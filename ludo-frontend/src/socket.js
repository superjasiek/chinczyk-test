import { io } from 'socket.io-client';

// Tworzymy połączenie względne względem domeny frontendowej (czyli np. https://chinczyk.jha.ovh)
export const socket = io({
  transports: ['websocket'],
});

// Możesz też dodać obsługę zdarzeń do debugowania
socket.on('connect', () => {
  console.log('✅ Socket.IO connected');
});

socket.on('disconnect', (reason) => {
  console.log('⚠️ Socket.IO disconnected:', reason);
});

socket.on('connect_error', (error) => {
  console.error('❌ Socket.IO connection error:', error);
});
