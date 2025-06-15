// ludoGame.js - Core Ludo Game Logic
const fs = require('fs');
const path = require('path');

// --- Constants ---
const PLAYER_COLORS = ["Red", "Green", "Yellow", "Blue"];
const PLAYER_INITIALS = { "Red": "R", "Green": "G", "Yellow": "Y", "Blue": "B" };

const TRACK_LENGTH = 48; // Updated to 48 cells
const HOME_STRETCH_LENGTH = 4; // Remains 4
const NUM_PAWNS_PER_PLAYER = 4;

const PLAYER_START_POSITIONS = { "Red": 0, "Green": 12, "Yellow": 24, "Blue": 36 };
const PLAYER_PATH_END_BEFORE_HOME_STRETCH = { "Red": 47, "Green": 11, "Yellow": 23, "Blue": 35 };

const PAWN_STATES = {
    HOME: "home",
    ACTIVE: "active",
    HOMESTRETCH: "homestretch",
    FINISHED: "finished"
};

// --- Initialization Functions ---

// Note: initializeGameBoard and initializePawns remain as they are,
// but will be called by startGameActual, not directly by createLudoGameInstance.

let FUNNY_COMMENTS = {};
try {
    const commentsPath = path.join(__dirname, 'funny_comments.json');
    const commentsData = fs.readFileSync(commentsPath, 'utf8');
    FUNNY_COMMENTS = JSON.parse(commentsData);
} catch (err) {
    console.error("Error loading funny comments:", err);
    // Fallback to empty comments if file not found or error in parsing
    FUNNY_COMMENTS = {
        "capture": [],
        "threeFinished": [],
        "rapidHits": []
    };
}

function initializeGameBoard(activePlayerColors) {
    const board = {
        track: Array(TRACK_LENGTH).fill(null), // Array of nulls
        players: {},
        blackHolePosition: null // Added for black hole mode
    };
    activePlayerColors.forEach(color => {
        board.players[color] = {
            home_area_count: NUM_PAWNS_PER_PLAYER,
            home_stretch: Array(HOME_STRETCH_LENGTH).fill(null), // Array of nulls
            finished_count: 0
        };
    });
    return board;
}

function initializePawns(activePlayerColors) {
    const pawns = {};
    activePlayerColors.forEach(color => {
        pawns[color] = [];
        for (let i = 0; i < NUM_PAWNS_PER_PLAYER; i++) {
            pawns[color].push({
                id: i,
                state: PAWN_STATES.HOME,
                position: null, // null for home, integer for track/HS
            });
        }
    });
    return pawns;
}

// Creates a new game instance object
function createLudoGameInstance(gameId, creatorPlayerName, creatorPlayerId, options = {}) {
    if (!gameId || !creatorPlayerName || !creatorPlayerId) {
        throw new Error("Game ID, creator name, and creator ID are required to create a game.");
    }

    const playersSetup = [];
    playersSetup.push({
        slotId: 0,
        playerId: creatorPlayerId,
        playerName: creatorPlayerName,
        color: null, // Color selection happens via UI
        isCreator: true,
        isAI: false
    });

    // Initialize remaining slots up to a default max (e.g. 4)
    // Slot 1 is potentially for AI
    if (options.enableAI && PLAYER_COLORS.length > 1) { // Check if AI can be enabled
        playersSetup.push({
            slotId: 1,
            playerId: 'AI_PLAYER_ID', // Special ID for AI
            playerName: 'Computer',
            color: null, // AI color will be assigned by assignColorToAI
            isCreator: false,
            isAI: true
        });
        // Initialize further slots, skipping slot 1 if taken by AI
        for (let i = 2; i < 4; i++) {
            playersSetup.push({ slotId: i, playerId: null, playerName: null, color: null, isCreator: false, isAI: false });
        }
    } else {
        // No AI or not enough colors, initialize all other slots as normal
        for (let i = 1; i < 4; i++) {
            playersSetup.push({ slotId: i, playerId: null, playerName: null, color: null, isCreator: false, isAI: false });
        }
    }

    // This is the game instance object
    const gameInstance = {
        gameId: gameId,
        creatorPlayerId: creatorPlayerId,
        status: 'setup', // 'setup', 'waitingForReady', 'active', 'roundOver', 'gameOver'
        
        playersSetup: playersSetup,
        num_players_setting: null, // Target number of players, set by creator
        targetVictories_setting: null, // Set by creator
        gameTimeMode_setting: null, // Will be set by creator via setGameParameters

        // Game-play related properties, initialized in startGameActual
        board: null,
        pawns: null,
        num_players: 0,       // Actual number of players in the game once started
        players: [],          // Colors of active players in order
        activePlayerColors: [], // Unique colors of active players
        playerNames: {},      // Map color to name for active players
        playerScores: {},
        targetVictories: 1,   // Actual target victories for the started game
        blackHoleModeEnabled: false, // Added for black hole mode
        
        current_player_index: 0,
        dice_roll: null,
        consecutive_sixes_count: 0,
        round_over: false,
        round_winner: null,
        overall_game_over: false,
        overall_game_winner: null,
        threeTryAttempts: 0,
        mustRollAgain: false,
        awaitingMove: false,

        // Readiness properties
        readyPlayers: new Set(), // Stores playerIds of those who confirmed readiness
        readinessTimerId: null, // To store setTimeout ID for readiness check

        // New Black Hole properties
        blackHoleActivationPawnCountTarget: null,
        blackHoleHasAppearedThisRound: false,

        // New Earthquake Mode properties
        earthquakeModeEnabled: false,
        earthquakeActivationTurnTargets: [null, null], // Updated
        earthquakesOccurredThisRound: 0, // Updated
        earthquakeTargetHitFlags: [false, false], // Added
        currentRoundTurnCounter: 0,
        roundStartTime: null,
        firstEarthquakeTriggered: false,
        secondEarthquakeTriggered: false,
        lastLogMessage: null,
        lastLogMessageColor: null,
        playerHitTimestamps: {}, // Added this line
        playerConsecutiveNonSixRolls: {},
        lastActivityTime: Date.now(),

        // Timer related properties
        gameTimeMode: null, // e.g., '4min', '6min', 'unlimited'
        playerTimers: {}, // e.g., { "Red": 240, "Green": 240 }
        playerTurnStartTime: null, // timestamp, e.g., Date.now()
        eliminatedPlayers: [], // e.g., ["Red"]
        initialTimePerPlayer: null, // e.g., 240 or 360
    };

    return gameInstance;
}


// --- Core Game Functions (adapted to take 'game' instance) ---

function rollDice() { // This is a utility, doesn't need 'game'
    // This function is a utility and does not modify game state directly.
    // lastActivityTime will be updated in the functions that call this,
    // like makeAIMove or processPlayerRoll.
    return Math.floor(Math.random() * 6) + 1;
}

function getPlayerColor(game) {
    if (game.status !== 'active' && game.status !== 'roundOver') { // Only relevant when game is active or round over
        return null; // Or handle as appropriate for other statuses
    }
    if (game.activePlayerColors && game.activePlayerColors.length > 0) {
        const playerIndex = game.current_player_index % game.activePlayerColors.length;
        return game.activePlayerColors[playerIndex];
    }
    console.error("[ludoGame.js getPlayerColor] Error: activePlayerColors is undefined, empty, or current_player_index is problematic.");
    return null;
}

function areAllPawnsHome(game, playerColor) {
    if (!game.board || !game.board.players[playerColor]) return true; // Default to true if board/player not initialized
    return game.board.players[playerColor].home_area_count === NUM_PAWNS_PER_PLAYER;
}

function getMovablePawns(game, playerColor, diceValue) {
    if (game.status !== 'active') return [];
    const movableIds = [];
    const playerPawns = game.pawns[playerColor];

    if (areAllPawnsHome(game, playerColor) && diceValue !== 6) {
        return [];
    }

    for (const pawn of playerPawns) {
        // console.log(`[getMovablePawns TRACE] Evaluating Pawn ID: ${pawn.id}, State: ${pawn.state}, Position: ${pawn.position}, Color: ${playerColor}, Dice: ${diceValue}`);
        if (pawn.state === PAWN_STATES.HOME) {
            if (diceValue === 6) {
                const startPos = PLAYER_START_POSITIONS[playerColor];
                const occupantAtStart = game.board.track[startPos];
                if (!occupantAtStart || occupantAtStart[0] !== playerColor) {
                    movableIds.push(pawn.id);
                }
            }
        } else if (pawn.state === PAWN_STATES.ACTIVE) {
            let tempNewAbsPos = pawn.position;
            let entersHs = false;
            for (let i = 0; i < diceValue; i++) {
                const playerHomeEntry = PLAYER_PATH_END_BEFORE_HOME_STRETCH[playerColor];
                if (tempNewAbsPos === playerHomeEntry) {
                    const remainingMoves = diceValue - (i + 1);
                    const hsTargetIdx = remainingMoves;
                    if (hsTargetIdx < HOME_STRETCH_LENGTH) {
                        if (game.board.players[playerColor].home_stretch[hsTargetIdx] === null) {
                            movableIds.push(pawn.id);
                        }
                        entersHs = true;
                    } else {
                        if (hsTargetIdx === HOME_STRETCH_LENGTH) {
                            movableIds.push(pawn.id);
                        }
                        entersHs = true; 
                    }
                    break; 
                }
                tempNewAbsPos = (tempNewAbsPos + 1) % TRACK_LENGTH;
            }

            if (!entersHs) {
                const finalDestAbsTrack = tempNewAbsPos;
                const occupant = game.board.track[finalDestAbsTrack];
                if (!occupant || occupant[0] !== playerColor) {
                    movableIds.push(pawn.id);
                }
            }
        } else if (pawn.state === PAWN_STATES.HOMESTRETCH) {
            const targetHsIdx = pawn.position + diceValue;
            if (targetHsIdx <= HOME_STRETCH_LENGTH) {
                if (targetHsIdx < HOME_STRETCH_LENGTH) {
                    if (game.board.players[playerColor].home_stretch[targetHsIdx] === null) {
                        movableIds.push(pawn.id);
                    }
                } else { 
                    movableIds.push(pawn.id);
                }
            }
        }
    }
    // console.log(`[getMovablePawns TRACE] Returning movableIds: [${movableIds.join(', ')}] for Player: ${playerColor}, Dice: ${diceValue}`);
    return movableIds;
}

