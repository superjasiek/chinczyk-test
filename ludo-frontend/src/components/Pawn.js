import React from 'react';
import './Board.css'; // Assuming Board.css contains .pawn, .pawn-Color, .movable styles

const Pawn = ({ playerColor, id, isMovable, onClick }) => {
  // Determine the CSS class based on playerColor
  const colorClass = playerColor ? `pawn-${playerColor}` : 'pawn-grey'; // Fallback class
  
  // Determine if the pawn should have the movable class
  const movableClass = isMovable ? 'movable' : '';

  const handleClick = () => {
    if (isMovable && onClick) {
      onClick(); // Call the passed onClick handler (which should trigger movePawn)
    }
  };

  return (
    <div 
      className={`pawn ${colorClass} ${movableClass}`} 
      title={`Pawn ${id} of ${playerColor}${isMovable ? ' (Click to move)' : ''}`}
      onClick={handleClick}
    >
      {/* Display pawn ID, could be initial of color + ID e.g., R0 */}
      {playerColor ? playerColor[0] : 'P'}{id}
    </div>
  );
};

export default Pawn;
