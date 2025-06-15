import React, { useState, useEffect } from 'react';
import './App.css'; 
import Game from './components/Game';
import Lobby from './components/Lobby';
import { socket } from './socket'; // Import the shared socket instance

function App() {
  const [inGame, setInGame] = useState(false);
  const [gameId, setGameId] = useState(null);
  const [myPlayerColor, setMyPlayerColor] = useState(null);
  const [myPlayerName, setMyPlayerName] = useState(null); // Added state for player name
  const [initialGameState, setInitialGameState] = useState(null);
  const [lobbyError, setLobbyError] = useState('');

  const clearLobbyError = () => setLobbyError('');

  useEffect(() => {
    // Listen for game creation/joining success to transition views
    const handleGameCreated = (data) => {
      setGameId(data.gameId);
      // myPlayerColor and myPlayerName are set from data.playerColor / data.playerName
      // For created games, enableEarthquakeMode is already set by handleCreateGame call.
      // We could also get it from data.gameState.earthquakeModeEnabled if server includes it early.
      setInitialGameState(data.gameState);
      // if (data.gameState && typeof data.gameState.earthquakeModeEnabled !== 'undefined') {
      //   setEnableEarthquakeMode(data.gameState.earthquakeModeEnabled);
      // }
      setInGame(true);
      setLobbyError('');
    };

    const handleJoinedGame = (data) => {
      setGameId(data.gameId);
      setInitialGameState(data.gameState);
      // For joined games, get earthquake mode from the initial game state
      // if (data.gameState && typeof data.gameState.earthquakeModeEnabled !== 'undefined') {
      //   setEnableEarthquakeMode(data.gameState.earthquakeModeEnabled);
      // } else {
      //   setEnableEarthquakeMode(false); // Default if not present
      // }
      setInGame(true);
      setLobbyError('');
    };
    
    const handleActionError = (data) => {
        // Handle errors that might occur during lobby phase, e.g., game full, game not found
        if (!inGame) { // Only show lobby errors if not in game
            setLobbyError(data.message);
        }
    };

    socket.on('gameCreated', handleGameCreated);
    socket.on('joinedGame', handleJoinedGame);
    socket.on('actionError', handleActionError); // Listen for errors useful for lobby

    return () => {
      socket.off('gameCreated', handleGameCreated);
      socket.off('joinedGame', handleJoinedGame);
      socket.off('actionError', handleActionError);
    };
  }, [inGame]); // Effect depends on inGame to only show lobby errors when not in game

  const handleCreateGame = (gameSettings) => { // Updated signature
    if (socket.connected) {
      socket.emit('createGame', gameSettings); // gameSettings from Lobby now only has playerName and enableAI
    } else {
      setLobbyError("Not connected to server. Please wait or check connection.");
    }
  };

  const handleJoinGame = (joinSettings) => { // Updated signature
    if (socket.connected && joinSettings && joinSettings.gameId && joinSettings.playerName) {
      socket.emit('joinGame', joinSettings); // Send joinSettings object
    } else if (!joinSettings || !joinSettings.gameId) {
      setLobbyError("Please select a game to join.");
    } else if (!joinSettings.playerName) {
      setLobbyError("Please enter your player name to join."); // Should be caught by Lobby, but good fallback
    } else {
      setLobbyError("Not connected to server. Please wait or check connection.");
    }
  };
  
  const handleReturnToLobby = () => {
    setInGame(false);
    setGameId(null);
    setMyPlayerColor(null);
    setMyPlayerName(null); // Reset player name
    setInitialGameState(null);
    // Optionally, tell the server the player is leaving the current game context if needed
    // socket.emit('leaveGame', { gameId }); // Requires server handler
  };


  return (
    <div className="App">
      <header className="App-header">
        <h1>Chińczyk</h1>
        {inGame && <button onClick={handleReturnToLobby} className="lobby-return-button">Powrót do Lobby</button>}
      </header>
      <main>
        {!inGame ? (
          <Lobby 
            onCreateGame={handleCreateGame} 
            onJoinGame={handleJoinGame}
            errorMsg={lobbyError}
            clearError={clearLobbyError}
          />
        ) : (
          <Game 
            gameId={gameId} 
            assignedPlayerColor={myPlayerColor}
            myPlayerName={myPlayerName} // Pass myPlayerName
            initialGameState={initialGameState} // Pass initial state to Game
            onReturnToLobby={handleReturnToLobby} // For Game Over screen
          />
        )}
      </main>
      <footer>
        <p>Ludo Game Frontend by Gonisuki Nabosaka &copy; 2025</p>
      </footer>
    </div>
  );
}

export default App;