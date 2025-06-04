import React, { useState, useEffect } from 'react';
import './Lobby.css'; // We'll create this CSS file next

const Lobby = ({ onCreateGame, onJoinGame, errorMsg, clearError }) => {
  // State for creating a game
  const [createPlayerName, setCreatePlayerName] = useState('');
  
  // State for joining a game
  const [activeGamesList, setActiveGamesList] = useState([]);
  const [selectedGameId, setSelectedGameId] = useState('');
  const [joinPlayerName, setJoinPlayerName] = useState('');
  const [isLoadingGames, setIsLoadingGames] = useState(false);
  const [fetchGamesError, setFetchGamesError] = useState('');

  // State for leaderboard
  const [leaderboardData, setLeaderboardData] = useState([]);
  const [isLoadingLeaderboard, setIsLoadingLeaderboard] = useState(false);
  const [fetchLeaderboardError, setFetchLeaderboardError] = useState('');
  
  const fetchLeaderboard = async () => {
    setIsLoadingLeaderboard(true);
    setFetchLeaderboardError('');
    try {
      const response = await fetch('/api/leaderboard');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setLeaderboardData(data);
    } catch (error) {
      setFetchLeaderboardError('Failed to load leaderboard. Please try again.');
      console.error("Error fetching leaderboard:", error);
    } finally {
      setIsLoadingLeaderboard(false);
    }
  };

  const fetchActiveGames = async () => {
    setIsLoadingGames(true);
    setFetchGamesError('');
    clearError(); // Clear general lobby errors too
    try {
      // Assuming proxy is set in package.json, or server handles CORS
      const response = await fetch('/api/activeGames'); 
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setActiveGamesList(data);
    } catch (error) {
      setFetchGamesError('Failed to load games. Please try again.');
      console.error("Error fetching active games:", error);
    } finally {
      setIsLoadingGames(false);
    }
  };

  useEffect(() => {
    fetchActiveGames();
    fetchLeaderboard(); // Fetch leaderboard on component mount
  }, []); // Fetch on component mount

  const handleCreate = () => {
    clearError();
    if (createPlayerName.trim() === '') {
      alert("Please enter your name for creating a game.");
      return;
    }
    onCreateGame({ 
      playerName: createPlayerName.trim()
    });
  };

  const handleJoin = () => {
    clearError();
    if (!selectedGameId) {
      alert("Please select a game to join from the list.");
      return;
    }
    if (joinPlayerName.trim() === '') {
      alert("Please enter your name for joining the game.");
      return;
    }
    onJoinGame({ 
      gameId: selectedGameId, 
      playerName: joinPlayerName.trim()
    });
  };

  return (
    <div className="lobby-container">
      <div className="main-lobby-area">
        <h2>Elo Suczki</h2>
        
        {errorMsg && <p className="lobby-error">Error: {errorMsg}</p>}

        <div className="lobby-section create-game-section">
          <h3>Utwórz nową grę</h3>
          <div className="form-group">
          <label htmlFor="createPlayerName">Imię: </label>
          <input 
            type="text" 
            id="createPlayerName" 
            value={createPlayerName} 
            onChange={(e) => setCreatePlayerName(e.target.value)} 
            placeholder="Podaj imię" 
            required 
          />
        </div>
        <button onClick={handleCreate} className="lobby-button create-button">Utwórz grę</button>
      </div>

      <div className="lobby-section join-game-section">
        <h3>Dołącz do trwającej gry</h3>
        <button onClick={fetchActiveGames} disabled={isLoadingGames} className="lobby-button refresh-button">
          {isLoadingGames ? 'Refreshing...' : 'Odśwież listę'}
        </button>
        {fetchGamesError && <p className="lobby-error">{fetchGamesError}</p>}
        
        {isLoadingGames && <p>Loading games...</p>}
        
        {!isLoadingGames && !fetchGamesError && activeGamesList.length === 0 && (
          <p>Nie ma aktywnych gier - stwórz jedną baranie!?</p>
        )}

        {!isLoadingGames && activeGamesList.length > 0 && (
          <div className="active-games-list">
            {activeGamesList.map(game => (
              <div 
                key={game.gameId} 
                onClick={() => setSelectedGameId(game.gameId)}
                className={`game-listing ${selectedGameId === game.gameId ? 'selected-game' : ''}`}
                style={{
                  padding: '10px',
                  margin: '5px 0',
                  border: selectedGameId === game.gameId ? '2px solid dodgerblue' : '1px solid #ccc',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  backgroundColor: selectedGameId === game.gameId ? '#e9f5ff' : 'transparent'
                }}
              >
                <p><strong>ID Gry: {game.gameId}</strong></p>
                <p>Liczba Graczy: {game.currentPlayersCount}/{game.maxPlayers}</p>
                <p>W Grze: {game.playerNamesInGame.join(', ') || 'Waiting for players...'}</p>
              </div>
            ))}
          </div>
        )}

        {activeGamesList.length > 0 && (
          <>
            <div className="form-group">
              <label htmlFor="joinPlayerName">Imię (aby dołączyć): </label>
              <input 
                type="text" 
                id="joinPlayerName" 
                value={joinPlayerName} 
                onChange={(e) => setJoinPlayerName(e.target.value)} 
                placeholder="Podaj imię" 
                required 
                disabled={!selectedGameId}
              />
            </div>
            <button onClick={handleJoin} className="lobby-button join-button" disabled={!selectedGameId || isLoadingGames}>Dołącz do wybranej gry</button>
          </>
        )}
      </div>
      </div> {/* End of main-lobby-area */}

      <div className="lobby-section leaderboard-section">
        <h3>Wygrywy (Top 10)</h3>
        <button onClick={fetchLeaderboard} disabled={isLoadingLeaderboard} className="lobby-button refresh-leaderboard-button">
          {isLoadingLeaderboard ? 'Refreshing...' : 'Odśwież Wygrywów'}
        </button>
        {isLoadingLeaderboard && <p>Loading leaderboard...</p>}
        {fetchLeaderboardError && <p className="lobby-error">{fetchLeaderboardError}</p>}
        {!isLoadingLeaderboard && !fetchLeaderboardError && leaderboardData.length === 0 && (
          <p>Brak wyników! Bądź pierwszy który wygra grę!.</p>
        )}
        {!isLoadingLeaderboard && !fetchLeaderboardError && leaderboardData.length > 0 && (
          <ol className="leaderboard-list">
            {leaderboardData.map((player, index) => (
              <li key={index} className="leaderboard-item">
                <span>{index + 1}.</span>
                <span>{player.name}</span>
                <span>{player.score} points</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
};

export default Lobby;
