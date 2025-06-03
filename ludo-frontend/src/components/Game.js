import React, { useState, useEffect, useCallback, useRef } from 'react'; // Added useRef
import { socket } from '../socket';
import Board from './Board';
import Dice from './Dice';
import PlayerArea from './PlayerArea';

const Game = ({ gameId: propGameId, myPlayerName, initialGameState, onReturnToLobby }) => { // assignedPlayerColor removed
  // Comment removed as the log will be placed correctly after state declarations.
  console.log("[Game.js MOUNT] initialGameState received:", JSON.stringify(initialGameState, null, 2));

  const [gameState, setGameState] = useState(initialGameState);
  const [myPlayerColor, setMyPlayerColor] = useState(null); // Changed from useState(assignedPlayerColor)
  const [isCreator, setIsCreator] = useState(false); // Changed from const

  const [numPlayers, setNumPlayers] = useState(initialGameState.num_players || 2);
  const [targetVictories, setTargetVictories] = useState(initialGameState.targetVictories || 1);
  
  const availableColors = ["Red", "Green", "Yellow", "Blue"];

  const [messages, setMessages] = useState([]); // messages state itself is not used in main useEffect deps
  const [clientMovablePawnIds, setClientMovablePawnIds] = useState([]);
  const [chatInputValue, setChatInputValue] = useState('');
  const [roundOverInfo, setRoundOverInfo] = useState(null);
  const [overallWinnerInfo, setOverallWinnerInfo] = useState(null);

  const [awaitingReadinessConfirm, setAwaitingReadinessConfirm] = useState(false);
  const [readinessTimer, setReadinessTimer] = useState(0);
  const [readyPlayersStatus, setReadyPlayersStatus] = useState({});
  const [readinessConfirmedBySelf, setReadinessConfirmedBySelf] = useState(false);

  // Refs for state/props accessed in socket handlers
  const gameStateRef = useRef(gameState);
  const myPlayerColorRef = useRef(myPlayerColor); // Though myPlayerColor is stable from useState(assignedPlayerColor)
  const roundOverInfoRef = useRef(roundOverInfo);
  const overallWinnerInfoRef = useRef(overallWinnerInfo);
  const myPlayerNameRef = useRef(myPlayerName);
  // No messagesRef needed as addMessage is stable and handles messages state

  useEffect(() => { gameStateRef.current = gameState; }, [gameState]);
  useEffect(() => { roundOverInfoRef.current = roundOverInfo; }, [roundOverInfo]);
  useEffect(() => { overallWinnerInfoRef.current = overallWinnerInfo; }, [overallWinnerInfo]);
  // myPlayerColor, assignedPlayerColor, myPlayerName are props or derived from props and stable or handled by their own refs if necessary
  useEffect(() => { myPlayerColorRef.current = myPlayerColor; }, [myPlayerColor]);
  useEffect(() => { myPlayerNameRef.current = myPlayerName; }, [myPlayerName]);

useEffect(() => {
  // Log entry points
  console.log('[Game.js CREATOR/COLOR CHECK] Running effect. initialGameState valid:', !!initialGameState, 'socket.id valid:', !!socket?.id);
  if (initialGameState) {
    console.log('[Game.js CREATOR/COLOR CHECK] initialGameState.gameCreatorId:', initialGameState.gameCreatorId, 'initialGameState.playersSetup exists:', !!initialGameState.playersSetup);
  }


  // Determine isCreator
  if (initialGameState && initialGameState.gameCreatorId && socket.id) {
    if (initialGameState.gameCreatorId === socket.id) {
      setIsCreator(true);
      console.log(`[Game.js CREATOR CHECK] setIsCreator(true). Socket.id: ${socket.id}`);
    } else {
      setIsCreator(false);
      console.log(`[Game.js CREATOR CHECK] setIsCreator(false). Socket.id: ${socket.id}, Creator ID: ${initialGameState.gameCreatorId}`);
    }
  } else {
    setIsCreator(false); // Default to false if essential info for creator check is missing
    console.log('[Game.js CREATOR CHECK] Conditions for isCreator not fully met. initialGameState:', !!initialGameState, 'initialGameState.gameCreatorId:', !!initialGameState?.gameCreatorId, 'socket.id:', !!socket?.id);
  }

  // Determine myPlayerColor (relies on playersSetup)
  if (initialGameState && initialGameState.playersSetup && socket.id) {
    const selfInSetup = initialGameState.playersSetup.find(p => p.playerId === socket.id);
    if (selfInSetup && selfInSetup.color) {
      setMyPlayerColor(selfInSetup.color);
      console.log(`[Game.js EFFECT_SELF_INFO] Set myPlayerColor to: ${selfInSetup.color} for socket.id: ${socket.id}`);
    } else if (selfInSetup) {
      // Player is in setup, but color not chosen yet or not available
      console.log(`[Game.js EFFECT_SELF_INFO] Found self in playersSetup for socket.id: ${socket.id}, but color is not set:`, selfInSetup?.color);
    } else {
      // Player is not in playersSetup array yet.
      console.warn(`[Game.js EFFECT_SELF_INFO] Could not find self in playersSetup for socket.id: ${socket.id}. playersSetup:`, JSON.stringify(initialGameState.playersSetup));
    }
  } else {
    // playersSetup might not be available yet, or initialGameState/socket.id is missing
    console.log('[Game.js PLAYER_COLOR_CHECK] Conditions for myPlayerColor not fully met. initialGameState:', !!initialGameState, 'initialGameState.playersSetup:', !!initialGameState?.playersSetup, 'socket.id:', !!socket?.id);
  }
}, [initialGameState, socket.id]);

// useEffect to update myPlayerColor from gameState, which reflects server updates (e.g., after color selection)
useEffect(() => {
  console.log('[Game.js COLOR_FROM_GAMESTATE_EFFECT] Running. gameState valid:', !!gameState, 'socket.id valid:', !!socket?.id);
  if (gameState && gameState.playersSetup && socket.id) {
    const selfInSetup = gameState.playersSetup.find(p => p.playerId === socket.id);
    if (selfInSetup && selfInSetup.color) {
      // Only set if the color is different from the current myPlayerColor state, or if myPlayerColor is null
      if (myPlayerColor !== selfInSetup.color) {
        setMyPlayerColor(selfInSetup.color);
        console.log(`[Game.js COLOR_FROM_GAMESTATE_EFFECT] Updated myPlayerColor to: ${selfInSetup.color} from gameState.`);
      } else {
        console.log(`[Game.js COLOR_FROM_GAMESTATE_EFFECT] myPlayerColor is already ${selfInSetup.color}. No update needed from gameState.`);
      }
    } else if (selfInSetup) {
      console.log(`[Game.js COLOR_FROM_GAMESTATE_EFFECT] Found self in gameState.playersSetup, but color is not set:`, selfInSetup?.color);
    } else {
      console.log(`[Game.js COLOR_FROM_GAMESTATE_EFFECT] Could not find self in gameState.playersSetup using socket.id: ${socket.id}.`);
    }
  } else {
    let reason = [];
    if (!gameState) reason.push("gameState is missing");
    if (gameState && !gameState.playersSetup) reason.push("gameState.playersSetup is missing");
    if (!socket.id) reason.push("socket.id is missing");
    console.log(`[Game.js COLOR_FROM_GAMESTATE_EFFECT] Conditions not met. Reasons: ${reason.join(', ')}.`);
  }
  // Adding myPlayerColor to dependencies:
  // If myPlayerColor is included, the effect runs whenever myPlayerColor changes.
  // The check `if (myPlayerColor !== selfInSetup.color)` prevents an infinite loop.
}, [gameState, socket.id, myPlayerColor]);


  const addMessage = useCallback((content, type = 'event', senderColor = null, senderName = null) => {
      setMessages(prevMessages => [
          { type, content, timestamp: new Date().toISOString(), displayTimestamp: new Date().toLocaleTimeString(), senderColor, senderName },
          ...prevMessages.slice(0, 49)
      ]);
  }, []); // setMessages is stable

  // Debug logging block - uses gameState directly, so it will re-run when gameState changes. This is fine.
  useEffect(() => {
    const currentGameState = gameStateRef.current; // Use ref for consistency if preferred, though direct gameState is fine here
    const currentMyPlayerColor = myPlayerColorRef.current;

    if (currentGameState && currentGameState.current_player_index != null && currentGameState.activePlayerColors && currentGameState.players && currentMyPlayerColor) {
      const clientMyPlayerColor = currentMyPlayerColor;
      const clientCurrentPlayerIndex = currentGameState.current_player_index;
      const clientActivePlayerColors = currentGameState.activePlayerColors;
      const clientPlayersCapacityList = currentGameState.players;
      let logCurrentPlayerColor = "N/A_Debug_Init";
      let logIsMyTurn = false;
      if (clientActivePlayerColors && clientActivePlayerColors.length > 0) {
          const activePlayerIndex = clientCurrentPlayerIndex % clientActivePlayerColors.length;
          logCurrentPlayerColor = clientActivePlayerColors[activePlayerIndex];
          logIsMyTurn = clientMyPlayerColor === logCurrentPlayerColor;
      } else if (clientPlayersCapacityList && clientPlayersCapacityList.length > 0 && clientCurrentPlayerIndex < clientPlayersCapacityList.length) {
          console.warn("[Game.js DEBUG ME] Using fallback (gameState.players) for logCurrentPlayerColor determination.");
          logCurrentPlayerColor = clientPlayersCapacityList[clientCurrentPlayerIndex];
          logIsMyTurn = clientMyPlayerColor === logCurrentPlayerColor;
      } else {
          if (clientPlayersCapacityList && clientPlayersCapacityList.length > 0) {
            console.warn("[Game.js DEBUG ME] Index out of bounds for fallback or lists empty. Idx:", clientCurrentPlayerIndex, "ActiveP:", JSON.stringify(clientActivePlayerColors), "PlayersL:", JSON.stringify(clientPlayersCapacityList));
          } else {
            console.warn("[Game.js DEBUG ME] Critical lists for turn determination are empty/invalid.");
          }
      }
      // addMessage calls are fine here as addMessage is stable
      addMessage(`[DEBUG ME] MyColor: ${clientMyPlayerColor}`, 'debug');
      addMessage(`[DEBUG ME] Idx: ${clientCurrentPlayerIndex}`, 'debug');
      addMessage(`[DEBUG ME] ActiveP: ${JSON.stringify(clientActivePlayerColors)}`, 'debug');
      addMessage(`[DEBUG ME] Calc UI Turn: ${logCurrentPlayerColor}`, 'debug');
      addMessage(`[DEBUG ME] Calc UI isMyTurn: ${logIsMyTurn}`, 'debug');
    }
  }, [gameState, myPlayerColor, addMessage]); // This specific useEffect is for debugging and uses gameState directly

  const handleRollDice = useCallback(() => {
    const currentGameState = gameStateRef.current;
    const currentMyPlayerColor = myPlayerColorRef.current;
    const currentRoundOverInfo = roundOverInfoRef.current;
    const currentOverallWinnerInfo = overallWinnerInfoRef.current;

    if (socket.connected && propGameId && currentGameState && currentMyPlayerColor) {
        let actualCurrentPlayer;
         if (currentGameState.activePlayerColors && currentGameState.activePlayerColors.length > 0 && currentGameState.current_player_index != null) {
            actualCurrentPlayer = currentGameState.activePlayerColors[currentGameState.current_player_index % currentGameState.activePlayerColors.length];
        } else { addMessage("Cannot roll dice: Active player data unclear for roll check."); return; }
        if (actualCurrentPlayer !== currentMyPlayerColor) { addMessage("Cannot roll dice: Not your turn."); return; }
        if (currentGameState.awaitingMove) { addMessage("You need to move a pawn first."); return; }
        if (currentRoundOverInfo || currentOverallWinnerInfo) { addMessage("Cannot roll dice: Round or game is over."); return; }
        socket.emit('rollDice', { gameId: propGameId });
    } else { addMessage("Cannot roll dice: Not in a game, not connected, or player color missing."); }
  }, [propGameId, addMessage]); // Dependencies are stable props/refs or stable callbacks

  const handleMovePawn = useCallback((pawnId) => {
    const currentGameState = gameStateRef.current;
    const currentMyPlayerColor = myPlayerColorRef.current;

    if (socket.connected && propGameId && currentGameState && currentMyPlayerColor) {
        let actualCurrentPlayer;
        if (currentGameState.activePlayerColors && currentGameState.activePlayerColors.length > 0 && currentGameState.current_player_index != null) {
            actualCurrentPlayer = currentGameState.activePlayerColors[currentGameState.current_player_index % currentGameState.activePlayerColors.length];
        } else { addMessage("Cannot move pawn: Active player data unclear for move check."); return; }
        if (actualCurrentPlayer !== currentMyPlayerColor) { addMessage("Cannot move pawn: Not your turn."); return; }
        if (!currentGameState.awaitingMove) { addMessage("Not awaiting a move. Roll dice or wait for your turn if you get an extra roll."); return; }
        if (currentGameState.dice_roll === null || currentGameState.dice_roll === 0) { addMessage("No dice roll to use for move. This shouldn't happen if awaitingMove is true."); return; }
        socket.emit('movePawn', { gameId: propGameId, pawnId });
    } else { addMessage("Cannot move pawn: Not in a game, not connected, or player color missing."); }
  }, [propGameId, addMessage]);

  const handleConfirmNextRound = useCallback(() => {
    const currentRoundOverInfo = roundOverInfoRef.current;
    const currentMyPlayerColor = myPlayerColorRef.current;
      if (socket.connected && propGameId && currentRoundOverInfo && currentRoundOverInfo.roundWinnerColor === currentMyPlayerColor) {
          socket.emit('confirmNextRound', { gameId: propGameId });
      } else { addMessage("Cannot start next round or not your turn to confirm."); }
  }, [propGameId, addMessage]);

  const handleSendChatMessage = useCallback(() => {
      if (socket.connected && propGameId && chatInputValue.trim() !== '') {
          socket.emit('sendChatMessage', { gameId: propGameId, message: chatInputValue.trim() });
          setChatInputValue('');
      } else if (chatInputValue.trim() === '') {
          // console.log("Chat input is empty, not sending.");
      } else { addMessage("Cannot send chat message: Not connected or not in a game."); }
  }, [propGameId, chatInputValue, addMessage, setChatInputValue]);


  // Main useEffect for socket event listeners
  useEffect(() => {
    console.log('[Game.js DEBUG] MAIN_EFFECT_RUN attempting. GameID Prop:', propGameId, 'Socket Connected:', socket.connected);
    if (!propGameId) {
      console.log('[Game.js DEBUG] MAIN_EFFECT_SKIPPED: propGameId is missing.');
      return; 
    }
    if (!socket.connected) {
      console.log('[Game.js DEBUG] MAIN_EFFECT_SKIPPED: socket is not connected.');
      // Optionally, you might want to return here or set up a one-time listener for 'connect' 
      // to then run the main effect logic. For now, just logging and returning is fine for diagnostics.
      return;
    }
    console.log('[Game.js DEBUG] MAIN_EFFECT_PROCEEDING with listener setup. GameID:', propGameId);
    // The existing MAIN_EFFECT_RUN log is removed by this change as the new "attempting" and "proceeding" logs cover it.
    // Unused local consts removed:
    // const currentMyPlayerColor = myPlayerColorRef.current; 
    // const currentMyPlayerName = myPlayerNameRef.current; 
    // const currentAssignedPlayerColor = assignedPlayerColorRef.current; // from prop

    // Initial join message - use refs for player name/color
    // Check if messages already contains join message to prevent duplicates on potential re-runs (though deps are minimal now)
    // This logic is tricky with setMessages, as messages itself is not a dependency.
    // For simplicity, let's assume this useEffect runs once per gameId effectively.
    // if (propGameId && currentMyPlayerColor && !messages.some(msg => msg.content.startsWith(`Joined Game: ${propGameId}`))) {
    //     const namePart = currentMyPlayerName || `Player ${currentMyPlayerColor}`;
    //     addMessage(`Joined Game: ${propGameId}. You are ${namePart} (${currentMyPlayerColor}).`);
    // }
    // The above message might be better handled outside this specific useEffect or passed differently.
    // For now, let's focus on event handlers.

    const handleConnect = () => addMessage('Reconnected to server. Socket ID: ' + socket.id);
    const handleDisconnect = (reason) => addMessage('Disconnected from server: ' + reason);

    const handleGameStateUpdate = (data) => {
      console.log("[Game.js] handleGameStateUpdate - Received raw data:", JSON.stringify(data));
      if (data && data.gameState && typeof data.gameState === 'object' && data.gameState.status) {
        const unwrappedGameState = data.gameState;
        console.log("[Game.js] handleGameStateUpdate - Setting unwrapped state:", JSON.stringify(unwrappedGameState));
        setGameState(unwrappedGameState); // This will trigger re-render and update gameStateRef via its own useEffect

        // Logic for clientMovablePawnIds, using unwrappedGameState and refs for other state
        const playerColorForPawnCheck = myPlayerColorRef.current; // Use ref
        let currentTurnPlayerColorForMovablePawns;

        if (unwrappedGameState.activePlayerColors && unwrappedGameState.activePlayerColors.length > 0 && typeof unwrappedGameState.current_player_index === 'number') {
          currentTurnPlayerColorForMovablePawns = unwrappedGameState.activePlayerColors[unwrappedGameState.current_player_index % unwrappedGameState.activePlayerColors.length];
        } else if (unwrappedGameState.players && unwrappedGameState.players.length > 0 && typeof unwrappedGameState.current_player_index === 'number' && unwrappedGameState.current_player_index < unwrappedGameState.players.length) {
          console.warn("[Game.js handleGameStateUpdate] Using fallback for currentTurnPlayerColorForMovablePawns.");
          currentTurnPlayerColorForMovablePawns = unwrappedGameState.players[unwrappedGameState.current_player_index];
        }
    
        if (playerColorForPawnCheck && currentTurnPlayerColorForMovablePawns === playerColorForPawnCheck && unwrappedGameState.awaitingMove) {
          const currentDice = unwrappedGameState.dice_roll;
          if (currentDice && unwrappedGameState.pawns && unwrappedGameState.pawns[playerColorForPawnCheck]) {
              const myPawnsData = unwrappedGameState.pawns[playerColorForPawnCheck];
              const calculatedMovableIds = [];
              const playerBoardData = unwrappedGameState.board && unwrappedGameState.board.players && unwrappedGameState.board.players[playerColorForPawnCheck];
              const allHome = playerBoardData?.home_area_count === 4;
              if (!(allHome && currentDice !== 6)) {
                  myPawnsData.forEach(pawn => {
                      if (pawn.state === 'home' && currentDice === 6) calculatedMovableIds.push(pawn.id);
                      else if (pawn.state === 'active' || pawn.state === 'homestretch') calculatedMovableIds.push(pawn.id);
                  });
              }
              setClientMovablePawnIds(calculatedMovableIds);
          } else { setClientMovablePawnIds([]); }
        } else { setClientMovablePawnIds([]); }
      } else {
        console.error("[Game.js] handleGameStateUpdate: Received data in unexpected structure. Data:", JSON.stringify(data));
      }
    };

    const handleDiceRolled = (data) => {
      const currentGameState = gameStateRef.current; // Use ref
      const playerColorForMessage = myPlayerColorRef.current; // Use ref for self-check

      let playerName = (currentGameState && currentGameState.playerNames && currentGameState.playerNames[data.playerColor]) || data.playerColor;
      let message = `${playerName} rolled a ${data.diceValue}. Sixes streak: ${data.consecutiveSixes}.`;
      if (data.mustRollAgain) message += " Must roll again.";
      if (data.awaitingMove) message += " Awaiting move.";
      addMessage(message);
      if(data.singleMovePawnId !== undefined && data.playerColor === playerColorForMessage && data.awaitingMove) {
          addMessage(`Server suggests pawn ID: ${data.singleMovePawnId} is the only move.`);
      }
    };

    const handlePawnMoved = (data) => {
      const currentGameState = gameStateRef.current; // Use ref
      let playerName = (currentGameState && currentGameState.playerNames && currentGameState.playerNames[data.playerColor]) || data.playerColor;
      let autoMoveText = data.autoMoved ? " (auto-moved by server)" : "";
      addMessage(`${playerName} moved pawn ${data.pawnId}. New Pos: ${data.newPos}, New State: ${data.newState}${autoMoveText}.`);
    };

    const handleTurnChanged = (data) => {
      const currentGameState = gameStateRef.current; // Use ref
      let newCurrentPlayerColorFromEvent = data.currentPlayer;
      let playerName = (currentGameState && currentGameState.playerNames && currentGameState.playerNames[newCurrentPlayerColorFromEvent]) || newCurrentPlayerColorFromEvent;
      addMessage(`Turn changed. Current player: ${playerName}.`);
      setClientMovablePawnIds([]);
    };

    const handleActionError = (data) => addMessage(`Error: ${data.message}`);
    const handlePlayerJoined = (data) => addMessage(`${data.playerName || data.playerColor} (${data.socketId ? data.socketId.substring(0,5) : 'N/A'}) has joined the game!`);
    const handlePlayerDisconnected = (data) => addMessage(`${data.playerName || data.playerColor} has disconnected.`);
    
    const handleRolledThreeSixes = (data) => {
        const currentGameState = gameStateRef.current; // Use ref
        let playerName = (currentGameState && currentGameState.playerNames && currentGameState.playerNames[data.playerColor]) || data.playerColor;
        addMessage(`${playerName} rolled three consecutive sixes! Dice was ${data.diceResult}. Turn forfeited.`);
    };

    const handleRoundOver = (data) => {
        setRoundOverInfo(data); // This will update roundOverInfoRef via its useEffect
        const currentGameState = gameStateRef.current; // Use ref
        const winnerName = data.roundWinnerName || (currentGameState && currentGameState.playerNames && currentGameState.playerNames[data.roundWinnerColor]) || data.roundWinnerColor;
        addMessage(`Runda skończona! Wygrywem zostaje: ${winnerName}. Wyniki: ${JSON.stringify(data.playerScores)}`);
    };

    const handleOverallGameOver = (data) => {
        setOverallWinnerInfo(data); // This will update overallWinnerInfoRef
        setRoundOverInfo(null); // This will update roundOverInfoRef
        const currentGameState = gameStateRef.current; // Use ref
        const winnerName = data.winnerName || (currentGameState && currentGameState.playerNames && currentGameState.playerNames[data.winnerColor]) || data.winnerColor;
        addMessage(`Koniec Gry! Wygrywem zostaje: ${winnerName}. Wynik:  ${JSON.stringify(data.finalScores)}`);
    };

    const handleNextRoundStarted = (data) => {
        setRoundOverInfo(null); // This will update roundOverInfoRef
        addMessage(data.message || "Next round has started!");
    };
    
    const handleNewChatMessage = (chatData) => {
        const currentGameState = gameStateRef.current; // Use ref
        const senderDisplayName = (currentGameState && currentGameState.playerNames && currentGameState.playerNames[chatData.senderColor]) || chatData.senderColor;
        const messageContent = `${senderDisplayName}: ${chatData.message}`;
        addMessage(messageContent, 'chat', chatData.senderColor, senderDisplayName);
    };

    // Readiness Check Listeners - use refs as needed
    const handleInitiateReadinessCheck = (data) => {
      console.log('[Game.js DEBUG] HIRC_EVENT_RECEIVED. Data:', data);
      addMessage(`Serwer zainicjował sprawdzanie gotowości. Czas na potwierdzenie: ${data.timeout || 10}s.`, 'system');
      setAwaitingReadinessConfirm(true);
      setReadinessTimer(data.timeout || 10);
      setReadyPlayersStatus(data.initialReadyStatus || {});
      const myPlayerActualId = socket.id;
      if (data.initialReadyStatus && data.initialReadyStatus[myPlayerActualId]) {
        setReadinessConfirmedBySelf(true);
      } else {
        setReadinessConfirmedBySelf(false);
      }
    };

    const handlePlayerReadinessUpdate = (data) => {
      setReadyPlayersStatus(data.newReadyStatus); // readyPlayersStatus state not directly used by other handlers here
      const myPlayerActualId = socket.id;
      if (data.newReadyStatus[myPlayerActualId]) {
        setReadinessConfirmedBySelf(true);
        addMessage('Twoja gotowość została potwierdzona.', 'event');
      }
    };

    const handleReadinessCheckOutcome = (data) => {
      setAwaitingReadinessConfirm(false);
      setReadinessTimer(0);
      if (data.success) {
        addMessage("Wszyscy gracze gotowi! Gra zaraz się rozpocznie...", 'system');
      } else {
        addMessage(`Sprawdzanie gotowości nie powiodło się: ${data.message}. Kreator może spróbować ponownie.`, 'error');
      }
      setReadinessConfirmedBySelf(false); 
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('gameStateUpdate', handleGameStateUpdate);
    socket.on('diceRolled', handleDiceRolled);
    socket.on('pawnMoved', handlePawnMoved);
    socket.on('turnChanged', handleTurnChanged);
    socket.on('actionError', handleActionError);
    socket.on('playerJoinedNotification', handlePlayerJoined);
    socket.on('playerDisconnected', handlePlayerDisconnected);
    socket.on('rolledThreeSixes', handleRolledThreeSixes);
    socket.on('roundOver', handleRoundOver);
    socket.on('overallGameOver', handleOverallGameOver);
    socket.on('nextRoundStarted', handleNextRoundStarted);
    socket.on('newChatMessage', handleNewChatMessage);
    socket.on('initiateReadinessCheck', handleInitiateReadinessCheck);
    console.log('[Game.js DEBUG] HIRC_LISTENER_ATTACHED for game:', propGameId);
    socket.on('playerReadinessUpdate', handlePlayerReadinessUpdate);
    socket.on('readinessCheckOutcome', handleReadinessCheckOutcome);
    
    // Keydown listener for spacebar to roll dice
    // This handler uses setGameState with a callback, which is fine.
    // It also accesses myPlayerColorRef, roundOverInfoRef, overallWinnerInfoRef.
    const handleKeyDown = (event) => {
        if (event.target.tagName === 'INPUT') return;
        if (event.code !== 'Space' && event.key !== ' ') return;
        
        // Access refs inside this handler
        const currentMyPlayerColor = myPlayerColorRef.current;
        const currentRoundOverInfo = roundOverInfoRef.current;
        const currentOverallWinnerInfo = overallWinnerInfoRef.current;

        // Use setGameState with a functional update to get the latest gameState
        setGameState(currentGs => { // currentGs is the latest gameState
            if (!currentGs || !currentMyPlayerColor) return currentGs;
            let actualCurrentPlayerForSpace;
            if (currentGs.activePlayerColors && currentGs.activePlayerColors.length > 0 && currentGs.current_player_index != null) {
                actualCurrentPlayerForSpace = currentGs.activePlayerColors[currentGs.current_player_index % currentGs.activePlayerColors.length];
            } else { return currentGs; }

            const isMyTurnForSpace = currentMyPlayerColor === actualCurrentPlayerForSpace;
            const diceDisabledForSpace = !isMyTurnForSpace || currentGs.awaitingMove || (currentGs.dice_roll !== null && !currentGs.mustRollAgain);
            const canRollForSpace = isMyTurnForSpace && !currentGs.awaitingMove && !diceDisabledForSpace && !currentRoundOverInfo && !currentOverallWinnerInfo;
            
            if (canRollForSpace) {
                event.preventDefault();
                // handleRollDice is stable and uses refs itself
                handleRollDice(); 
            }
            return currentGs; // Return unchanged state if no roll
        });
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      console.log('[Game.js DEBUG] MAIN_EFFECT_CLEANUP. GameID:', propGameId);
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('gameStateUpdate', handleGameStateUpdate);
      socket.off('diceRolled', handleDiceRolled);
      socket.off('pawnMoved', handlePawnMoved);
      socket.off('turnChanged', handleTurnChanged);
      socket.off('actionError', handleActionError);
      socket.off('playerJoinedNotification', handlePlayerJoined);
      socket.off('playerDisconnected', handlePlayerDisconnected);
      socket.off('rolledThreeSixes', handleRolledThreeSixes);
      socket.off('newChatMessage', handleNewChatMessage);
      socket.off('roundOver', handleRoundOver);
      socket.off('overallGameOver', handleOverallGameOver);
      socket.off('nextRoundStarted', handleNextRoundStarted);
      socket.off('initiateReadinessCheck', handleInitiateReadinessCheck);
      socket.off('playerReadinessUpdate', handlePlayerReadinessUpdate);
      socket.off('readinessCheckOutcome', handleReadinessCheckOutcome);
      window.removeEventListener('keydown', handleKeyDown);
    };
  // Minimal dependencies: only things that, if they change, *must* cause listeners to re-register.
  // propGameId is a key identifier.
  // socket.connected is added to re-run the effect when the socket connection status changes.
  // initialGameState is used for some setup conditions (like isCreator) that are fixed once component mounts.
  // myPlayerName, assignedPlayerColor are props, their refs are updated.
  // addMessage is stable and used by handlers.
  }, [propGameId, socket.connected, handleRollDice]); 
  // Note: addMessage could be added back if handlers defined outside this effect need it as a prop,
  // but since handlers are inside and addMessage is stable via useCallback, it's accessible.

  // useEffect for readiness timer (this is fine as is, depends on specific state)
  useEffect(() => {
    // The RENDER START log was moved from here. This comment can be cleaned up if desired, but is harmless.
    // The RENDER START log is now placed before PRE-LOAD-CHECK.
    if (awaitingReadinessConfirm && readinessTimer > 0) {
      const interval = setInterval(() => {
        setReadinessTimer(prevTimer => prevTimer - 1);
      }, 1000);
      return () => clearInterval(interval);
    } else if (awaitingReadinessConfirm && readinessTimer === 0) {
      // Time's up, client doesn't do anything, server will send outcome
      // setAwaitingReadinessConfirm(false); // Server will manage this with readinessCheckOutcome
      // addMessage("Czas na potwierdzenie gotowości minął.", "system");
    }
  }, [awaitingReadinessConfirm, readinessTimer, addMessage]);

  // This is the correct single location for RENDER START log, after all hooks.
  console.log('[Game.js RENDER START] GameID Prop:', propGameId, 'Socket ID:', socket.id, 'Socket Connected:', socket.connected, 'AwaitingConfirm:', awaitingReadinessConfirm);
  
  // Add this logging before the loading condition:
  console.log("[Game.js PRE-LOAD-CHECK] current gameState:", JSON.stringify(gameState, null, 2));
  if (gameState) {
      console.log("[Game.js PRE-LOAD-CHECK] gameState.status:", gameState.status);
      console.log("[Game.js PRE-LOAD-CHECK] typeof gameState.playersSetup:", typeof gameState.playersSetup);
      console.log("[Game.js PRE-LOAD-CHECK] Array.isArray(gameState.playersSetup):", Array.isArray(gameState.playersSetup));
      console.log("[Game.js PRE-LOAD-CHECK] gameState.playersSetup:", JSON.stringify(gameState.playersSetup, null, 2)); // Log playersSetup content
      console.log("[Game.js PRE-LOAD-CHECK] gameState.players:", JSON.stringify(gameState.players, null, 2));
      console.log("[Game.js PRE-LOAD-CHECK] gameState.board:", gameState.board ? "Exists" : "Does NOT exist");
      console.log("[Game.js PRE-LOAD-CHECK] gameState.pawns:", gameState.pawns ? "Exists" : "Does NOT exist");
  } else {
      console.log("[Game.js PRE-LOAD-CHECK] gameState is null or undefined.");
  }

  // New loading conditions
  if (!gameState) { // Basic check for gameState object itself
    return <div>Loading game state... If this persists, try returning to lobby.</div>;
  }

  // If game is in setup, we don't need board/pawns/active players list yet.
  // We primarily need playersSetup for the setup UI.
  const activeGamePhases = ['active', 'roundOver', 'gameOver'];
  if (activeGamePhases.includes(gameState.status) && (!gameState.players || !gameState.board || !gameState.pawns)) {
    // For non-setup phases, these are critical, so show loading if they're missing.
    return <div>Loading game state for active game... If this persists, try returning to lobby.</div>;
  }

  // Additionally, ensure that playersSetup, which is critical for the setup phase, exists.
  if (gameState.status === 'setup' && !gameState.playersSetup) {
    return <div>Loading setup information... If this persists, try returning to lobby.</div>;
  }

  // At this point, if status is 'setup', we assume playersSetup is available.
  // If status is 'active' (or other non-setup states), players, board, and pawns are assumed available.

  // MAIN UI LOGIC FOR DETERMINING CURRENT PLAYER
  let currentPlayerColor = 'N/A';
  let currentPlayerDisplayName = 'N/A';
  let isMyTurn = false;
  const effectivePlayerColor = myPlayerColor; // Use the color assigned to this client

  // Only attempt to determine current player if not in setup phase and gameState is valid
  if (gameState && gameState.status !== 'setup') {
    if (gameState.activePlayerColors && gameState.activePlayerColors.length > 0 && typeof gameState.current_player_index === 'number') {
        const activePlayerIndex = gameState.current_player_index % gameState.activePlayerColors.length;
        currentPlayerColor = gameState.activePlayerColors[activePlayerIndex];
        currentPlayerDisplayName = (gameState.playerNames && gameState.playerNames[currentPlayerColor]) || currentPlayerColor;
        isMyTurn = effectivePlayerColor === currentPlayerColor;
    } else if (gameState.players && gameState.players.length > 0 && typeof gameState.current_player_index === 'number' && gameState.current_player_index < gameState.players.length ) {
        console.warn("[Game.js] Using fallback for currentPlayerColor determination (UI render during active game). activePlayerColors might be empty or current_player_index problematic.", JSON.stringify(gameState.activePlayerColors), gameState.current_player_index);
        currentPlayerColor = gameState.players[gameState.current_player_index];
        currentPlayerDisplayName = (gameState.playerNames && gameState.playerNames[currentPlayerColor]) || currentPlayerColor;
        isMyTurn = effectivePlayerColor === currentPlayerColor;
    } else if (gameState.status === 'active' || gameState.status === 'roundOver' || gameState.status === 'gameOver') {
        // Only log warning if not in setup and data is truly missing for an active/post-setup game state
        console.warn(`[Game.js] Cannot determine current player for UI render (status: ${gameState.status}); critical properties like activePlayerColors or players list are undefined or index out of bounds.`);
    }
    // If status is 'waitingForReady', 'roundOver', 'gameOver' but no active players defined, it will also default to N/A without specific warning here, which is acceptable.
  }
  // For 'setup' phase, the defaults 'N/A', 'N/A', and false remain, and no warning is logged from this block.
  // END OF MAIN UI LOGIC
  console.log(`[Game.js TURN_CALC] GameID: ${propGameId}, Client's Color (effectivePlayerColor): ${effectivePlayerColor}, Current Turn Color (currentPlayerColor): ${currentPlayerColor}, IsMyTurn: ${isMyTurn}, Game Status: ${gameState?.status}, CPI: ${gameState?.current_player_index}, ActiveColors: ${JSON.stringify(gameState?.activePlayerColors)}`);

  const threeTryInfo = (gameState && gameState.status !== 'setup' && gameState.board && gameState.board.players && gameState.board.players[effectivePlayerColor]?.home_area_count === 4 && isMyTurn && gameState.threeTryAttempts > 0 && gameState.threeTryAttempts < 3 && gameState.dice_roll !== 6)
    ? `(Attempt ${gameState.threeTryAttempts} of 3 to roll a 6)`
    : "";

  const playersJoined = gameState && gameState.activePlayerColors ? gameState.activePlayerColors.length : 0;
  const playersCapacity = gameState ? gameState.num_players : 0;
  const isWaitingForPlayers = gameState && gameState.activePlayerColors && gameState.num_players &&
                              playersJoined < playersCapacity &&
                              !overallWinnerInfo && !roundOverInfo;

  const gameNotFull = isWaitingForPlayers; // Simplified, as dice should be disabled if waiting for players.
  const diceDisabled = gameNotFull || !isMyTurn || (gameState ? gameState.awaitingMove : true) || (gameState && gameState.dice_roll !== null && !gameState.mustRollAgain) || !!roundOverInfo || !!overallWinnerInfo;
  
  // Game status for UI rendering (e.g., hiding setup controls after game starts)
  // This relies on gameState being updated. initialIsSetupPhase is based on the prop.
  const currentIsSetupPhase = gameState.status === 'setup';
  // Add this log
  console.log('[Game.js SETUP PHASE CHECK] gameState.status:', gameState?.status, 'currentIsSetupPhase:', currentIsSetupPhase);

  const handleStartGame = () => {
    console.log("Creator requests game start. Settings:", { numPlayers, targetVictories });
    socket.emit('creatorRequestsGameStart', { 
      gameId: propGameId, 
      settings: { numPlayers, targetVictories } 
    });
    // Button will be disabled via awaitingReadinessConfirm after server responds
  };

  const handleConfirmReadiness = () => {
    if (socket.connected && propGameId && awaitingReadinessConfirm && !readinessConfirmedBySelf) {
      socket.emit('playerReady', { gameId: propGameId });
      setReadinessConfirmedBySelf(true); // Optimistic update, server will confirm via playerReadinessUpdate
      addMessage('Potwierdziłeś gotowość.', 'event');
    }
  };

  const handleColorSelection = (color) => {
    if (socket.connected && propGameId && currentIsSetupPhase) {
      const takenColors = gameState.playersSetup?.map(p => p.color).filter(c => c !== null) || [];
      if (takenColors.includes(color)) {
        addMessage(`Kolor ${color} jest już zajęty.`, 'error');
        return;
      }
      const myCurrentSlot = gameState.playersSetup?.find(p => p.playerId === socket.id);
      if (myCurrentSlot && myCurrentSlot.color === color) {
        addMessage(`Już wybrałeś ${color}.`, 'event');
        return;
      }
      socket.emit('selectColor', { gameId: propGameId, color: color });
    } else {
      addMessage("Nie można wybrać koloru: Gra nie jest w fazie konfiguracji lub utracono połączenie.", 'error');
    }
  };

  // Add this logging line:
  if (gameState) { // Ensure gameState is not null before accessing its properties
    console.log(`[Game.js RENDER] CPI: ${gameState.current_player_index}, Dice: ${gameState.dice_roll}, AwaitingMv: ${gameState.awaitingMove}, EffectiveColor: ${effectivePlayerColor}, CalcIsMyTurn: ${isMyTurn}, MovablePawns: ${JSON.stringify(clientMovablePawnIds)}, Names: ${JSON.stringify(gameState.playerNames)}, CurrPlayerName: ${currentPlayerDisplayName}, isCreator: ${isCreator}, isSetup: ${currentIsSetupPhase}`);
  } else {
    // Log current player display name even if gameState is null, as it might have a default.
    console.log(`[Game.js RENDER] gameState is null or undefined at render time. currentPlayerDisplayName: ${currentPlayerDisplayName}, EffectiveColor: ${effectivePlayerColor}`);
  }

  return (
    <div className="game-active-container">
      <h2 className="game-title">Chińczyk: {propGameId}</h2>
      <p className="player-info">Jesteś {myPlayerNameRef.current || 'Player'} (<span style={{color: myPlayerColor, fontWeight:'bold', border: myPlayerColor ? `2px solid ${myPlayerColor}` : 'none', padding: '2px 4px', borderRadius: '4px'}}>{myPlayerColor || 'Wybieram...'}</span>)</p>
      
      {isWaitingForPlayers && !currentIsSetupPhase && ( // Only show this if not in setup
        <p className="waiting-players-message">
          Czekamy na {playersCapacity - playersJoined} graczy aby dołączyli.
          ({playersJoined}/{playersCapacity} graczy w aktywnej grze).
        </p>
      )}
      {currentIsSetupPhase && (
        <p className="setup-phase-message" style={{padding: '10px', backgroundColor: '#e3f2fd', border: '1px solid #bbdefb', borderRadius: '4px', color: '#1e88e5'}}>
          Gra jest w fazie konfiguracji. Stwórca ustawia parametry gry. Gracze wybierają kolory.
        </p>
      )}

      <div className="game-left-column">
        <Board gameState={gameState} myPlayerColor={myPlayerColor} movablePawnIds={clientMovablePawnIds}
              onPawnClick={(pawnId) => {
                if (currentIsSetupPhase) { addMessage("Gra się jeszcze nie zaczeła.", "error"); return; }
                if (isMyTurn && gameState.awaitingMove && !roundOverInfo && !overallWinnerInfo) { handleMovePawn(pawnId); }
                else if (isMyTurn && !gameState.awaitingMove && !roundOverInfo && !overallWinnerInfo) { addMessage("Roll the dice first, or if you rolled a 6 and can't move, roll again."); }
                else if (!isMyTurn && !roundOverInfo && !overallWinnerInfo) { addMessage("Not your turn to move."); }
                else if (roundOverInfo || overallWinnerInfo) { addMessage("The round/game is over."); }
              }}
        />
        <div className="player-areas-container">
              {currentIsSetupPhase ? (
                (gameState.playersSetup || Array.from({ length: numPlayers }, (_, i) => ({ slotId: i, playerId: null, playerName: null, color: null }))).map((playerSlot, index) => {
                  const isSelfInSlot = playerSlot.playerId === socket.id;
                  const playerIsReady = awaitingReadinessConfirm && readyPlayersStatus[playerSlot.playerId] === true;
                  return (
                    <PlayerArea
                      key={playerSlot.slotId || `slot-${index}`}
                      playerColor={playerSlot.color}
                      playerName={playerSlot.playerName || (playerSlot.playerId ? `Gracz ${index + 1}`: null)}
                      isSetupPhase={true}
                      isSelf={isSelfInSlot}
                      availableColors={availableColors}
                      takenColors={gameState.playersSetup?.map(p => p.color).filter(c => c !== null) || []}
                      onSelectColor={handleColorSelection}
                      isReady={playerIsReady} // Pass down the readiness status
                      pawns={[]}
                      homeCount={0}
                      finishedCount={0}
                      isCurrentPlayer={false}
                    />
                  );
                })
              ) : (
                (gameState.players || []).map(color => {
                    if ((gameState.pawns && gameState.pawns[color]) || (gameState.playerNames && gameState.playerNames[color])) {
                        return (<PlayerArea 
                                  key={color} 
                                  playerColor={color} 
                                  playerName={(gameState.playerNames && gameState.playerNames[color])} 
                                  pawns={gameState.pawns[color] || []} 
                                  homeCount={gameState.board && gameState.board.players && gameState.board.players[color]?.home_area_count != null ? gameState.board.players[color].home_area_count : 4} 
                                  finishedCount={gameState.board && gameState.board.players && gameState.board.players[color]?.finished_count != null ? gameState.board.players[color].finished_count : 0} 
                                  isCurrentPlayer={color === currentPlayerColor}
                                  isSetupPhase={false}
                                />
                        );
                    }
                    return null;
                })
              )}
        </div>
      </div>

      <div className="game-right-column">
        {/* Add this log */}
        console.log('[Game.js CREATOR CONTROLS RENDER CHECK] isCreator:', isCreator, 'currentIsSetupPhase:', currentIsSetupPhase);
        {isCreator && currentIsSetupPhase && (
          <div className="game-setup-controls">
            <h4>Game Settings (Creator)</h4>
            <div className="form-group">
              <label htmlFor="numPlayersSetup">Number of Players:</label>
              <select 
                id="numPlayersSetup" 
                value={numPlayers} 
                onChange={(e) => setNumPlayers(parseInt(e.target.value, 10))}
                disabled={!currentIsSetupPhase || awaitingReadinessConfirm || (gameState.playersSetup && gameState.playersSetup.filter(p=>p.playerId).length > 1 && isCreator && gameState.status === 'setup')} 
              >
                <option value="2">2</option>
                <option value="3">3</option>
                <option value="4">4</option>
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="targetVictoriesSetup">Target Victories:</label>
              <select 
                id="targetVictoriesSetup" 
                value={targetVictories} 
                onChange={(e) => setTargetVictories(parseInt(e.target.value, 10))}
                disabled={!currentIsSetupPhase || awaitingReadinessConfirm} 
              >
                <option value="1">1</option>
                <option value="2">2</option>
                <option value="3">3</option>
              </select>
            </div>
            <button 
              onClick={handleStartGame} 
              disabled={
                !currentIsSetupPhase || 
                awaitingReadinessConfirm || // Disable if readiness check is in progress
                !gameState.playersSetup || 
                // Ensure playersSetup has successfully populated up to numPlayers
                gameState.playersSetup.filter(p => p.playerId).length !== numPlayers || 
                gameState.playersSetup.slice(0, numPlayers).some(p => !p.playerId || !p.color)
              } 
              className="lobby-button"
            >
              Start Game
            </button>
            {/* Feedback Messages */}
            { currentIsSetupPhase && !awaitingReadinessConfirm && gameState.playersSetup && gameState.playersSetup.filter(p=>p.playerId).length < numPlayers && <p style={{fontSize: '0.8em', color: 'red'}}>Oczekiwanie na {numPlayers - gameState.playersSetup.filter(p=>p.playerId).length} graczy.</p> }
            { currentIsSetupPhase && !awaitingReadinessConfirm && gameState.playersSetup && gameState.playersSetup.filter(p=>p.playerId).length === numPlayers && gameState.playersSetup.slice(0, numPlayers).some(p => p.playerId && !p.color) && <p style={{fontSize: '0.8em', color: 'red'}}>Wszyscy gracze muszą wybrać kolor.</p> }
          </div>
        )}

        {/* Readiness Confirmation UI */}
        {awaitingReadinessConfirm && (
          <div className="readiness-check-container" style={{padding: '10px', border: '1px solid #ffc107', borderRadius: '4px', backgroundColor: '#fff3e0', marginBlock: '15px'}}>
            <h4 style={{marginTop: 0, color: '#e65100'}}>Potwierdzenie Gotowości</h4>
            <p>Pozostały czas: <span style={{fontWeight: 'bold'}}>{readinessTimer}s</span></p>
            
            {socket.id === initialGameState.gameCreatorId ? ( // Creator's View
              <div>
                <p>Oczekiwanie na potwierdzenie od graczy...</p>
                <p>Gotowi: {Object.values(readyPlayersStatus).filter(status => status).length} / {(gameState.playersSetup || []).filter(p => p.playerId && p.playerId !== initialGameState.gameCreatorId).length}</p>
                {/* Display ready status per player - TODO: Enhance PlayerArea for this */}
              </div>
            ) : ( // Non-Creator Player's View
              <div>
                <p>Gra zaraz się rozpocznie! Potwierdź swoją gotowość.</p>
                <button 
                  onClick={handleConfirmReadiness} 
                  disabled={readinessConfirmedBySelf || (readyPlayersStatus && readyPlayersStatus[socket.id])}
                  className="lobby-button"
                  style={{backgroundColor: (readinessConfirmedBySelf || (readyPlayersStatus && readyPlayersStatus[socket.id])) ? '#a5d6a7' : '#4CAF50' }} // Greenish if confirmed
                >
                  {(readinessConfirmedBySelf || (readyPlayersStatus && readyPlayersStatus[socket.id])) ? 'Gotowość Potwierdzona' : 'Potwierdź Gotowość'}
                </button>
              </div>
            )}
          </div>
        )}

        {!overallWinnerInfo && !roundOverInfo && !isWaitingForPlayers && !currentIsSetupPhase && ( 
          <div className={`turn-indicator ${isMyTurn ? 'my-turn' : ''}`}>
            <h3>{isMyTurn ? "Twoja kolej!" : `${currentPlayerDisplayName}'s kolej`} {threeTryInfo}</h3>
          </div>
        )}
        {!overallWinnerInfo && !roundOverInfo && gameState && gameState.awaitingMove && isMyTurn && !currentIsSetupPhase &&
          <p className="action-prompt await-move">Wyrzuciłeś {gameState.dice_roll}. Wybierz pionka.</p>}
        {!overallWinnerInfo && !roundOverInfo && gameState.mustRollAgain && isMyTurn && !gameState.awaitingMove && !currentIsSetupPhase &&
          <p className="action-prompt roll-again">Rzucaj ponownie!</p>}
        
        {overallWinnerInfo && (
          <div className="game-over-message overall-game-over">
              <h3>GAME OVER!</h3>
              <p>Wygrywem jest: <span style={{color: overallWinnerInfo.winnerColor, fontWeight: 'bold'}}>{overallWinnerInfo.winnerName || overallWinnerInfo.winnerColor}</span>!</p>
              <h4>Finalne wyniki:</h4>
              <ul>{Object.entries(overallWinnerInfo.finalScores || {}).map(([color, score]) => (<li key={color} style={{color: color}}>{(gameState.playerNames && gameState.playerNames[color]) || color}: {score}</li>))}</ul>
              <button onClick={onReturnToLobby} className="lobby-button">Return to Lobby</button>
          </div>
        )}
        {!overallWinnerInfo && roundOverInfo && (
          <div className="game-over-message round-over">
              <h3>Koniec Rundy!</h3>
              <p><span style={{color: roundOverInfo.roundWinnerColor, fontWeight: 'bold'}}>{roundOverInfo.roundWinnerName || (gameState.playerNames && gameState.playerNames[roundOverInfo.roundWinnerColor]) || roundOverInfo.roundWinnerColor}</span> won this round!</p>
              <h4>Wyniki:</h4>
              <ul>{Object.entries(roundOverInfo.playerScores || {}).map(([color, score]) => ( <li key={color} style={{color: color}}>{(gameState.playerNames && gameState.playerNames[color]) || color}: {score}</li>))}</ul>
              {myPlayerColor === roundOverInfo.roundWinnerColor ? (<button onClick={handleConfirmNextRound} className="lobby-button">OK - Start Next Round</button>) : (<p>Waiting for {(gameState.playerNames && gameState.playerNames[roundOverInfo.roundWinnerColor]) || roundOverInfo.roundWinnerColor} to start the next round.</p>)}
          </div>
        )}
        {!overallWinnerInfo && !roundOverInfo && gameState.awaitingNextRoundConfirmationFrom && myPlayerColor !== gameState.awaitingNextRoundConfirmationFrom && !currentIsSetupPhase && (
           <p className="waiting-confirmation">Waiting for {(gameState.playerNames && gameState.playerNames[gameState.awaitingNextRoundConfirmationFrom]) || gameState.awaitingNextRoundConfirmationFrom} to start the next round.</p>
        )}

        {!overallWinnerInfo && !roundOverInfo && !currentIsSetupPhase && (
          <Dice value={gameState.dice_roll} onRoll={handleRollDice} isMyTurn={isMyTurn} awaitingMove={gameState.awaitingMove} mustRollAgain={gameState.mustRollAgain} disabled={diceDisabled || currentIsSetupPhase } />
        )}
        
        <div className="game-log-container">
          <h3>Log Gry:</h3>
          <ul className="game-log-list">{messages.map((msg, index) => (
            <li
                key={index}
                className={`log-message ${msg.type === 'chat' ? 'chat-message' : 'event-message'}`}
            >
                <span className="timestamp">[{msg.displayTimestamp}]</span>
                {msg.type === 'chat' ? (
                    <span className="message-content">
                        <span className="sender-name" style={{ color: msg.senderColor, fontWeight: 'bold' }}>
                            {msg.senderName || msg.senderColor || 'Player'}
                        </span>
                        {/* Corrected substring logic for chat messages */}
                        {`: ${msg.content.startsWith((msg.senderName || msg.senderColor || 'Player') + ': ') ? msg.content.substring((msg.senderName || msg.senderColor || 'Player').length + 2) : msg.content}`}
                    </span>
                ) : (
                    <span className="message-content">{msg.content}</span>
                )}
            </li>
          ))}
        </ul>
        <div className="chat-input-container">
            <input
                type="text"
                value={chatInputValue}
                onChange={(e) => setChatInputValue(e.target.value)}
                onKeyPress={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendChatMessage();
                    }
                }}
                placeholder="Type a message..."
                className="chat-input"
            />
            <button onClick={handleSendChatMessage} className="chat-send-button">Wyślij</button>
        </div>
      </div> {/* game-log-container */}
    </div> {/* game-right-column */}
  </div> /* game-active-container */
  );
};

export default Game;
