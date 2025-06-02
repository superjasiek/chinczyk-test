import React from 'react';

const Dice = ({ value, onRoll, isMyTurn, awaitingMove, mustRollAgain, disabled }) => {
  // Add logging here
  console.log(`[Dice.js] Props received - value: ${value}, isMyTurn: ${isMyTurn}, awaitingMove: ${awaitingMove}, mustRollAgain: ${mustRollAgain}, disabled: ${disabled}`);

  const canRoll = isMyTurn && !awaitingMove && (value === null || value === 0 || mustRollAgain);
  
  const diceStyle = {
    width: '60px',
    height: '60px',
    border: '1px solid black',
    // display: 'flex', // Not needed for img
    // justifyContent: 'center', // Not needed for img
    // alignItems: 'center', // Not needed for img
    // fontSize: '24px', // Not needed for img
    // fontWeight: 'bold', // Not needed for img
    margin: '20px auto',
    backgroundColor: '#f0f0f0', // Good as a fallback or if images have transparency
    // Ensure the image is displayed as a block element to respect margin auto
    display: 'block', 
  };

  const buttonStyle = {
    padding: '10px 20px',
    fontSize: '16px',
    cursor: (disabled || !canRoll) ? 'not-allowed' : 'pointer',
    backgroundColor: (disabled || !canRoll) ? '#ccc' : '#4CAF50',
    color: 'white',
    border: 'none',
    borderRadius: '5px',
    display: 'block', // Make button block to center it if needed
    margin: '10px auto',
  };

  return (
    <div>
      <img 
        src={(value !== null && value !== 0) ? `/dice/${value}.png` : '/dice/roll.png'} 
        alt={value !== null && value !== 0 ? `Dice value ${value}` : 'Roll the dice'} 
        style={diceStyle} 
        title="Dice Value" 
      />
      <button 
        onClick={onRoll} 
        disabled={disabled || !canRoll} 
        style={buttonStyle}
        title={!isMyTurn ? "Nie twoja kolej" : (awaitingMove ? "Przesuń pionek" : (mustRollAgain ? "Rzucaj ponownie" : "Rzucaj"))}
      >
        Rzucaj
      </button>
    </div>
  );
};

export default Dice;