function switchPlayer(game) {
    game.lastActivityTime = Date.now();
    game.lastLogMessage = null;
    game.lastLogMessageColor = null;
    if (game.status !== 'active') return;

    // --- Timer Logic: Update previous player's timer ---
    if (game.gameTimeMode && game.gameTimeMode !== 'unlimited' && game.playerTurnStartTime !== null && game.activePlayerColors && game.activePlayerColors.length > 0) {
        const now = Date.now();
        const previousPlayerIndex = game.current_player_index % game.activePlayerColors.length; // current_player_index is still for the player whose turn just ended
        const previousPlayerColor = game.activePlayerColors[previousPlayerIndex];
        const previousPlayerIsAI = game.playersSetup.find(p => p.color === previousPlayerColor)?.isAI;

        if (previousPlayerColor && !game.eliminatedPlayers.includes(previousPlayerColor) && !previousPlayerIsAI) {
            const elapsedSeconds = Math.floor((now - game.playerTurnStartTime) / 1000);
            if (game.playerTimers[previousPlayerColor] !== null) {
                game.playerTimers[previousPlayerColor] -= elapsedSeconds;
                // Basic elimination check (server might do more complex checks)
                if (game.playerTimers[previousPlayerColor] <= 0) {
                    game.playerTimers[previousPlayerColor] = 0; // Ensure timer doesn't go negative
                    if (!game.eliminatedPlayers.includes(previousPlayerColor)) {
                        game.eliminatedPlayers.push(previousPlayerColor);
                        console.log(`Player ${previousPlayerColor} eliminated due to timer.`);
                        // Further logic for handling elimination (e.g., skipping turns) will be managed by server / turn progression logic.
                    }
                }
            }
        }
    }
    // --- End Timer Logic for previous player ---

    // Earthquake mode check (Removed old logic)
    // New earthquake logic will be called elsewhere or handled differently

    game.consecutive_sixes_count = 0;
    if (game.activePlayerColors && game.activePlayerColors.length > 0) {
        game.current_player_index = (game.current_player_index + 1) % game.activePlayerColors.length;

        // Skip eliminated players
        let attempts = 0; // To prevent infinite loop if all players eliminated
        while (game.eliminatedPlayers.includes(game.activePlayerColors[game.current_player_index % game.activePlayerColors.length]) && attempts < game.activePlayerColors.length) {
            game.current_player_index = (game.current_player_index + 1) % game.activePlayerColors.length;
            attempts++;
        }

        // Check if all players are eliminated (e.g. if only one non-eliminated player remains, they are the winner)
        // This basic check might be expanded in server.js
        const activeNonEliminatedPlayers = game.activePlayerColors.filter(pColor => !game.eliminatedPlayers.includes(pColor));
        if (activeNonEliminatedPlayers.length <= 1 && game.activePlayerColors.length > 1) { // If 1 or 0 players left, and there was more than 1 to start
             // Game might end or round might end. Server should handle this state.
             // For now, just log. A more robust solution might set a game state.
             console.log("All or all but one player eliminated by timer. Game may need to end.");
        }

    } else {
        console.error("[ludoGame.js switchPlayer] Error: Cannot switch player, activePlayerColors is empty or undefined.");
    }
    game.dice_roll = null;
    game.threeTryAttempts = 0;
    game.mustRollAgain = false;
    game.awaitingMove = false;

    // --- Timer Logic: Set start time for new current player ---
    if (game.gameTimeMode && game.gameTimeMode !== 'unlimited' && game.activePlayerColors && game.activePlayerColors.length > 0) {
        const currentPlayerColor = game.activePlayerColors[game.current_player_index % game.activePlayerColors.length];
        const currentPlayerIsAI = game.playersSetup.find(p => p.color === currentPlayerColor)?.isAI;

        if (currentPlayerColor && !game.eliminatedPlayers.includes(currentPlayerColor) && !currentPlayerIsAI) {
            game.playerTurnStartTime = Date.now();
        } else {
            game.playerTurnStartTime = null; // AI, eliminated, or unlimited time
        }
    } else {
        game.playerTurnStartTime = null; // Unlimited time or game not started properly
    }
    // --- End Timer Logic for new player ---
}

function movePawn(game, pawnOwnerColor, pawnId, diceValue) {
    game.lastActivityTime = Date.now();
    if (game.status !== 'active') return false;
    const playerPawns = game.pawns[pawnOwnerColor];
    let pawnToMove = null;
    let pawnIndexInList = -1;

    for (let i = 0; i < playerPawns.length; i++) {
        if (playerPawns[i].id === pawnId) {
            pawnToMove = playerPawns[i];
            pawnIndexInList = i;
            break;
        }
    }

    if (!pawnToMove) return false; 

    if (pawnToMove.state === PAWN_STATES.HOME) {
        if (diceValue === 6) {
            const startPos = PLAYER_START_POSITIONS[pawnOwnerColor];
            const occupant = game.board.track[startPos];
            if (occupant) {
                const occPlayerColor = occupant[0];
                const occPawnListIndex = occupant[1];
                const opponentPawnObject = game.pawns[occPlayerColor][occPawnListIndex];
                if (occPlayerColor !== pawnOwnerColor) {
                    opponentPawnObject.state = PAWN_STATES.HOME;
                    opponentPawnObject.position = null;
                    game.board.players[occPlayerColor].home_area_count++;
                    if (!game.playerHitTimestamps[pawnOwnerColor]) {
                        game.playerHitTimestamps[pawnOwnerColor] = []; // Initialize if not present, as a safeguard
                    }
                    game.playerHitTimestamps[pawnOwnerColor].push(Date.now());
                    checkAndTriggerRapidHitsComment(game, pawnOwnerColor);
                    game.board.track[startPos] = null; 
                    const captureComments = FUNNY_COMMENTS.capture || [];
                    if (captureComments.length > 0) {
                        const randomComment = captureComments[Math.floor(Math.random() * captureComments.length)];
                        const attackerName = game.playerNames[pawnOwnerColor];
                        const victimName = game.playerNames[occPlayerColor];
                        const formattedComment = randomComment.replace("{X}", attackerName).replace("{Y}", victimName);
                        game.lastLogMessage = formattedComment;
                        game.lastLogMessageColor = pawnOwnerColor;
                    }
                } else { 
                    return false;
                }
            }
            pawnToMove.state = PAWN_STATES.ACTIVE;
            pawnToMove.position = startPos;
            game.board.track[startPos] = [pawnOwnerColor, pawnIndexInList];
            game.board.players[pawnOwnerColor].home_area_count--;
            return true;
        }
        return false;
    }
    else if (pawnToMove.state === PAWN_STATES.ACTIVE) {
        const currentAbsPos = pawnToMove.position;
        game.board.track[currentAbsPos] = null; 
        const playerHomeEntryTrackPos = PLAYER_PATH_END_BEFORE_HOME_STRETCH[pawnOwnerColor];
        let newAbsPosOnTrack = currentAbsPos;

        for (let i = 0; i < diceValue; i++) {
            if (newAbsPosOnTrack === playerHomeEntryTrackPos) {
                const remainingMoves = diceValue - (i + 1);
                const hsTargetIdx = remainingMoves;
                if (hsTargetIdx < HOME_STRETCH_LENGTH) {
                    if (game.board.players[pawnOwnerColor].home_stretch[hsTargetIdx] !== null) {
                        game.board.track[currentAbsPos] = [pawnOwnerColor, pawnIndexInList]; 
                        return false;
                    }
                    pawnToMove.state = PAWN_STATES.HOMESTRETCH;
                    pawnToMove.position = hsTargetIdx;
                    game.board.players[pawnOwnerColor].home_stretch[hsTargetIdx] = [pawnOwnerColor, pawnIndexInList];
                    return true;
                } else if (hsTargetIdx === HOME_STRETCH_LENGTH) { 
                    pawnToMove.state = PAWN_STATES.FINISHED;
                    pawnToMove.position = null;
                    game.board.players[pawnOwnerColor].finished_count++;
                    // Black Hole Activation Check (when a pawn finishes)
                    if (game.blackHoleModeEnabled && !game.blackHoleHasAppearedThisRound) {
                        // pawnOwnerColor is already defined in movePawn referring to the owner of the pawn that just moved.
                        // game.board.players[pawnOwnerColor].finished_count has just been incremented.
                        if (game.board.players[pawnOwnerColor].finished_count > 0 && // Ensure count is valid
                            game.board.players[pawnOwnerColor].finished_count <= 3 && // Check if count is 1, 2, or 3
                            game.board.players[pawnOwnerColor].finished_count === game.blackHoleActivationPawnCountTarget) {
                            
                            module.exports.activateBlackHole(game); // This function sets game.board.blackHolePosition
                            game.blackHoleHasAppearedThisRound = true;
                            console.log(`[movePawn] Black hole activated by ${pawnOwnerColor} finishing a pawn. Target: ${game.blackHoleActivationPawnCountTarget}, CurrentFinished: ${game.board.players[pawnOwnerColor].finished_count}. New Position: ${game.board.blackHolePosition}`);
                        }
                    }
                    // End Black Hole Activation Check
                    if (game.board.players[pawnOwnerColor].finished_count === 3) {
                        const threeFinishedComments = FUNNY_COMMENTS.threeFinished || [];
                        if (threeFinishedComments.length > 0) {
                            const randomComment = threeFinishedComments[Math.floor(Math.random() * threeFinishedComments.length)];
                            const playerName = game.playerNames[pawnOwnerColor];
                            const formattedComment = randomComment.replace("{X}", playerName);
                            game.lastLogMessage = formattedComment;
                            game.lastLogMessageColor = pawnOwnerColor;
                        }
                    }
                    if (game.board.players[pawnOwnerColor].finished_count === NUM_PAWNS_PER_PLAYER) {
                        game.round_over = true; 
                        game.round_winner = pawnOwnerColor;
                        game.status = 'roundOver'; // Added this line
                    }
                    checkAndTriggerSecondEarthquake(game); // Added call
                    return true;
                } else { 
                    game.board.track[currentAbsPos] = [pawnOwnerColor, pawnIndexInList]; 
                    return false;
                }
            }
            newAbsPosOnTrack = (newAbsPosOnTrack + 1) % TRACK_LENGTH;
        }
        const finalDestAbsTrack = newAbsPosOnTrack;
        const occupant = game.board.track[finalDestAbsTrack];
        if (occupant) {
            const occPlayerColor = occupant[0];
            const occPawnListIndex = occupant[1];
            const opponentPawnObject = game.pawns[occPlayerColor][occPawnListIndex];
            if (occPlayerColor !== pawnOwnerColor) {
                opponentPawnObject.state = PAWN_STATES.HOME;
                opponentPawnObject.position = null;
                game.board.players[occPlayerColor].home_area_count++;
                if (!game.playerHitTimestamps[pawnOwnerColor]) {
                    game.playerHitTimestamps[pawnOwnerColor] = []; // Initialize if not present, as a safeguard
                }
                game.playerHitTimestamps[pawnOwnerColor].push(Date.now());
                checkAndTriggerRapidHitsComment(game, pawnOwnerColor);
                const captureComments = FUNNY_COMMENTS.capture || [];
                if (captureComments.length > 0) {
                    const randomComment = captureComments[Math.floor(Math.random() * captureComments.length)];
                    const attackerName = game.playerNames[pawnOwnerColor];
                    const victimName = game.playerNames[occPlayerColor];
                    const formattedComment = randomComment.replace("{X}", attackerName).replace("{Y}", victimName);
                    game.lastLogMessage = formattedComment;
                    game.lastLogMessageColor = pawnOwnerColor;
                }
            } else { 
                game.board.track[currentAbsPos] = [pawnOwnerColor, pawnIndexInList]; 
                return false;
            }
        }

        // Black Hole Check
        if (game.blackHoleModeEnabled && game.board.blackHolePosition !== null && finalDestAbsTrack === game.board.blackHolePosition) {
            // Black hole effect:
            pawnToMove.state = PAWN_STATES.HOME;
            pawnToMove.position = null; 
            game.board.players[pawnOwnerColor].home_area_count++;

            // The pawn is no longer on game.board.track[finalDestAbsTrack].
            // If a capture happened at finalDestAbsTrack, the opponent was already removed.
            // If no capture, game.board.track[finalDestAbsTrack] should be cleared.
            // The black hole logic ensures the spot is now null if the pawn landed there and got sent home.
            // If an opponent was there, they were captured and sent home, and the spot was set to null before this check.
            // If the spot was empty, it remains null.
            // The key is that the current pawn does not occupy it.
            game.board.track[finalDestAbsTrack] = null; // Ensure the spot is clear after pawn is sent home.

            game.pawnSentHomeByExistingBlackHole = { // Added this block
                playerColor: pawnOwnerColor,
                playerName: game.playerNames[pawnOwnerColor],
                pawnId: pawnToMove.id,
                blackHolePosition: finalDestAbsTrack
            };
            console.log(`Pawn ${pawnToMove.id} of ${pawnOwnerColor} landed on a black hole at ${finalDestAbsTrack} and was sent home.`);
            // Black hole remains until relocated by switchPlayer logic.
            return true; // Move is considered complete.
        }
        // End Black Hole Check

        pawnToMove.position = finalDestAbsTrack;
        game.board.track[finalDestAbsTrack] = [pawnOwnerColor, pawnIndexInList];
        return true;
    }
    else if (pawnToMove.state === PAWN_STATES.HOMESTRETCH) {
        const currentHsPos = pawnToMove.position;
        game.board.players[pawnOwnerColor].home_stretch[currentHsPos] = null; 
        const newHsPos = currentHsPos + diceValue;
        if (newHsPos < HOME_STRETCH_LENGTH) {
            if (game.board.players[pawnOwnerColor].home_stretch[newHsPos] !== null) {
                game.board.players[pawnOwnerColor].home_stretch[currentHsPos] = [pawnOwnerColor, pawnIndexInList]; 
                return false;
            }
            pawnToMove.position = newHsPos;
            game.board.players[pawnOwnerColor].home_stretch[newHsPos] = [pawnOwnerColor, pawnIndexInList];
            return true;
        } else if (newHsPos === HOME_STRETCH_LENGTH) { 
            pawnToMove.state = PAWN_STATES.FINISHED;
            pawnToMove.position = null;
            game.board.players[pawnOwnerColor].finished_count++;
            // Black Hole Activation Check (when a pawn finishes)
            if (game.blackHoleModeEnabled && !game.blackHoleHasAppearedThisRound) {
                // pawnOwnerColor is already defined in movePawn referring to the owner of the pawn that just moved.
                // game.board.players[pawnOwnerColor].finished_count has just been incremented.
                if (game.board.players[pawnOwnerColor].finished_count > 0 && // Ensure count is valid
                    game.board.players[pawnOwnerColor].finished_count <= 3 && // Check if count is 1, 2, or 3
                    game.board.players[pawnOwnerColor].finished_count === game.blackHoleActivationPawnCountTarget) {
                    
                    module.exports.activateBlackHole(game); // This function sets game.board.blackHolePosition
                    game.blackHoleHasAppearedThisRound = true;
                    console.log(`[movePawn] Black hole activated by ${pawnOwnerColor} finishing a pawn. Target: ${game.blackHoleActivationPawnCountTarget}, CurrentFinished: ${game.board.players[pawnOwnerColor].finished_count}. New Position: ${game.board.blackHolePosition}`);
                }
            }
            // End Black Hole Activation Check
            if (game.board.players[pawnOwnerColor].finished_count === 3) {
                const threeFinishedComments = FUNNY_COMMENTS.threeFinished || [];
                if (threeFinishedComments.length > 0) {
                    const randomComment = threeFinishedComments[Math.floor(Math.random() * threeFinishedComments.length)];
                    const playerName = game.playerNames[pawnOwnerColor];
                    const formattedComment = randomComment.replace("{X}", playerName);
                    game.lastLogMessage = formattedComment;
                    game.lastLogMessageColor = pawnOwnerColor;
                }
            }
            if (game.board.players[pawnOwnerColor].finished_count === NUM_PAWNS_PER_PLAYER) {
                game.round_over = true; 
                game.round_winner = pawnOwnerColor;
                game.status = 'roundOver'; // Added this line
            }
                    checkAndTriggerSecondEarthquake(game); // Added call
            return true;
        } else { 
            game.board.players[pawnOwnerColor].home_stretch[currentHsPos] = [pawnOwnerColor, pawnIndexInList]; 
            return false;
        }
    }
    return false;
}

