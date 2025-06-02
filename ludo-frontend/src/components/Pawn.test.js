import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import Pawn from './Pawn';

describe('Pawn Component', () => {
  test('renders correctly with given props', () => {
    render(<Pawn playerColor="Red" id={0} isMovable={false} onClick={() => {}} />);
    const pawnElement = screen.getByTitle('Pawn 0 of Red');
    expect(pawnElement).toBeInTheDocument();
    expect(pawnElement).toHaveTextContent('R0');
    expect(pawnElement).toHaveClass('pawn pawn-Red');
    expect(pawnElement).not.toHaveClass('movable');
  });

  test('applies "movable" class and is clickable when isMovable is true', () => {
    const handleClick = jest.fn();
    render(<Pawn playerColor="Blue" id={1} isMovable={true} onClick={handleClick} />);
    
    const pawnElement = screen.getByTitle('Pawn 1 of Blue (Click to move)');
    expect(pawnElement).toBeInTheDocument();
    expect(pawnElement).toHaveTextContent('B1');
    expect(pawnElement).toHaveClass('pawn pawn-Blue movable');
    
    fireEvent.click(pawnElement);
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  test('is not clickable when isMovable is false', () => {
    const handleClick = jest.fn();
    render(<Pawn playerColor="Green" id={2} isMovable={false} onClick={handleClick} />);
    
    const pawnElement = screen.getByTitle('Pawn 2 of Green');
    fireEvent.click(pawnElement);
    expect(handleClick).not.toHaveBeenCalled();
  });

  test('displays default if playerColor is not provided', () => {
    render(<Pawn id={3} />);
    const pawnElement = screen.getByText('P3');
    expect(pawnElement).toHaveClass('pawn-grey');
  });
});
