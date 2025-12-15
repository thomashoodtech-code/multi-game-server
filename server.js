// server.js - The Master Controller for the 8-in-1 Game Platform

const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");

// 1. --- Socket.IO Configuration ---
// The CORS configuration is VITAL for letting your IONOS site talk to this Render server.
const io = new Server(server, {
  cors: {
    // Using "*" is the simplest way for now, allowing connection from any domain (like your IONOS site)
    origin: "*", 
    methods: ["GET", "POST"]
  }
});

// 2. --- Server Port Configuration ---
// Render requires us to use the port defined in the environment variable.
const PORT = process.env.PORT || 3000; 

// 3. --- Game State and Room Management ---

// Central object to store all active game rooms.
// Key: roomCode (4-digit string), Value: { hostSocketId, players: [], gameType, gameState }
let gameRooms = {};

// Helper function to generate a unique 4-digit room code
function generateRoomCode() {
  let code = Math.floor(1000 + Math.random() * 9000).toString();
  while (gameRooms.hasOwnProperty(code)) {
    code = Math.floor(1000 + Math.random() * 9000).toString();
  }
  return code;
}

// 4. --- Socket.IO Connection Handlers ---

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  // --- HOST Functions ---

  // Host requests a new room (e.g., when clicking "Start Game" on host.html)
  socket.on('createRoom', (data) => {
    const roomCode = generateRoomCode();
    
    // Create the new room object
    gameRooms[roomCode] = {
      hostSocketId: socket.id,
      players: [],
      gameType: data.gameType,
      gameState: 'waiting' // Initial state
    };
    
    socket.join(roomCode); // Host joins the room
    
    // Notify the host (the browser that sent the request)
    socket.emit('roomCreated', { roomCode: roomCode, gameType: data.gameType });
    console.log(`Room created: ${roomCode} for game: ${data.gameType}`);
  });

  // --- PLAYER Functions ---

  // Player attempts to join a room
  socket.on('joinRoom', (data) => {
    const roomCode = data.roomCode;
    const playerName = data.playerName;
    const room = gameRooms[roomCode];

    if (room) {
      // 1. Add player to the room list
      room.players.push({ id: socket.id, name: playerName });
      socket.join(roomCode); // Player joins the socket.io room

      // 2. Notify the player they joined successfully
      socket.emit('joinedRoom', { 
        roomCode: roomCode, 
        gameType: room.gameType,
        players: room.players
      });

      // 3. Notify the host and all others in the room of the new player
      io.to(roomCode).emit('playerJoined', { 
        playerName: playerName, 
        players: room.players 
      });

      console.log(`Player ${playerName} joined room ${roomCode}`);
    } else {
      // Room does not exist
      socket.emit('joinFailed', 'Room code is invalid or the host has disconnected.');
    }
  });


  // --- DISCONNECT Function ---
  
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    
    // Check if the disconnected user was a Host
    for (const code in gameRooms) {
      if (gameRooms[code].hostSocketId === socket.id) {
        // Host disconnected: end the game for everyone
        io.to(code).emit('hostDisconnected', 'The host has left the game. The room is closed.');
        delete gameRooms[code];
        console.log(`Host disconnected, room ${code} closed.`);
        return;
      }
    }

    // Check if the disconnected user was a Player
    for (const code in gameRooms) {
      const room = gameRooms[code];
      const playerIndex = room.players.findIndex(p => p.id === socket.id);
      
      if (playerIndex !== -1) {
        const playerName = room.players[playerIndex].name;
        room.players.splice(playerIndex, 1); // Remove player from the list
        
        // Notify everyone in the room (including the host)
        io.to(code).emit('playerLeft', {
          playerName: playerName,
          players: room.players // Send updated player list
        });
        console.log(`Player ${playerName} left room ${code}.`);
        return;
      }
    }
  });

});

// 5. --- Start the Server ---
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Public URL: https://multi-game-server.onrender.com`);
});
