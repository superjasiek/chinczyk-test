
import React, { useState } from "react"; // Import useState
import Pawn from './Pawn'; // Import the Pawn component
import "./Board.css"; 

const boardSize = 15;
const PLAYER_COLORS = ['Red', 'Green', 'Yellow', 'Blue']; 
const TRACK_LENGTH = 48; // Updated to align with the 48-cell MAIN_PATH_SEQUENCE
const FINISZ_CELL_IDS = ["6y7", "7y6", "8y7", "7y8"];

const PLAYER_PATH_END_NODES = { Red: 47, Green: 11, Yellow: 23, Blue: 35 };
// PLAYER_START_NODES_ON_MAIN_PATH is effectively the index of ORIGINAL_EXIT_FIELDS in MAIN_PATH_SEQUENCE
// Red: "8y1" is MAIN_PATH_SEQUENCE[0]
// Green: "13y8" is MAIN_PATH_SEQUENCE[12]
// Yellow: "6y13" is MAIN_PATH_SEQUENCE[24]
// Blue: "1y6" is MAIN_PATH_SEQUENCE[36]
const PLAYER_START_NODES_ON_MAIN_PATH = { Red: 0, Green: 12, Yellow: 24, Blue: 36 };


// Path definition: Now 48 cells. Player segments are 12 cells each.
// Server's pawn.position (0-47) will map to indices here.
const MAIN_PATH_SEQUENCE = [
  // Red segment (0-11). MAIN_PATH_SEQUENCE[0]="8y1". Ends MAIN_PATH_SEQUENCE[11]="13y7" (Green's Visual Entry).
  "8y1", "8y2", "8y3", "8y4", "8y5", "8y6", "9y6", "10y6", "11y6", "12y6", "13y6", "13y7",
  // Green segment (12-23). MAIN_PATH_SEQUENCE[12]="13y8". Ends MAIN_PATH_SEQUENCE[23]="7y13" (Yellow's Visual Entry).
  "13y8", "12y8", "11y8", "10y8", "9y8", "8y8", "8y9", "8y10", "8y11", "8y12", "8y13", "7y13",
  // Yellow segment (24-35). MAIN_PATH_SEQUENCE[24]="6y13". Ends MAIN_PATH_SEQUENCE[35]="1y7" (Blue's Visual Entry).
  "6y13", "6y12", "6y11", "6y10", "6y9", "6y8", "5y8", "4y8", "3y8", "2y8", "1y8", "1y7",
  // Blue segment (36-47). MAIN_PATH_SEQUENCE[36]="1y6". Ends MAIN_PATH_SEQUENCE[47]="7y1" (Red's Visual Entry).
  "1y6", "2y6", "3y6", "4y6", "5y6", "6y6", "6y5", "6y4", "6y3", "6y2", "6y1", "7y1"
];

const START_CELLS = { // No change
  Red: ["0y0", "0y1", "1y0", "1y1"],
  Green: ["14y0", "14y1", "13y0", "13y1"],
  Yellow: ["13y14", "13y13", "14y13", "14y14"],
  Blue: ["0y13", "0y14", "1y13", "1y14"]
};

const HOME_STRETCH_CELLS = {
  Red: ["7y2", "7y3", "7y4", "7y5"],        // Path from "7y1" (MAIN_PATH_SEQUENCE[47])
  Green: ["12y7", "11y7", "10y7", "9y7"],  // Path from "13y7" (MAIN_PATH_SEQUENCE[11])
  Yellow: ["7y12", "7y11", "7y10", "7y9"], // Path from "7y13" (MAIN_PATH_SEQUENCE[23])
  Blue: ["2y7", "3y7", "4y7", "5y7"]     // Path from "1y7" (MAIN_PATH_SEQUENCE[35])
};