function checkAndTriggerSecondEarthquake(game) {
    if (!game.earthquakeModeEnabled || game.earthquakesOccurredThisRound !== 1 || game.secondEarthquakeTriggered) {
        return false;
    }

    let totalFinishedPawns = 0;
    if (game.pawns && game.board && game.board.players) {
        for (const playerColor in game.pawns) {
            if (game.board.players[playerColor] && typeof game.board.players[playerColor].finished_count === 'number') {
                totalFinishedPawns += game.board.players[playerColor].finished_count;
            }
        }
    }

    if (totalFinishedPawns >= 3) {
        console.log(`[checkAndTriggerSecondEarthquake] Attempting to trigger second earthquake. Total finished pawns: ${totalFinishedPawns} for game ${game.gameId}`);
        activateEarthquake(game); // This function should set game.earthquakeJustHappened = true;
         if (game.earthquakeJustHappened) { // Check if activateEarthquake was successful
            game.secondEarthquakeTriggered = true;
            game.earthquakesOccurredThisRound++; // Should be 2 now
            // game.earthquakeJustHappened is already set by activateEarthquake
            return true;
        }
    }
    return false;
}

function startNextRound(game) {
    if (game.status !== 'roundOver' && game.status !== 'gameOver') return game; // Should only start next round if round/game is over
    
    game.board = initializeGameBoard(game.players); // Use game.players (active colors from previous round)
    game.pawns = initializePawns(game.players);

    game.activePlayerColors.forEach(color => {
        game.playerHitTimestamps[color] = [];
        game.playerConsecutiveNonSixRolls[color] = 0;
    });

    game.current_player_index = Math.floor(Math.random() * game.num_players); // num_players is actual
    game.dice_roll = null;
    game.consecutive_sixes_count = 0;
    game.threeTryAttempts = 0;
    game.mustRollAgain = false;
    game.awaitingMove = false;
    game.round_over = false;
    game.round_winner = null;
    // overall_game_over, overall_game_winner, playerScores, targetVictories remain.
    game.status = 'active'; // Set status to active for the new round
    console.log("New round started. Current scores:", game.playerScores);

    if (game.blackHoleModeEnabled) {
        game.blackHoleActivationPawnCountTarget = Math.floor(Math.random() * 3) + 1; // Randomly 1, 2, or 3
        game.blackHoleHasAppearedThisRound = false;
        if (game.board) { // Ensure board exists before trying to set blackHolePosition
            game.board.blackHolePosition = null;
        }
        console.log(`[startNextRound] Black hole mode enabled. Target finished pawns for activation: ${game.blackHoleActivationPawnCountTarget}`);
    } else {
        game.blackHoleActivationPawnCountTarget = null;
        game.blackHoleHasAppearedThisRound = false;
        if (game.board) {
            game.board.blackHolePosition = null;
        }
    }

    // Reset Earthquake Mode flags for the new round
    if (game.earthquakeModeEnabled) {
        game.roundStartTime = Date.now();
        game.earthquakesOccurredThisRound = 0;
        game.firstEarthquakeTriggered = false;
        game.secondEarthquakeTriggered = false;
        // game.earthquakeActivationTurnTargets = [null, null]; // Removed
        // game.earthquakeTargetHitFlags = [false, false]; // Removed
        // game.currentRoundTurnCounter = 0; // Removed
        console.log(`[startNextRound] Earthquake mode re-initialized for new round.`);
    } else {
        // Ensure these are reset even if mode is disabled mid-game then re-enabled for a new game
        game.roundStartTime = null;
        game.earthquakesOccurredThisRound = 0;
        game.firstEarthquakeTriggered = false;
        game.secondEarthquakeTriggered = false;
        // game.earthquakeActivationTurnTargets = [null, null]; // Removed
        // game.earthquakeTargetHitFlags = [false, false]; // Removed
        // game.currentRoundTurnCounter = 0; // Removed
    }
    return game; 
}

function checkForGameVictory(game) {
    if (!game.round_over || !game.round_winner) {
        return { overallWinnerFound: false, winner: null };
    }
    const roundWinnerColor = game.round_winner;
    if (!game.playerScores[roundWinnerColor]) game.playerScores[roundWinnerColor] = 0; // Initialize if somehow missing
    game.playerScores[roundWinnerColor] += 1; // Typically 1 point per round win, or adjust as per rules

    if (game.playerScores[roundWinnerColor] >= game.targetVictories) {
        game.overall_game_over = true;
        game.overall_game_winner = roundWinnerColor;
        game.status = 'gameOver'; // Update game status
    }
    return {
        overallWinnerFound: game.overall_game_over,
        winner: game.overall_game_winner
    };
}

// --- Setup Phase Specific Functions ---

function setGameParameters(game, numPlayers, targetVictories, gameTimeMode, playerId) {
    game.lastActivityTime = Date.now();
    if (playerId !== game.creatorPlayerId) {
        return { success: false, error: "Only the game creator can set parameters." };
    }
    if (game.status !== 'setup') {
        return { success: false, error: "Parameters can only be set during setup phase." };
    }
    if (numPlayers < 2 || numPlayers > 4) {
        return { success: false, error: "Number of players must be between 2 and 4." };
    }
    if (targetVictories < 1 || targetVictories > 5) { // Example range for victories
        return { success: false, error: "Target victories must be between 1 and 5." };
    }

    const validTimeModes = ['4min', '6min', 'unlimited', null]; // null might be default before selection
    if (!validTimeModes.includes(gameTimeMode)) {
        return { success: false, error: "Invalid game time mode selected." };
    }

    const newNumPlayersInt = parseInt(numPlayers, 10);

    // Check if reducing player count conflicts with already joined & colored players
    const joinedAndColoredPlayers = game.playersSetup.filter(p => p.playerId !== null && p.color !== null).length;
    if (newNumPlayersInt < joinedAndColoredPlayers) {
        return { success: false, error: `Cannot reduce player count below current number of players who have already selected a color (${joinedAndColoredPlayers}).` };
    }

    // Adjust playersSetup array size
    const oldSize = game.playersSetup.length;
    if (newNumPlayersInt < oldSize) { // If shrinking
        for (let i = newNumPlayersInt; i < oldSize; i++) {
            if (game.playersSetup[i] && game.playersSetup[i].playerId !== null) {
                // Cannot shrink if it removes an already joined player.
                return { success: false, error: `Cannot reduce player count to ${newNumPlayersInt} as it would remove player '${game.playersSetup[i].playerName}'.` };
            }
        }
        // If loop completes, it's safe to slice
        game.playersSetup = game.playersSetup.slice(0, newNumPlayersInt);
    } else if (newNumPlayersInt > oldSize) { // If expanding
         for (let i = oldSize; i < newNumPlayersInt; i++) { // Use oldSize as the starting point for adding new slots
            game.playersSetup.push({ slotId: i, playerId: null, playerName: null, color: null, isCreator: false, isAI: false });
        }
    }

    // After successfully adjusting size (or if size is the same), apply settings:
    game.num_players_setting = newNumPlayersInt;
    game.targetVictories_setting = parseInt(targetVictories, 10);
    game.gameTimeMode_setting = gameTimeMode;
    
    // Ensure creator is always in slot 0 if num_players_setting >= 1
    // This check is more of a safeguard for logical consistency.
    if (game.num_players_setting >= 1 && 
        (!game.playersSetup[0] || game.playersSetup[0].playerId !== game.creatorPlayerId || !game.playersSetup[0].isCreator)) {
        console.warn("Creator not found in slot 0 after parameter adjustment or slot array was malformed. This may indicate an issue.");
        // Potentially, re-ensure creator's presence if absolutely necessary, though ideally logic flow prevents this.
    }

    return { success: true };
}

