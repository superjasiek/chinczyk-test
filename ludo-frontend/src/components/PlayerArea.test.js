import React from 'react';
import { render, screen } from '@testing-library/react';
import PlayerArea from './PlayerArea';

// Mock the Pawn component to simplify PlayerArea tests
jest.mock('./Pawn', () => ({ playerColor, id }) => <div data-testid={`pawn-${playerColor}-${id}`}>{playerColor[0]}{id}</div>);

describe('PlayerArea Component', () => {
  const mockPlayerProps = {
    playerColor: "Red",
    pawns: [
      { id: 0, state: 'home' },
      { id: 1, state: 'home' },
      { id: 2, state: 'active', position: 5 },
      { id: 3, state: 'finished' },
    ],
    homeCount: 2,
    finishedCount: 1,
    isCurrentPlayer: false,
  };

  test('renders player information correctly', () => {
    render(<PlayerArea {...mockPlayerProps} />);
    
    expect(screen.getByText('Red')).toBeInTheDocument(); // Player color in title
    expect(screen.getByText(`Pawns at Home: ${mockPlayerProps.homeCount}`)).toBeInTheDocument();
    expect(screen.getByText(`Pawns Finished: ${mockPlayerProps.finishedCount}`)).toBeInTheDocument();
  });

  test('renders correct number of home pawns based on homeCount', () => {
    render(<PlayerArea {...mockPlayerProps} />);
    // We expect 'homeCount' number of pawns to be rendered in the home area display.
    // The mock Pawn component will render with test IDs like 'pawn-Red-0', 'pawn-Red-1'.
    // Since homeCount is 2, and the first two pawns in mockPlayerProps are 'home'
    expect(screen.getByTestId('pawn-Red-0')).toBeInTheDocument();
    expect(screen.getByTestId('pawn-Red-1')).toBeInTheDocument();
    // Ensure pawns not at home (or beyond homeCount) are not rendered here
    expect(screen.queryByTestId('pawn-Red-2')).not.toBeInTheDocument(); 
  });
  
  test('applies current player styling when isCurrentPlayer is true', () => {
    const { container } = render(<PlayerArea {...mockPlayerProps} isCurrentPlayer={true} />);
    // The component uses inline styles for the border based on isCurrentPlayer.
    // Check if the style contains 'gold' for the border.
    const playerAreaDiv = container.firstChild; // Get the main div
    expect(playerAreaDiv.style.border).toContain('gold');
  });

  test('applies normal player color styling when not current player', () => {
    const { container } = render(<PlayerArea {...mockPlayerProps} isCurrentPlayer={false} />);
    const playerAreaDiv = container.firstChild;
    expect(playerAreaDiv.style.border).toContain(mockPlayerProps.playerColor.toLowerCase());
  });

  test('handles case with no pawns prop gracefully for home pawns display', () => {
    const propsNoPawns = { ...mockPlayerProps, pawns: undefined, homeCount: 2 };
    render(<PlayerArea {...propsNoPawns} />);
    // Should still render "Pawns at Home: 2" but not crash trying to map undefined pawns.
    // The component's current logic for homePawnsDisplay will render placeholders or fewer if pawns undefined.
    // The test here is mainly that it doesn't crash.
    expect(screen.getByText(`Pawns at Home: ${propsNoPawns.homeCount}`)).toBeInTheDocument();
    // Check that no actual pawn elements are rendered if pawns prop is missing
    // This depends on how PlayerArea handles missing pawns prop for rendering home pawns.
    // Current PlayerArea renders placeholders for homeCount if pawns is undefined.
    // Example: <Pawn key={`home-placeholder-Red-0`} color="Red" id={'H'} />
    expect(screen.queryByTestId('pawn-Red-H')).toBeInTheDocument(); // Check for placeholder
  });

});