const ORIGINAL_EXIT_FIELDS = { // Values based on the new 48-cell MAIN_PATH_SEQUENCE
    Red: "8y1",    // MAIN_PATH_SEQUENCE[0]
    Green: "13y8", // MAIN_PATH_SEQUENCE[12]
    Yellow: "6y13",// MAIN_PATH_SEQUENCE[24]
    Blue: "1y6"    // MAIN_PATH_SEQUENCE[36]
};

function calculatePawnCellId(pawn, pawnColor, allPawnsForColor) {
    console.log('[Board.js CaclPawnId] Entry. Pawn:', pawn, 'pawnColor:', pawnColor);

    if (!pawn || typeof pawn.state === 'undefined') {
        console.error('[Board.js CaclPawnId] ERROR: Pawn or pawn.state is undefined!', pawn);
        return null;
    }
    if (typeof pawnColor === 'undefined' || pawnColor === null) {
        console.error('[Board.js CaclPawnId] ERROR: pawnColor is undefined or null!');
        return null;
    }

    if (pawn.state === 'home') {
        console.log('[Board.js CaclPawnId] State: home. pawnColor:', pawnColor);
        const homeCells = START_CELLS[pawnColor]; 
        console.log('[Board.js CaclPawnId] START_CELLS object:', START_CELLS); // Log entire object for structure check
        console.log('[Board.js CaclPawnId] homeCells for', pawnColor, ':', homeCells);
        if (!homeCells) {
            console.error('[Board.js CaclPawnId] ERROR: homeCells is undefined for pawnColor:', pawnColor);
            return null;
        }
        if (!allPawnsForColor || typeof allPawnsForColor.length === 'undefined') {
            console.error('[Board.js CaclPawnId] ERROR: allPawnsForColor is invalid for pawnColor:', pawnColor, allPawnsForColor);
            return null;
        }
        let pawnsAlreadyInHome = 0;
        for (let i = 0; i < allPawnsForColor.length; i++) {
            if (allPawnsForColor[i].id === pawn.id) break;
            if (allPawnsForColor[i].state === 'home') pawnsAlreadyInHome++;
        }
        if (typeof homeCells.length === 'undefined' || homeCells.length === 0) {
            console.error('[Board.js CaclPawnId] ERROR: homeCells is not an array or is empty for pawnColor:', pawnColor, homeCells);
            return null;
        }
        return homeCells[pawnsAlreadyInHome % homeCells.length];

    } else if (pawn.state === 'active') {
        const serverPawnPosition = pawn.position;
        console.log('[Board.js CaclPawnId] State: active. pawnColor:', pawnColor, 'serverPawnPosition:', serverPawnPosition);
        console.log('[Board.js CaclPawnId] MAIN_PATH_SEQUENCE array (length):', MAIN_PATH_SEQUENCE ? MAIN_PATH_SEQUENCE.length : 'undefined');

        if (serverPawnPosition === null || serverPawnPosition < 0 || serverPawnPosition >= TRACK_LENGTH) {
            console.error(`[Board.js CaclPawnId] Invalid serverPawnPosition: ${serverPawnPosition} for active pawn ${pawn.id}. Expected 0-${TRACK_LENGTH - 1}.`);
            return null; 
        }
        // MAIN_PATH_SEQUENCE must be 52 cells for this direct indexing to work.
        if (!MAIN_PATH_SEQUENCE || MAIN_PATH_SEQUENCE.length !== TRACK_LENGTH) {
             console.error(`[Board.js CaclPawnId] ERROR: MAIN_PATH_SEQUENCE is not ${TRACK_LENGTH} cells long! Actual length: ${MAIN_PATH_SEQUENCE ? MAIN_PATH_SEQUENCE.length : 'undefined'}`);
             return null; // Prevent out-of-bounds access
        }
        return MAIN_PATH_SEQUENCE[serverPawnPosition];

    } else if (pawn.state === 'homestretch') {
        console.log('[Board.js CaclPawnId] State: homestretch. pawnColor:', pawnColor, 'pawn.position (used as home_stretch_pos):', pawn.position);
        const homeStretchCells = HOME_STRETCH_CELLS[pawnColor];
        console.log('[Board.js CaclPawnId] HOME_STRETCH_CELLS object:', HOME_STRETCH_CELLS); // Log entire object
        console.log('[Board.js CaclPawnId] homeStretchCells for', pawnColor, ':', homeStretchCells);

        if (!homeStretchCells) {
            console.error('[Board.js CaclPawnId] ERROR: homeStretchCells is undefined for pawnColor:', pawnColor);
            return null;
        }
        if (typeof homeStretchCells.length === 'undefined') {
             console.error('[Board.js CaclPawnId] ERROR: homeStretchCells is not an array for pawnColor:', pawnColor, homeStretchCells);
            return null;
        }
        // Use pawn.position as the index, as this is what server-side ludoGame.js sets for homestretch.
        if (pawn.position !== null && pawn.position >= 0 && pawn.position < homeStretchCells.length) {
            return homeStretchCells[pawn.position];
        }
        console.warn(`[Board.js CaclPawnId] Invalid pawn.position for homestretch for pawn ${pawn.id}: ${pawn.position}. Max length: ${homeStretchCells.length}`);
        return null;
    } else {
        console.warn('[Board.js CaclPawnId] Unknown pawn state:', pawn.state, 'for pawn:', pawn);
    }
    return null;
}

