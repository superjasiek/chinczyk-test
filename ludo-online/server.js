const express = require('express');
const http = require('http');
const { Server } = require("socket.io");

let globalPlayerScores = {};
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

  socket.on('createGame', ({ playerName }) => { // Destructure playerName from data
    const gameId = `game${nextGameId++}`;
    const creatorPlayerId = socket.id;

    if (!playerName || typeof playerName !== 'string' || playerName.trim() === '') {
      socket.emit('actionError', { message: 'Player name is required for creating a game.' });
      return;
    }
    const trimmedPlayerName = playerName.trim();

    const game = createLudoGameInstance(gameId, trimmedPlayerName, creatorPlayerId);
    activeGames[gameId] = game;
    
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
    if (game.status !== 'active') return socket.emit('actionError', {message: 'Game not active.'});


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

    let diceResult;

    if (ludoGameLogic.areAllPawnsHome(game, actualPlayerColor)) {
        game.threeTryAttempts++;
        diceResult = ludoGameLogic.rollDice();
        game.dice_roll = diceResult;
        
        if (diceResult === 6) {
            game.consecutive_sixes_count = 1; 
            game.threeTryAttempts = 0; 
            const homePawns = game.pawns[actualPlayerColor].filter(p => p.state === ludoGameLogic.PAWN_STATES.HOME);
            if (homePawns.length > 0) {
                const pawnToMoveId = homePawns[0].id; 
                ludoGameLogic.movePawn(game, actualPlayerColor, pawnToMoveId, diceResult);
                io.to(gameId).emit('pawnMoved', { playerColor: actualPlayerColor, pawnId: pawnToMoveId, diceValue: diceResult, newPos: game.pawns[actualPlayerColor].find(p=>p.id === pawnToMoveId).position, autoMoved: true });
            }
            game.mustRollAgain = true; 
            game.awaitingMove = false; 
        } else { 
            if (game.threeTryAttempts === 3) {
                game.threeTryAttempts = 0;
                ludoGameLogic.switchPlayer(game);
                io.to(gameId).emit('turnChanged', { currentPlayer: ludoGameLogic.getPlayerColor(game) });
            } else {
                game.mustRollAgain = true; 
                game.awaitingMove = false; 
            }
        }
    } else { 
        diceResult = ludoGameLogic.rollDice();
        game.dice_roll = diceResult;

        if (diceResult === 6) {
            game.consecutive_sixes_count++;
        } else {
            game.consecutive_sixes_count = 0;
        }

        if (game.consecutive_sixes_count === 3) {
            io.to(gameId).emit('rolledThreeSixes', { playerColor: actualPlayerColor, diceResult });
            ludoGameLogic.switchPlayer(game);
            io.to(gameId).emit('turnChanged', { currentPlayer: ludoGameLogic.getPlayerColor(game) });
        } else {
            const movablePawns = ludoGameLogic.getMovablePawns(game, actualPlayerColor, diceResult);
            if (movablePawns.length === 0) {
                if (diceResult !== 6) { 
                    ludoGameLogic.switchPlayer(game);
                    io.to(gameId).emit('turnChanged', { currentPlayer: ludoGameLogic.getPlayerColor(game) });
                } else { 
                    game.mustRollAgain = true;
                }
            } else { 
                game.awaitingMove = true;
                if (movablePawns.length === 1) {
                     io.to(gameId).emit('diceRolled', { playerColor: actualPlayerColor, diceValue: diceResult, consecutiveSixes: game.consecutive_sixes_count, mustRollAgain: game.mustRollAgain, awaitingMove: game.awaitingMove, singleMovePawnId: movablePawns[0] });
                     io.to(gameId).emit('gameStateUpdate', { gameState: getGameState(game) });
                     return; 
                }
            }
        }
    }
    
    io.to(gameId).emit('diceRolled', { playerColor: actualPlayerColor, diceValue: diceResult, consecutiveSixes: game.consecutive_sixes_count, mustRollAgain: game.mustRollAgain, awaitingMove: game.awaitingMove });
    io.to(gameId).emit('gameStateUpdate', { gameState: getGameState(game) });
  });

  socket.on('movePawn', (data) => {
    const { gameId, pawnId } = data;
    const game = activeGames[gameId];
    
    if (!game) return socket.emit('actionError', { message: 'Game not found.' });
    if (game.status !== 'active') return socket.emit('actionError', {message: 'Game not active.'});

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
                io.to(gameId).emit('overallGameOver', { 
                    winnerColor: game.overall_game_winner,
                    winnerName: game.playerNames[game.overall_game_winner],
                    finalScores: game.playerScores 
                });
                const winnerName = game.playerNames[game.overall_game_winner];
                if (winnerName) {
                    globalPlayerScores[winnerName] = (globalPlayerScores[winnerName] || 0) + 2; // Simplified scoring
                }
                delete activeGames[gameId]; 
                return; 
            } else {
                game.awaitingNextRoundConfirmationFrom = game.round_winner;
            }
        } else { 
            if (diceValue === 6 && game.consecutive_sixes_count < 3) {
                game.mustRollAgain = true;
            } else {
                ludoGameLogic.switchPlayer(game);
                io.to(gameId).emit('turnChanged', { currentPlayer: ludoGameLogic.getPlayerColor(game) });
            }
        }
    } else {
        socket.emit('actionError', { message: 'Invalid move.' });
        game.awaitingMove = true; 
    }
    
    io.to(gameId).emit('gameStateUpdate', { gameState: getGameState(game) }); 
  });

  socket.on('creatorFinalizeSettings', (data) => {
    const { gameId, settings } = data;
    const game = activeGames[gameId];

    if (!game) return socket.emit('actionError', { message: 'Game not found.' });
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
    if (game.status !== 'setup') return socket.emit('actionError', { message: 'Cannot select color outside of setup phase.' });
    
    // Player ID is from the socket that sent the event
    const result = ludoGameLogic.handlePlayerColorSelection(game, socket.id, color);

    if (result.success) {
      // Update playerColor on socket for older handlers if they rely on it (though ideally they use playerId)
      socket.playerColor = color; 
      io.to(gameId).emit('gameStateUpdate', { gameState: getGameState(game) });
    } else {
      socket.emit('actionError', { message: result.error || 'Failed to select color.' });
    }
  });

  socket.on('creatorRequestsGameStart', (data) => {
    const { gameId } = data; // Settings are now part of the game instance via creatorFinalizeSettings
    const game = activeGames[gameId];

    if (!game) return socket.emit('actionError', { message: 'Game not found.' });
    if (socket.id !== game.creatorPlayerId) return socket.emit('actionError', { message: 'Only creator can start the game.' });
    if (game.status !== 'setup') return socket.emit('actionError', { message: 'Game not in setup phase.' });

    // Preconditions for starting readiness check (already in ludoGame.initiateReadinessCheck)
    const readinessCheckResult = ludoGameLogic.initiateReadinessCheck(game);

    if (!readinessCheckResult.success) {
        return socket.emit('actionError', { message: readinessCheckResult.error || "Cannot start readiness check." });
    }
    
    // Clear any existing timer for this game, just in case
    if (game.readinessTimerId) {
        clearTimeout(game.readinessTimerId);
    }
    game.readinessTimerId = setTimeout(() => handleReadinessTimeout(gameId, io), READINESS_TIMEOUT_SECONDS * 1000);
    
    io.to(gameId).emit('initiateReadinessCheck', { 
        timeout: READINESS_TIMEOUT_SECONDS, 
        initialReadyStatus: ludoGameLogic.getReadyPlayersStatus(game) 
    });
    io.to(gameId).emit('gameStateUpdate', { gameState: getGameState(game) }); // Reflects status change to 'waitingForReady'
  });

  socket.on('playerReady', (data) => {
    const { gameId } = data;
    const game = activeGames[gameId];

    if (!game) return socket.emit('actionError', { message: 'Game not found.' });
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
  });


  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    const gameId = socket.gameId; // Game ID stored on socket
    const playerId = socket.playerId; // Player ID stored on socket

    if (gameId && activeGames[gameId]) {
      const game = activeGames[gameId];
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
            // Handle if game should end due to disconnection (e.g., < 2 players)
            const activePlayerCount = game.playersSetup.filter(p => p.playerId !== null && p.color !== null).length;
            if (activePlayerCount < 2) { // Assuming 2 is min for active game
                console.log(`Game ${gameId} has less than 2 players, ending game.`);
                // Potentially set status to gameOver or just delete
                io.to(gameId).emit('actionError', { message: "Game ended due to insufficient players."}); // Notify remaining
                delete activeGames[gameId];
                return;
            }
        }
        
        const remainingPlayers = game.playersSetup.filter(p => p.playerId !== null).length;
        if (remainingPlayers === 0 && game.status !== 'active' && game.status !== 'gameOver') { // Don't delete active/finished games this way
            console.log(`Game ${gameId} is empty, deleting.`);
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


server.listen(PORT, () => {
  console.log(`Ludo server listening on *:${PORT}`);
});

module.exports = { app, server, io, activeGames }; // Export activeGames for potential inspection/testing
