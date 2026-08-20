const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// index.html 与 server.js 同目录即可
app.use(express.static(__dirname));

const rooms = new Map();

io.on('connection', (socket) => {
    let currentRoom = null;

    socket.on('createRoom', ({ name }, cb) => {
        const roomId = Math.random().toString(36).replace(/[^a-z0-9]/gi, '').substring(0, 5).toUpperCase();
        currentRoom = roomId;
        rooms.set(roomId, { id: roomId, host: socket.id, phase: 'lobby', players: [{ id: socket.id, name }] });
        socket.join(roomId);
        cb({ ok: true, roomId });
    });

    socket.on('joinRoom', ({ roomId, name }, cb) => {
        const room = rooms.get(roomId);
        if (!room) return cb({ ok: false, err: '房间不存在' });
        if (room.phase !== 'lobby') return cb({ ok: false, err: '游戏已开始，无法加入' });
        if (room.players.length >= 4) return cb({ ok: false, err: '房间已满(4人)' });
        currentRoom = roomId;
        socket.join(roomId);
        room.players.push({ id: socket.id, name });
        io.to(roomId).emit('playerList', room.players);
        cb({ ok: true, roomId, players: room.players });
    });

    socket.on('setPhase', (phase) => { const r = rooms.get(currentRoom); if (r) r.phase = phase; });

    // 客户端 → 房主
    socket.on('toHost', (data) => {
        const r = rooms.get(currentRoom);
        if (r && r.host !== socket.id) io.to(r.host).emit('fromClient', { from: socket.id, ...data });
    });

    // 房主 → 所有人（除自己）
    socket.on('toAll', (data) => { if (currentRoom) socket.to(currentRoom).emit('fromHost', data); });

    // 房主 → 指定玩家
    socket.on('toPlayer', ({ target, data }) => { io.to(target).emit('fromHost', data); });

    socket.on('disconnect', () => {
        if (!currentRoom) return;
        const room = rooms.get(currentRoom);
        if (!room) return;
        room.players = room.players.filter(p => p.id !== socket.id);
        if (room.players.length === 0) { rooms.delete(currentRoom); return; }
        io.to(currentRoom).emit('playerList', room.players);
        io.to(currentRoom).emit('playerLeft', socket.id);
        if (room.host === socket.id) {
            room.host = room.players[0].id;
            io.to(currentRoom).emit('newHost', room.players[0].id);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🎮 乱世·弈界 服务器 → http://localhost:${PORT}`));