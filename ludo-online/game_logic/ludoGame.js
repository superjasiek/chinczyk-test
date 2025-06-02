// ludoGame.js - Core Ludo Game Logic

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

function initializeGameBoard(activePlayerColors) {
    const board = {
        track: Array(TRACK_LENGTH).fill(null), // Array of nulls
        players: {}
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
function createLudoGameInstance(gameId, creatorPlayerName, creatorPlayerId) {
    if (!gameId || !creatorPlayerName || !creatorPlayerId) {
        throw new Error("Game ID, creator name, and creator ID are required to create a game.");
    }

    const playersSetup = [];
    playersSetup.push({
        slotId: 0,
        playerId: creatorPlayerId,
        playerName: creatorPlayerName,
        color: null, // Color selection happens via UI
        isCreator: true
    });
    // Initialize remaining slots up to a default max (e.g. 4)
    for (let i = 1; i < 4; i++) { // Assuming default max 4 slots initially shown
        playersSetup.push({ slotId: i, playerId: null, playerName: null, color: null, isCreator: false });
    }

    // This is the game instance object
    const gameInstance = {
        gameId: gameId,
        creatorPlayerId: creatorPlayerId,
        status: 'setup', // 'setup', 'waitingForReady', 'active', 'roundOver', 'gameOver'
        
        playersSetup: playersSetup,
        num_players_setting: null, // Target number of players, set by creator
        targetVictories_setting: null, // Set by creator

        // Game-play related properties, initialized in startGameActual
        board: null,
        pawns: null,
        num_players: 0,       // Actual number of players in the game once started
        players: [],          // Colors of active players in order
        activePlayerColors: [], // Unique colors of active players
        playerNames: {},      // Map color to name for active players
        playerScores: {},
        targetVictories: 1,   // Actual target victories for the started game
        
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
    };

    return gameInstance;
}


// --- Core Game Functions (adapted to take 'game' instance) ---

function rollDice() { // This is a utility, doesn't need 'game'
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
    if (game.status !== 'active') return;
    game.consecutive_sixes_count = 0;
    if (game.activePlayerColors && game.activePlayerColors.length > 0) {
        game.current_player_index = (game.current_player_index + 1) % game.activePlayerColors.length;
    } else {
        console.error("[ludoGame.js switchPlayer] Error: Cannot switch player, activePlayerColors is empty or undefined.");
    }
    game.dice_roll = null;
    game.threeTryAttempts = 0;
    game.mustRollAgain = false;
    game.awaitingMove = false;
}

function movePawn(game, pawnOwnerColor, pawnId, diceValue) {
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
                    game.board.track[startPos] = null; 
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
                    if (game.board.players[pawnOwnerColor].finished_count === NUM_PAWNS_PER_PLAYER) {
                        game.round_over = true; 
                        game.round_winner = pawnOwnerColor; 
                    }
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
            } else { 
                game.board.track[currentAbsPos] = [pawnOwnerColor, pawnIndexInList]; 
                return false;
            }
        }
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
            if (game.board.players[pawnOwnerColor].finished_count === NUM_PAWNS_PER_PLAYER) {
                game.round_over = true; 
                game.round_winner = pawnOwnerColor; 
            }
            return true;
        } else { 
            game.board.players[pawnOwnerColor].home_stretch[currentHsPos] = [pawnOwnerColor, pawnIndexInList]; 
            return false;
        }
    }
    return false;
}

function startNextRound(game) {
    if (game.status !== 'roundOver' && game.status !== 'gameOver') return game; // Should only start next round if round/game is over
    
    game.board = initializeGameBoard(game.players); // Use game.players (active colors from previous round)
    game.pawns = initializePawns(game.players);

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

function setGameParameters(game, numPlayers, targetVictories, playerId) {
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
            game.playersSetup.push({ slotId: i, playerId: null, playerName: null, color: null, isCreator: false });
        }
    }

    // After successfully adjusting size (or if size is the same), apply settings:
    game.num_players_setting = newNumPlayersInt;
    game.targetVictories_setting = parseInt(targetVictories, 10);
    
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
            game.playersSetup[i] = { slotId: i, playerId: null, playerName: null, color: null, isCreator: (i===0 && playerId === game.creatorPlayerId) };
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

    const isColorTaken = game.playersSetup.some(p => p.color === color && p.playerId !== playerId);
    if (isColorTaken) {
        return { success: false, error: `Color ${color} is already taken.` };
    }

    // If player had a previous color, make it available (effectively nullify it for others)
    // This is implicitly handled as we just check current assignments.
    playerSlot.color = color;
    return { success: true };
}

function removePlayer(game, playerId) {
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
    // Creator is auto-ready (or doesn't need to confirm)
    if(game.creatorPlayerId) game.readyPlayers.add(game.creatorPlayerId); 
    return {success: true};
}

function setPlayerReady(game, playerId) {
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
    
    if (joinedPlayerIdsInSettings.length !== game.num_players_setting) return false; // Not all slots (as per setting) are filled

    for (const playerId of joinedPlayerIdsInSettings) {
        if (!game.readyPlayers.has(playerId)) {
            return false;
        }
    }
    return joinedPlayerIdsInSettings.length > 0; // Ensure there's at least one player if num_players_setting is 1 (though usually min 2)
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

    return { success: true };
}


// --- Game State Access and Modification Functions ---

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
    }
    return baseState;
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
    startGameActual
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
