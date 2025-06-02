import React from 'react';
import Pawn from './Pawn'; // To display home pawns perhaps

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
  const areaStyle = {
    border: `3px solid ${isSetupPhase && isReady ? 'lightgreen' : (isCurrentPlayer && !isSetupPhase ? 'gold' : playerColor || 'grey')}`, 
    // Styling priority: Ready in setup > Current player in game > Default color or grey
    padding: '10px',
    margin: '10px',
    borderRadius: '5px',
    backgroundColor: '#f9f9f9',
    minWidth: '150px',
  };

  const titleStyle = {
    color: playerColor || (isSetupPhase && !playerName ? 'grey' : 'black'), // Grey out title if slot is empty in setup
    fontWeight: 'bold',
    marginBottom: '5px',
  };

  const homePawnsDisplay = [];
  if (!isSetupPhase && pawns) { // Only show pawns if not in setup phase
    const homePawnsObjects = pawns.filter(p => p.state === 'home');
    for (let i = 0; i < homeCount; i++) {
        const pawn = homePawnsObjects[i];
        homePawnsDisplay.push(
            <Pawn 
                key={pawn ? `home-${playerColor}-${pawn.id}` : `home-placeholder-${playerColor}-${i}`}
                color={playerColor} 
                id={pawn ? pawn.id : 'H'} 
            />
        );
    }
  }

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
              disabled={takenColors.includes(color)}
            >
              {color} {takenColors.includes(color) ? '(Zajęty)' : ''}
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
          <div style={{ display: 'flex', flexWrap: 'wrap', minHeight: '35px' }}>
            {homePawnsDisplay}
          </div>
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
