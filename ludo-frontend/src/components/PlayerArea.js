import React from 'react';

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
  isReady // New prop for readiness status
}) => {
  let borderColor = playerColor || 'grey';
  if (isSetupPhase && isReady) {
    borderColor = 'lightgreen';
  } else if (!isSetupPhase && isCurrentPlayer) {
    borderColor = 'gold';
  }

  const areaStyle = {
    border: `3px solid ${borderColor}`,
    padding: '10px',
    margin: '10px',
    borderRadius: '5px',
    backgroundColor: '#f9f9f9', // Unified background
    minWidth: '150px',
    minHeight: '110px', // Added minHeight
  };

  const titleStyle = {
    color: playerColor || (isSetupPhase && !playerName ? 'grey' : 'black'), // Unified title color logic
    fontWeight: 'bold',
    marginBottom: '5px',
  };

  return (
    <div style={areaStyle}>
      <h3 style={titleStyle}>{playerName || playerColor || (isSetupPhase ? 'Wolne Miejsce...' : 'Player')}</h3>
      
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
       {isSetupPhase && !playerColor && !isSelf && playerName && (
        <p style={{ fontStyle: 'italic', fontSize: '0.9em' }}>Czeka na wybór koloru...</p>
      )}
    </div>
  );
};

export default PlayerArea;