// Helper function to calculate potential destination cell ID
function getPotentialDestinationCellId(pawn, diceRoll, pawnColor, gameState, constants) {
    if (!pawn || diceRoll === null || diceRoll === 0) {
        return null;
    }

    if (pawn.state === 'home') {
        return diceRoll === 6 ? constants.ORIGINAL_EXIT_FIELDS[pawnColor] : null;
    }

    if (pawn.state === 'homestretch') {
        const currentStretchPos = pawn.position; // This is the index in playerHomeStretch
        const targetStretchPos = currentStretchPos + diceRoll;
        const playerHomeStretch = constants.HOME_STRETCH_CELLS[pawnColor];
        return targetStretchPos < playerHomeStretch.length ? playerHomeStretch[targetStretchPos] : null;
    }

    if (pawn.state === 'active') {
        const currentGlobalPos = pawn.position; // Index on MAIN_PATH_SEQUENCE
        const playerPathEndNodeIndex = constants.PLAYER_PATH_END_NODES[pawnColor]; // e.g. Red: 47
        const playerHomeStretch = constants.HOME_STRETCH_CELLS[pawnColor];

        let currentPosOnPath = currentGlobalPos; // This will be an index
        let currentPathIsMain = true;

        for (let i = 0; i < diceRoll; i++) {
            if (currentPathIsMain) {
                if (currentPosOnPath === playerPathEndNodeIndex) {
                    currentPathIsMain = false; // Transition to home stretch
                    currentPosOnPath = 0;      // Reset position to start of home stretch (index 0 for playerHomeStretch)
                } else {
                    currentPosOnPath = (currentPosOnPath + 1) % constants.TRACK_LENGTH; // Move on main path
                }
            } else { // Already on home stretch
                currentPosOnPath += 1;
            }
        }

        if (currentPathIsMain) {
            return constants.MAIN_PATH_SEQUENCE[currentPosOnPath];
        } else {
            if (currentPosOnPath < playerHomeStretch.length) {
                return playerHomeStretch[currentPosOnPath];
            } else {
                return null; // Overshot home stretch
            }
        }
    }

    return null; // Should not be reached if states are handled
}