function assignPlayerToSlot(game, playerId, playerName) {
    game.lastActivityTime = Date.now();
    if (game.status !== 'setup') {
        return { success: false, error: "Players can only join during the setup phase." };
    }
    // Removed: Check for game.num_players_setting, players can join before params are set.

    // Check if player already in a slot
    const existingPlayerSlot = game.playersSetup.find(p => p.playerId === playerId);
    if (existingPlayerSlot) {
        return { success: true, assignedSlotId: existingPlayerSlot.slotId, message: "Player already in slot." };
    }
    
    let assignedSlot = null;
    // Iterate through available slots (default 4, or up to num_players_setting if already set)
    // Players can only join up to the current size of playersSetup or num_players_setting if it's smaller and set.
    const maxJoinableSlots = game.num_players_setting !== null ? Math.min(game.num_players_setting, game.playersSetup.length) : game.playersSetup.length;

    for (let i = 0; i < maxJoinableSlots; i++) {
        // Ensure slot exists (it should, up to playersSetup.length)
        if (!game.playersSetup[i]) { 
            // This case indicates an issue with playersSetup initialization or modification,
            // as it should always have objects up to its current logical length.
            // For safety, create it if missing, though this hides a potential bug.
            game.playersSetup[i] = { slotId: i, playerId: null, playerName: null, color: null, isCreator: (i===0 && playerId === game.creatorPlayerId), isAI: false };
        }
        // Skip AI slots for human assignment
        if (game.playersSetup[i].isAI) {
            continue;
        }
        if (game.playersSetup[i].playerId === null) {
            game.playersSetup[i].playerId = playerId;
            game.playersSetup[i].playerName = playerName;
            assignedSlot = game.playersSetup[i];
            break;
        }
    }

    if (assignedSlot) {
        return { success: true, assignedSlotId: assignedSlot.slotId };
    } else {
        // If no num_players_setting is set, and all default slots (e.g., 4) are full
        if (game.num_players_setting === null && game.playersSetup.every(p => p.playerId !== null)) {
            return { success: false, error: "All available slots are currently filled. Waiting for creator to set game size." };
        }
        // If num_players_setting is set and all those slots are full
        return { success: false, error: "Game is full according to creator settings." };
    }
}

function handlePlayerColorSelection(game, playerId, color) {
    game.lastActivityTime = Date.now();
    if (game.status !== 'setup') {
        return { success: false, error: "Color can only be selected during setup." };
    }
    if (!PLAYER_COLORS.includes(color)) {
        return { success: false, error: "Invalid color selected." };
    }

    const playerSlot = game.playersSetup.find(p => p.playerId === playerId);
    if (!playerSlot) {
        return { success: false, error: "Player not found in game setup." };
    }

    // Check if the color is taken by another human player OR by an AI player
    const isColorTaken = game.playersSetup.some(p => {
        if (p.color === color) {
            if (p.isAI) return true; // Color taken by AI
            if (p.playerId !== playerId) return true; // Color taken by another human
        }
        return false;
    });

    if (isColorTaken) {
        // If the player attempting to take the color is the AI itself (which shouldn't happen via this function)
        // or if the color is taken by someone else.
        const takerIsAI = playerSlot.isAI;
        const colorHolder = game.playersSetup.find(p => p.color === color);
        if (takerIsAI && colorHolder && colorHolder.playerId === 'AI_PLAYER_ID'){
            // This case means AI already has this color, which is fine.
            // However, AI color is set at game creation, not via this function.
            // This path should ideally not be hit for AI.
        } else {
            return { success: false, error: `Color ${color} is already taken.` };
        }
    }

    // If player had a previous color, make it available (effectively nullify it for others)
    // This is implicitly handled as we just check current assignments.
    playerSlot.color = color;
    return { success: true };
}

function removePlayer(game, playerId) {
    if (playerId === 'AI_PLAYER_ID') {
        // AI cannot be "removed" in the same way a human player is.
        // This action should ideally be handled by specific game logic (e.g. ending an AI game).
        return { success: false, error: "AI player cannot be removed via this function." };
    }

    const playerIndex = game.playersSetup.findIndex(p => p.playerId === playerId);
    if (playerIndex === -1) {
        return { success: false, error: "Player not found." };
    }

    const playerSlot = game.playersSetup[playerIndex];
    // If player is creator and others are present, or game active, more complex logic might be needed.
    // For setup/waitingForReady, simply clear their details.
    // Note: isCreator flag on slot 0 should persist.
    if (playerSlot.isCreator && game.status !== 'setup') {
         // Potentially more complex logic: end game, find new creator?
         // For now, if creator leaves mid-game, it's problematic.
         // During setup, creator leaving might dissolve the game (handled in server.js).
    }
    
    playerSlot.playerId = null;
    playerSlot.playerName = null;
    playerSlot.color = null; 
    // isCreator flag remains for slot 0. Other slots always false.

    if (game.status === 'waitingForReady') {
        game.readyPlayers.delete(playerId);
    }
    
    // If game was full based on num_players_setting, it might become available again.
    // If num_players_setting was not yet set, playersSetup retains its default 4 slots.
    // If num_players_setting was set, and a slot within that range becomes free, it's joinable.

    return { success: true, removedPlayerId: playerId, vacatedSlotId: playerSlot.slotId };
}


// --- Readiness Logic ---
function initiateReadinessCheck(game) {
    if (game.status !== 'setup') return {success: false, error: 'Game not in setup phase'};
    // Add checks: num_players_setting must be set, all slots up to num_players_setting must be filled with playerIds and colors.
    if (!game.num_players_setting || game.num_players_setting < 2) {
        return {success: false, error: 'Number of players not correctly set.'};
    }
    const requiredPlayers = game.playersSetup.slice(0, game.num_players_setting);
    if (requiredPlayers.some(p => !p.playerId || !p.color)) {
        return {success: false, error: 'All players must join and select a color before starting readiness check.'};
    }

    game.status = 'waitingForReady';
    game.readyPlayers.clear();
    // Creator is auto-ready
    if(game.creatorPlayerId) game.readyPlayers.add(game.creatorPlayerId);
    // AI players are auto-ready
    game.playersSetup.forEach(pSlot => {
        if (pSlot.isAI && pSlot.playerId) {
            game.readyPlayers.add(pSlot.playerId);
        }
    });
    return {success: true};
}

function setPlayerReady(game, playerId) {
    game.lastActivityTime = Date.now();
    if (game.status !== 'waitingForReady') return {success: false, error: 'Not in readiness check phase.'};
    if (playerId === game.creatorPlayerId) { // Creator doesn't confirm this way
        return {success: true, message: "Creator is implicitly ready."}; 
    }
    const playerSlot = game.playersSetup.find(p => p.playerId === playerId);
    if (!playerSlot) return {success: false, error: "Player not part of this game."};

    game.readyPlayers.add(playerId);
    return {success: true};
}

function getReadyPlayersStatus(game) {
    const status = {};
    game.playersSetup.forEach(pSlot => {
        if (pSlot.playerId) { // only consider joined players
            status[pSlot.playerId] = game.readyPlayers.has(pSlot.playerId);
        }
    });
    return status;
}

function checkIfAllPlayersReady(game) {
    if (game.status !== 'waitingForReady') return false;
    if (!game.num_players_setting) return false;

    const joinedPlayerIdsInSettings = game.playersSetup
        .slice(0, game.num_players_setting)
        .filter(p => p.playerId !== null)
        .map(p => p.playerId);
    
    // Filter for player slots that are actually part of the game based on num_players_setting
    const activeSlotsToCheck = game.playersSetup.slice(0, game.num_players_setting);

    if (activeSlotsToCheck.filter(p => p.playerId !== null).length !== game.num_players_setting) {
        return false; // Not all slots (as per setting) are filled with a player (human or AI)
    }

    for (const pSlot of activeSlotsToCheck) {
        if (pSlot.isAI) {
            // AI is considered ready if it has a playerId (which it should if configured)
            if (!pSlot.playerId) return false; // Should not happen for a configured AI
            continue; // AI is auto-ready
        }
        // For human players, check the readyPlayers set
        if (!game.readyPlayers.has(pSlot.playerId)) {
            return false;
        }
    }
    return activeSlotsToCheck.length > 0; // Ensure there's at least one player slot configured
}

