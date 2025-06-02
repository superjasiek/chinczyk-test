import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import Dice from './Dice';

describe('Dice Component', () => {
  test('renders with initial value and button', () => {
    render(<Dice value={null} onRoll={() => {}} isMyTurn={true} awaitingMove={false} mustRollAgain={false} disabled={false} />);
    expect(screen.getByTitle('Dice Value')).toHaveTextContent('?');
    expect(screen.getByRole('button', { name: 'Roll Dice' })).toBeInTheDocument();
  });

  test('displays the dice value when provided', () => {
    render(<Dice value={5} onRoll={() => {}} isMyTurn={true} awaitingMove={false} mustRollAgain={false} disabled={false} />);
    expect(screen.getByTitle('Dice Value')).toHaveTextContent('5');
  });

  test('calls onRoll when button is clicked and not disabled', () => {
    const handleRoll = jest.fn();
    render(<Dice value={null} onRoll={handleRoll} isMyTurn={true} awaitingMove={false} mustRollAgain={false} disabled={false} />);
    
    const rollButton = screen.getByRole('button', { name: 'Roll Dice' });
    expect(rollButton).not.toBeDisabled();
    fireEvent.click(rollButton);
    expect(handleRoll).toHaveBeenCalledTimes(1);
  });

  test('button is disabled when "disabled" prop is true', () => {
    const handleRoll = jest.fn();
    render(<Dice value={null} onRoll={handleRoll} isMyTurn={true} awaitingMove={false} mustRollAgain={false} disabled={true} />);
    expect(screen.getByRole('button', { name: 'Roll Dice' })).toBeDisabled();
  });

  test('button is disabled when not my turn', () => {
    render(<Dice value={null} onRoll={() => {}} isMyTurn={false} awaitingMove={false} mustRollAgain={false} disabled={false} />);
    expect(screen.getByRole('button', { name: 'Roll Dice' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Roll Dice' })).toHaveAttribute('title', 'Not your turn');
  });

  test('button is disabled when awaiting move', () => {
    render(<Dice value={3} onRoll={() => {}} isMyTurn={true} awaitingMove={true} mustRollAgain={false} disabled={false} />);
    expect(screen.getByRole('button', { name: 'Roll Dice' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Roll Dice' })).toHaveAttribute('title', 'Move your pawn');
  });
  
  test('button is enabled when mustRollAgain is true, even if dice value is present', () => {
    const handleRoll = jest.fn();
    render(<Dice value={6} onRoll={handleRoll} isMyTurn={true} awaitingMove={false} mustRollAgain={true} disabled={false} />);
    const rollButton = screen.getByRole('button', { name: 'Roll Dice' });
    expect(rollButton).not.toBeDisabled();
    expect(rollButton).toHaveAttribute('title', 'Roll again');
    fireEvent.click(rollButton);
    expect(handleRoll).toHaveBeenCalledTimes(1);
  });

   test('button is disabled if dice rolled (value not null) and not mustRollAgain', () => {
    render(<Dice value={4} onRoll={() => {}} isMyTurn={true} awaitingMove={false} mustRollAgain={false} disabled={false} />);
    // The `disabled` logic inside Dice is: !isMyTurn || awaitingMove || (value !== null && !mustRollAgain)
    // So, if value is not null (4) and mustRollAgain is false, it should be disabled.
    // The prop 'disabled' passed to the component is also part of the final check.
    // The intrinsic logic of the component: `const canRoll = isMyTurn && !awaitingMove && (value === null || value === 0 || mustRollAgain);`
    // `disabled={passedInDisabled || !canRoll}`
    // Here, passedInDisabled = false.
    // canRoll = true && !false && (false || false || false) = true && true && false = false.
    // So, button should be disabled.
    expect(screen.getByRole('button', { name: 'Roll Dice' })).toBeDisabled();
  });

});
