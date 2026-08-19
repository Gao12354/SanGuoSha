// server.js
const WebSocket = require('ws');
const crypto = require('crypto');  // ← 替换 uuid
const http = require('http');
const fs = require('fs');
const path = require('path');

function uuidv4() { return crypto.randomUUID(); }  // ← 替代 require('uuid')

const PORT = 3000;
// ... 后面代码不变
// ========== HTTP 静态文件服务 ==========
const server = http.createServer((req, res) => {
    let filePath = req.url === '/' ? '/index.html' : req.url;
    filePath = path.join(__dirname, 'public', filePath);
    const ext = path.extname(filePath);
    const mimeTypes = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
    try {
        const data = fs.readFileSync(filePath);
        res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'text/plain; charset=utf-8' });
        res.end(data);
    } catch {
        res.writeHead(404); res.end('Not Found');
    }
});

// ========== WebSocket 服务 ==========
const wss = new WebSocket.Server({ server });

const rooms = new Map(); // roomId -> Room

class Room {
    constructor(id, hostName) {
        this.id = id;
        this.hostName = hostName;
        this.players = [];      // [{ws, name, playerId, ready}]
        this.state = 'lobby';   // lobby | picking | battle | over
        this.gameState = null;  // 完整游戏状态快照
        this.turnQueue = [];    // 行动队列
        this.currentTurnIdx = 0;
        this.setup = null;
        this.pickData = {};     // { playerId: { faction, generals } }
        this.takenFactions = new Set();
        this.pickOrder = [];
        this.currentPickerIdx = 0;
        this.messages = [];     // 战斗消息日志
    }

    addPlayer(ws, name) {
        const playerId = this.players.length + 1;
        this.players.push({ ws, name, playerId, ready: false });
        this.broadcast({ type: 'player_joined', playerId, name, count: this.players.length });
        this.sendTo(ws, { type: 'welcome', playerId, roomId: this.id, players: this.players.map(p => ({ name: p.name, playerId: p.playerId })) });
        return playerId;
    }

    removePlayer(ws) {
        const idx = this.players.findIndex(p => p.ws === ws);
        if (idx === -1) return;
        const removed = this.players.splice(idx, 1)[0];
        this.broadcast({ type: 'player_left', playerId: removed.playerId, name: removed.name });
        if (this.players.length === 0) {
            rooms.delete(this.id);
            console.log(`Room ${this.id} destroyed`);
        }
    }

    sendTo(ws, msg) {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
    }

    broadcast(msg, excludeWs = null) {
        const data = JSON.stringify(msg);
        this.players.forEach(p => {
            if (p.ws !== excludeWs && p.ws.readyState === WebSocket.OPEN) p.ws.send(data);
        });
    }

    // ---------- 准备 & 开始 ----------
    setReady(playerId, setupConfig) {
        const p = this.players.find(pl => pl.playerId === playerId);
        if (!p) return;
        p.ready = true;
        p.setupConfig = setupConfig; // { teamCount, aiCount, teams:{playerId: teamKey} }
        this.broadcast({ type: 'player_ready', playerId, name: p.name });

        if (this.players.every(pl => pl.ready)) {
            this.startPickPhase();
        }
    }

    startPickPhase() {
        this.state = 'picking';
        // 使用房主的配置
        const hostCfg = this.players[0].setupConfig || {};
        this.setup = {
            playerCount: this.players.length,
            teamCount: hostCfg.teamCount || 2,
            aiCount: hostCfg.aiCount || Math.max(0, 4 - this.players.length),
            playerTeams: hostCfg.teams || {}
        };
        // 默认未设置的玩家为单干
        for (let i = 1; i <= this.players.length; i++) {
            if (!this.setup.playerTeams[i]) this.setup.playerTeams[i] = 'S';
        }

        this.pickOrder = this.players.map(p => p.playerId);
        this.currentPickerIdx = 0;
        this.takenFactions = new Set();
        this.pickData = {};

        this.broadcast({
            type: 'pick_phase_start',
            setup: this.setup,
            pickOrder: this.pickOrder,
            currentPicker: this.pickOrder[0]
        });
    }

    handlePick(playerId, faction, generals) {
        if (this.pickOrder[this.currentPickerIdx] !== playerId) return;
        if (this.takenFactions.has(faction)) return;

        this.pickData[playerId] = { faction, generals };
        this.takenFactions.add(faction);
        this.broadcast({ type: 'pick_done', playerId, faction, taken: [...this.takenFactions] });

        this.currentPickerIdx++;
        if (this.currentPickerIdx < this.pickOrder.length) {
            this.broadcast({
                type: 'pick_next',
                currentPicker: this.pickOrder[this.currentPickerIdx],
                taken: [...this.takenFactions]
            });
        } else {
            this.startBattle();
        }
    }

