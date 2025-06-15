const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const fs = require('fs'); // Added fs module

const LEADERBOARD_FILE = './leaderboard.json'; // Added leaderboard file constant
let globalPlayerScores = {};

// Load leaderboard data
try {
  if (fs.existsSync(LEADERBOARD_FILE)) {
    const leaderboardData = fs.readFileSync(LEADERBOARD_FILE, 'utf8');
    globalPlayerScores = JSON.parse(leaderboardData);
    console.log('Leaderboard data loaded successfully.');
  } else {
    console.log('No leaderboard file found. A new one will be created when scores are updated.');
    globalPlayerScores = {}; // Initialize with empty object
  }
} catch (error) {
  console.error('Error loading leaderboard data:', error);
  globalPlayerScores = {}; // Default to empty object on error
}

const { createLudoGameInstance, getGameState, ...ludoGameLogic } = require('./game_logic/ludoGame'); // Destructure game logic functions
const cors = require('cors'); 

const app = express();
const server = http.createServer(app);

app.use(cors()); // Added - Enable CORS for all Express routes

const io = new Server(server, {
  cors: {
    origin: "*", // Allow all origins for simplicity. Restrict in production.
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;
const READINESS_TIMEOUT_SECONDS = 10; // Readiness check timeout

let activeGames = {}; // Stores game instances, keyed by gameId
let nextGameId = 1;
const activeGameIntervals = {}; // For storing game tick intervals

// app.use(express.json()); 
app.use(express.json()); // Enable JSON parsing for Express - ensure it's after cors if any specific cors config needed before it

app.get('/', (req, res) => {
  res.send('<h1>Ludo Server Running</h1><p>Active games: ' + Object.keys(activeGames).length + '</p>');
});

app.get('/api/activeGames', (req, res) => {
  const joinableGames = Object.values(activeGames)
    .filter(game => game.status === 'setup') // Only show games in setup
    .map(game => {
      const currentPlayersCount = game.playersSetup.filter(p => p.playerId !== null).length;
      // Use num_players_setting if set, otherwise show based on default slot availability (e.g. 4)
      const maxPlayers = game.num_players_setting || game.playersSetup.length; 
      
      if (currentPlayersCount < maxPlayers) {
        return {
          gameId: game.gameId,
          currentPlayersCount: currentPlayersCount,
          maxPlayers: maxPlayers,
          playerNamesInGame: game.playersSetup
                              .filter(p => p.playerId !== null && p.playerName !== null)
                              .map(p => p.playerName),
        };
      }
      return null;
    })
    .filter(game => game !== null);
  res.json(joinableGames);
});

app.get('/api/leaderboard', (req, res) => {
  const leaderboard = Object.entries(globalPlayerScores)
    .map(([name, score]) => ({ name, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
  res.json(leaderboard);
});

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  socket.on('createGame', ({ playerName, enableAI }) => { // Destructure playerName and enableAI
    const gameId = `game${nextGameId++}`;
    const creatorPlayerId = socket.id;

    if (!playerName || typeof playerName !== 'string' || playerName.trim() === '') {
      socket.emit('actionError', { message: 'Player name is required for creating a game.' });
      return;
    }
    const trimmedPlayerName = playerName.trim();

    const gameOptions = { enableAI: !!enableAI }; // Ensure enableAI is a boolean
    const game = createLudoGameInstance(gameId, trimmedPlayerName, creatorPlayerId, gameOptions);
    activeGames[gameId] = game;
    game.lastActivityTime = Date.now();
    
    // If AI is enabled, and num_players_setting is not yet set, default it to 2.
    // This helps simplify UI logic for joining, as an AI game is typically 1v1.
    if (gameOptions.enableAI && game.playersSetup.find(p=>p.isAI)) {
        if(game.num_players_setting === null) { // Only set if not already set
            // Set to 2 players (1 human, 1 AI) by default for AI games.
            // Creator can change this later if game logic supports AI in >2 player games.
            ludoGameLogic.setGameParameters(game, 2, game.targetVictories_setting || 1, creatorPlayerId);
        }
    }

    socket.gameId = gameId; // Store gameId on socket for disconnect and other events
    socket.playerId = creatorPlayerId; // Store playerId on socket as well

    socket.join(gameId);

    console.log(`Game ${gameId} created by ${trimmedPlayerName} (${creatorPlayerId}).`);
    socket.emit('gameCreated', { 
        gameId, 
        // playerColor will be null initially, selected via UI
        // playerName is already known to client that sent it
        gameState: getGameState(game) 
    });
    // No general gameStateUpdate here, creator gets it via gameCreated.
    // Other players will get updates when they join or when settings change.
  });

  socket.on('joinGame', (data) => {
    const { gameId, playerName } = data;
    const game = activeGames[gameId];
    const joiningPlayerId = socket.id;

    if (game) {
        game.lastActivityTime = Date.now();
    }

    if (!playerName || typeof playerName !== 'string' || playerName.trim() === '') {
        socket.emit('actionError', { message: 'Player name is required for joining.' });
        return;
    }
    const trimmedPlayerName = playerName.trim();

    if (!game) {
      socket.emit('actionError', { message: 'Game not found.' });
      return;
    }

    if (game.status !== 'setup') {
      socket.emit('actionError', { message: 'Game is not in setup phase or already started.'});
      return;
    }

    // Check if game is a 2-player AI game and already has its human player (the creator)
    const hasAI = game.playersSetup.some(p => p.isAI);
    if (hasAI && game.num_players_setting === 2) {
        const humanPlayerCount = game.playersSetup.filter(p => p.playerId !== null && !p.isAI).length;
        // If the creator (a human) is present and another human tries to join a 2-player AI game
        if (humanPlayerCount >= 1 && joiningPlayerId !== game.creatorPlayerId) {
             socket.emit('actionError', { message: 'This is a 1v1 game against AI and is already full.' });
             return;
        }
        // If for some reason a second human tries to join before creator, also block if creator slot is empty but AI means it's a 1v1.
        // This scenario is less likely if creator always joins first.
    }


    const assignResult = ludoGameLogic.assignPlayerToSlot(game, joiningPlayerId, trimmedPlayerName);

    if (assignResult.success) {
        socket.gameId = gameId;
        socket.playerId = joiningPlayerId;
        socket.join(gameId);

        console.log(`Player ${trimmedPlayerName} (${joiningPlayerId}) joined game ${gameId}, slot ${assignResult.assignedSlotId}.`);
        socket.emit('joinedGame', { 
            gameId, 
            // playerColor will be null initially
            gameState: getGameState(game)
        });
        // Notify other players in the room
        socket.to(gameId).emit('playerJoinedNotification', { 
            playerId: joiningPlayerId, 
            playerName: trimmedPlayerName, 
            message: `${trimmedPlayerName} has joined the game!`,
            gameState: getGameState(game) // Send updated state
        });
         // Also send a general update to refresh everyone's view of playersSetup
        io.to(gameId).emit('gameStateUpdate', { gameState: getGameState(game) });
    } else {
        socket.emit('actionError', { message: assignResult.error || 'Could not join game.' });
    }
  });

  // Placeholder for existing rollDice, movePawn, etc. handlers
  // They will need to be adapted to use getGameState(game) and check game.status
  // For example, in socket.on('rollDice', (data) => { const game = activeGames[gameId]; if (game.status !== 'active') ... })

  socket.on('rollDice', (data) => {
    const { gameId } = data;
    const game = activeGames[gameId];

    if (!game) return socket.emit('actionError', { message: 'Game not found.' });
    game.lastActivityTime = Date.now();
    if (game.status !== 'active') return socket.emit('actionError', {message: 'Game not active.'});

    // Call for first earthquake check
    let earthquakeJustOccurred = ludoGameLogic.checkAndTriggerFirstEarthquake(game);
    // Assuming checkAndTriggerSecondEarthquake also returns a boolean indicating if it occurred.
    // And that it should also be considered for mercy re-roll.
    earthquakeJustOccurred = earthquakeJustOccurred || ludoGameLogic.checkAndTriggerSecondEarthquake(game);

    if (checkAndEmitEarthquake(gameId, game, io)) { // This helper emits 'earthquakeActivated' if game.earthquakeJustHappened was true
        // If an earthquake happened, the game state might have changed significantly.
        // The client needs the updated state before proceeding with further turn logic.
        io.to(gameId).emit('gameStateUpdate', { gameState: getGameState(game) });
        // Depending on game rules, an earthquake might end the current action or turn.
        // For now, we assume the turn continues unless the earthquake logic itself ends the turn.
    }


    const playerColor = socket.playerColor; // This needs to be the actual color of the player from game.playersSetup
    const currentPlayerSlot = game.playersSetup.find(p => p.playerId === socket.playerId);
    if (!currentPlayerSlot || !currentPlayerSlot.color) {
        return socket.emit('actionError', { message: 'Player not fully setup or color missing.' });
    }
    const actualPlayerColor = currentPlayerSlot.color;


    if (actualPlayerColor !== ludoGameLogic.getPlayerColor(game)) {
      return socket.emit('actionError', { message: 'Not your turn.' });
    }
    if (game.awaitingMove) {
        return socket.emit('actionError', { message: 'A move is pending for the previous dice roll.' });
    }
    game.mustRollAgain = false; 

    // Roll dice first
    let diceResult = ludoGameLogic.rollDice();
    game.dice_roll = diceResult;

    // Earthquake Mercy Re-roll Logic
    if (earthquakeJustOccurred &&
        ludoGameLogic.areAllPawnsHome(game, actualPlayerColor) &&
        game.dice_roll !== 6) {

        console.log(`[rollDice ${gameId}] Player ${actualPlayerColor} granted earthquake mercy re-roll.`);
        game.mustRollAgain = true;
        game.awaitingMove = false;
        // game.threeTryAttempts is NOT incremented in this specific case.
        game.lastLogMessage = "Earthquake trapped your pawns! You get a mercy re-roll.";
        game.lastLogMessageColor = actualPlayerColor;

    } else if (ludoGameLogic.areAllPawnsHome(game, actualPlayerColor)) { // Standard "all pawns home" logic
        game.threeTryAttempts++;
        // Dice already rolled and set to game.dice_roll
        
        if (game.dice_roll === 6) {
            game.consecutive_sixes_count = 1; 
            game.threeTryAttempts = 0; 
            const homePawns = game.pawns[actualPlayerColor].filter(p => p.state === ludoGameLogic.PAWN_STATES.HOME);
            if (homePawns.length > 0) {
                const pawnToMoveId = homePawns[0].id; 
                ludoGameLogic.movePawn(game, actualPlayerColor, pawnToMoveId, game.dice_roll); // Use game.dice_roll
                io.to(gameId).emit('pawnMoved', { playerColor: actualPlayerColor, pawnId: pawnToMoveId, diceValue: game.dice_roll, newPos: game.pawns[actualPlayerColor].find(p=>p.id === pawnToMoveId).position, autoMoved: true });
            }
            game.mustRollAgain = true; 
            game.awaitingMove = false; 
        } else { 
            if (game.threeTryAttempts === 3) {
                game.threeTryAttempts = 0;
                ludoGameLogic.switchPlayer(game);
                // No need to call checkAndEmitEarthquake here again as it was done after the earthquake trigger itself.
                // The mercy roll logic specifically applies *after* an earthquake has just occurred and been processed.
                const newCurrentPlayerColor = ludoGameLogic.getPlayerColor(game);
                io.to(gameId).emit('turnChanged', { currentPlayer: newCurrentPlayerColor });
                if (game.status === 'active') {
                    const nextPlayerSlot = game.playersSetup.find(p => p.color === newCurrentPlayerColor);
                    if (nextPlayerSlot && nextPlayerSlot.isAI) {
                        console.log(`[rollDice ${gameId}] Human (all home, 3 tries no 6) turn ended, next player ${newCurrentPlayerColor} is AI. Triggering AI move.`);
                        setTimeout(() => triggerAIMove(gameId, game), 500);
                    }
                }
            } else {
                game.mustRollAgain = true; 
                game.awaitingMove = false; 
            }
        }
    } else { // Standard "pawns on board" logic
        // Dice already rolled and set to game.dice_roll

        if (game.dice_roll === 6) {
            game.consecutive_sixes_count++;
        } else {
            game.consecutive_sixes_count = 0;
        }

        if (game.consecutive_sixes_count === 3) {
            io.to(gameId).emit('rolledThreeSixes', { playerColor: actualPlayerColor, diceResult: game.dice_roll }); // Use game.dice_roll
            ludoGameLogic.switchPlayer(game);
            // No need to call checkAndEmitEarthquake here again.
            const newCurrentPlayerColor = ludoGameLogic.getPlayerColor(game);
            io.to(gameId).emit('turnChanged', { currentPlayer: newCurrentPlayerColor });
            if (game.status === 'active') {
                const nextPlayerSlot = game.playersSetup.find(p => p.color === newCurrentPlayerColor);
                if (nextPlayerSlot && nextPlayerSlot.isAI) {
                    console.log(`[rollDice ${gameId}] Human (3 sixes) turn ended, next player ${newCurrentPlayerColor} is AI. Triggering AI move.`);
                    setTimeout(() => triggerAIMove(gameId, game), 500);
                }
            }
        } else {
            const movablePawns = ludoGameLogic.getMovablePawns(game, actualPlayerColor, game.dice_roll); // Use game.dice_roll
            if (movablePawns.length === 0) {
                if (game.dice_roll !== 6) {
                    ludoGameLogic.switchPlayer(game);
                    // No need to call checkAndEmitEarthquake here again.
                    const newCurrentPlayerColor = ludoGameLogic.getPlayerColor(game);
                    io.to(gameId).emit('turnChanged', { currentPlayer: newCurrentPlayerColor });
                    if (game.status === 'active') {
                        const nextPlayerSlot = game.playersSetup.find(p => p.color === newCurrentPlayerColor);
                        if (nextPlayerSlot && nextPlayerSlot.isAI) {
                            console.log(`[rollDice ${gameId}] Human (no movable pawns, not 6) turn ended, next player ${newCurrentPlayerColor} is AI. Triggering AI move.`);
                            setTimeout(() => triggerAIMove(gameId, game), 500);
                        }
                    }
                } else { 
                    game.mustRollAgain = true;
                }
            } else { 
                game.awaitingMove = true;
                if (movablePawns.length === 1) {
                     // diceResult variable is out of scope here, use game.dice_roll
                     io.to(gameId).emit('diceRolled', { playerColor: actualPlayerColor, diceValue: game.dice_roll, consecutiveSixes: game.consecutive_sixes_count, mustRollAgain: game.mustRollAgain, awaitingMove: game.awaitingMove, singleMovePawnId: movablePawns[0] });
                     io.to(gameId).emit('gameStateUpdate', { gameState: getGameState(game) });
                     return; 
                }
            }
        }
    }
    
    // diceResult variable is out of scope here, use game.dice_roll for emitting
    io.to(gameId).emit('diceRolled', { playerColor: actualPlayerColor, diceValue: game.dice_roll, consecutiveSixes: game.consecutive_sixes_count, mustRollAgain: game.mustRollAgain, awaitingMove: game.awaitingMove });
    io.to(gameId).emit('gameStateUpdate', { gameState: getGameState(game) });
  });

  socket.on('movePawn', (data) => {
    const { gameId, pawnId } = data;
    const game = activeGames[gameId];
    
    if (!game) return socket.emit('actionError', { message: 'Game not found.' });
    game.lastActivityTime = Date.now();
    if (game.status !== 'active') return socket.emit('actionError', {message: 'Game not active.'});

    // Call for first earthquake check
    ludoGameLogic.checkAndTriggerFirstEarthquake(game);
    if (checkAndEmitEarthquake(gameId, game, io)) {
        io.to(gameId).emit('gameStateUpdate', { gameState: getGameState(game) });
        // Similar considerations as in rollDice: does the earthquake interrupt the planned pawn move?
        // For now, assume the pawn move will proceed on the (potentially) altered board state.
    }

    const currentPlayerSlot = game.playersSetup.find(p => p.playerId === socket.playerId);
    if (!currentPlayerSlot || !currentPlayerSlot.color) {
        return socket.emit('actionError', { message: 'Player not fully setup or color missing.' });
    }
    const playerColor = currentPlayerSlot.color;

    if (playerColor !== ludoGameLogic.getPlayerColor(game)) { 
      return socket.emit('actionError', { message: 'Not your turn.' });
    }
    if (!game.awaitingMove) {
        return socket.emit('actionError', { message: 'Not awaiting a move.' });
    }
    if (game.dice_roll === null) {
      return socket.emit('actionError', { message: 'Roll dice first.' });
    }

    const diceValue = game.dice_roll;
    const numericPawnId = parseInt(pawnId, 10);
    const moveValid = ludoGameLogic.movePawn(game, playerColor, numericPawnId, diceValue);

    game.awaitingMove = false; 

    if (moveValid) {
        const pawnMovedDetails = game.pawns[playerColor].find(p=>p.id === numericPawnId);
        io.to(gameId).emit('pawnMoved', { playerColor, pawnId: numericPawnId, diceValue, newPos: pawnMovedDetails ? pawnMovedDetails.position : null, newState: pawnMovedDetails ? pawnMovedDetails.state : null });
        
        // Check for black hole activation and immediate hit
        if (game.justActivatedBlackHolePosition) {
            console.log(`[${gameId}] Emitting blackHoleActivated. Position: ${game.justActivatedBlackHolePosition}`);
            io.to(gameId).emit('blackHoleActivated', { position: game.justActivatedBlackHolePosition });
            game.justActivatedBlackHolePosition = null; // Reset flag

            if (game.pawnSentHomeByNewBlackHole) {
                console.log(`[${gameId}] Emitting playerHitBlackHole (due to new activation). Player: ${game.pawnSentHomeByNewBlackHole.playerName}, Pawn: ${game.pawnSentHomeByNewBlackHole.pawnId}`);
                io.to(gameId).emit('playerHitBlackHole', game.pawnSentHomeByNewBlackHole);
                game.pawnSentHomeByNewBlackHole = null; // Reset flag
            }
        }

        // Check for hitting an existing black hole
        if (game.pawnSentHomeByExistingBlackHole) {
            console.log(`[${gameId}] Emitting playerHitBlackHole (existing). Player: ${game.pawnSentHomeByExistingBlackHole.playerName}, Pawn: ${game.pawnSentHomeByExistingBlackHole.pawnId}`);
            io.to(gameId).emit('playerHitBlackHole', game.pawnSentHomeByExistingBlackHole);
            game.pawnSentHomeByExistingBlackHole = null; // Reset flag
        }

        game.dice_roll = null;

        if (game.round_over) { 
            const victoryCheck = ludoGameLogic.checkForGameVictory(game); 
            
            io.to(gameId).emit('roundOver', {
                roundWinnerColor: game.round_winner,
                roundWinnerName: game.playerNames[game.round_winner],
                playerScores: game.playerScores,
                overallWinnerFound: victoryCheck.overallWinnerFound,
                overallGameWinnerColor: victoryCheck.winner,
                overallGameWinnerName: victoryCheck.winner ? game.playerNames[victoryCheck.winner] : null
            });

            if (victoryCheck.overallWinnerFound) {
                // The game.status is already set to 'gameOver' by checkForGameVictory.
                // We ensure the event is emitted. The gameStateUpdate at the end of the handler will reflect this.
                io.to(gameId).emit('overallGameOver', { 
                    winnerColor: game.overall_game_winner,
                    winnerName: game.playerNames[game.overall_game_winner],
                    finalScores: game.playerScores 
                });
                // Clear interval on overall game over
                if (activeGameIntervals[gameId]) {
                    clearInterval(activeGameIntervals[gameId]);
                    delete activeGameIntervals[gameId];
                    console.log(`[Game Timer] Cleared interval for game ${gameId} due to overall game over (player move).`);
                }
                const winnerName = game.playerNames[game.overall_game_winner];
                if (winnerName) {
                    globalPlayerScores[winnerName] = (globalPlayerScores[winnerName] || 0) + 2; // Simplified scoring
                    // Save updated leaderboard
                    fs.writeFile(LEADERBOARD_FILE, JSON.stringify(globalPlayerScores, null, 2), (err) => {
                        if (err) {
                            console.error('Error saving leaderboard data:', err);
                        } else {
                            console.log('Leaderboard data saved successfully.');
                        }
                    });
                }
                // Do NOT delete activeGames[gameId] here.
                // Do NOT return here; allow the final gameStateUpdate to be sent.
                // Ensure gameStateUpdate is sent to reflect final gameOver status.
                io.to(gameId).emit('gameStateUpdate', { gameState: getGameState(game) });
            } else { // Overall game is not over
                const roundWinnerColor = game.round_winner;
                const roundWinnerIsAI = game.playersSetup.some(p => p.color === roundWinnerColor && p.isAI);

                if (roundWinnerIsAI) {
                    console.log(`[${gameId}] Human's move resulted in AI player ${roundWinnerColor} winning the round. Automatically starting next round.`);
                    ludoGameLogic.startNextRound(game);
                    io.to(gameId).emit('nextRoundStarted', { message: 'Next round starting automatically as AI won previous.' });
                    io.to(gameId).emit('gameStateUpdate', { gameState: getGameState(game) });

                    const newCurrentPlayerColor = ludoGameLogic.getPlayerColor(game);
                    const newCurrentPlayerIsAI = game.playersSetup.some(p => p.color === newCurrentPlayerColor && p.isAI);
                    if (newCurrentPlayerIsAI && game.status === 'active') {
                        console.log(`[${gameId}] New current player ${newCurrentPlayerColor} is AI. Triggering AI move for new round.`);
                        setTimeout(() => triggerAIMove(gameId, game), 1000);
                    }
                } else {
                    // Human winner, existing logic: wait for confirmNextRound event
                    game.awaitingNextRoundConfirmationFrom = game.round_winner;
                    io.to(gameId).emit('gameStateUpdate', { gameState: getGameState(game) });
                }
            }
        } else { // Round is not over
            if (diceValue === 6 && game.consecutive_sixes_count < 3) {
                game.mustRollAgain = true;
            } else { // Turn ends
                // If a lastLogMessage (e.g., from capture) was generated by the player's move,
                // send it now before it's cleared by switchPlayer.
                if (game.lastLogMessage) {
                    io.to(gameId).emit('gameStateUpdate', { gameState: getGameState(game) });
                }

                ludoGameLogic.switchPlayer(game); // Clears lastLogMessage for the next player's state

                // Handle potential earthquake after player switch.
                // checkAndEmitEarthquake will emit its own 'earthquakeActivated' event
                // and potentially a gameStateUpdate if an earthquake happens.
                checkAndEmitEarthquake(gameId, game, io);

                const newCurrentPlayerColor = ludoGameLogic.getPlayerColor(game);
                io.to(gameId).emit('turnChanged', { currentPlayer: newCurrentPlayerColor });

                // Check if the new player is AI
                if (game.status === 'active') { // Ensure game is still active
                    const nextPlayerSlot = game.playersSetup.find(p => p.color === newCurrentPlayerColor);
                    if (nextPlayerSlot && nextPlayerSlot.isAI) {
                        console.log(`[movePawn ${gameId}] Human turn ended, next player ${newCurrentPlayerColor} is AI. Triggering AI move.`);
                        setTimeout(() => triggerAIMove(gameId, game), 500);
                    }
                }
            }
        }
    } else {
        // moveValid is false
        socket.emit('actionError', { message: 'Invalid move.' });

        const movablePawns = ludoGameLogic.getMovablePawns(game, playerColor, game.dice_roll);

        if (movablePawns.length === 0) {
            game.awaitingMove = false;
            // Check for consecutive sixes count; assume game.consecutive_sixes_count is updated by rollDice
            if (game.dice_roll === 6 && game.consecutive_sixes_count < 3) {
                game.mustRollAgain = true;
            } else {
                // Not a 6, or it was the 3rd six (which should have been handled in rollDice, but as a fallback)
                // Or, if it was a 6 but no movable pawns and it's not the 3rd six (which implies mustRollAgain was set true)
                // This path means the turn should switch.
                ludoGameLogic.switchPlayer(game);
                checkAndEmitEarthquake(gameId, game, io); // Check for earthquake after player switch
                const newCurrentPlayerColor = ludoGameLogic.getPlayerColor(game);
                io.to(gameId).emit('turnChanged', { currentPlayer: newCurrentPlayerColor });
                if (game.status === 'active') {
                    const nextPlayerSlot = game.playersSetup.find(p => p.color === newCurrentPlayerColor);
                    if (nextPlayerSlot && nextPlayerSlot.isAI) {
                        console.log(`[movePawn ${gameId}] Invalid move, no movable pawns, player ${playerColor} turn ended. Next player ${newCurrentPlayerColor} is AI. Triggering AI move.`);
                        setTimeout(() => triggerAIMove(gameId, game), 500);
                    }
                }
            }
        } else {
            // Movable pawns exist, player must make a valid move
            game.awaitingMove = true; 
        }
    }
    
    io.to(gameId).emit('gameStateUpdate', { gameState: getGameState(game) });
  });

  socket.on('creatorFinalizeSettings', (data) => {
    const { gameId, settings } = data;
    const game = activeGames[gameId];

    if (!game) return socket.emit('actionError', { message: 'Game not found.' });
    game.lastActivityTime = Date.now();
    if (socket.id !== game.creatorPlayerId) return socket.emit('actionError', { message: 'Only creator can finalize settings.' });
    if (game.status !== 'setup') return socket.emit('actionError', { message: 'Game not in setup phase.' });

    const { numPlayers, targetVictories } = settings;
    const result = ludoGameLogic.setGameParameters(game, numPlayers, targetVictories, socket.id);

    if (result.success) {
      io.to(gameId).emit('gameStateUpdate', { gameState: getGameState(game) });
    } else {
      socket.emit('actionError', { message: result.error || 'Failed to set game parameters.' });
    }
  });

  socket.on('selectColor', (data) => {
    const { gameId, color } = data;
    const game = activeGames[gameId];

    if (!game) return socket.emit('actionError', { message: 'Game not found.' });
    game.lastActivityTime = Date.now();
    if (game.status !== 'setup') return socket.emit('actionError', { message: 'Cannot select color outside of setup phase.' });
    
    // Player ID is from the socket that sent the event
    const result = ludoGameLogic.handlePlayerColorSelection(game, socket.id, color);

    if (result.success) {
      // Update playerColor on socket for older handlers if they rely on it (though ideally they use playerId)
      socket.playerColor = color; 

      // If an AI player exists and doesn't have a color yet, try to assign one
      if (game.playersSetup.some(p => p.isAI && p.color === null)) {
        const aiColorAssigned = ludoGameLogic.assignColorToAI(game);
        if (aiColorAssigned) {
          console.log(`[selectColor ${gameId}] AI color automatically assigned after human selection.`);
        } else {
          // This is a potential issue, but game state update will proceed.
          // initiateReadinessCheck might fail later if AI color is still null.
          console.error(`[selectColor ${gameId}] AI player exists but could not be assigned a color.`);
        }
      }

      io.to(gameId).emit('gameStateUpdate', { gameState: getGameState(game) });
    } else {
      socket.emit('actionError', { message: result.error || 'Failed to select color.' });
    }
  });

  socket.on('creatorRequestsGameStart', (data) => {
    const { gameId, settings } = data;
    const game = activeGames[gameId];

    if (!game) { socket.emit('actionError', { message: 'Game not found.' }); return; }
    game.lastActivityTime = Date.now();
    if (socket.id !== game.creatorPlayerId) { socket.emit('actionError', { message: 'Only creator can start the game.' }); return; }
    if (game.status !== 'setup') { socket.emit('actionError', { message: 'Game not in setup phase.' }); return; }

    console.log(`[creatorRequestsGameStart ${gameId}] Received data:`, JSON.stringify(data, null, 2)); // Log entire data object

    if (settings) {
        console.log(`[creatorRequestsGameStart ${gameId}] Received settings object:`, JSON.stringify(settings, null, 2));
        const { numPlayers, targetVictories, blackHoleMode, earthquakeMode, gameTimeMode } = settings; // Destructure gameTimeMode

        if (numPlayers && targetVictories) {
            // Ensure gameTimeMode is passed to setGameParameters
            const setResult = ludoGameLogic.setGameParameters(game, numPlayers, targetVictories, gameTimeMode, socket.id);
            if (!setResult.success) {
                socket.emit('actionError', { message: setResult.error || 'Invalid game settings provided.' });
                return;
            }
            console.log(`[creatorRequestsGameStart ${gameId}] blackHoleMode from client settings: ${blackHoleMode}`);
            game.blackHoleModeEnabled = !!blackHoleMode;
            console.log(`[creatorRequestsGameStart ${gameId}] game.blackHoleModeEnabled was set to: ${game.blackHoleModeEnabled}`);
            
            game.earthquakeModeEnabled = !!earthquakeMode; // Set earthquakeModeEnabled
            console.log(`[creatorRequestsGameStart ${gameId}] game.earthquakeModeEnabled was set to: ${game.earthquakeModeEnabled}`);
        } else {
            console.log(`[creatorRequestsGameStart ${gameId}] numPlayers or targetVictories missing in settings. game.blackHoleModeEnabled remains: ${game.blackHoleModeEnabled}`);
            // If critical settings are missing, earthquakeMode might also not be processed or default.
            game.earthquakeModeEnabled = false; 
            console.log(`[creatorRequestsGameStart ${gameId}] Critical settings missing. game.earthquakeModeEnabled defaulted to: ${game.earthquakeModeEnabled}`);
        }
    } else {
        console.log(`[creatorRequestsGameStart ${gameId}] No settings object received. game.blackHoleModeEnabled remains: ${game.blackHoleModeEnabled}`);
        game.earthquakeModeEnabled = false; 
        console.log(`[creatorRequestsGameStart ${gameId}] No settings object received. game.earthquakeModeEnabled defaulted to: ${game.earthquakeModeEnabled}`);
    }

    // Assign color to AI if it doesn't have one yet
    if (game.playersSetup.some(p => p.isAI && p.color === null)) {
        const aiColorAssigned = ludoGameLogic.assignColorToAI(game);
        if (!aiColorAssigned) {
            console.error(`[creatorRequestsGameStart ${gameId}] Failed to assign color to AI opponent. Cannot start.`);
            socket.emit('actionError', { message: 'Failed to assign color to AI opponent. Ensure not all colors are taken by humans if AI is enabled.' });
            return; // Prevent game start
        }
        console.log(`[creatorRequestsGameStart ${gameId}] AI color assigned before readiness check.`);
        // Send an immediate state update so clients see AI's color before readiness prompt
        io.to(gameId).emit('gameStateUpdate', { gameState: getGameState(game) });
    }

    // Proceed with readiness check
    const readinessCheckResult = ludoGameLogic.initiateReadinessCheck(game);

    if (!readinessCheckResult.success) {
        // If initiateReadinessCheck fails (e.g. not all players have colors, incl. AI), emit error.
        // This could happen if assignColorToAI failed silently or conditions weren't met for players.
        socket.emit('actionError', { message: readinessCheckResult.error || "Cannot start readiness check (e.g., not all players have colors)." });
        return;
    }
    
    // Clear any existing timer for this game, just in case
    if (game.readinessTimerId) {
        clearTimeout(game.readinessTimerId);
        game.readinessTimerId = null;
    }

    // After initiating readiness, check if all players are already ready
    // This is especially relevant for 1 Human + 1 AI games where AI is auto-ready
    // and creator is auto-ready.
    if (ludoGameLogic.checkIfAllPlayersReady(game)) {
        console.log(`[${gameId}] All players (including AI if any) are ready immediately after creator start. Starting game.`);
        const startResult = ludoGameLogic.startGameActual(game);
        if (startResult.success) {
            io.to(gameId).emit('readinessCheckOutcome', { success: true, message: "All players ready, game starting." });
            io.to(gameId).emit('gameStateUpdate', { gameState: getGameState(game) }); // Game is now 'active'
            // Check if first player is AI and trigger their move
            if (game.status === 'active') {
                // Start game tick interval if timed game
                if (game.gameTimeMode && game.gameTimeMode !== 'unlimited') {
                    if (activeGameIntervals[gameId]) clearInterval(activeGameIntervals[gameId]);
                    activeGameIntervals[gameId] = setInterval(() => { handleGameTick(gameId, io); }, 1000);
                    console.log(`[Game Timer] Interval started for game ${gameId} with mode ${game.gameTimeMode}`);
                }

                const firstPlayerColor = ludoGameLogic.getPlayerColor(game);
                const firstPlayerSlot = game.playersSetup.find(p => p.color === firstPlayerColor);
                if (firstPlayerSlot && firstPlayerSlot.isAI) {
                    console.log(`[creatorRequestsGameStart ${gameId}] Game started, first player ${firstPlayerColor} is AI. Triggering AI move.`);
                    setTimeout(() => triggerAIMove(gameId, game), 500);
                }
            }
        } else {
            // This case should ideally not happen if checkIfAllPlayersReady was true
            game.status = 'setup'; // Revert
            game.readyPlayers.clear();
            socket.emit('actionError', { message: startResult.error || 'Failed to start game immediately after readiness check.' });
            io.to(gameId).emit('gameStateUpdate', { gameState: getGameState(game) });
        }
    } else {
        // Not all players are ready yet (e.g., games with more than 1 human player)
        // Proceed with the timeout logic for other players to confirm.
        game.readinessTimerId = setTimeout(() => handleReadinessTimeout(gameId, io), READINESS_TIMEOUT_SECONDS * 1000);

        const payload = {
            timeout: READINESS_TIMEOUT_SECONDS,
            initialReadyStatus: ludoGameLogic.getReadyPlayersStatus(game)
        };
        console.log(`[${gameId}] Emitting 'initiateReadinessCheck' for other players. Payload: `, payload);
        io.to(gameId).emit('initiateReadinessCheck', payload);
        io.to(gameId).emit('gameStateUpdate', { gameState: getGameState(game) }); // Reflects status change to 'waitingForReady'
    }
  });

  socket.on('playerReady', (data) => {
    const { gameId } = data;
    const game = activeGames[gameId];

    if (!game) return socket.emit('actionError', { message: 'Game not found.' });
    game.lastActivityTime = Date.now();
    if (game.status !== 'waitingForReady') return socket.emit('actionError', { message: 'Not in readiness check phase.' });
    if (socket.id === game.creatorPlayerId) return socket.emit('actionError', { message: 'Creator does not confirm readiness this way.'}); // Creator is auto-ready

    const readyResult = ludoGameLogic.setPlayerReady(game, socket.id);
    if (!readyResult.success) {
        return socket.emit('actionError', { message: readyResult.error || 'Failed to set player ready.' });
    }

    io.to(gameId).emit('playerReadinessUpdate', { 
        newReadyStatus: ludoGameLogic.getReadyPlayersStatus(game), // Send the map of playerID:isReady
        gameState: getGameState(game) // Also send full state if parts of it depend on ready status indirectly
    });

    if (ludoGameLogic.checkIfAllPlayersReady(game)) {
        if (game.readinessTimerId) {
            clearTimeout(game.readinessTimerId);
            game.readinessTimerId = null;
        }
        const startResult = ludoGameLogic.startGameActual(game);
        if (startResult.success) {
            io.to(gameId).emit('readinessCheckOutcome', { success: true });
            io.to(gameId).emit('gameStateUpdate', { gameState: getGameState(game) }); // Game is now 'active'
            // Check if first player is AI
            if (game.status === 'active') {
                // Start game tick interval if timed game
                if (game.gameTimeMode && game.gameTimeMode !== 'unlimited') {
                    if (activeGameIntervals[gameId]) clearInterval(activeGameIntervals[gameId]);
                    activeGameIntervals[gameId] = setInterval(() => { handleGameTick(gameId, io); }, 1000);
                    console.log(`[Game Timer] Interval started for game ${gameId} with mode ${game.gameTimeMode}`);
                }

                const firstPlayerColor = ludoGameLogic.getPlayerColor(game);
                const firstPlayerSlot = game.playersSetup.find(p => p.color === firstPlayerColor);
                if (firstPlayerSlot && firstPlayerSlot.isAI) {
                    console.log(`[playerReady ${gameId}] Game started, first player ${firstPlayerColor} is AI. Triggering AI move.`);
                    setTimeout(() => triggerAIMove(gameId, game), 500);
                }
            }
        } else {
            // This case should ideally not happen if checkIfAllPlayersReady was true and startGameActual conditions are aligned
            game.status = 'setup'; // Revert
            game.readyPlayers.clear();
            io.to(gameId).emit('readinessCheckOutcome', { success: false, message: startResult.error || 'Failed to start game after readiness.' });
            io.to(gameId).emit('gameStateUpdate', { gameState: getGameState(game) });
        }
    }
  });

  socket.on('confirmNextRound', (data) => {
    const { gameId } = data;
    const game = activeGames[gameId];
    
    if (!game) return socket.emit('actionError', { message: 'Game not found.' });
    game.lastActivityTime = Date.now();
    
    const currentPlayerSlot = game.playersSetup.find(p => p.playerId === socket.playerId);
    if (!currentPlayerSlot || !currentPlayerSlot.color) {
        return socket.emit('actionError', { message: 'Player not fully setup.' });
    }
    const playerColor = currentPlayerSlot.color;

    if (playerColor !== game.awaitingNextRoundConfirmationFrom) {
        return socket.emit('actionError', { message: 'Not your turn to confirm next round.' });
    }

    ludoGameLogic.startNextRound(game); 
    game.awaitingNextRoundConfirmationFrom = null; 

    io.to(gameId).emit('nextRoundStarted', { message: 'Next round starting.' });
    io.to(gameId).emit('gameStateUpdate', { gameState: getGameState(game) });

    // After starting the next round, check if the new current player is an AI
    const newCurrentPlayerColor = ludoGameLogic.getPlayerColor(game);
    const newCurrentPlayerIsAI = game.playersSetup.some(p => p.color === newCurrentPlayerColor && p.isAI);

    if (newCurrentPlayerIsAI && game.status === 'active') {
        console.log(`[${gameId}] New round started after human confirmation. Current player ${newCurrentPlayerColor} is AI. Triggering AI move.`);
        setTimeout(() => triggerAIMove(gameId, game), 500); // Short delay for UX
    }
  });


  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    const gameId = socket.gameId; // Game ID stored on socket
    const playerId = socket.playerId; // Player ID stored on socket

    if (gameId && activeGames[gameId]) {
      const game = activeGames[gameId];
      // Update activity time if a player disconnects and the game is affected
      game.lastActivityTime = Date.now();
      const removalResult = ludoGameLogic.removePlayer(game, playerId);

      if (removalResult.success) {
        console.log(`Player ${playerId} removed from game ${gameId}.`);
        io.to(gameId).emit('playerDisconnected', { 
            playerId: playerId, 
            // playerName can be retrieved from game.playersSetup if needed, or passed in removalResult
            vacatedSlotId: removalResult.vacatedSlotId,
            message: `A player has disconnected.`, // Generic message
            gameState: getGameState(game)
        });

        if (game.status === 'waitingForReady') {
            // If player disconnects during readiness, check if remaining are all ready
            if (ludoGameLogic.checkIfAllPlayersReady(game)) {
                clearTimeout(game.readinessTimerId); 
                game.readinessTimerId = null;
                const startResult = ludoGameLogic.startGameActual(game);
                if (startResult.success) {
                    io.to(gameId).emit('readinessCheckOutcome', { success: true });
                    io.to(gameId).emit('gameStateUpdate', { gameState: getGameState(game) });
                } else {
                    // This case (e.g. not enough players after disconnect) should lead to outcome: false
                    game.status = 'setup'; // Revert to setup
                    game.readyPlayers.clear();
                    io.to(gameId).emit('readinessCheckOutcome', { success: false, message: 'Player disconnected, not enough ready players.' });
                    io.to(gameId).emit('gameStateUpdate', { gameState: getGameState(game) });
                }
            }
        } else if (game.status === 'active') {
            const hasAI = game.playersSetup.some(p => p.isAI);
            const humanPlayers = game.playersSetup.filter(p => p.playerId !== null && !p.isAI && p.color !== null);
            const activeHumanPlayerCount = humanPlayers.length;

            if (hasAI && activeHumanPlayerCount === 0) {
                console.log(`Game ${gameId} vs AI: Human player disconnected. Ending game.`);
                io.to(gameId).emit('gameEndedNotification', { message: "Human player disconnected. Game ended." });
                if (activeGameIntervals[gameId]) {
                    clearInterval(activeGameIntervals[gameId]);
                    delete activeGameIntervals[gameId];
                    console.log(`[Game Timer] Cleared interval for game ${gameId} due to disconnect leading to game end.`);
                }
                delete activeGames[gameId]; // Remove the game
                return;
            } else if (activeHumanPlayerCount + (hasAI ? 1 : 0) < 2 && !hasAI) { // For human-only games, or if AI logic implies it can't continue
                 console.log(`Game ${gameId} has less than 2 active players, ending game.`);
                 io.to(gameId).emit('gameEndedNotification', { message: "Game ended due to insufficient players."});
                 if (activeGameIntervals[gameId]) {
                    clearInterval(activeGameIntervals[gameId]);
                    delete activeGameIntervals[gameId];
                    console.log(`[Game Timer] Cleared interval for game ${gameId} due to disconnect leading to game end.`);
                }
                 delete activeGames[gameId];
                 return;
            }
        }
        
        const remainingPlayers = game.playersSetup.filter(p => p.playerId !== null).length;
        if (remainingPlayers === 0 && game.status !== 'active' && game.status !== 'gameOver') { // Don't delete active/finished games this way
            console.log(`Game ${gameId} is empty, deleting.`);
            if (activeGameIntervals[gameId]) { // Also clear interval if game becomes empty during setup/waiting
                clearInterval(activeGameIntervals[gameId]);
                delete activeGameIntervals[gameId];
                console.log(`[Game Timer] Cleared interval for game ${gameId} as it became empty.`);
            }
            delete activeGames[gameId];
        } else {
            io.to(gameId).emit('gameStateUpdate', { gameState: getGameState(game) }); 
        }
      }
    }
  });

  socket.on('sendChatMessage', (data) => {
    // data should contain { gameId: string, message: string }
    const { gameId, message } = data;
    const game = activeGames[gameId]; // Use 'game' instance
    
    if (!game) {
        return socket.emit('actionError', { message: 'Game not found for chat.' });
    }
    game.lastActivityTime = Date.now();
    
    const playerSlot = game.playersSetup.find(p => p.playerId === socket.id);
    if (!playerSlot || !playerSlot.color) { // Player must be in a slot and have a color to chat
        return socket.emit('actionError', { message: 'Player not fully setup for chat (no color or slot).' });
    }

    if (!message || message.trim() === '') {
        return socket.emit('actionError', { message: 'Cannot send an empty message.' });
    }

    const chatMessagePayload = {
        senderColor: playerSlot.color, // Use color from playersSetup
        senderName: playerSlot.playerName, // Can also send playerName
        senderId: socket.id,
        message: message.trim(), 
        timestamp: new Date().toISOString()
    };

    io.to(gameId).emit('newChatMessage', chatMessagePayload);
    console.log(`Game ${gameId}: Chat from ${playerSlot.playerName} (${playerSlot.color}): ${message.trim()}`);
  });
});

// --- Game Tick Handler ---
/**
 * Handles the game tick for timer updates.
 * @param {string} gameId The ID of the game.
 * @param {object} io The Socket.IO server instance.
 */
function handleGameTick(gameId, io) {
    const game = activeGames[gameId];

    if (!game || game.status !== 'active' || !game.gameTimeMode || game.gameTimeMode === 'unlimited' || game.overall_game_over || game.round_over) {
        if (activeGameIntervals[gameId]) {
            clearInterval(activeGameIntervals[gameId]);
            delete activeGameIntervals[gameId];
            console.log(`[Game Timer] Cleared interval for game ${gameId} due to status change or game end.`);
        }
        return;
    }

    const currentPlayerColor = ludoGameLogic.getPlayerColor(game);

    if (!currentPlayerColor || !game.playerTurnStartTime) {
        return;
    }

    const playerSetup = game.playersSetup.find(p => p.color === currentPlayerColor);
    const currentPlayerIsAI = playerSetup ? playerSetup.isAI : false;

    if (currentPlayerIsAI || game.eliminatedPlayers.includes(currentPlayerColor)) {
        return;
    }

    const elapsedSecondsThisTurnSegment = Math.floor((Date.now() - game.playerTurnStartTime) / 1000);
    const projectedRemainingTime = game.playerTimers[currentPlayerColor] - elapsedSecondsThisTurnSegment;

    const currentPlayerData = game.playersSetup.find(p => p.color === currentPlayerColor);
    if (currentPlayerData && currentPlayerData.playerId) {
        io.to(currentPlayerData.playerId).emit('timerTickUpdate', {
            playerColor: currentPlayerColor,
            remainingTime: projectedRemainingTime > 0 ? projectedRemainingTime : 0
        });
    }

    if (projectedRemainingTime <= 0) {
        if (!game.eliminatedPlayers.includes(currentPlayerColor)) {
            console.log(`[Game Timer] Player ${currentPlayerColor} in game ${gameId} timed out. Projected time: ${projectedRemainingTime}`);

            game.playerTimers[currentPlayerColor] = 0;
            game.eliminatedPlayers.push(currentPlayerColor);
            game.lastLogMessage = `${game.playerNames[currentPlayerColor]} (${currentPlayerColor}) timed out and is eliminated!`;
            game.lastLogMessageColor = currentPlayerColor;

            io.to(gameId).emit('playerEliminated', {
                gameId,
                playerColor: currentPlayerColor,
                playerName: game.playerNames[currentPlayerColor],
                message: game.lastLogMessage
            });

            ludoGameLogic.switchPlayer(game);

            io.to(gameId).emit('gameStateUpdate', { gameId, gameState: ludoGameLogic.getGameState(game) });

            const activeNonEliminated = game.activePlayerColors.filter(pColor => !game.eliminatedPlayers.includes(pColor));

            if (activeNonEliminated.length <= 1 && game.activePlayerColors.length > 1) {
                 console.log(`[Game Timer] Game ${gameId} ending due to eliminations. Active non-eliminated: ${activeNonEliminated.length}`);
                 game.overall_game_over = true;
                 if (activeNonEliminated.length === 1) {
                     game.overall_game_winner = activeNonEliminated[0];
                     game.playerScores[game.overall_game_winner] = (game.playerScores[game.overall_game_winner] || 0) + game.targetVictories;
                 }
                 io.to(gameId).emit('overallGameOver', {
                    winnerColor: game.overall_game_winner,
                    winnerName: game.overall_game_winner ? game.playerNames[game.overall_game_winner] : null,
                    finalScores: game.playerScores,
                    message: game.overall_game_winner ? `${game.playerNames[game.overall_game_winner]} wins due to opponent timeouts!` : "Game over due to multiple timeouts."
                 });
                 if (activeGameIntervals[gameId]) {
                    clearInterval(activeGameIntervals[gameId]);
                    delete activeGameIntervals[gameId];
                 }
            } else {
                const newCurrentPlayerColor = ludoGameLogic.getPlayerColor(game); // Variable is declared here
                // The duplicate line that was here has been removed.
                const newCurrentPlayerIsAI = game.playersSetup.find(p => p.color === newCurrentPlayerColor)?.isAI;
                if (newCurrentPlayerIsAI && game.status === 'active' && !game.overall_game_over) {
                    console.log(`[Game Timer ${gameId}] Player ${currentPlayerColor} timed out. Next player ${newCurrentPlayerColor} is AI. Triggering AI move directly.`);
                    setTimeout(() => triggerAIMove(gameId, game), 500); // Directly call triggerAIMove
                }
            }
        }
    }
}
// --- End Game Tick Handler ---

// Server-internal function for readiness timeout
function handleReadinessTimeout(gameId, ioInstance) {
    const game = activeGames[gameId];
    if (!game || game.status !== 'waitingForReady') {
        console.log(`[ReadinessTimeout] Game ${gameId} not found or not in waitingForReady state.`);
        return;
    }

    console.log(`[ReadinessTimeout] Timeout for game ${gameId}.`);
    if (game.readinessTimerId) { // Should always be true if called from timeout
      clearTimeout(game.readinessTimerId);
      game.readinessTimerId = null;
    }

    if (ludoGameLogic.checkIfAllPlayersReady(game)) {
        const startResult = ludoGameLogic.startGameActual(game);
        if (startResult.success) {
            ioInstance.to(gameId).emit('readinessCheckOutcome', { success: true });
            ioInstance.to(gameId).emit('gameStateUpdate', { gameState: getGameState(game) });
            // Check if first player is AI
            if (game.status === 'active') {
                // Start game tick interval if timed game
                if (game.gameTimeMode && game.gameTimeMode !== 'unlimited') {
                    if (activeGameIntervals[gameId]) clearInterval(activeGameIntervals[gameId]);
                    activeGameIntervals[gameId] = setInterval(() => { handleGameTick(gameId, io); }, 1000);
                    console.log(`[Game Timer] Interval started for game ${gameId} with mode ${game.gameTimeMode}`);
                }

                const firstPlayerColor = ludoGameLogic.getPlayerColor(game);
                const firstPlayerSlot = game.playersSetup.find(p => p.color === firstPlayerColor);
                if (firstPlayerSlot && firstPlayerSlot.isAI) {
                    console.log(`[ReadinessTimeout ${gameId}] Game started, first player ${firstPlayerColor} is AI. Triggering AI move.`);
                    setTimeout(() => triggerAIMove(gameId, game), 500);
                }
            }
        } else {
            // Should not happen if checkIfAllPlayersReady was true and logic is sound
            game.status = 'setup'; 
            game.readyPlayers.clear();
            ioInstance.to(gameId).emit('readinessCheckOutcome', { success: false, message: startResult.error || 'Failed to start game after readiness success (internal error).' });
            ioInstance.to(gameId).emit('gameStateUpdate', { gameState: getGameState(game) });
        }
    } else {
        game.status = 'setup'; // Revert to setup phase
        game.readyPlayers.clear(); // Clear any partial readiness
        ioInstance.to(gameId).emit('readinessCheckOutcome', { success: false, message: 'Not all players confirmed readiness in time.' });
        ioInstance.to(gameId).emit('gameStateUpdate', { gameState: getGameState(game) });
    }
}

// --- Earthquake Event Helper ---
function checkAndEmitEarthquake(gameId, game, ioInstance) {
    if (game.earthquakeJustHappened) {
        console.log(`[${gameId}] Earthquake detected! Emitting 'earthquakeActivated'.`);
        ioInstance.to(gameId).emit('earthquakeActivated', {
            message: "Trzęsienie Ziemi! Pionki zmieniły swój kolor. Jesteśmy zgubieni!"
            // newPlayerNames and newPlayerTurnOrderColors are removed
        });
        game.earthquakeJustHappened = false; // Reset the flag
        return true; // Indicates earthquake was handled
    }
    return false; // No earthquake
}

server.listen(PORT, () => {
  console.log(`Ludo server listening on *:${PORT}`);
  startInactivityCheck(); // Start the inactivity checker
});

// --- Game Inactivity Checker ---
const GAME_INACTIVITY_TIMEOUT = 30 * 60 * 1000; // 30 minutes
const CHECK_INACTIVITY_INTERVAL = 5 * 60 * 1000; // 5 minutes
let inactivityCheckIntervalId = null;

function checkInactiveGames() {
    console.log('[InactivityCheck] Checking for inactive games...');
    const now = Date.now();
    Object.keys(activeGames).forEach(gameId => {
        const game = activeGames[gameId];
        if (game && game.lastActivityTime) {
            if (now - game.lastActivityTime > GAME_INACTIVITY_TIMEOUT) {
                console.log(`[InactivityCheck] Game ${gameId} is inactive. Destroying.`);
                io.to(gameId).emit('gameDestroyed', { gameId, reason: `Game inactive for over ${GAME_INACTIVITY_TIMEOUT / 60 / 1000} minutes.` });

                // Clean up sockets in the room before deleting the game
                const roomSockets = io.sockets.adapter.rooms.get(gameId);
                if (roomSockets) {
                    roomSockets.forEach(socketId => {
                        const socketInstance = io.sockets.sockets.get(socketId);
                        if (socketInstance) {
                            socketInstance.leave(gameId);
                            // Optionally, perform other cleanup specific to each socket if needed
                        }
                    });
                }
                // Clear interval when game is destroyed by inactivity
                if (activeGameIntervals[gameId]) {
                    clearInterval(activeGameIntervals[gameId]);
                    delete activeGameIntervals[gameId];
                    console.log(`[Game Timer] Cleared interval for inactive game ${gameId}.`);
                }
                delete activeGames[gameId];
            }
        } else if (game && !game.lastActivityTime) {
            // If a game somehow exists without a lastActivityTime, set it now so it can be timed out in the future.
            // This could happen if games were created before this feature was added and not yet updated.
            console.warn(`[InactivityCheck] Game ${gameId} found without lastActivityTime. Initializing it now.`);
            game.lastActivityTime = now;
        }
    });
}

function startInactivityCheck() {
    if (inactivityCheckIntervalId) {
        clearInterval(inactivityCheckIntervalId);
    }
    inactivityCheckIntervalId = setInterval(checkInactiveGames, CHECK_INACTIVITY_INTERVAL);
    console.log(`Inactivity check started. Interval: ${CHECK_INACTIVITY_INTERVAL / 60 / 1000} mins, Timeout: ${GAME_INACTIVITY_TIMEOUT / 60 / 1000} mins.`);
}

function stopInactivityCheck() {
    if (inactivityCheckIntervalId) {
        clearInterval(inactivityCheckIntervalId);
        inactivityCheckIntervalId = null;
        console.log('Inactivity check stopped.');
    }
}

module.exports = {
    app,
    server,
    io,
    activeGames,
    stopInactivityCheck,
    checkInactiveGames, // Export for testing
    GAME_INACTIVITY_TIMEOUT, // Export for testing
    // Note: nextGameId is not exported as it's an internal counter managed by server.js
};

// --- AI Turn Management ---
async function triggerAIMove(gameId, game) {
    // Ensure game object is valid and has lastActivityTime before proceeding
    if (!game || !activeGames[gameId]) { // Check if game still exists in activeGames
        console.log(`[triggerAIMove ${gameId}] Game not found in activeGames. AI will not move.`);
        return;
    }
    if (game.status !== 'active') {
        console.log(`[triggerAIMove ${gameId}] Game not active. AI will not move.`);
        return;
    }
    // Update activity time when AI is triggered to make a move
    game.lastActivityTime = Date.now();

    if (!game || game.status !== 'active') { // Re-check status after potential time passing
        console.log(`[triggerAIMove ${gameId}] Game became not active or not found before AI move execution. AI will not move.`);
        return;
    }

    let earthquakeJustOccurredInAITurn = false;
    if (game.earthquakeModeEnabled) {
        // Check if the first earthquake can be triggered
        if (game.earthquakesOccurredThisRound === 0 && !game.firstEarthquakeTriggered) {
            if (ludoGameLogic.checkAndTriggerFirstEarthquake(game)) { // This function sets game.earthquakeJustHappened
                earthquakeJustOccurredInAITurn = true;
            }
        }
        // Potential check for second earthquake (less common at turn start for AI)
        // else if (game.earthquakesOccurredThisRound === 1 && !game.secondEarthquakeTriggered) {
        //    if (ludoGameLogic.checkAndTriggerSecondEarthquake(game)) {
        //        earthquakeJustOccurredInAITurn = true;
        //    }
        // }
    }

    // This helper emits 'earthquakeActivated' if game.earthquakeJustHappened was set true by the above calls,
    // and then it resets game.earthquakeJustHappened.
    // The 'earthquakeJustOccurredInAITurn' variable holds whether it happened *this specific time* for makeAIMove.
    if (checkAndEmitEarthquake(gameId, game, io)) {
         io.to(gameId).emit('gameStateUpdate', { gameState: getGameState(game) });
         // If an earthquake was emitted, it means earthquakeJustOccurredInAITurn would have been true if triggered by the checks above.
         // The flag game.earthquakeJustHappened is reset by checkAndEmitEarthquake.
    }
    // Note: The specific `ludoGameLogic.checkAndTriggerFirstEarthquake(game);` call that was here previously
    // is now integrated into the logic above to set `earthquakeJustOccurredInAITurn`.

    const aiPlayerColor = ludoGameLogic.getPlayerColor(game);
    const aiPlayerSlot = game.playersSetup.find(p => p.color === aiPlayerColor);

    if (!aiPlayerSlot || !aiPlayerSlot.isAI) {
        console.log(`[triggerAIMove ${gameId}] Current player ${aiPlayerColor} is not AI. AI will not move.`);
        return;
    }

    console.log(`[triggerAIMove ${gameId}] AI player ${aiPlayerColor}'s turn.`);

    try {
        const aiActionResult = ludoGameLogic.makeAIMove(game, earthquakeJustOccurredInAITurn); // Pass the flag

        console.log(`[triggerAIMove ${gameId}] AI action result:`, JSON.stringify(aiActionResult, null, 2));

        // Broadcast AI's dice roll
        io.to(gameId).emit('diceRolled', {
            playerColor: aiPlayerColor,
            diceValue: aiActionResult.diceRoll,
            consecutiveSixes: game.consecutive_sixes_count, // game object is updated by makeAIMove
            mustRollAgain: aiActionResult.mustRollAgain,
            awaitingMove: false // AI move is immediate
        });

        // If a pawn was moved
        if (aiActionResult.movedPawnId !== undefined && aiActionResult.action !== "consecutive_3_sixes" && aiActionResult.action !== "failed_to_roll_6_in_3_tries" && aiActionResult.action !== "no_movable_pawns_not_6" && aiActionResult.action !== "no_valid_move_chosen_or_execution_failed") {
            io.to(gameId).emit('pawnMoved', {
                playerColor: aiPlayerColor,
                pawnId: aiActionResult.movedPawnId,
                diceValue: aiActionResult.diceRoll,
                newPos: aiActionResult.newPosition,
                newState: aiActionResult.newPawnState,
                autoMoved: aiActionResult.autoMovedFromHome || false // Ensure it's defined
            });
        }

        // Handle Round/Game Over (makeAIMove might set game.round_over)
        if (game.round_over) {
            const victoryCheck = ludoGameLogic.checkForGameVictory(game); // This updates game.status to 'gameOver' if needed

            io.to(gameId).emit('roundOver', {
                roundWinnerColor: game.round_winner,
                roundWinnerName: game.playerNames[game.round_winner],
                playerScores: game.playerScores,
                overallWinnerFound: victoryCheck.overallWinnerFound,
                overallGameWinnerColor: victoryCheck.winner,
                overallGameWinnerName: victoryCheck.winner ? game.playerNames[victoryCheck.winner] : null
            });

            if (victoryCheck.overallWinnerFound) {
                io.to(gameId).emit('overallGameOver', {
                    winnerColor: game.overall_game_winner,
                    winnerName: game.playerNames[game.overall_game_winner],
                    finalScores: game.playerScores
                });
                // Clear interval on overall game over (AI move)
                if (activeGameIntervals[gameId]) {
                    clearInterval(activeGameIntervals[gameId]);
                    delete activeGameIntervals[gameId];
                    console.log(`[Game Timer] Cleared interval for game ${gameId} due to overall game over (AI move).`);
                }
                const winnerName = game.playerNames[game.overall_game_winner];
                if (winnerName) { // Update global scores if winner exists
                    globalPlayerScores[winnerName] = (globalPlayerScores[winnerName] || 0) + 2; // Simplified scoring
                    // Save updated leaderboard
                    fs.writeFile(LEADERBOARD_FILE, JSON.stringify(globalPlayerScores, null, 2), (err) => {
                        if (err) {
                            console.error('Error saving leaderboard data:', err);
                        } else {
                            console.log('Leaderboard data saved successfully.');
                        }
                    });
                }
            } else { // Overall game is not over
                // Since this is triggerAIMove, the roundWinner is definitely the current AI player.
                const roundWinnerColor = game.round_winner;
                console.log(`[${gameId}] AI player ${roundWinnerColor} won the round (from triggerAIMove). Automatically starting next round.`);
                ludoGameLogic.startNextRound(game);
                io.to(gameId).emit('nextRoundStarted', { message: 'Next round starting automatically.' });
                io.to(gameId).emit('gameStateUpdate', { gameState: getGameState(game) });

                const newCurrentPlayerColor = ludoGameLogic.getPlayerColor(game);
                const newCurrentPlayerIsAI = game.playersSetup.some(p => p.color === newCurrentPlayerColor && p.isAI);
                if (newCurrentPlayerIsAI && game.status === 'active') {
                    console.log(`[${gameId}] New current player ${newCurrentPlayerColor} is AI. Triggering AI move for new round.`);
                    setTimeout(() => triggerAIMove(gameId, game), 1000);
                }
            }
            // No need for io.to(gameId).emit('gameStateUpdate', { gameState: getGameState(game) }); here as it's done inside branches
            return; // End AI turn processing here if round/game is over
        }

        // Handle "Must Roll Again" for AI
        if (aiActionResult.mustRollAgain && game.status === 'active' && !game.round_over && !game.overall_game_over) {
            io.to(gameId).emit('gameStateUpdate', { gameState: getGameState(game) });
            console.log(`[triggerAIMove ${gameId}] AI ${aiPlayerColor} must roll again (e.g. rolled 6, or trying for 6 from home). Scheduling next AI move.`);
            setTimeout(() => triggerAIMove(gameId, game), 1000);
        }
        // If the turn explicitly ends, or if it's not a "must roll again" situation (and game not over)
        // This ensures the game progresses if the AI isn't entitled to another immediate action.
        else if (aiActionResult.turnEnds || (!aiActionResult.mustRollAgain && game.status === 'active' && !game.round_over && !game.overall_game_over)) {
            console.log(`[triggerAIMove ${gameId}] AI ${aiPlayerColor} turn ends. TurnEnds: ${aiActionResult.turnEnds}, MustRollAgain: ${aiActionResult.mustRollAgain}. Processing turn end.`);

            // If a lastLogMessage (e.g., from AI capture) was generated by the AI's move,
            // send it now before it's cleared by switchPlayer.
            if (game.lastLogMessage) {
                io.to(gameId).emit('gameStateUpdate', { gameState: getGameState(game) });
            }

            ludoGameLogic.switchPlayer(game); // Clears lastLogMessage for the next player's state

            // Handle potential earthquake after player switch.
            checkAndEmitEarthquake(gameId, game, io);
            // checkAndEmitEarthquake emits its own 'earthquakeActivated' and potentially a gameStateUpdate.

            const newCurrentPlayerColor = ludoGameLogic.getPlayerColor(game);
            io.to(gameId).emit('turnChanged', { currentPlayer: newCurrentPlayerColor });
            // The gameStateUpdate here sends the state *after* switchPlayer (and potential earthquake updates)
            io.to(gameId).emit('gameStateUpdate', { gameState: getGameState(game) });

            // ... existing AI check for next turn ...
            const nextPlayerSlot = game.playersSetup.find(p => p.color === newCurrentPlayerColor);
            if (nextPlayerSlot && nextPlayerSlot.isAI && game.status === 'active') {
                 console.log(`[triggerAIMove ${gameId}] Next player ${newCurrentPlayerColor} is AI. Scheduling their move.`);
                 setTimeout(() => triggerAIMove(gameId, game), 500);
            }
        }
        // If game is over (round_over or overall_game_over), no player switching or further AI move triggering here.
        // The 'gameStateUpdate' after round/game over handling is sufficient.
        // If none of the above conditions, it might be a state where game ended AND mustRollAgain was true,
        // in which case the return after game over handling prevents further action. Or simply an update is enough.
        else if (game.status !== 'active' || game.round_over || game.overall_game_over) {
             // Game ended, just ensure clients have the latest state.
            io.to(gameId).emit('gameStateUpdate', { gameState: getGameState(game) });
        }


    } catch (error) {
        console.error(`[triggerAIMove ${gameId}] Error during AI move for ${aiPlayerColor}:`, error);
        // Consider how to handle AI errors - maybe switch player or end turn?
        // For now, just log and emit game state.
        if (game.status === 'active') {
            ludoGameLogic.switchPlayer(game); // Basic error handling: switch player
            checkAndEmitEarthquake(gameId, game, io); // Check and emit earthquake
            io.to(gameId).emit('turnChanged', { currentPlayer: ludoGameLogic.getPlayerColor(game) });
        }
        io.to(gameId).emit('gameStateUpdate', { gameState: getGameState(game) });
    }
}
