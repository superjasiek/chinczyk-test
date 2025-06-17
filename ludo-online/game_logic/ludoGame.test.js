
const LudoGame = require('./ludoGame'); // Import all exports

const {
    createLudoGameInstance,
    assignPlayerToSlot,
    handlePlayerColorSelection,
    setGameParameters,
    startGameActual,
    getPlayerColor,
    switchPlayer,
    checkForGameVictory,
    startNextRound,
    // Constants if needed directly, though often accessed via game state
    PLAYER_COLORS,
    PAWN_STATES,
    NUM_PAWNS_PER_PLAYER,
    // Not typically used directly in high-level tests but listed in prompt
    // PLAYER_START_POSITIONS,
    // TRACK_LENGTH,
    // HOME_STRETCH_LENGTH,
    // PLAYER_PATH_END_BEFORE_HOME_STRETCH,
    rollDice
} = LudoGame;


// Keep existing tests if they are for a different setup or utility function
// The prompt's old initializeGameState seems like a direct state setup,
// while the new test uses the full game creation workflow.
const initializeGameState = LudoGame.initializeGameState; // If it's still exported and used by old tests

describe('Ludo Game Logic', () => {

    // Helper to create a basic game state for tests
    const createSimpleGameState = (activeColors = ["Red", "Green"], allGameColors = ["Red", "Green", "Yellow", "Blue"]) => {
        const initialPlayers = activeColors.map(color => ({ color, name: `Player ${color.charAt(0)}` }));
        return initializeGameState(initialPlayers, 2, allGameColors);
    };

    // Keep existing tests for initializeGameState and rollDice if they are still valid.
    // The prompt's focus is on getPlayerColor and switchPlayer, so I'll mainly reconstruct those.
    // For brevity, I'll assume the original initializeGameState and rollDice tests from the read_files output are mostly fine,
    // but they might need slight adjustments if initializeGameState's signature or behavior changed significantly earlier.
    // The initializeGameState in the provided snippet seems to take (num_players), but the file uses (initialPlayersArray, targetVictories, allGameColorsList)
    // I will adapt the initializeGameState tests to the correct signature.

    describe('initializeGameState', () => {
        test('should initialize with correct active players and all game colors', () => {
            const initialPlayers = [{ color: "Red", name: "P1" }, { color: "Blue", name: "P2" }];
            const gameColors = ["Red", "Green", "Blue", "Yellow"];
            const state = initializeGameState(initialPlayers, 2, gameColors);

            expect(state.num_players).toBe(4); // Total colors available in the game
            expect(state.players).toEqual(["Red", "Green", "Blue", "Yellow"]); // All game colors
            expect(state.activePlayerColors).toEqual(["Red", "Blue"]); // Only active players
            expect(state.playerNames).toEqual({ "Red": "P1", "Blue": "P2" });
            expect(state.playerScores).toEqual({ "Red": 0, "Green": 0, "Blue": 0, "Yellow": 0 });
            expect(state.round_over).toBe(false); // Changed from game_over
            expect(state.round_winner).toBeNull(); // Changed from winner
            expect(state.dice_roll).toBeNull();
            expect(Object.keys(state.pawns).length).toBe(4); // Pawns for all game colors
            expect(state.pawns.Red.length).toBe(NUM_PAWNS_PER_PLAYER);
        });

        test('current_player_index should be valid for active players', () => {
            const initialPlayers = [{ color: "Red", name: "P1" }, { color: "Green", name: "P2" }];
            const gameColors = ["Red", "Green"];
            const state = initializeGameState(initialPlayers, 2, gameColors);
            expect(state.current_player_index).toBeGreaterThanOrEqual(0);
            expect(state.current_player_index).toBeLessThan(state.activePlayerColors.length);
        });

        test('should throw error for invalid initialPlayersArray or allGameColorsList', () => {
            expect(() => initializeGameState([], 2, ["Red", "Green"])).toThrow();
            expect(() => initializeGameState([{color: "Red", name: "P1"}], 2, ["Red"])).toThrow();
        });
    });

    describe('rollDice', () => {
        test('should return a number between 1 and 6', () => {
            for (let i = 0; i < 100; i++) {
                const result = rollDice();
                expect(result).toBeGreaterThanOrEqual(1);
                expect(result).toBeLessThanOrEqual(6);
            }
        });
    });

    describe('getPlayerColor', () => {
        test('should return correct color for active players', () => {
            const initialP = [{ color: "Red", name: "P1" }, { color: "Green", name: "P2" }];
            const gameC = ["Red", "Green"];
            let gameState = initializeGameState(initialP, 2, gameC);

            gameState.current_player_index = 0;
            expect(getPlayerColor(gameState)).toBe("Red");

            gameState.current_player_index = 1;
            expect(getPlayerColor(gameState)).toBe("Green");
        });

        test('should handle current_player_index wrapping correctly with activePlayerColors', () => {
            const initialP = [{ color: "Red", name: "P1" }, { color: "Green", name: "P2" }];
            const gameC = ["Red", "Green"];
            let gameState = initializeGameState(initialP, 2, gameC);

            gameState.current_player_index = 2; // 2 % 2 = 0
            expect(getPlayerColor(gameState)).toBe("Red");
        });

        test('should return the first active player if current_player_index is initially out of bounds (due to modulo)', () => {
            const initialP = [{ color: "Red", name: "P1" }, { color: "Green", name: "P2" }, { color: "Yellow", name: "P3" }];
            const gameC = ["Red", "Green", "Yellow"];
            let gameState = initializeGameState(initialP, 2, gameC);

            gameState.current_player_index = 3; // 3 % 3 = 0
            expect(getPlayerColor(gameState)).toBe("Red");
        });

        test('should handle a single active player', () => {
            const initialP = [{ color: "Blue", name: "P1" }];
            // allGameColorsList must have 2 to 4 players.
            const gameC = ["Blue", "Green"]; // Simulate a 2-player game where Green is not active.
            let gameState = initializeGameState(initialP, 2, gameC);

            gameState.current_player_index = 0;
            expect(getPlayerColor(gameState)).toBe("Blue");

            gameState.current_player_index = 1; // 1 % 1 = 0
            expect(getPlayerColor(gameState)).toBe("Blue");
        });

        test('should use fallback to gameState.players[0] if activePlayerColors is empty and log error', () => {
            const initialP = [{ color: "Red", name: "P1" }]; // Needed to make gameState.players have something
            const gameC = ["Red", "Green"]; // gameState.players will be ["Red", "Green"]
            let gameState = initializeGameState(initialP, 2, gameC);

            gameState.activePlayerColors = []; // Manually make it empty
            gameState.current_player_index = 0;

            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
            const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

            expect(getPlayerColor(gameState)).toBe("Red"); // Fallback to gameState.players[0]
            expect(consoleErrorSpy).toHaveBeenCalled();
            expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining("Fallback: Returning first player"));

            consoleErrorSpy.mockRestore();
            consoleWarnSpy.mockRestore();
        });

        test('should return null if activePlayerColors is empty and gameState.players is also empty (or not suitable) and log error', () => {
            const initialP = [{ color: "Red", name: "P1" }];
             // allGameColorsList must have 2 to 4 players.
            let gameState = initializeGameState(initialP, 2, ["Red", "Green"]);

            gameState.activePlayerColors = [];
            gameState.players = []; // Also make players empty to test final null return
            gameState.current_player_index = 0;

            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
            const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

            expect(getPlayerColor(gameState)).toBeNull();
            expect(consoleErrorSpy).toHaveBeenCalled();
            expect(consoleWarnSpy).not.toHaveBeenCalled(); // Warn should not be called if players is empty

            consoleErrorSpy.mockRestore();
            consoleWarnSpy.mockRestore();
        });


        test('should use fallback to gameState.players[0] if activePlayerColors is undefined and log error', () => {
            const initialP = [{ color: "Yellow", name: "P1" }];
            const gameC = ["Yellow", "Blue"];
            let gameState = initializeGameState(initialP, 2, gameC);

            gameState.activePlayerColors = undefined; // Manually make it undefined
            gameState.current_player_index = 0;

            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
            const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

            expect(getPlayerColor(gameState)).toBe("Yellow"); // Fallback to gameState.players[0]
            expect(consoleErrorSpy).toHaveBeenCalled();
            expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining("Fallback: Returning first player"));

            consoleErrorSpy.mockRestore();
            consoleWarnSpy.mockRestore();
        });
    });

    describe('switchPlayer', () => {
        test('should correctly advance current_player_index for multiple active players', () => {
            const initialP = [{ color: "Red", name: "P1" }, { color: "Green", name: "P2" }, { color: "Yellow", name: "P3" }];
            const gameC = ["Red", "Green", "Yellow"];
            let gameState = initializeGameState(initialP, 2, gameC);

            gameState.current_player_index = 0; // Red
            switchPlayer(gameState);
            expect(gameState.current_player_index).toBe(1); // Green
            expect(getPlayerColor(gameState)).toBe("Green");

            switchPlayer(gameState);
            expect(gameState.current_player_index).toBe(2); // Yellow
            expect(getPlayerColor(gameState)).toBe("Yellow");
        });

        test('should wrap current_player_index back to 0 after reaching the end of activePlayerColors', () => {
            const initialP = [{ color: "Red", name: "P1" }, { color: "Green", name: "P2" }, { color: "Yellow", name: "P3" }];
            const gameC = ["Red", "Green", "Yellow"];
            let gameState = initializeGameState(initialP, 2, gameC);

            gameState.current_player_index = 2; // Yellow
            switchPlayer(gameState);
            expect(gameState.current_player_index).toBe(0); // Red
            expect(getPlayerColor(gameState)).toBe("Red");
        });

        test('should work correctly with two active players', () => {
            const initialP = [{ color: "Red", name: "P1" }, { color: "Green", name: "P2" }];
            const gameC = ["Red", "Green"];
            let gameState = initializeGameState(initialP, 2, gameC);

            gameState.current_player_index = 0; // Red
            switchPlayer(gameState);
            expect(gameState.current_player_index).toBe(1); // Green

            switchPlayer(gameState);
            expect(gameState.current_player_index).toBe(0); // Red
        });

        test('should handle switching with a single active player (index should remain 0)', () => {
            const initialP = [{ color: "Red", name: "P1" }];
            // allGameColorsList must have 2 to 4 players.
            const gameC = ["Red", "Yellow"]; // Simulate a 2-player game context
            let gameState = initializeGameState(initialP, 2, gameC);

            gameState.current_player_index = 0; // Red
            switchPlayer(gameState);
            expect(gameState.current_player_index).toBe(0); // Still Red
        });

        test('should reset turn-specific state variables', () => {
            const initialP = [{ color: "Red", name: "P1" }, { color: "Green", name: "P2" }];
            const gameC = ["Red", "Green"];
            let gameState = initializeGameState(initialP, 2, gameC);

            gameState.current_player_index = 0;
            gameState.dice_roll = 6;
            gameState.consecutive_sixes_count = 1;
            gameState.threeTryAttempts = 2;
            gameState.mustRollAgain = true;
            gameState.awaitingMove = true;

            switchPlayer(gameState);

            expect(gameState.dice_roll).toBeNull();
            expect(gameState.consecutive_sixes_count).toBe(0);
            expect(gameState.threeTryAttempts).toBe(0);
            expect(gameState.mustRollAgain).toBe(false);
            expect(gameState.awaitingMove).toBe(false);
        });

        test('should not change index if activePlayerColors is empty and log error', () => {
            const initialP = [{ color: "Red", name: "P1" }];
            const gameC = ["Red", "Green"]; // gameState.players will be ["Red", "Green"]
            let gameState = initializeGameState(initialP, 2, gameC);

            const originalIndex = gameState.current_player_index; // Might be 0 if Red is the only active one initially
            gameState.activePlayerColors = []; // Manually make it empty

            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

            switchPlayer(gameState);

            // current_player_index should ideally not change, or be predictable
            // The current implementation of switchPlayer doesn't explicitly set it to 0 in this case,
            // it just skips the modulo operation. So, it would retain its previous value.
            // If activePlayerColors was initially empty, current_player_index would be 0 from initializeGameState.
            // If it had players, then emptied, it would be the last valid index.
            // For this test, let's assume it was 0.
            expect(gameState.current_player_index).toBe(originalIndex);
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("Cannot switch player, activePlayerColors is empty or undefined."));

            consoleErrorSpy.mockRestore();
        });
    });

    // Placeholder for other tests like 'areAllPawnsHome', 'getMovablePawns', 'movePawn'
    // These would need similar adaptation if their logic relies on activePlayerColors or specific player turn logic.
    // For now, focusing on the requested functions.

    describe('Player Elimination and Round Progression', () => {
        // Define colors to be used in this test block consistently
        const P_RED = "Red";
        const P_GREEN = "Green";
        const P_BLUE = "Blue";

        test('should correctly handle player elimination by timer and ensure eliminated player does not participate in subsequent rounds', () => {
            // 1. Setup Game
            let game = createLudoGameInstance('eliminationTestGame', 'player1-id', 'Player1');

            // Assign players
            assignPlayerToSlot(game, 'player1-id', 'Player Red');
            handlePlayerColorSelection(game, 'player1-id', P_RED);

            assignPlayerToSlot(game, 'player2-id', 'Player Green');
            handlePlayerColorSelection(game, 'player2-id', P_GREEN);

            assignPlayerToSlot(game, 'player3-id', 'Player Blue');
            handlePlayerColorSelection(game, 'player3-id', P_BLUE);

            // Set game parameters (3 players, 2 victories, 4min timer)
            const paramsResult = setGameParameters(game, 3, 2, '4min', game.creatorPlayerId);
            expect(paramsResult.success).toBe(true);

            // Start the game
            const startResult = startGameActual(game);
            expect(startResult.success).toBe(true);
            expect(game.status).toBe('active');

            // Verify initial state
            expect(game.activePlayerColors).toEqual(expect.arrayContaining([P_RED, P_GREEN, P_BLUE]));
            expect(game.activePlayerColors.length).toBe(3);
            expect(game.num_players).toBe(3);
            expect(game.eliminatedPlayers).toEqual([]);
            expect(game.playerTimers[P_RED]).toBe(240);
            expect(game.playerTimers[P_GREEN]).toBe(240);
            expect(game.playerTimers[P_BLUE]).toBe(240);

            // 2. Simulate Player Elimination (Green player timed out)
            // Find Green's index to set current_player_index correctly
            const greenIndex = game.activePlayerColors.indexOf(P_GREEN);
            expect(greenIndex).not.toBe(-1); // Ensure Green is active
            game.current_player_index = greenIndex;
            expect(getPlayerColor(game)).toBe(P_GREEN); // Verify it's Green's turn

            game.playerTimers[P_GREEN] = 1; // Set Green's timer to 1 second
            game.playerTurnStartTime = Date.now() - 2000; // Simulate 2 seconds elapsed

            // Spy on console.log to check for elimination message
            const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

            switchPlayer(game); // This should trigger Green's elimination

            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining(`Player ${P_GREEN} PERMANENTLY eliminated due to timer.`));

            // Assertions after Green's elimination
            expect(game.eliminatedPlayers).toContain(P_GREEN);
            expect(game.activePlayerColors).not.toContain(P_GREEN);
            expect(game.activePlayerColors.length).toBe(2);
            expect(game.num_players).toBe(2);
            expect(game.playerTimers[P_GREEN]).toBe(0);

            const currentPlayerAfterElimination = getPlayerColor(game);
            expect([P_RED, P_BLUE]).toContain(currentPlayerAfterElimination); // Next player should be Red or Blue

            // 3. Simulate End of Current Round (Red wins the round)
            game.round_over = true;
            game.round_winner = P_RED;
            game.status = 'roundOver';

            checkForGameVictory(game);
            expect(game.playerScores[P_RED]).toBe(1);
            expect(game.overall_game_over).toBe(false); // Game target is 2 victories

            // 4. Start Next Round
            startNextRound(game);

            // Assertions for the new round
            expect(game.status).toBe('active');
            expect(game.activePlayerColors.length).toBe(2);
            expect(game.activePlayerColors).toEqual(expect.arrayContaining([P_RED, P_BLUE]));
            expect(game.activePlayerColors).not.toContain(P_GREEN);

            expect(game.players.length).toBe(2); // game.players should also be updated
            expect(game.players).toEqual(expect.arrayContaining([P_RED, P_BLUE]));
            expect(game.players).not.toContain(P_GREEN);

            expect(game.num_players).toBe(2);
            // game.eliminatedPlayers tracks players who cannot play *at all* anymore (timer death).
            // startGameActual initializes it to []. startNextRound does not clear it.
            // So Green should still be listed as an eliminated player overall.
            expect(game.eliminatedPlayers).toContain(P_GREEN);

            expect(Object.keys(game.board.players)).toEqual(expect.arrayContaining([P_RED, P_BLUE]));
            expect(Object.keys(game.board.players).length).toBe(2);
            expect(game.board.players[P_GREEN]).toBeUndefined();

            expect(Object.keys(game.pawns)).toEqual(expect.arrayContaining([P_RED, P_BLUE]));
            expect(Object.keys(game.pawns).length).toBe(2);
            expect(game.pawns[P_GREEN]).toBeUndefined();

            const currentPlayerInNewRound = getPlayerColor(game);
            expect([P_RED, P_BLUE]).toContain(currentPlayerInNewRound);

            // 5. Verify Eliminated Player Cannot Participate
            // This is implicitly verified by Green not being in activePlayerColors,
            // thus getPlayerColor will not return Green, and Green cannot take a turn.
            // Also, board and pawns for Green are not initialized for the new round.

            consoleLogSpy.mockRestore();
        });
    });
});