// --- Actual Game Start ---
function startGameActual(game) {
    if (game.status !== 'waitingForReady' && game.status !== 'setup') { // Allow direct start from setup if readiness is skipped
        return { success: false, error: "Game not in a state to be started." };
    }
    if (!game.num_players_setting || !game.targetVictories_setting) {
        return { success: false, error: "Game parameters not fully set." };
    }

    game.activePlayers = game.playersSetup.filter(p => p.playerId !== null && p.color !== null).slice(0, game.num_players_setting);
    if (game.activePlayers.length !== game.num_players_setting) {
        return { success: false, error: "Not all player slots are filled and colored correctly for the game settings." };
    }
    if (game.activePlayers.length < 2) { // Or your game's minimum player rule
         return { success: false, error: "Not enough players to start the game." };
    }

    game.status = 'active';
    game.num_players = game.activePlayers.length; // Actual number of players
    game.targetVictories = game.targetVictories_setting;
    
    game.players = []; // Ordered list of colors
    game.activePlayerColors = []; // Unique list of colors
    game.playerNames = {};
    game.playerScores = {};

    game.activePlayers.forEach(pSetup => {
        game.players.push(pSetup.color);
        game.activePlayerColors.push(pSetup.color);
        game.playerNames[pSetup.color] = pSetup.playerName;
        game.playerScores[pSetup.color] = 0;
        game.playerHitTimestamps[pSetup.color] = [];
        game.playerConsecutiveNonSixRolls[pSetup.color] = 0;
    });

    game.board = initializeGameBoard(game.activePlayerColors);
    game.pawns = initializePawns(game.activePlayerColors);
    
    game.current_player_index = Math.floor(Math.random() * game.num_players);
    game.dice_roll = null;
    game.consecutive_sixes_count = 0;
    game.round_over = false;
    game.round_winner = null;
    game.overall_game_over = false;
    game.overall_game_winner = null;
    game.threeTryAttempts = 0;
    game.mustRollAgain = false;
    game.awaitingMove = false;
    game.readyPlayers.clear(); // Clear readiness set as game starts

    // --- Initialize Timer related properties ---
    game.gameTimeMode = game.gameTimeMode_setting;
    game.playerTimers = {};
    game.eliminatedPlayers = [];
    game.initialTimePerPlayer = null;

    if (game.gameTimeMode === '4min') {
        game.initialTimePerPlayer = 240;
    } else if (game.gameTimeMode === '6min') {
        game.initialTimePerPlayer = 360;
    }

    game.activePlayerColors.forEach(color => {
        if (game.gameTimeMode === '4min') {
            game.playerTimers[color] = 240;
        } else if (game.gameTimeMode === '6min') {
            game.playerTimers[color] = 360;
        } else { // unlimited or null
            game.playerTimers[color] = null;
        }
    });

    // Set playerTurnStartTime for the first player if the game is timed
    // And if the first player is not AI and not eliminated (though eliminated should be empty here)
    const firstPlayerColor = game.activePlayerColors[game.current_player_index % game.activePlayerColors.length];
    const firstPlayerIsAI = game.playersSetup.find(p => p.color === firstPlayerColor)?.isAI;

    if (game.gameTimeMode !== 'unlimited' && firstPlayerColor && !firstPlayerIsAI) {
        game.playerTurnStartTime = Date.now();
    } else {
        game.playerTurnStartTime = null;
    }
    // --- End Timer Initialization ---

    if (game.blackHoleModeEnabled) {
        game.blackHoleActivationPawnCountTarget = Math.floor(Math.random() * 3) + 1; // Randomly 1, 2, or 3
        game.blackHoleHasAppearedThisRound = false;
        if (game.board) { // Ensure board exists before trying to set blackHolePosition
            game.board.blackHolePosition = null;
        }
        console.log(`[startGameActual] Black hole mode enabled. Target finished pawns for activation: ${game.blackHoleActivationPawnCountTarget}`);
    } else {
        game.blackHoleActivationPawnCountTarget = null;
        game.blackHoleHasAppearedThisRound = false;
        if (game.board) {
            game.board.blackHolePosition = null;
        }
    }

    // Initialize Earthquake Mode flags
    if (game.earthquakeModeEnabled) {
        game.roundStartTime = Date.now();
        game.earthquakesOccurredThisRound = 0;
        game.firstEarthquakeTriggered = false;
        game.secondEarthquakeTriggered = false;
        // game.earthquakeActivationTurnTargets = [null, null]; // Removed
        // game.earthquakeTargetHitFlags = [false, false]; // Removed
        // game.currentRoundTurnCounter = 0; // Removed
        console.log(`[startGameActual] Earthquake mode enabled. Flags reset.`);
    } else {
        // Ensure these are reset even if mode is disabled then re-enabled without new instance
        game.roundStartTime = null;
        game.earthquakesOccurredThisRound = 0;
        game.firstEarthquakeTriggered = false;
        game.secondEarthquakeTriggered = false;
        // game.earthquakeActivationTurnTargets = [null, null]; // Removed
        // game.earthquakeTargetHitFlags = [false, false]; // Removed
        // game.currentRoundTurnCounter = 0; // Removed
    }
    game.lastLogMessage = null;
    game.lastLogMessageColor = null;

    return { success: true };
}

function assignColorToAI(game) {
    const aiPlayerSlot = game.playersSetup.find(p => p.isAI === true && p.playerId === 'AI_PLAYER_ID');
    if (!aiPlayerSlot) {
      console.warn(`[assignColorToAI] No AI player slot found in game ${game.gameId} to assign color.`);
      return false; // No AI player found in setup
    }
    if (aiPlayerSlot.color !== null) {
      return true; // AI already has a color
    }

    let assignedColor = null;
    for (const color of PLAYER_COLORS) {
      const isColorTaken = game.playersSetup.some(p => p.color === color);
      if (!isColorTaken) {
        assignedColor = color;
        break;
      }
    }

    if (assignedColor) {
      aiPlayerSlot.color = assignedColor;
      console.log(`[assignColorToAI] Assigned color ${assignedColor} to AI player in game ${game.gameId}`);
      return true;
    } else {
      console.error(`[assignColorToAI] Could not find an available color for AI player in game ${game.gameId}. All PLAYER_COLORS might be taken.`);
      return false;
    }
}

