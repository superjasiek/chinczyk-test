import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import Game from './Game'; // Assuming Game.js is in the same directory or correct path
import { socket as mockSocket } from '../socket'; // Import the mocked socket

// Mock the socket.io-client module
jest.mock('../socket', () => ({
  socket: {
    on: jest.fn(),
    off: jest.fn(),
    emit: jest.fn(),
    connected: true, // Start as connected
    id: 'test-socket-id'
  },
}));

// Mock child components to simplify Game component testing and focus on its logic
jest.mock('./Board', () => (props) => <div data-testid="board-mock" onClick={() => props.onPawnClick('mockPawnId')}>Board</div>);
jest.mock('./Dice', () => (props) => <button data-testid="dice-mock" onClick={props.onRoll} disabled={props.disabled}>Roll Dice ({props.value || '?'})</button>);
jest.mock('./PlayerArea', () => (props) => <div data-testid={`player-area-${props.playerColor}`}>{props.playerColor} Area</div>);


describe('Game Component', () => {
  // Helper function to simulate receiving a socket event
  const emitSocketEvent = (eventName, data) => {
    // Find the event handler that Game.js registered for this eventName
    const eventHandlerCall = mockSocket.on.mock.calls.find(call => call[0] === eventName);
    if (eventHandlerCall && typeof eventHandlerCall[1] === 'function') {
      act(() => { // Ensure state updates are wrapped in act
        eventHandlerCall[1](data);
      });
    } else {
      console.warn(`No socket handler found for event: ${eventName} in Game.js mock setup`);
    }
  };
  
  // Props that would normally come from App.js when a game is active
  const gameProps = {
    gameId: 'game1',
    assignedPlayerColor: 'Red', // Changed to match typical color casing from server/game logic
    initialGameState: { // A minimal initial game state for testing
      gameId: 'game1',
      players: ['Red', 'Green', 'Yellow', 'Blue'], // Game.js iterates over this
      num_players: 2, // Or 4, ensure pawns object matches
      pawns: {
        Red: [{ id: 0, state: 'home', position: null, home_stretch_position: null }, { id: 1, state: 'home', position: null, home_stretch_position: null }, { id: 2, state: 'home', position: null, home_stretch_position: null }, { id: 3, state: 'home', position: null, home_stretch_position: null }],
        Green: [{ id: 0, state: 'home', position: null, home_stretch_position: null }, { id: 1, state: 'home', position: null, home_stretch_position: null }, { id: 2, state: 'home', position: null, home_stretch_position: null }, { id: 3, state: 'home', position: null, home_stretch_position: null }],
        Yellow: [{ id: 0, state: 'home', position: null, home_stretch_position: null }, { id: 1, state: 'home', position: null, home_stretch_position: null }, { id: 2, state: 'home', position: null, home_stretch_position: null }, { id: 3, state: 'home', position: null, home_stretch_position: null }],
        Blue: [{ id: 0, state: 'home', position: null, home_stretch_position: null }, { id: 1, state: 'home', position: null, home_stretch_position: null }, { id: 2, state: 'home', position: null, home_stretch_position: null }, { id: 3, state: 'home', position: null, home_stretch_position: null }],
      },
      board: { // Ensure this structure matches what Game.js expects for PlayerArea and other logic
        players: {
          Red: { home_area_count: 4, finished_count: 0, home_stretch: Array(6).fill(null) },
          Green: { home_area_count: 4, finished_count: 0, home_stretch: Array(6).fill(null) },
          Yellow: { home_area_count: 4, finished_count: 0, home_stretch: Array(6).fill(null) },
          Blue: { home_area_count: 4, finished_count: 0, home_stretch: Array(6).fill(null) },
        }
      },
      current_player_index: 0, // Red's turn
      dice_roll: null,
      consecutive_sixes_count: 0,
      mustRollAgain: false,
      awaitingMove: false,
      threeTryAttempts: 0,
      game_over: false,
      winner: null,
    },
    onReturnToLobby: jest.fn(),
  };

  beforeEach(() => {
    // Clear mock calls before each test
    mockSocket.on.mockClear();
    mockSocket.off.mockClear();
    mockSocket.emit.mockClear();
    // Reset initialGameState to a fresh copy for each test
    // Deep copy initialGameState to prevent modifications in one test affecting others
    gameProps.initialGameState = JSON.parse(JSON.stringify({
      gameId: 'game1',
      players: ['Red', 'Green', 'Yellow', 'Blue'],
      num_players: 2,
      pawns: {
        Red: [{ id: 0, state: 'home', position: null, home_stretch_position: null }, { id: 1, state: 'home', position: null, home_stretch_position: null }, { id: 2, state: 'home', position: null, home_stretch_position: null }, { id: 3, state: 'home', position: null, home_stretch_position: null }],
        Green: [{ id: 0, state: 'home', position: null, home_stretch_position: null }, { id: 1, state: 'home', position: null, home_stretch_position: null }, { id: 2, state: 'home', position: null, home_stretch_position: null }, { id: 3, state: 'home', position: null, home_stretch_position: null }],
        Yellow: [{ id: 0, state: 'home', position: null, home_stretch_position: null }, { id: 1, state: 'home', position: null, home_stretch_position: null }, { id: 2, state: 'home', position: null, home_stretch_position: null }, { id: 3, state: 'home', position: null, home_stretch_position: null }],
        Blue: [{ id: 0, state: 'home', position: null, home_stretch_position: null }, { id: 1, state: 'home', position: null, home_stretch_position: null }, { id: 2, state: 'home', position: null, home_stretch_position: null }, { id: 3, state: 'home', position: null, home_stretch_position: null }],
      },
      board: {
        players: {
          Red: { home_area_count: 4, finished_count: 0, home_stretch: Array(6).fill(null) },
          Green: { home_area_count: 4, finished_count: 0, home_stretch: Array(6).fill(null) },
          Yellow: { home_area_count: 4, finished_count: 0, home_stretch: Array(6).fill(null) },
          Blue: { home_area_count: 4, finished_count: 0, home_stretch: Array(6).fill(null) },
        }
      },
      current_player_index: 0,
      dice_roll: null,
      consecutive_sixes_count: 0,
      mustRollAgain: false,
      awaitingMove: false,
      threeTryAttempts: 0,
      game_over: false,
      winner: null,
    }));
  });

  test('renders initial game view with props', () => {
    render(<Game {...gameProps} />);
    expect(screen.getByText(`Ludo Game: ${gameProps.gameId}`)).toBeInTheDocument();
    expect(screen.getByText(`You are Player: ${gameProps.assignedPlayerColor}`)).toBeInTheDocument();
    // Check for turn indicator, adapting to potential case differences or exact text
    expect(screen.getByText((content, element) => content.startsWith('Your Turn') || content.includes(`${gameProps.initialGameState.players[gameProps.initialGameState.current_player_index]}'s Turn`))).toBeInTheDocument();
    expect(screen.getByTestId('dice-mock')).toBeInTheDocument();
    expect(screen.getByTestId('board-mock')).toBeInTheDocument();
    expect(screen.getByTestId('player-area-Red')).toBeInTheDocument();
    expect(screen.getByTestId('player-area-Green')).toBeInTheDocument();
  });

  // ... (other existing tests from Game.test.js can remain here) ...
  test('handles dice roll when it is player\'s turn', () => {
    render(<Game {...gameProps} />);
    const diceButton = screen.getByTestId('dice-mock');
    expect(diceButton).not.toBeDisabled(); 
    fireEvent.click(diceButton);
    expect(mockSocket.emit).toHaveBeenCalledWith('rollDice', { gameId: gameProps.gameId });
  });

  test('dice roll button is disabled when not player\'s turn', () => {
    const otherPlayerTurnState = {
        ...gameProps.initialGameState,
        current_player_index: 1 // Green's turn
    };
    render(<Game {...gameProps} initialGameState={otherPlayerTurnState} />);
    expect(screen.getByTestId('dice-mock')).toBeDisabled();
  });
  
  // ... more existing tests
});


