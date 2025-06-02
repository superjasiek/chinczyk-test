
const {
    initializeGameState,
    getPlayerColor,
    switchPlayer,
    PLAYER_COLORS,
    PAWN_STATES,
    NUM_PAWNS_PER_PLAYER,
    PLAYER_START_POSITIONS,
    TRACK_LENGTH,
    HOME_STRETCH_LENGTH,
    PLAYER_PATH_END_BEFORE_HOME_STRETCH,
    rollDice // Assuming rollDice is also exported and might be useful
} = require('./ludoGame');

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
});