// --- AI Player Logic ---
function makeAIMove(game, earthquakeJustOccurred = false) { // Added earthquakeJustOccurred parameter
    game.lastActivityTime = Date.now();
    game.lastLogMessage = null;
    game.lastLogMessageColor = null;
    
    const aiPlayerColor = getPlayerColor(game); // Ensure this is the current AI player

    // Dice Roll
    const diceValue = rollDice();
    game.dice_roll = diceValue;

    if (diceValue === 6) {
        game.playerConsecutiveNonSixRolls[aiPlayerColor] = 0;
        game.consecutive_sixes_count++;
        if (game.consecutive_sixes_count === 3) {
            game.mustRollAgain = false; 
            game.awaitingMove = false; 
            return {
                diceRoll: diceValue,
                action: "consecutive_3_sixes",
                playerId: aiPlayerColor, 
                turnEnds: true,
                reason: "Rolled 3 consecutive sixes."
            };
        }
    } else { // Not a 6
        if(game.playerConsecutiveNonSixRolls && game.playerConsecutiveNonSixRolls[aiPlayerColor] !== undefined) { 
            game.playerConsecutiveNonSixRolls[aiPlayerColor]++;
        } else {
            game.playerConsecutiveNonSixRolls[aiPlayerColor] = 1; 
        }
        game.consecutive_sixes_count = 0; 
        checkAndTriggerNoSixRollComment(game, aiPlayerColor); 
    }

    // Earthquake Mercy Re-roll Logic for AI
    if (earthquakeJustOccurred && 
        areAllPawnsHome(game, aiPlayerColor) && 
        game.dice_roll !== 6) {
        
        console.log(`[makeAIMove ${game.gameId}] AI ${aiPlayerColor} granted earthquake mercy re-roll.`);
        game.mustRollAgain = true;
        game.awaitingMove = false; 
        // game.threeTryAttempts is NOT incremented in this specific case.
        game.lastLogMessage = `Computer (${aiPlayerColor}) was trapped by an earthquake! It gets a mercy re-roll.`;
        game.lastLogMessageColor = aiPlayerColor; // Or a neutral color

        return {
            diceRoll: game.dice_roll,
            action: "earthquake_mercy_reroll",
            mustRollAgain: true,
            turnEnds: false, // AI doesn't end turn, it re-rolls
            reason: "Earthquake mercy re-roll."
        };
    } 
    // Standard "All Pawns Home" Scenario
    else if (areAllPawnsHome(game, aiPlayerColor)) {
        // Note: game.dice_roll is from the single roll at the start of makeAIMove
        game.threeTryAttempts++;

        if (game.dice_roll === 6) {
            // If a 6 is rolled, reset attempts, and pawn moves out.
            game.consecutive_sixes_count = 1; // This is the first 6 in a potential new series
            game.threeTryAttempts = 0;

            const pawns = game.pawns[aiPlayerColor];
            let pawnToMoveId = -1;
            // Find the first pawn in the home state (any will do, as they are identical in this state)
            for (let i = 0; i < pawns.length; i++) {
                if (pawns[i].state === PAWN_STATES.HOME) {
                    pawnToMoveId = pawns[i].id;
                    break;
                }
            }

            // It should always find a pawn home if areAllPawnsHome is true.
            // If somehow not (which would be a state inconsistency), this move would fail.
            // For AI, we assume valid state and proceed.
            movePawn(game, aiPlayerColor, pawnToMoveId, 6); // movePawn updates board and pawn state

            game.mustRollAgain = true; // Rolling a 6 gives another turn
            game.awaitingMove = false; // AI's move is made
            return {
                diceRoll: 6,
                movedPawnId: pawnToMoveId,
                action: "auto_moved_from_home",
                autoMovedFromHome: true,
                mustRollAgain: true,
                turnEnds: false,
                newPosition: game.pawns[aiPlayerColor].find(p => p.id === pawnToMoveId).position,
                newPawnState: game.pawns[aiPlayerColor].find(p => p.id === pawnToMoveId).state
            };
        } else {
            // Did not roll a 6
            if (game.threeTryAttempts >= 3) {
                game.threeTryAttempts = 0; // Reset
                // Turn ends, switchPlayer will be called by server
                game.mustRollAgain = false;
                game.awaitingMove = false;
                return {
                    diceRoll: game.dice_roll,
                    action: "failed_to_roll_6_in_3_tries",
                    turnEnds: true,
                    reason: "Failed to roll 6 in 3 tries with all pawns home."
                };
            } else {
                // Fewer than 3 tries, and not a 6. AI's turn effectively ends, but mustRollAgain is false.
                // Server won't switch player yet based on mustRollAgain, but AI has no move.
                // This implies the server needs to know the turn ends if no move is made.
                // For AI, this means its current processing step is done.
                // The game state (threeTryAttempts) is updated for the next AI attempt if it's still its turn.
                // However, standard Ludo rules usually mean the turn passes if you can't move.
                // Let's assume the server handles turn passing if AI returns turnEnds: true.
                // If not a 6, and not 3rd try, the AI *must* wait for another roll *if* it were a human.
                // For an AI, it means it will immediately "roll again" in a conceptual sense.
                // The server logic for AI might interpret "mustRollAgain: true" as "call makeAIMove again".
                // Let's return mustRollAgain based on the game rules if it were a human.
                // The prompt says: "The AI must roll again (implicitly, turn doesn't switch yet)."
                // This means the current AI's turn isn't over.
                game.mustRollAgain = true; // Server will call makeAIMove again for this AI player.
                game.awaitingMove = false;
                // AI's turn doesn't end, it must "roll again" for one of its 3 tries.
                // The server will call makeAIMove again.
                return {
                    diceRoll: game.dice_roll, // The non-6 roll
                    action: "waiting_for_6_all_home",
                    mustRollAgain: true,
                    turnEnds: false,
                    reason: `Rolled ${game.dice_roll}. Attempt ${game.threeTryAttempts} of 3 to roll a 6 (all pawns home).`
                };
            }
        }
    }

    // If not all pawns are home OR if AI rolled a 6 while all pawns were home (and pawn was moved out)
    // Proceed with normal turn logic (which includes handling `mustRollAgain` if a 6 was rolled)
    const movablePawnIds = getMovablePawns(game, aiPlayerColor, game.dice_roll);

    // Handle "No Movable Pawns" Scenario
    if (movablePawnIds.length === 0) {
        game.awaitingMove = false; // No move for AI to make.
        if (game.dice_roll === 6) {
            // Rolled a 6 but no pawns can be moved (e.g., all movable pawns blocked by own pawns).
            game.mustRollAgain = true; // Gets to roll again.
            return {
                diceRoll: game.dice_roll,
                action: "no_movable_pawns_rolled_6",
                mustRollAgain: true,
                turnEnds: false, // Turn does not pass yet.
                reason: "No movable pawns, but rolled a 6."
            };
        } else {
            // No movable pawns and not a 6, turn ends.
            game.mustRollAgain = false;
            // switchPlayer(game); // Server will handle this.
            return {
                diceRoll: game.dice_roll,
                action: "no_movable_pawns_not_6",
                turnEnds: true,
                reason: "No movable pawns and did not roll a 6."
            };
        }
    }

    // If there are movable pawns, proceed to select and move one.
    let chosenPawnId = -1;
    let bestProgressPawn = -1; 
    let maxProgressScore = -1; 

    // Priority 1: Capture opponent's pawn
    let potentialCaptures = [];
    for (const pawnId of movablePawnIds) {
        const pawn = game.pawns[aiPlayerColor].find(p => p.id === pawnId);
        if (!pawn) continue;

        let targetPos = -1;
        let targetState = pawn.state;

        if (pawn.state === PAWN_STATES.HOME) { // This case is for moving out of home
            if (game.dice_roll === 6) {
                targetPos = PLAYER_START_POSITIONS[aiPlayerColor];
                targetState = PAWN_STATES.ACTIVE;
            } else {
                continue; // Cannot move from home without a 6
            }
        } else if (pawn.state === PAWN_STATES.ACTIVE) {
            let tempNewAbsPos = pawn.position;
            let entersHs = false;
            for (let i = 0; i < game.dice_roll; i++) {
                const playerHomeEntry = PLAYER_PATH_END_BEFORE_HOME_STRETCH[aiPlayerColor];
                if (tempNewAbsPos === playerHomeEntry) {
                    const remainingMoves = game.dice_roll - (i + 1);
                    // We only care about captures on the main track for this priority
                    entersHs = true;
                    break;
                }
                tempNewAbsPos = (tempNewAbsPos + 1) % TRACK_LENGTH;
            }
            if (!entersHs) {
                targetPos = tempNewAbsPos;
            }
        } else if (pawn.state === PAWN_STATES.HOMESTRETCH) {
            // Cannot capture on home stretch
            continue;
        }

        if (targetState === PAWN_STATES.ACTIVE && targetPos !== -1) {
            const occupant = game.board.track[targetPos];
            if (occupant && occupant[0] !== aiPlayerColor) { // Occupied by an opponent
                potentialCaptures.push(pawnId);
            }
        }
    }

    if (potentialCaptures.length > 0) {
        // If multiple capture opportunities, pick one randomly for now.
        // Later, could add more sophisticated choice (e.g., which capture is "better")
        chosenPawnId = potentialCaptures[Math.floor(Math.random() * potentialCaptures.length)];
    }

    // Priority 2: Move pawn from home (if dice roll is 6)
    // This is considered if no capture was prioritized, or if capture pawn was not home pawn.
    // Note: The "All Pawns Home" scenario already handles moving from home if it's the *only* option.
    // This priority here is for when there might be other pawns on the board, but moving a new one out is desirable.
    if (chosenPawnId === -1 && game.dice_roll === 6) {
        const homePawnsMovable = movablePawnIds.filter(pawnId => {
            const pawn = game.pawns[aiPlayerColor].find(p => p.id === pawnId);
            return pawn && pawn.state === PAWN_STATES.HOME;
        });
        if (homePawnsMovable.length > 0) {
            // Prefer moving a pawn from home if a 6 is rolled and no capture is available.
            // If multiple home pawns are somehow movable (should be only one unless start is blocked by own), pick one.
            chosenPawnId = homePawnsMovable[0];
            // No specific capture check needed here as it's moving to start or potentially capturing at start.
            // The earlier capture logic would have handled capture-at-start if it was an opponent.
            // If it's an own pawn at start, getMovablePawns should have excluded it.
        }
    }

    // Priority 3: Move pawn closest to finishing
    if (chosenPawnId === -1) {
        // bestProgressPawn and maxProgressScore are already declared
        // Reset them here if necessary for this block's logic
        maxProgressScore = -1; 
        bestProgressPawn = -1; 

        for (const pawnId of movablePawnIds) {
            const pawn = game.pawns[aiPlayerColor].find(p => p.id === pawnId);
            if (!pawn || pawn.state === PAWN_STATES.HOME || pawn.state === PAWN_STATES.FINISHED) continue;

            let score = 0;
            if (pawn.state === PAWN_STATES.HOMESTRETCH) {
                // Higher score for being on home stretch, closer to finish
                score = TRACK_LENGTH + HOME_STRETCH_LENGTH + pawn.position;
            } else if (pawn.state === PAWN_STATES.ACTIVE) {
                // Score based on position on main track.
                // Need to handle wraparound for different player colors to measure progress towards their specific home entry.
                const homeEntry = PLAYER_PATH_END_BEFORE_HOME_STRETCH[aiPlayerColor];
                const startPos = PLAYER_START_POSITIONS[aiPlayerColor];

                if (startPos > homeEntry) { // Path wraps around the board (e.g. Blue, Yellow)
                    if (pawn.position >= startPos) {
                        score = pawn.position - startPos;
                    } else { // pawn.position < homeEntry (already wrapped around)
                        score = (TRACK_LENGTH - startPos) + pawn.position;
                    }
                } else { // Path does not wrap around (e.g. Red, Green)
                    score = pawn.position - startPos;
                    if (score < 0) score = 0; // Should not happen if pawn is active and past start
                }
                 // Ensure pawns closer to their home entry (but not yet on HS) get higher scores.
                 // This basic score is distance from start. To make it "progress", we can invert or use total length.
                 // Let's use distance to home entry. Lower is better. So we want to maximize (TRACK_LENGTH - distance_to_home_entry)
                 // Or simply, distance from current position to PLAYER_PATH_END_BEFORE_HOME_STRETCH[aiPlayerColor]
                 // A pawn at position 45 for Red (home entry 47) is closer than pawn at 5.
                 // Score: current absolute position, adjusted for "how far along its specific path it is".
                 // A simpler metric: just raw pawn.position might be okay if combined with homestretch priority.
                 // Let's refine: score is how many steps it has taken on its path towards home stretch.

                let stepsTaken = 0;
                if (pawn.position >= startPos) { // Standard case
                    stepsTaken = pawn.position - startPos;
                } else { // Wrapped around case (e.g. for Blue, start 36, current pos 5)
                    stepsTaken = (TRACK_LENGTH - startPos) + pawn.position;
                }
                 // This doesn't quite order by "closest to finishing" if paths are different lengths before HS.
                 // Let's use a direct measure of steps *remaining* to reach home stretch entry.

                let currentPos = pawn.position;
                let stepsToHomeEntry = 0;
                while(currentPos !== homeEntry) {
                    currentPos = (currentPos + 1) % TRACK_LENGTH;
                    stepsToHomeEntry++;
                    if (stepsToHomeEntry > TRACK_LENGTH) break; // Safety break
                }
                score = TRACK_LENGTH - stepsToHomeEntry; // Higher score for fewer steps remaining
            }

            if (score > maxProgressScore) {
                maxProgressScore = score;
                bestProgressPawn = pawnId;
            }
        }
        if (bestProgressPawn !== -1) {
            chosenPawnId = bestProgressPawn;
        }
    }

    // Priority 4: Random selection (if no other strategy chose a pawn)
    if (chosenPawnId === -1 && movablePawnIds.length > 0) {
        chosenPawnId = movablePawnIds[Math.floor(Math.random() * movablePawnIds.length)];
    }

    // Execute Move and Return AI's Action
    if (chosenPawnId !== -1) {
        const pawnBeforeMove = game.pawns[aiPlayerColor].find(p => p.id === chosenPawnId);
        const originalState = pawnBeforeMove ? pawnBeforeMove.state : null;

        const moveSuccessful = movePawn(game, aiPlayerColor, chosenPawnId, game.dice_roll);

        if (moveSuccessful) {
            game.awaitingMove = false;
            const movedPawn = game.pawns[aiPlayerColor].find(p => p.id === chosenPawnId);

            let action = "selected_move_other"; // Default action
            if (potentialCaptures.includes(chosenPawnId)) {
                action = "selected_move_capture";
            } else if (originalState === PAWN_STATES.HOME && game.dice_roll === 6) { // Pawn moved from home
                action = "selected_move_from_home";
            } else if (chosenPawnId === bestProgressPawn && maxProgressScore > -1) { // Check if chosen by progress logic
                action = "selected_move_progress";
            } else if (chosenPawnId !== -1) { // If chosen by other means (e.g. random, or only one movable)
                action = "selected_move_random_or_single"; // More descriptive general fallback
            }

            // Determine if a capture happened.
            // This is tricky without movePawn returning it.
            // A simple heuristic: if an opponent pawn is no longer at the destination square
            // and AI pawn is there now, a capture likely occurred.
            // This is still imperfect. `movePawn` ideally should return capture status.
            // For now, we'll stick to the `potentialCaptures` check for the `capturedPawn` flag.
            const capturedPawn = potentialCaptures.includes(chosenPawnId);

            game.mustRollAgain = (game.dice_roll === 6 && game.consecutive_sixes_count < 3);

            return {
                diceRoll: game.dice_roll,
                movedPawnId: chosenPawnId,
                newPosition: movedPawn.position,
                newPawnState: movedPawn.state,
                capturedPawn: capturedPawn,
                mustRollAgain: game.mustRollAgain,
                turnEnds: !game.mustRollAgain,
                action: action
            };
        } else {
            // This case implies an issue with game logic if a movable pawn fails to move.
            console.error(`AI Error: Move for chosen pawn ${chosenPawnId} by AI ${aiPlayerColor} failed unexpectedly.`);
            // Fall through to return a "no move" action if this rare case occurs.
        }
    }

    // If no pawn was chosen (e.g. movablePawnIds was empty initially, though handled) or move failed.
    game.awaitingMove = false; // AI's turn processing is complete.
    // If dice_roll was 6 but no move could be made (e.g. all spots blocked by own pawns), AI should roll again.
    // This was handled in the "No Movable Pawns" section. If we reach here, it means a move should have been possible.
    // So, if chosenPawnId is -1 at this point, it means something went wrong or no valid pawn from movable list.
    return {
        diceRoll: game.dice_roll,
        aiPlayerColor: aiPlayerColor,
        action: "no_valid_move_chosen_or_execution_failed",
        turnEnds: true,
        mustRollAgain: false // Should not get another roll if a move was expected but failed at selection/execution
    };
}

// --- Game State Access and Modification Functions ---

