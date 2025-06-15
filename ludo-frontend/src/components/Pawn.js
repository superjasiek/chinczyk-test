import React from 'react';
import './Board.css'; // Assuming Board.css contains .pawn, .pawn-Color, .movable styles

const Pawn = ({
  playerColor,
  id,
  isMovable,
  onClick,
  isOwnerEliminated, // New prop
  // Props for hover effects if Board delegates them
  onMouseEnter,
  onMouseLeave,
  titleText // More flexible title
}) => {
  // Determine the CSS class based on playerColor
  const colorClass = playerColor ? `pawn-${playerColor.toLowerCase()}` : 'pawn-grey'; // Ensure lowercase for CSS consistency
  
  // Determine if the pawn should have the movable class
  const movableClass = isMovable && isOwnerEliminated !== true ? 'movable' : ''; // Not movable if owner eliminated
  const eliminatedClass = isOwnerEliminated === true ? 'pawn-eliminated' : ''; // CSS class for elimination styling

  const handleClick = () => {
    if (isMovable && onClick && isOwnerEliminated !== true) {
      onClick();
    }
  };

  const pawnStyle = {
    opacity: isOwnerEliminated === true ? 0.5 : 1,
    cursor: isOwnerEliminated === true ? 'not-allowed' : (isMovable ? 'pointer' : 'default'),
  };

  return (
    <div 
      className={`pawn ${colorClass} ${movableClass} ${eliminatedClass}`}
      style={pawnStyle}
      title={titleText || `Pawn ${id} of ${playerColor}${isMovable && isOwnerEliminated !== true ? ' (Click to move)' : ''}${isOwnerEliminated === true ? ' - ELIMINATED' : ''}`}
      onClick={handleClick}
      onMouseEnter={onMouseEnter} // Pass through from Board
      onMouseLeave={onMouseLeave} // Pass through from Board
    >
      {/* Display pawn ID, could be initial of color + ID e.g., R0 */}
      {/* {playerColor ? playerColor[0] : 'P'}{id} */}
      {/* Content removed to match the simple div style from Board.js's direct rendering */}
    </div>
  );
};

export default Pawn;
