import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom'; // For extended matchers
import Board from './Board';

// Mock initial empty gameState
const mockInitialGameState = {
  players: ['red', 'green', 'yellow', 'blue'], // Board.js iterates PLAYER_COLORS which might rely on this
  pawns: {
    red: [{ id: 'red1', state: 'home', position: null, home_stretch_position: null }],
    green: [{ id: 'green1', state: 'home', position: null, home_stretch_position: null }],
    yellow: [{ id: 'yellow1', state: 'home', position: null, home_stretch_position: null }],
    blue: [{ id: 'blue1', state: 'home', position: null, home_stretch_position: null }]
  },
  current_player_index: 0,
  dice_roll: null,
  awaitingMove: false,
  // other fields that might be accessed by Board.js, even if indirectly via calculatePawnCellId
};

describe('Board Component', () => {
  test('renders without crashing with initial empty state', () => {
    render(<Board gameState={mockInitialGameState} onPawnClick={() => {}} myPlayerColor="red" movablePawnIds={[]} />);
    // Check for a board container. The class name 'board' is applied to the main div.
    expect(screen.getByRole('main').parentElement).toHaveClass('board'); // Assuming the board div is the direct parent of the main grid
  });

  test('renders without crashing if gameState is null or undefined initially', () => {
    const { rerender } = render(<Board gameState={null} onPawnClick={() => {}} myPlayerColor="red" movablePawnIds={[]} />);
    expect(screen.getByRole('main').parentElement).toHaveClass('board'); // Should render fallback

    rerender(<Board gameState={{ ...mockInitialGameState, pawns: null }} onPawnClick={() => {}} myPlayerColor="red" movablePawnIds={[]} />);
    expect(screen.getByRole('main').parentElement).toHaveClass('board'); // Should render fallback
  });

  const mockGameStateWithPawns = {
    players: ['red', 'green', 'yellow', 'blue'],
    pawns: {
      red: [
        { id: 'r1', state: 'active', position: 5, home_stretch_position: null },
        { id: 'r2', state: 'home', position: null, home_stretch_position: null },
      ],
      green: [
        { id: 'g1', state: 'homestretch', position: null, home_stretch_position: 2 },
      ],
      yellow: [
        { id: 'y1', state: 'finished', position: null, home_stretch_position: null }, // Should not be rendered
      ],
      blue: [
        { id: 'b1', state: 'active', position: 10, home_stretch_position: null },
      ],
    },
    current_player_index: 0, // Red's turn
    dice_roll: 6,
    awaitingMove: true,
    // other necessary game state properties
  };

  test('renders pawns correctly based on gameState', () => {
    const { container } = render(<Board gameState={mockGameStateWithPawns} onPawnClick={() => {}} myPlayerColor="red" movablePawnIds={[]} />);
    
    // Pawns are rendered inside cells. We look for divs with class 'pawn' and the respective color.
    const redPawns = container.querySelectorAll('.pawn.red');
    expect(redPawns.length).toBe(2); // r1, r2

    const greenPawns = container.querySelectorAll('.pawn.green');
    expect(greenPawns.length).toBe(1); // g1

    const bluePawns = container.querySelectorAll('.pawn.blue');
    expect(bluePawns.length).toBe(1); // b1
    
    expect(screen.getByTitle('Pawn r1 (red)\nState: active\nPos: 5\nStretch Pos: null')).toBeInTheDocument();
    expect(screen.getByTitle('Pawn g1 (green)\nState: homestretch\nPos: null\nStretch Pos: 2')).toBeInTheDocument();

    const yellowPawns = container.querySelectorAll('.pawn.yellow');
    expect(yellowPawns.length).toBe(0); // Yellow pawn y1 is 'finished'
  });

  test('highlights movable pawns and calls onPawnClick', () => {
    const handlePawnClick = jest.fn();
    const currentMyPlayerColor = 'red'; // It's Red's turn in mockGameStateWithPawns
    const currentMovablePawnIds = ['r1']; // Only r1 is movable

    render(
      <Board
        gameState={mockGameStateWithPawns}
        myPlayerColor={currentMyPlayerColor}
        movablePawnIds={currentMovablePawnIds}
        onPawnClick={handlePawnClick}
      />
    );

    const movablePawnR1 = screen.getByTitle('Pawn r1 (red)\nState: active\nPos: 5\nStretch Pos: null');
    expect(movablePawnR1).toHaveClass('movable');
    fireEvent.click(movablePawnR1);
    expect(handlePawnClick).toHaveBeenCalledWith('r1');
    expect(handlePawnClick).toHaveBeenCalledTimes(1);

    const nonMovablePawnR2 = screen.getByTitle('Pawn r2 (red)\nState: home\nPos: null\nStretch Pos: null');
    expect(nonMovablePawnR2).not.toHaveClass('movable');
    fireEvent.click(nonMovablePawnR2);
    expect(handlePawnClick).toHaveBeenCalledTimes(1); // Not called again

    // Pawn g1 belongs to green, not the current player (red)
    const otherPlayerPawnG1 = screen.getByTitle('Pawn g1 (green)\nState: homestretch\nPos: null\nStretch Pos: 2');
    expect(otherPlayerPawnG1).not.toHaveClass('movable');
    fireEvent.click(otherPlayerPawnG1);
    expect(handlePawnClick).toHaveBeenCalledTimes(1); // Still not called again

    // Pawn b1 belongs to blue, and is not in movablePawnIds
     const otherPlayerPawnB1 = screen.getByTitle('Pawn b1 (blue)\nState: active\nPos: 10\nStretch Pos: null');
     expect(otherPlayerPawnB1).not.toHaveClass('movable');
     fireEvent.click(otherPlayerPawnB1);
     expect(handlePawnClick).toHaveBeenCalledTimes(1); // Still not called again
  });
});
