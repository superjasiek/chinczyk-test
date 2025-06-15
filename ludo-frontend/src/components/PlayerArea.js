import React, { useState, useEffect } from 'react';

const PlayerArea = ({ 
  playerColor, 
  playerName, // Added playerName
  pawns, 
  homeCount, 
  finishedCount, 
  isCurrentPlayer,
  // New props for color selection in setup phase
  isSetupPhase,
  isSelf,
  availableColors,
  takenColors,
  onSelectColor,
  isReady, // New prop for readiness status
  // Timer related props
  playerTimer,
  isEliminated,
  initialTimePerPlayer,
  gameTimeMode,
  playerTurnStartTime
}) => {
  let borderColor = playerColor || 'grey';
  if (isEliminated) {
    borderColor = '#757575'; // Dark grey for eliminated
  } else if (isSetupPhase && isReady) {
    borderColor = 'lightgreen';
  } else if (!isSetupPhase && isCurrentPlayer) {
    borderColor = 'gold';
  }

  const areaStyle = {
    border: `3px solid ${borderColor}`,
    padding: '10px',
    margin: '10px',
    borderRadius: '5px',
    backgroundColor: isEliminated ? '#e0e0e0' : '#f9f9f9', // Unified background, greyish if eliminated
    opacity: isEliminated ? 0.6 : 1,
    minWidth: '150px',
    minHeight: '110px', // Added minHeight
  };

  const titleStyle = {
    color: playerColor || (isSetupPhase && !playerName ? 'grey' : 'black'), // Unified title color logic
    fontWeight: 'bold',
    marginBottom: '5px',
    textDecoration: isEliminated ? 'line-through' : 'none',
  };

  const formatTime = (totalSeconds) => {
    if (totalSeconds === null || totalSeconds === undefined || totalSeconds < 0) {
      return '--:--';
    }
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  };

  const [displayedTime, setDisplayedTime] = useState(playerTimer);

  useEffect(() => {
    setDisplayedTime(playerTimer); // Always sync with the live prop first

    let timerInterval = null;
    if (isCurrentPlayer && !isEliminated && gameTimeMode !== 'unlimited' && typeof playerTimer === 'number' && playerTimer > 0) {
      // If this is the current player, and they are active and game is timed,
      // start a local interval to decrement the display smoothly.
      // The 'playerTimer' prop acts as a sync point from the server.
      timerInterval = setInterval(() => {
        // Decrement based on its own previous state, not playerTimer prop directly inside interval
        setDisplayedTime(prevTime => {
          if (prevTime === null || prevTime <= 0) { // Check for null as well
            clearInterval(timerInterval); // Clear interval if time runs out
            return 0;
          }
          return prevTime - 1;
        });
      }, 1000);
    } else if (gameTimeMode === 'unlimited' || playerTimer === null) {
        setDisplayedTime(null); // Ensure displayedTime is null for unlimited or if playerTimer is null
    }


    return () => {
      if (timerInterval) {
        clearInterval(timerInterval);
      }
    };
    // Re-sync and restart interval if the authoritative playerTimer (from server) changes,
    // or if the player's status (isCurrentPlayer, isEliminated) changes.
  }, [playerTimer, isCurrentPlayer, isEliminated, gameTimeMode]);


  return (
    <div style={areaStyle}>
      <h3 style={titleStyle}>{playerName || playerColor || (isSetupPhase ? 'Wolne Miejsce...' : 'Player')}</h3>
      
      {/* Timer and Elimination Display - Not shown during setup phase's color picking */}
      {!isSetupPhase && (
        <>
          {isEliminated ? (
            <p style={{ color: 'red', fontWeight: 'bold', marginTop: '5px' }}>Wyeliminowany</p>
          ) : gameTimeMode === 'unlimited' || displayedTime === null ? (
            <p style={{ marginTop: '5px' }}>Czas: Bez limitu</p>
          ) : (
            <p style={{ marginTop: '5px' }}>Pozostały czas: {formatTime(displayedTime)}</p>
          )}
        </>
      )}

      {isSetupPhase && isSelf && !playerColor && availableColors && (
        <div className="color-picker-container" style={{ marginTop: '10px' }}>
          <p style={{ fontSize: '0.9em', marginBottom: '5px' }}>Wybierz kolor:</p>
          {availableColors.map(color => (
            <button
              key={color}
              style={{ 
                backgroundColor: color, 
                color: color === 'Yellow' || color === 'Green' ? 'black' : 'white', // Text color for visibility
                margin: '3px', 
                padding: '5px 8px',
                border: `1px solid ${takenColors.includes(color) ? '#aaa' : '#555'}`,
                borderRadius: '4px',
                cursor: takenColors.includes(color) ? 'not-allowed' : 'pointer',
                opacity: takenColors.includes(color) ? 0.6 : 1,
              }}
              onClick={() => onSelectColor(color)}
              disabled={
                // Color is taken by another player (color !== playerColor is true if playerColor is null, as in this block)
                (takenColors.includes(color) && color !== playerColor) ||
                // Or, if "I" (isSelf) have already chosen a color (playerColor !== null)
                // AND this button is for a different color.
                // (This part of the condition will be false in this specific rendering block because playerColor is null,
                // but including it for logical completeness as per potential broader interpretation of requirements)
                (isSelf && playerColor !== null && color !== playerColor)
              }
            >
              {color} {takenColors.includes(color) && color !== playerColor ? '(Zajęty)' : ''}
            </button>
          ))}
        </div>
      )}

      {isSetupPhase && playerColor && (
        <p style={{ marginTop: '10px', fontWeight: 'bold' }}>Kolor: <span style={{color: playerColor}}>{playerColor}</span></p>
      )}

      {isSetupPhase && isReady && playerColor && ( // Only show "Gotowy!" if player has a color (is an active player)
        <p style={{ marginTop: '5px', color: 'green', fontWeight: 'bold' }}>(Gotowy!)</p>
      )}
      
      {!isSetupPhase && (
        <>
          <p>Pionki w Bazie: {homeCount}</p>
          <p>Pionki na Mecie: {finishedCount}</p>
        </>
      )}
      {/* Message for player waiting for color selection - only if not eliminated and in setup */}
      {isSetupPhase && !playerColor && !isSelf && playerName && !isEliminated && (
        <p style={{ fontStyle: 'italic', fontSize: '0.9em' }}>Czeka na wybór koloru...</p>
      )}
    </div>
  );
};

export default PlayerArea;