function activateBlackHole(game) {
    if (!game.blackHoleModeEnabled || game.status !== 'active' || !game.board) {
        if (game.board) game.board.blackHolePosition = null; // Ensure it's cleared if mode disabled mid-game or status changes
        return;
    }

    const excludedPositions = new Set();
    if (game.activePlayerColors && game.activePlayerColors.length > 0) {
        game.activePlayerColors.forEach(color => {
            if (PLAYER_START_POSITIONS[color] !== undefined) {
                excludedPositions.add(PLAYER_START_POSITIONS[color]);
            }
            if (PLAYER_PATH_END_BEFORE_HOME_STRETCH[color] !== undefined) {
                // This is the cell *before* home stretch, often a safe zone or an entry point.
                // Depending on rules, this might be excludable. For now, let's exclude it.
                excludedPositions.add(PLAYER_PATH_END_BEFORE_HOME_STRETCH[color]);
            }
        });
    }

    // Also exclude any positions currently occupied by a pawn that is on its own start cell.
    // (Though start cells are already in excludedPositions, this is a more general safety for "safe start spots")
    // This specific rule ("occupied by a pawn of the same color as the cell's 'owner' if it's a start cell")
    // is mostly covered by excluding all PLAYER_START_POSITIONS. A simpler approach is to exclude all occupied cells.
    // For now, let's stick to the defined safe zones (start and entry to home stretch).
    // A more complex rule might be to exclude any cell that is a start position AND occupied by that color's pawn.
    // However, PLAYER_START_POSITIONS are absolute track indices, so they are already excluded.

    const possiblePositions = [];
    for (let i = 0; i < TRACK_LENGTH; i++) {
        if (!excludedPositions.has(i)) {
            possiblePositions.push(i);
        }
    }

    if (possiblePositions.length > 0) {
        const randomIndex = Math.floor(Math.random() * possiblePositions.length);
        game.board.blackHolePosition = possiblePositions[randomIndex];
        game.justActivatedBlackHolePosition = game.board.blackHolePosition; // Added this line
        console.log(`[activateBlackHole] Black hole activated at position: ${game.board.blackHolePosition}. Valid positions were: [${possiblePositions.join(', ')}]. Excluded: [${Array.from(excludedPositions).join(', ')}]`);

        // Check if the black hole position is occupied
        if (game.board.track[game.board.blackHolePosition] !== null) {
            const [occPlayerColor, occPawnListIndex] = game.board.track[game.board.blackHolePosition];
            const pawnToReturn = game.pawns[occPlayerColor][occPawnListIndex];

            // Update pawn state
            pawnToReturn.state = PAWN_STATES.HOME;
            pawnToReturn.position = null;

            // Increment home_area_count
            game.board.players[occPlayerColor].home_area_count++;

            // Clear the track position
            game.board.track[game.board.blackHolePosition] = null;

            game.pawnSentHomeByNewBlackHole = { // Added this block
                playerColor: occPlayerColor,
                playerName: game.playerNames[occPlayerColor],
                pawnId: pawnToReturn.id,
                blackHolePosition: game.board.blackHolePosition
            };
            console.log(`[activateBlackHole] Pawn ${pawnToReturn.id} of player ${occPlayerColor} was at the black hole position ${game.board.blackHolePosition} and sent home.`);
            // TODO: Consider returning information about the pawn sent home, e.g., { pawnId: pawnToReturn.id, ownerColor: occPlayerColor }
        }

    } else {
        game.board.blackHolePosition = null; // Should ideally not happen if TRACK_LENGTH > excludedPositions.size
        console.log(`[activateBlackHole] No valid positions found for black hole. Excluded: [${Array.from(excludedPositions).join(', ')}]`);
    }
}

function activateEarthquake(game) {
    if (!game.earthquakeModeEnabled) { // Removed game.earthquakeHasOccurredThisRound
        return;
    }
    console.log(`[activateEarthquake] Triggering PURE PAWN SWAP earthquake for game ${game.gameId}`);

    const playerColors = [...game.activePlayerColors]; // Use activePlayerColors which is the list of colors in play
    if (playerColors.length < 2) {
        console.log("[activateEarthquake] Not enough active players to swap pawns. No action taken.");
        return; 
    }

    // Create a shuffled version of playerColors to determine the mapping.
    // Player at playerColors[i] will give their pawns to player at shuffledPlayerColorsForMapping[i]
    let shuffledPlayerColorsForMapping = [...playerColors];
    for (let i = shuffledPlayerColorsForMapping.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffledPlayerColorsForMapping[i], shuffledPlayerColorsForMapping[j]] = [shuffledPlayerColorsForMapping[j], shuffledPlayerColorsForMapping[i]];
    }

    // Ensure no player gets their own pawns back, if possible.
    let needsRemap = true;
    let attempts = 0; // Prevent infinite loop in edge cases, though unlikely with current logic
    while (needsRemap && attempts < 10) {
        needsRemap = false;
        let selfMappedCount = 0;
        for (let i = 0; i < playerColors.length; i++) {
            if (playerColors[i] === shuffledPlayerColorsForMapping[i]) {
                selfMappedCount++;
            }
        }

        if (selfMappedCount === playerColors.length && playerColors.length > 1) {
            // All players map to themselves, force a cyclic shift
            // (e.g., P0's pawns -> P1, P1's pawns -> P2, ..., Pn-1's pawns -> P0)
            const lastPlayerOriginalPawnsTarget = shuffledPlayerColorsForMapping[0]; // P0 will get pawns from P(n-1)
            for (let i = 0; i < playerColors.length - 1; i++) {
                shuffledPlayerColorsForMapping[i] = shuffledPlayerColorsForMapping[i + 1];
            }
            shuffledPlayerColorsForMapping[playerColors.length - 1] = lastPlayerOriginalPawnsTarget;
            // This guarantees no self-mapping if length > 1
            break; 
        } else if (selfMappedCount > 0) {
            // Some self-mapping, try reshuffle
            for (let i = shuffledPlayerColorsForMapping.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [shuffledPlayerColorsForMapping[i], shuffledPlayerColorsForMapping[j]] = [shuffledPlayerColorsForMapping[j], shuffledPlayerColorsForMapping[i]];
            }
            needsRemap = true; // Re-check the new shuffle
        }
        attempts++;
    }
    
    // pawnSetSourceMap: key is the NEW owner (playerColor), value is the ORIGINAL owner (shuffledPlayerColorsForMapping[i]) whose pawns they get.
    // Example: { "Red": "Blue", "Blue": "Red" } means Red player now gets Blue's original pawns.
    const pawnSetSourceMap = {};
    for (let i = 0; i < playerColors.length; i++) {
        // playerColors[i] is the player (e.g. Red). They will get pawns from shuffledPlayerColorsForMapping[i] (e.g. Blue)
        pawnSetSourceMap[playerColors[i]] = shuffledPlayerColorsForMapping[i];
    }
    console.log("[activateEarthquake] Pawn Set Source Map (NewOwnerColor gets pawns From ThisOriginalOwnerColor):", pawnSetSourceMap);

    const newPawnCollections = {}; // Stores { "PlayerColor": [actual pawn objects] }

    // Create new collections of pawns based on the source map
    for (const newOwnerColor of playerColors) {
        const originalOwnerOfThesePawns = pawnSetSourceMap[newOwnerColor];
        // Deep copy the pawns from the original owner to the new owner's collection
        if (game.pawns[originalOwnerOfThesePawns]) {
            newPawnCollections[newOwnerColor] = JSON.parse(JSON.stringify(game.pawns[originalOwnerOfThesePawns]));
        } else {
            console.warn(`[activateEarthquake] No pawns found for original owner ${originalOwnerOfThesePawns} when assigning to ${newOwnerColor}`);
            newPawnCollections[newOwnerColor] = []; // Assign empty array if source is missing
        }
    }

    // Assign the new pawn collections to the game state
    game.pawns = newPawnCollections;

    // --- Rebuild Board Representation and Counts ---
    // Clear current board state (track and home stretches)
    game.board.track = Array(TRACK_LENGTH).fill(null);
    playerColors.forEach(color => {
        if (game.board.players[color]) {
            game.board.players[color].home_stretch = Array(HOME_STRETCH_LENGTH).fill(null);
        } else {
            console.warn(`[activateEarthquake] game.board.players[${color}] missing during home_stretch clear.`);
        }
    });

    // Recalculate counts and update board track/home stretch based on new pawn ownership
    playerColors.forEach(pColor => { // pColor is the player who now OWNS these pawns
        let homeCount = 0;
        let finishedCount = 0;
        if (game.pawns[pColor]) {
            game.pawns[pColor].forEach((pawn, pawnIndex) => {
                // The pawn object itself (state, position) is from its original owner,
                // but it's now logically owned by pColor.
                if (pawn.state === PAWN_STATES.ACTIVE && pawn.position !== null) {
                    game.board.track[pawn.position] = [pColor, pawnIndex]; // Mark with new owner pColor
                } else if (pawn.state === PAWN_STATES.HOMESTRETCH && pawn.position !== null) {
                    // Pawns on a home stretch are on *their specific colored path*.
                    // If Red's pawns (now owned by Blue) were on Red's home stretch, they are no longer on a valid HS for Blue.
                    // This interpretation of "pure pawn swap" means pawns on an opponent's HS become 'active' again,
                    // or are sent home if that's too complex.
                    // For simplicity: If a pawn is on a home_stretch that doesn't match its new owner's color,
                    // it should be moved back to its start or treated as 'active' at a nearby equivalent.
                    //
                    // Simpler rule: Pawns keep their absolute position if on main track.
                    // Pawns on a home_stretch or in home/finished state are relative to their *new* owner.
                    // This means if Red had a pawn on its HS at index 1, and Blue gets Red's pawns,
                    // that pawn is now on Blue's HS at index 1. This is what JSON.parse(JSON.stringify) would achieve
                    // if the pawn object's 'position' for HS is relative.
                    // Let's assume pawn.position for HOMESTRETCH is its index on *any* home stretch.
                    // The `game.board.players[pColor].home_stretch` is the specific stretch for `pColor`.
                    if (game.board.players[pColor]) {
                        game.board.players[pColor].home_stretch[pawn.position] = [pColor, pawnIndex];
                    } else {
                         console.warn(`[activateEarthquake] game.board.players[${pColor}] missing for home_stretch update of pawn ${pawnIndex}.`);
                    }
                }

                if (pawn.state === PAWN_STATES.HOME) homeCount++;
                if (pawn.state === PAWN_STATES.FINISHED) finishedCount++;
            });
        } else {
            console.warn(`[activateEarthquake] game.pawns[${pColor}] missing during count and board rebuild.`);
        }
        
        if (game.board.players[pColor]) {
            game.board.players[pColor].home_area_count = homeCount;
            game.board.players[pColor].finished_count = finishedCount;
        } else {
            console.warn(`[activateEarthquake] game.board.players[${pColor}] missing for count update.`);
        }
    });

    // game.earthquakeHasOccurredThisRound = true; // Commented out
    game.earthquakeJustHappened = true; 
    // Player identities (playerNames, playersSetup[i].color, turn order game.players) DO NOT CHANGE.
    console.log(`[activateEarthquake] PURE PAWN SWAP Earthquake completed. Players retain their colors and turn order. Pawns have been re-assigned.`);
}

