const http = require('http');
const { Server } = require("socket.io");
const Client = require("socket.io-client").io; // Use .io for CJS
const ludoGame = require('./game_logic/ludoGame');

// Import what's needed from server.js - might need to adjust server.js to export app & io for testing
// For now, we'll test by running a server instance.
// Note: This approach is more of an integration test.
// True unit tests for socket handlers would involve mocking socket and io objects.

describe("Ludo Server Basic Functionality", () => {
  let ioServer, serverHttp, clientSocket1, clientSocket2, port;
  let activeGamesRef; // To access activeGames from the server module if possible

  beforeAll((done) => {
    // Dynamically import server to get a fresh instance with potentially mocked parts later
    // For now, direct require and hope it doesn't pollute other tests if run in same suite
    const serverModule = require('./server'); 
    serverHttp = serverModule.server; // Assuming server.js exports its http server instance
    ioServer = serverModule.io;       // Assuming server.js exports its io instance
    activeGamesRef = serverModule.activeGames; // Assuming server.js exports activeGames

    // Find an available port
    const s = http.createServer();
    s.listen(0, () => {
      port = s.address().port;
      s.close(() => {
        // Ensure the main server isn't already listening on this port from a previous test run
        // This is tricky. For isolated tests, server should be started/stopped per test or suite.
        // If server.listen was already called in server.js, this might conflict or re-use.
        // The server.js module currently calls server.listen().
        // For testing, it's better if listen() is only called in a specific start function.
        // For this test, we assume server.js's listen is a global side effect and we connect to it.
        // This is not ideal but works for basic integration.
        
        // If server.js already started listening, we might not need to call listen() again.
        // Let's assume the server is already running due to require('./server')
        // and its listen call. We will just connect to it.
        // This means PORT from server.js (3000) will be used.
        // To avoid port conflicts, it's better server.js does NOT auto-listen when required.
        // For this test, I'll proceed assuming server.js auto-listens on its PORT.
        port = process.env.PORT || 3000; // From server.js
        done();
      });
    });
  });

  afterAll(() => {
    ioServer.close(); // Close the server instance created by server.js
    if (clientSocket1 && clientSocket1.connected) clientSocket1.disconnect();
    if (clientSocket2 && clientSocket2.connected) clientSocket2.disconnect();
  });

  beforeEach((done) => {
    // Clean up activeGames before each test if possible and needed
    for (const key in activeGamesRef) {
        delete activeGamesRef[key];
    }
    
    const socketUrl = `http://localhost:${port}`;
    clientSocket1 = new Client(socketUrl, { forceNew: true, transports: ['websocket'] });
    clientSocket1.on("connect", () => {
        // console.log("Client 1 connected for test");
        done();
    });
    clientSocket1.on("connect_error", (err) => {
        console.error("Client 1 connection error:", err.message);
        done(err); // Fail test if connection error
    });
  });

  afterEach(() => {
    if (clientSocket1 && clientSocket1.connected) clientSocket1.disconnect();
    if (clientSocket2 && clientSocket2.connected) clientSocket2.disconnect();
  });

  test("should allow a user to create a new game", (done) => {
    clientSocket1.emit("createGame", { numPlayers: 2 });
    clientSocket1.on("gameCreated", (data) => {
      expect(data.gameId).toBeDefined();
      expect(data.playerColor).toBe("Red"); // First player is Red by default
      expect(data.gameState).toBeDefined();
      expect(data.gameState.players[0]).toBe("Red");
      expect(activeGamesRef[data.gameId]).toBeDefined();
      expect(activeGamesRef[data.gameId].playerSockets[data.playerColor]).toBe(clientSocket1.id);
      done();
    });
  });

  test("should allow a second user to join an existing game", (done) => {
    let gameIdToJoin;
    // First, player 1 creates a game
    clientSocket1.emit("createGame", { numPlayers: 2 });
    clientSocket1.on("gameCreated", (data) => {
      gameIdToJoin = data.gameId;
      expect(gameIdToJoin).toBeDefined();

      // Player 2 joins
      clientSocket2 = new Client(`http://localhost:${port}`, { forceNew: true, transports: ['websocket'] });
      clientSocket2.on("connect", () => {
        clientSocket2.emit("joinGame", { gameId: gameIdToJoin });
      });
      clientSocket2.on("joinedGame", (joinData) => {
        expect(joinData.gameId).toBe(gameIdToJoin);
        expect(joinData.playerColor).toBe("Green"); // Second player should be Green
        expect(joinData.gameState).toBeDefined();
        expect(activeGamesRef[gameIdToJoin].playerSockets[joinData.playerColor]).toBe(clientSocket2.id);
        expect(Object.keys(activeGamesRef[gameIdToJoin].playerSockets).length).toBe(2);
        done();
      });
       clientSocket2.on("connect_error", (err) => done(err));
    });
  });
  
  test("should prevent joining a full game", (done) => {
    clientSocket1.emit("createGame", { numPlayers: 2 }); // Game for 2 players
    clientSocket1.on("gameCreated", (gameData) => {
        const gameId = gameData.gameId;
        // Player 2 joins
        clientSocket2 = new Client(`http://localhost:${port}`, { forceNew: true, transports: ['websocket'] });
        clientSocket2.on("connect", () => clientSocket2.emit("joinGame", { gameId }));
        clientSocket2.on("joinedGame", () => {
            // Player 3 tries to join (should fail)
            const clientSocket3 = new Client(`http://localhost:${port}`, { forceNew: true, transports: ['websocket'] });
            clientSocket3.on("connect", () => clientSocket3.emit("joinGame", { gameId }));
            clientSocket3.on("actionError", (errorData) => {
                expect(errorData.message).toBe("Game is full.");
                clientSocket3.disconnect();
                done();
            });
            clientSocket3.on("connect_error", (err) => done(err));
        });
        clientSocket2.on("connect_error", (err) => done(err));
    });
  });

  test("should allow a player to roll dice if it's their turn", (done) => {
    clientSocket1.emit("createGame", { numPlayers: 2 });
    clientSocket1.on("gameCreated", (gameData) => {
        const gameId = gameData.gameId;
        const creatorColor = gameData.playerColor;
        
        // It should be creator's (Red's) turn initially if game logic sets first player correctly
        // Or, wait for gameStateUpdate to confirm current player
        clientSocket1.on("gameStateUpdate", (updatedState) => {
            if (ludoGame.getPlayerColor(updatedState) === creatorColor && updatedState.dice_roll === null) {
                clientSocket1.emit("rollDice", { gameId });
            }
        });

        clientSocket1.on("diceRolled", (diceData) => {
            expect(diceData.playerColor).toBe(creatorColor);
            expect(diceData.diceValue).toBeGreaterThanOrEqual(1);
            expect(diceData.diceValue).toBeLessThanOrEqual(6);
            expect(activeGamesRef[gameId].dice_roll).toBe(diceData.diceValue);
            done();
        });
    });
  });

  test("should not allow a player to roll dice if not their turn", (done) => {
    clientSocket1.emit("createGame", { numPlayers: 2 }); // Red creates
    clientSocket1.on("gameCreated", (gameData) => {
        const gameId = gameData.gameId;
        // Player 2 (Green) joins
        clientSocket2 = new Client(`http://localhost:${port}`, { forceNew: true, transports: ['websocket'] });
        clientSocket2.on("connect", () => clientSocket2.emit("joinGame", { gameId }));
        clientSocket2.on("joinedGame", () => {
            // It's still Red's turn. Green tries to roll.
            clientSocket2.emit("rollDice", { gameId }); 
        });
        clientSocket2.on("actionError", (errorData) => {
            expect(errorData.message).toBe("Not your turn.");
            done();
        });
        clientSocket2.on("connect_error", (err) => done(err));
    });
  });

  // Add a basic movePawn test
  // This requires a dice to be rolled first, and for the client to be awaiting a move.
  test("should allow a player to move a pawn after rolling", (done) => {
    clientSocket1.emit("createGame", { numPlayers: 2 });
    let currentGameState;
    clientSocket1.on("gameStateUpdate", (gs) => {
        currentGameState = gs; // Keep track of the latest game state
    });

    clientSocket1.on("gameCreated", (gameData) => {
        const gameId = gameData.gameId;
        const playerColor = gameData.playerColor; // Red

        // Simulate a scenario where Red rolls a 6 (auto-moves pawn 0 out) and must roll again
        // Then rolls a 3, and is awaiting move
        // To simplify, we'll manually set up a state where Red has rolled and is awaiting move.
        
        // This is hard to test without full turn-by-turn interaction or deep mocking of server state.
        // A simpler test:
        // 1. Create game
        // 2. Roll a 6 (server should auto-move pawn 0 out for Red, and Red must roll again)
        // 3. Roll a 3 (Red is now awaiting move for pawn 0 with dice 3)
        // 4. Send movePawn for pawn 0 with dice 3

        // For this example, we'll just check if the event is received by server
        // and if an error or success is emitted, without complex state setup.
        // This requires the server to have a game where it's clientSocket1's turn
        // and dice has been rolled, and it's awaiting a move.

        // Manually set state for testing this specific handler (less integration, more unit-like for handler)
        const testGameId = "testMovePawnGame";
        const initialGs = ludoGame.initializeGameState(2);
        initialGs.gameId = testGameId;
        initialGs.playerSockets = { [playerColor]: clientSocket1.id };
        initialGs.current_player_index = initialGs.players.indexOf(playerColor);
        initialGs.dice_roll = 3; // Assume player rolled a 3
        initialGs.awaitingMove = true;
        // Put a pawn on board for Red to move
        initialGs.pawns[playerColor][0].state = ludoGame.PAWN_STATES.ACTIVE;
        initialGs.pawns[playerColor][0].position = ludoGame.PLAYER_START_POSITIONS[playerColor];
        initialGs.board.track[ludoGame.PLAYER_START_POSITIONS[playerColor]] = [playerColor, 0];
        initialGs.board.players[playerColor].home_area_count = 3;
        activeGamesRef[testGameId] = initialGs;
        clientSocket1.gameId = testGameId; // Assign to socket for server to find
        clientSocket1.playerColor = playerColor;


        clientSocket1.emit("movePawn", { gameId: testGameId, pawnId: 0 });

        clientSocket1.on("pawnMoved", (moveData) => {
            expect(moveData.playerColor).toBe(playerColor);
            expect(moveData.pawnId).toBe(0);
            expect(moveData.diceValue).toBe(3);
            expect(activeGamesRef[testGameId].pawns[playerColor][0].position).toBe(ludoGame.PLAYER_START_POSITIONS[playerColor] + 3);
            // Turn should switch as it was not a 6
            expect(ludoGame.getPlayerColor(activeGamesRef[testGameId])).not.toBe(playerColor);
            done();
        });
         clientSocket1.on("actionError", (err) => {
            done(new Error("movePawn failed: " + err.message));
        });
    });


});
