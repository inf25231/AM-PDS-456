import { WebSocketServer } from 'ws';

const PORT = process.env.PORT || 8080;
const wss = new WebSocketServer({ port: PORT });

// roomId -> Set of WebSocket clients
const rooms = new Map();

wss.on('connection', (ws) => {
  let currentRoom = null;

  ws.on('message', (raw) => {
    const msg = JSON.parse(raw);

    if (msg.type === 'join-room') {
      currentRoom = msg.roomId;
      if (!rooms.has(currentRoom)) rooms.set(currentRoom, new Set());
      rooms.get(currentRoom).add(ws);
      console.log(`joined room: ${currentRoom}`);
      return;
    }

    // forward all other messages to peers in the same room
    if (currentRoom && rooms.has(currentRoom)) {
      for (const peer of rooms.get(currentRoom)) {
        if (peer !== ws && peer.readyState === 1) {
          peer.send(raw.toString());
        }
      }
    }
  });

  ws.on('close', () => {
    if (currentRoom && rooms.has(currentRoom)) {
      rooms.get(currentRoom).delete(ws);
      if (rooms.get(currentRoom).size === 0) rooms.delete(currentRoom);
      console.log(`left room: ${currentRoom}`);
    }
  });
});

console.log(`Signaling server running on ws://localhost:${PORT}`);