export default function Board({ gameState, myPlayerColor, movablePawnIds, onPawnClick, eliminatedPlayers = [] }) { // Added eliminatedPlayers prop with default
  const [hoverHighlightedCellId, setHoverHighlightedCellId] = useState(null); // Added state for hover highlight

  // Destructure blackHoleModeEnabled and blackHolePosition from gameState
  const blackHoleModeEnabled = gameState?.blackHoleModeEnabled;
  const blackHolePosition = gameState?.board?.blackHolePosition; // Access safely

  let blackHoleCellId = null;
  if (blackHoleModeEnabled && typeof blackHolePosition === 'number' && blackHolePosition >= 0 && blackHolePosition < MAIN_PATH_SEQUENCE.length) {
    blackHoleCellId = MAIN_PATH_SEQUENCE[blackHolePosition];
  }

  console.log('[Board.js] Received gameState:', gameState);
  if (gameState && gameState.pawns) {
      console.log('[Board.js] Received gameState.pawns:', gameState.pawns); 
  } else {
      console.log('[Board.js] Received gameState.pawns: undefined or null');
  }

  // Determine if pawns should be processed and rendered
  const shouldProcessPawns = gameState && gameState.status !== 'setup' && gameState.pawns;
  
  const cellToPawnMap = {};
  if (shouldProcessPawns) {
    PLAYER_COLORS.forEach(color => { 
      if (gameState.pawns[color]) {
          gameState.pawns[color].forEach((pawn, index) => { 
              if (pawn && typeof pawn.state !== 'undefined') { 
                  if (pawn.state !== 'finished') {
                      const cellId = calculatePawnCellId(pawn, color, gameState.pawns[color]);
                      if (cellId) {
                          if (!cellToPawnMap[cellId]) {
                              cellToPawnMap[cellId] = [];
                          }
                          cellToPawnMap[cellId].push({...pawn, color});
                      }
                  }
              } else {
                  console.warn(`[Board.js] Encountered invalid or incomplete pawn object in gameState.pawns for color '${color}' at index ${index}:`, pawn);
              }
          });
      }
    });
  }
  console.log('[Board.js] Generated cellToPawnMap (active game):', cellToPawnMap);

  const mainPathSet = new Set(MAIN_PATH_SEQUENCE);
  const startRedSet = new Set(START_CELLS.Red);
  const startGreenSet = new Set(START_CELLS.Green);
  const startYellowSet = new Set(START_CELLS.Yellow);
  const startBlueSet = new Set(START_CELLS.Blue);
  const redGoalSet = new Set(HOME_STRETCH_CELLS.Red);
  const greenGoalSet = new Set(HOME_STRETCH_CELLS.Green);
  const yellowGoalSet = new Set(HOME_STRETCH_CELLS.Yellow);
  const blueGoalSet = new Set(HOME_STRETCH_CELLS.Blue);

  const pathConstants = { MAIN_PATH_SEQUENCE, HOME_STRETCH_CELLS, ORIGINAL_EXIT_FIELDS, TRACK_LENGTH, PLAYER_PATH_END_NODES, PLAYER_START_NODES_ON_MAIN_PATH };

  const getCellClassName = (currentCellId) => { 
      let className = "";
      if (startRedSet.has(currentCellId)) className = "start red";
      else if (startGreenSet.has(currentCellId)) className = "start green";
      else if (startYellowSet.has(currentCellId)) className = "start yellow";
      else if (startBlueSet.has(currentCellId)) className = "start blue";
      
      else if (redGoalSet.has(currentCellId)) className = "goal red";
      else if (greenGoalSet.has(currentCellId)) className = "goal green";
      else if (yellowGoalSet.has(currentCellId)) className = "goal yellow";
      else if (blueGoalSet.has(currentCellId)) className = "goal blue";

      else if (currentCellId === ORIGINAL_EXIT_FIELDS.Red) className = "exit red path"; 
      else if (currentCellId === ORIGINAL_EXIT_FIELDS.Green) className = "exit green path";
      else if (currentCellId === ORIGINAL_EXIT_FIELDS.Yellow) className = "exit yellow path";
      else if (currentCellId === ORIGINAL_EXIT_FIELDS.Blue) className = "exit blue path";
      
      else if (mainPathSet.has(currentCellId)) className = "path";
      else if (currentCellId === "7y7") className = "center";
      else className = "empty";

      // Note: Highlighting is done via inline style for simplicity, not by adding a class here.
      // If a class-based approach is preferred, it would be added here.
      return className;
  };

  const boardMatrixWithPawns = Array.from({ length: boardSize }, (_, y) =>
    Array.from({ length: boardSize }, (_, x) => {
      const cellId = `${x}y${y}`;
      let cellContent = null;
      let finiszTextContent = null; // Initialize finiszTextContent

      if (FINISZ_CELL_IDS.includes(cellId)) {
        finiszTextContent = (
          <span style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            fontSize: '10px',
            color: 'black',
            pointerEvents: 'none'
          }}>
            finisz
          </span>
        );
      }

      if (cellToPawnMap[cellId]) {
          if (cellId === "0y0") {
              console.log(`[Board.js] Rendering cell "0y0". Pawns in this cell:`, cellToPawnMap[cellId]);
          }
          cellContent = cellToPawnMap[cellId].map(pawn => {
              const isMovable = gameState && myPlayerColor && movablePawnIds &&
                                gameState.players && typeof gameState.current_player_index !== 'undefined' &&
                                gameState.players[gameState.current_player_index] === myPlayerColor &&
                                pawn.color === myPlayerColor &&
                                movablePawnIds.includes(pawn.id);

              const isOwnerEliminated = eliminatedPlayers.includes(pawn.color);

              if (cellId === "0y0") {
                   console.log(`[Board.js] Attempting to render pawn in "0y0":`, pawn, `IsMovable: ${isMovable}`, `IsOwnerEliminated: ${isOwnerEliminated}`);
              }

              const titleText = `Pawn ${pawn.id} (${pawn.color})${isOwnerEliminated ? ' - ELIMINATED' : ''}
State: ${pawn.state}
Pos: ${pawn.position}${pawn.home_stretch_position !== undefined ? `\nStretch Pos: ${pawn.home_stretch_position}` : ''}`;

              return (
                <Pawn
                  key={pawn.id}
                  playerColor={pawn.color}
                  id={pawn.id}
                  isMovable={isMovable}
                  onClick={() => {
                    // The Pawn component's internal onClick now handles the isMovable and !isOwnerEliminated check
                    onPawnClick(pawn.id);
                  }}
                  isOwnerEliminated={isOwnerEliminated}
                  onMouseEnter={() => {
                    // Logic for hover highlight remains in Board.js as it affects cellStyle
                    if (isMovable && gameState && typeof gameState.dice_roll !== 'undefined' && gameState.dice_roll !== null && !isOwnerEliminated) {
                      const destinationCellId = getPotentialDestinationCellId(pawn, gameState.dice_roll, pawn.color, gameState, pathConstants);
                      setHoverHighlightedCellId(destinationCellId);
                    }
                  }}
                  onMouseLeave={() => {
                    setHoverHighlightedCellId(null);
                  }}
                  titleText={titleText}
                />
              );
          });
      } else {
          if (cellId === "0y0") {
              console.log(`[Board.js] Rendering cell "0y0". No pawns mapped to this cell.`);
          }
      }
      
      const cellStyle = { position: 'relative' };
      if (cellId === hoverHighlightedCellId) {
        cellStyle.backgroundColor = 'rgba(255, 255, 0, 0.5)'; // Yellow highlight
      }

      let cellClasses = `cell ${getCellClassName(cellId)}`;
      if (blackHoleCellId && cellId === blackHoleCellId) {
          cellClasses += ' black-hole-cell';
      }

      return (
          <div key={cellId} id={cellId} className={cellClasses} style={cellStyle}> {/* Use cellClasses and cellStyle */}
              {/* <span style={{
                  fontSize: '8px', 
                  position: 'absolute', 
                  top: '1px', 
                  left: '1px', 
                  color: '#333', // Dark gray for better visibility on various backgrounds
                  zIndex: 1 // Ensure it's above cell background, but pawns can go over
              }}>
                  {cellId}
              </span> */}
              {cellContent}
              {finiszTextContent} {/* Render finiszTextContent */}
          </div>
      );
    })
  );
  return <div className="board">{boardMatrixWithPawns}</div>;
}