    // ---------- 战斗初始化 ----------
    startBattle() {
        this.state = 'battle';
        // 构建初始 gameState（与客户端逻辑一致的数据结构）
        const FORDER = ['shu','wei','wu','qun','jin','chu','yan','liang','nan','bei'];
        const playerFactions = Object.values(this.pickData).map(d => d.faction);
        const remaining = FORDER.filter(f => !playerFactions.includes(f));
        const shuffled = remaining.sort(() => Math.random() - 0.5);
        const aiFactions = shuffled.slice(0, this.setup.aiCount);
        const activeFactions = [...playerFactions, ...aiFactions];

        // 映射 faction -> controller
        const controllers = {};
        const factionTeamMap = {};
        const generalsMap = {};

        this.players.forEach(p => {
            const pd = this.pickData[p.playerId];
            controllers[pd.faction] = p.playerId;
            factionTeamMap[pd.faction] = this.setup.playerTeams[p.playerId] || 'S';
            generalsMap[pd.faction] = pd.generals;
        });
        aiFactions.forEach(f => {
            controllers[f] = 0;
            factionTeamMap[f] = 'S';
        });

        this.gameState = {
            activeFactions,
            controllers,
            factionTeamMap,
            generalsMap,
            turnIdx: 0,
            turnCount: 0,
            units: [],       // 由客户端根据 generalsMap 生成（保持渲染一致性）
            hands: {},
            terrain: {},
            over: false,
            winner: null
        };

        this.broadcast({
            type: 'battle_start',
            gameState: this.gameState,
            setup: this.setup
        });
    }

    // ---------- 战斗指令转发 ----------
    handleAction(playerId, action) {
        // action: { type: 'move'|'use_card'|'end_turn'|'response', ... }
        // 服务端做基本校验后广播给所有人
        const p = this.players.find(pl => pl.playerId === playerId);
        if (!p) return;

        // 验证是否是当前玩家的回合
        const curFaction = this.gameState.activeFactions[this.gameState.turnIdx];
        if (this.gameState.controllers[curFaction] !== playerId) {
            this.sendTo(p.ws, { type: 'error', msg: '不是你的回合' });
            return;
        }

        this.broadcast({
            type: 'game_action',
            playerId,
            action,
            timestamp: Date.now()
        });
    }

    // 状态同步（用于断线重连或校验）
    syncState(ws) {
        this.sendTo(ws, {
            type: 'state_sync',
            gameState: this.gameState,
            state: this.state,
            messages: this.messages.slice(-50)
        });
    }
}

// ========== 连接处理 ==========
wss.on('connection', (ws) => {
    let currentRoom = null;
    let myPlayerId = null;

    ws.on('message', (raw) => {
        let msg;
        try { msg = JSON.parse(raw); } catch { return; }

        switch (msg.type) {
            case 'create_room': {
                const roomId = uuidv4().slice(0, 6).toUpperCase();
                const room = new Room(roomId, msg.name || 'Host');
                rooms.set(roomId, room);
                currentRoom = room;
                myPlayerId = room.addPlayer(ws, msg.name || 'Host');
                console.log(`Room ${roomId} created by ${msg.name}`);
                break;
            }
            case 'join_room': {
                const room = rooms.get(msg.roomId?.toUpperCase());
                if (!room) {
                    ws.send(JSON.stringify({ type: 'error', msg: '房间不存在' }));
                    return;
                }
                if (room.state !== 'lobby') {
                    ws.send(JSON.stringify({ type: 'error', msg: '游戏已开始' }));
                    return;
                }
                currentRoom = room;
                myPlayerId = room.addPlayer(ws, msg.name || `Player${room.players.length + 1}`);
                console.log(`${msg.name} joined room ${msg.roomId}`);
                break;
            }
            case 'get_rooms': {
                const list = [...rooms.values()]
                    .filter(r => r.state === 'lobby')
                    .map(r => ({ id: r.id, host: r.hostName, players: r.players.length }));
                ws.send(JSON.stringify({ type: 'room_list', rooms: list }));
                break;
            }
            case 'ready': {
                if (currentRoom) currentRoom.setReady(myPlayerId, msg.config);
                break;
            }
            case 'pick': {
                if (currentRoom) currentRoom.handlePick(myPlayerId, msg.faction, msg.generals);
                break;
            }
            case 'action': {
                if (currentRoom) currentRoom.handleAction(myPlayerId, msg.action);
                break;
            }
            case 'sync_request': {
                if (currentRoom) currentRoom.syncState(ws);
                break;
            }
        }
    });

    ws.on('close', () => {
        if (currentRoom) currentRoom.removePlayer(ws);
    });
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`🎮 乱世·弈界 局域网服务器已启动`);
    console.log(`📡 地址: http://0.0.0.0:${PORT}`);
    console.log(`💡 局域网内其他设备访问: http://<本机IP>:${PORT}`);
});