// New Describe block for Chat Functionality
describe('Game Component - Chat Functionality', () => {
  // Use a slightly modified gameProps or a new one if initialGameState needs to be different for chat tests
  const chatTestProps = {
    gameId: 'chatGame456',
    assignedPlayerColor: 'Red',
    initialGameState: {
      gameId: 'chatGame456',
      players: ['Red', 'Green', 'Blue', 'Yellow'], // Ensure players array is present
      pawns: { // Minimal pawn setup
        Red: [], Green: [], Blue: [], Yellow: []
      },
      board: { // Minimal board setup
        players: { Red: {}, Green: {}, Blue: {}, Yellow: {} }
      },
      current_player_index: 0,
      dice_roll: null,
      awaitingMove: false,
      // ... other fields Game.js might access during render or initial useEffect
    },
    onReturnToLobby: jest.fn(),
  };

  beforeEach(() => {
    mockSocket.on.mockClear();
    mockSocket.off.mockClear();
    mockSocket.emit.mockClear();
    // Deep copy for chatTestProps.initialGameState as well
    chatTestProps.initialGameState = JSON.parse(JSON.stringify({
        gameId: 'chatGame456',
        players: ['Red', 'Green', 'Blue', 'Yellow'],
        pawns: { Red: [], Green: [], Blue: [], Yellow: [] },
        board: { players: { Red: {}, Green: {}, Blue: {}, Yellow: {} } },
        current_player_index: 0,
        dice_roll: null,
        awaitingMove: false,
    }));
  });

  test('chat input updates its value on change', () => {
    render(<Game {...chatTestProps} />);
    const chatInput = screen.getByPlaceholderText('Type a message...');
    fireEvent.change(chatInput, { target: { value: 'Hello chat!' } });
    expect(chatInput.value).toBe('Hello chat!');
  });

  test('clicking send button emits sendChatMessage and clears input', () => {
    render(<Game {...chatTestProps} />);
    const chatInput = screen.getByPlaceholderText('Type a message...');
    const sendButton = screen.getByRole('button', { name: /send/i }); // Using regex for flexibility

    fireEvent.change(chatInput, { target: { value: 'Test message' } });
    fireEvent.click(sendButton);

    expect(mockSocket.emit).toHaveBeenCalledWith('sendChatMessage', {
      gameId: chatTestProps.gameId,
      message: 'Test message',
    });
    expect(chatInput.value).toBe('');
  });
  
  test('pressing Enter in chat input emits sendChatMessage and clears input', () => {
    render(<Game {...chatTestProps} />);
    const chatInput = screen.getByPlaceholderText('Type a message...');

    fireEvent.change(chatInput, { target: { value: 'Enter key test' } });
    // Note: fireEvent.keyPress is okay, but keyUp or keyDown might be more accurate for some "Enter key" submissions.
    // Testing with keyPress as per example.
    fireEvent.keyPress(chatInput, { key: 'Enter', code: 'Enter', charCode: 13 }); 
    
    expect(mockSocket.emit).toHaveBeenCalledWith('sendChatMessage', {
        gameId: chatTestProps.gameId,
        message: 'Enter key test',
    });
    expect(chatInput.value).toBe('');
  });

  test('displays received chat messages in the log', async () => {
    let newChatMessageHandler;
    // Capture the handler registered by Game.js
    mockSocket.on.mockImplementation((event, handler) => {
      if (event === 'newChatMessage') {
        newChatMessageHandler = handler;
      }
      // Call original mock for other events if necessary, or ensure all are captured if Game.js uses more.
      // For this test, we only care about 'newChatMessage'.
    });

    render(<Game {...chatTestProps} />);
    
    // Ensure the handler was registered. If Game.js useEffect runs, it should be.
    // Adding a small wait can sometimes help if registration is slightly delayed, though usually not needed.
    await waitFor(() => expect(newChatMessageHandler).toBeDefined());

    const chatData = {
      senderColor: 'Blue', // Use a color from chatTestProps.initialGameState.players
      senderId: 'socket123',
      message: 'Hello from server',
      timestamp: new Date().toISOString(),
    };

    act(() => {
      if (newChatMessageHandler) {
        newChatMessageHandler(chatData);
      } else {
        throw new Error("newChatMessage handler was not captured by mockSocket.on");
      }
    });
    
    // The message content is formatted as "Color: Message" in Game.js's addMessage via handleNewChatMessage
    // The JSX then extracts the part after "Color: "
    // So, we search for the "Color" part (rendered in a span) and the "Message" part separately or combined.
    
    // Wait for the message to appear in the document
    // Game.js formats message as: `[timestamp] <span class="sender-color" style="color: blue; font-weight: bold;">Blue</span>: Hello from server`
    await waitFor(() => {
        // Check for the sender's color name
        const senderElement = screen.getByText(chatData.senderColor, { selector: 'span.sender-color' });
        expect(senderElement).toBeInTheDocument();
        expect(senderElement).toHaveStyle(`color: ${chatData.senderColor.toLowerCase()}`); // Color is lowercased in style prop in Game.js
        
        // Check for the message content itself (the part after ": ")
        // We can use a regex to find the list item containing the text.
        const messageRegex = new RegExp(`: ${chatData.message}`);
        const listItemContainingMessage = screen.getByText(messageRegex, { selector: 'li.chat-message span.message-content' });
        expect(listItemContainingMessage).toBeInTheDocument();

        // Check for the timestamp part
        const timestampRegex = new RegExp(`\\[${new Date(chatData.timestamp).toLocaleTimeString()}\\]`);
        expect(screen.getByText(timestampRegex, { selector: 'span.timestamp' })).toBeInTheDocument();
    });
  });
});