function checkAndTriggerFirstEarthquake(game) {
    if (!game.earthquakeModeEnabled || game.earthquakesOccurredThisRound !== 0 || game.firstEarthquakeTriggered) {
        return false;
    }
    if (Date.now() - game.roundStartTime >= 45000) { // 45 seconds
        // Random chance, e.g., 1 in 3 for demonstration. This can be configured.
        if (Math.random() < 1/3) {
            console.log(`[checkAndTriggerFirstEarthquake] Attempting to trigger first earthquake for game ${game.gameId}`);
            activateEarthquake(game); // This function should set game.earthquakeJustHappened = true;
            if (game.earthquakeJustHappened) { // Check if activateEarthquake was successful (e.g. not blocked internally)
                game.firstEarthquakeTriggered = true;
                game.earthquakesOccurredThisRound++; // Should be 1 now
                // game.earthquakeJustHappened is already set by activateEarthquake
                return true;
            }
        }
    }
    return false;
}

// getGameState should be a method of the game instance or a function taking it
// For now, we'll make it a separate function.
function getGameState(game) {
    const baseState = {
        gameId: game.gameId,
        status: game.status,
        playersSetup: game.playersSetup,
        gameCreatorId: game.creatorPlayerId,
        numPlayersSetting: game.num_players_setting, // Use the setting name
        targetVictoriesSetting: game.targetVictories_setting, // Use the setting name
    };

    if (game.status === 'waitingForReady') {
        baseState.readyStatus = getReadyPlayersStatus(game);
    }

    if (game.status === 'active' || game.status === 'roundOver' || game.status === 'gameOver') {
        baseState.board = game.board;
        baseState.pawns = game.pawns;
        baseState.num_players = game.num_players; // Actual number of players
        baseState.players = game.players; // Colors in order
        baseState.activePlayerColors = game.activePlayerColors;
        baseState.playerNames = game.playerNames;
        baseState.playerScores = game.playerScores;
        baseState.targetVictories = game.targetVictories; // Actual target
        baseState.current_player_index = game.current_player_index;
        baseState.dice_roll = game.dice_roll;
        baseState.consecutive_sixes_count = game.consecutive_sixes_count;
        baseState.round_over = game.round_over;
        baseState.round_winner = game.round_winner;
        baseState.overall_game_over = game.overall_game_over;
        baseState.overall_game_winner = game.overall_game_winner;
        baseState.threeTryAttempts = game.threeTryAttempts;
        baseState.mustRollAgain = game.mustRollAgain;
        baseState.awaitingMove = game.awaitingMove;
        baseState.blackHoleModeEnabled = game.blackHoleModeEnabled;
        baseState.blackHolePosition = game.board ? game.board.blackHolePosition : null;

        // Earthquake mode flags
        baseState.earthquakeModeEnabled = game.earthquakeModeEnabled;
        baseState.earthquakesOccurredThisRound = game.earthquakesOccurredThisRound; // Updated name
        // baseState.earthquakeActivationTurnTargets = game.earthquakeActivationTurnTargets; // Removed
        baseState.lastLogMessage = game.lastLogMessage;
        baseState.lastLogMessageColor = game.lastLogMessageColor;
        if (game.earthquakeJustHappened) { // Stays the same
            baseState.earthquakeJustHappened = true;
        }

        // Add timer related properties
        baseState.gameTimeMode = game.gameTimeMode;
        baseState.playerTimers = game.playerTimers;
        baseState.eliminatedPlayers = game.eliminatedPlayers;
        baseState.initialTimePerPlayer = game.initialTimePerPlayer;
    }
    return baseState;
}

function checkAndTriggerRapidHitsComment(game, attackerPlayerColor) {
    if (!game.playerHitTimestamps || !game.playerHitTimestamps[attackerPlayerColor]) {
        return; // No hit data for this player
    }

    const rapidHitsComments = FUNNY_COMMENTS.rapidHits || [];
    if (rapidHitsComments.length === 0) {
        return; // No "rapidHits" comments defined
    }

    const now = Date.now();
    const recentHits = game.playerHitTimestamps[attackerPlayerColor].filter(timestamp => {
        return (now - timestamp) <= 45000; // 45 seconds window
    });

    if (recentHits.length >= 2) {
        const playerName = game.playerNames[attackerPlayerColor];
        if (!playerName) {
            console.error(`Player name not found for color: ${attackerPlayerColor} when triggering rapid hits comment.`);
            return;
        }
        const randomComment = rapidHitsComments[Math.floor(Math.random() * rapidHitsComments.length)];
        const formattedComment = randomComment.replace("{playerName}", playerName);

        game.lastLogMessage = formattedComment;
        game.lastLogMessageColor = attackerPlayerColor; // Or a generic color if preferred

        // Clear hits for this player to prevent immediate re-triggering for the same sequence
        game.playerHitTimestamps[attackerPlayerColor] = [];
        // Alternatively, to only clear the hits that contributed to this trigger:
        // game.playerHitTimestamps[attackerPlayerColor] = game.playerHitTimestamps[attackerPlayerColor].filter(timestamp => (now - timestamp) > 45000);
        // For simplicity, let's clear all for now as per the plan.
    }
}

function checkAndTriggerNoSixRollComment(game, playerColor) {
    const noSixComments = FUNNY_COMMENTS.noSixInEightRolls || [];
    if (noSixComments.length === 0) {
        return false; // No comments defined
    }

    if (game.playerConsecutiveNonSixRolls[playerColor] >= 8) {
        const playerName = game.playerNames[playerColor];
        if (!playerName) {
            console.error(`Player name not found for color: ${playerColor} when triggering no-six comment.`);
            return false;
        }
        const randomComment = noSixComments[Math.floor(Math.random() * noSixComments.length)];
        const formattedComment = randomComment.replace("{playerName}", playerName);

        game.lastLogMessage = formattedComment;
        game.lastLogMessageColor = playerColor; // Or a generic color

        game.playerConsecutiveNonSixRolls[playerColor] = 0; // Reset count
        return true; // Comment was triggered
    }
    return false; // Condition not met
}

function processPlayerRoll(game, playerColor, diceValue) {
    game.lastActivityTime = Date.now();
    game.lastLogMessage = null;
    game.lastLogMessageColor = null;
    game.dice_roll = diceValue; // Set the game's dice_roll state

    if (diceValue === 6) {
        game.playerConsecutiveNonSixRolls[playerColor] = 0;
        game.consecutive_sixes_count++;
        if (game.consecutive_sixes_count === 3) {
            // Logic for 3 consecutive sixes (turn ends, switch player)
            game.mustRollAgain = false;
            game.awaitingMove = false;
            // Server will call switchPlayer based on this outcome
            return { turnEnds: true, reason: "Rolled 3 consecutive sixes." };
        }
        game.mustRollAgain = true; // Roll again on a 6 (if not 3rd)
    } else {
        game.playerConsecutiveNonSixRolls[playerColor]++;
        game.consecutive_sixes_count = 0;
        game.mustRollAgain = false; // Turn usually doesn't grant another roll for non-six
        checkAndTriggerNoSixRollComment(game, playerColor);
    }

    // Determine if player can move (similar to start of makeAIMove)
    if (areAllPawnsHome(game, playerColor) && diceValue !== 6) {
        game.threeTryAttempts++;
        if (game.threeTryAttempts >= 3) {
            game.threeTryAttempts = 0;
            // Turn ends, switchPlayer will be called by server
            return { turnEnds: true, reason: "Failed to roll 6 in 3 tries with all pawns home." };
        }
        // Player must roll again (implicitly, turn doesn't switch yet for these 3 tries)
        game.mustRollAgain = true;
        return { turnEnds: false, mustRollAgain: true, reason: `Rolled ${diceValue}. Attempt ${game.threeTryAttempts} of 3 to roll a 6.` };
    }

    const movablePawns = getMovablePawns(game, playerColor, diceValue);
    if (movablePawns.length === 0) {
        if (game.mustRollAgain) { // e.g. rolled a 6 but no moves
             return { turnEnds: false, mustRollAgain: true, reason: "No movable pawns, but rolled a 6 (or must roll again)." };
        }
        // No movable pawns and not a 6 (or not required to roll again), turn ends
        return { turnEnds: true, reason: "No movable pawns." };
    }

    game.awaitingMove = true; // Player can make a move
    return { turnEnds: false, awaitingMove: true, movablePawns: movablePawns };
}

// --- Module Exports ---
module.exports = {
    createLudoGameInstance, // New way to create a game
    getGameState,           // New way to get state for client
    // Keep other existing exports if they are pure functions or utilities
    PLAYER_COLORS,
    PLAYER_INITIALS,
    TRACK_LENGTH,
    HOME_STRETCH_LENGTH,
    NUM_PAWNS_PER_PLAYER,
    PLAYER_START_POSITIONS,
    PLAYER_PATH_END_BEFORE_HOME_STRETCH,
    PAWN_STATES,
    // initializeGameBoard, initializePawns, initializeGameState are now internal or replaced
    rollDice, // rollDice is a pure utility, can stay
    // Functions that operate on gameState will be modified or new ones created
    // getPlayerColor, areAllPawnsHome, getMovablePawns, switchPlayer, movePawn, startNextRound, checkForGameVictory
    // will be adapted to take 'game' as first param.
    getPlayerColor, 
    areAllPawnsHome, 
    getMovablePawns,
    switchPlayer,
    movePawn,
    startNextRound, 
    checkForGameVictory,

    // Newly added exports for setup, readiness, and game lifecycle
    setGameParameters,
    assignPlayerToSlot,
    handlePlayerColorSelection,
    removePlayer,
    initiateReadinessCheck,
    setPlayerReady,
    getReadyPlayersStatus,
    checkIfAllPlayersReady,
    startGameActual,
    makeAIMove, // Export the new AI function
    assignColorToAI, // Export assignColorToAI
    activateBlackHole, // Export for testing purposes
    activateEarthquake, // Add the new function here
    checkAndTriggerFirstEarthquake, // Added new function
    checkAndTriggerSecondEarthquake, // Added new function
    checkAndTriggerRapidHitsComment, // Added for potential testing
    FUNNY_COMMENTS, // Export for testing purposes
    processPlayerRoll,
    checkAndTriggerNoSixRollComment
};

// --- Basic Test Block (optional, for direct execution with node) ---
if (require.main === module) {
    console.log("Running basic Ludo game logic tests (adapted for new structure)...");

    // Test 1: Initialization
    let game = createLudoGameInstance('testGame1', 'Alice', 'alice123');
    console.log("Initial game instance (Alice created):", JSON.stringify(getGameState(game), null, 2));

    // Further tests would need to call the new functions that take 'game' as an argument.
    // e.g., setGameParameters(game, 2, 1, 'alice123');
    // assignPlayerToSlot(game, 'bob456', 'Bob');
    // handlePlayerColorSelection(game, 'alice123', 'Red');
    // etc.
    // Then, startGameActual(game) would be called before testing gameplay functions.

    // This test block needs significant updates to align with the new structure.
    // For now, this just shows the basic instance creation.
    console.log("\nBasic instance creation test finished. Gameplay function tests need refactoring.");
}
