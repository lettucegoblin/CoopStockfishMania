const https = require('https');
const http = require('http');
const express = require('express');
const path = require('path');
const fs = require('fs');
const WebSocket = require('ws');
const uniqid = require('uniqid');
const randomAnimalName = require('random-animal-name');
const randomAvatarGenerator = require("random-avatar-generator");

const avaGenerator = new randomAvatarGenerator.AvatarGenerator();

// Configuration
const config = require('./config.json');
const PORT = process.env.PORT || config.port || 8000;

const app = express();

// Serve static files from the "public" directory
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Server setup (HTTP/HTTPS)
let server;
if (fs.existsSync(config.keyFileLocation) && fs.existsSync(config.certFileLocation)) {
    const options = {
        key: fs.readFileSync(config.keyFileLocation),
        cert: fs.readFileSync(config.certFileLocation)
    };
    server = https.createServer(options, app);
} else {
    server = http.createServer(app);
}

server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running at http://0.0.0.0:${PORT}/`);
});

const wss = new WebSocket.Server({ server });

// Backend State
const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const rooms = new Map();

/**
 * Room logic encapsulated to handle state transitions safely.
 */
class Room {
    constructor(id) {
        this.id = id;
        this.users = new Map(); // userid -> ws object
        this.readyUsers = new Set(); 
        this.gameState = {
            status: "active", // "active", "paused"
            turnOrder: {
                order: [], // List of userids + "robot"
                serverTimestamp: Date.now(),
                turnNum: 0,
                turnOrderIndex: 0,
                lastGameBoardFen: START_FEN,
                centipawns: 0
            },
            botDifficulty: 10
        };
        this.cleanupTimeout = null;
    }

    pauseGame() {
        if (this.gameState.status !== "paused") {
            this.gameState.status = "paused";
            this.readyUsers.clear();
            this.broadcastStatus();
        }
    }

    resumeIfReady() {
        const humanUserIds = Array.from(this.users.keys());
        const allHumansReady = humanUserIds.every(uid => this.readyUsers.has(uid));
        
        if (allHumansReady && humanUserIds.length > 0 && this.gameState.turnOrder.order.length > 1) {
            this.gameState.status = "active";
            this.broadcastStatus();
            this.checkAndTriggerRobotTurn();
        }
    }

    addUser(ws) {
        this.users.set(ws.user.userid, ws);
        if (this.cleanupTimeout) {
            clearTimeout(this.cleanupTimeout);
            this.cleanupTimeout = null;
        }
        
        // Always pause when someone joins or re-joins
        this.pauseGame();

        // Ensure a default robot is in turn order if room is new
        const hasRobot = this.gameState.turnOrder.order.some(id => id.startsWith("robot_"));
        if (!hasRobot && this.users.size === 1 && this.gameState.turnOrder.order.length === 0) { // First user joining a fresh room
            this.gameState.turnOrder.order.push("robot_10");
        }
        
        // Add user to turn order if not already there
        if (!this.gameState.turnOrder.order.includes(ws.user.userid)) {
            const firstRobotIndex = this.gameState.turnOrder.order.findIndex(id => id.startsWith("robot_"));
            
            // If the room ONLY has robots (or is empty), put the first human at the start (White)
            if (this.users.size === 1 && firstRobotIndex !== -1) {
                this.gameState.turnOrder.order.splice(firstRobotIndex, 0, ws.user.userid);
            } else {
                // Otherwise append to the end to avoid disrupting the current game/turn
                this.gameState.turnOrder.order.push(ws.user.userid);
            }
        }

        // Broadcast turn order change
        this.broadcast({
            requestType: "turnOrderUpdate",
            turnOrder: this.gameState.turnOrder
        });
    }

    removeUser(userid) {
        this.users.delete(userid);
        this.readyUsers.delete(userid);
        
        if (this.users.size === 0) {
            this.cleanupTimeout = setTimeout(() => {
                rooms.delete(this.id);
                console.log(`Room ${this.id} cleaned up due to inactivity.`);
            }, 300000);
        } else {
            // Pause if someone leaves
            this.pauseGame();
        }

        this.gameState.turnOrder.order = this.gameState.turnOrder.order.filter(id => id !== userid);
        this.gameState.turnOrder.serverTimestamp = Date.now();
        
        if (this.gameState.turnOrder.turnOrderIndex >= this.gameState.turnOrder.order.length) {
            this.gameState.turnOrder.turnOrderIndex = 0;
        }
    }

    checkAndTriggerRobotTurn() {
        if (this.gameState.status !== "active") return;
        if (this.gameState.turnOrder.order.length <= 1) return;

        const currentTurnId = this.gameState.turnOrder.order[this.gameState.turnOrder.turnOrderIndex];
        if (currentTurnId === "robot" || currentTurnId?.startsWith("robot_")) {
            console.log(`Triggering robot turn for room ${this.id}`);
            // We notify ONE human client to perform the Stockfish calculation and send back a "botMove"
            const humanClients = Array.from(this.users.values()).filter(ws => ws.readyState === WebSocket.OPEN);
            if (humanClients.length > 0) {
                const triggerClient = humanClients[Math.floor(Math.random() * humanClients.length)];
                let botLevel = 10;
                if (currentTurnId.startsWith("robot_")) {
                    botLevel = parseInt(currentTurnId.split('_')[1]) || 10;
                }
                triggerClient.send(JSON.stringify({
                    requestType: "triggerRobotMove",
                    fen: this.gameState.turnOrder.lastGameBoardFen || START_FEN,
                    difficulty: botLevel
                }));
            }
        }
    }

    broadcastStatus() {
        this.broadcast({
            requestType: "gameStatusUpdate",
            status: this.gameState.status,
            readyUsers: Array.from(this.readyUsers),
            allUsers: Array.from(this.users.values()).map(u => ({
                userid: u.user.userid,
                username: u.user.username,
                avatarUrl: u.user.avatarUrl
            }))
        });
    }

    broadcast(payload, excludeUserId = null) {
        const data = JSON.stringify(payload);
        this.users.forEach((ws, userid) => {
            if (userid !== excludeUserId && ws.readyState === WebSocket.OPEN) {
                ws.send(data);
            }
        });
    }
}

wss.on('connection', function connection(ws, request) {
    ws.user = {
        userid: uniqid(),
        username: randomAnimalName(),
        roomId: null,
        disconnectTimeout: null
    };
    ws.user.avatarUrl = avaGenerator.generateRandomAvatar(ws.user.username);

    ws.on('message', function incoming(message) {
        const messageJson = safeParseJson(message);
        if (!messageJson) return;

        const room = rooms.get(ws.user.roomId);

        switch (messageJson.requestType) {
            case "initRoom":
                handleInitRoom(ws, messageJson);
                break;
            
            case "rename":
                if (room) {
                    const newName = messageJson.username;
                    if (newName && typeof newName === 'string' && newName.trim() !== '') {
                        ws.user.username = newName.trim();
                        // We need to rebroadcast the user state. Since user state is distributed in 'init' and 'newClient',
                        // we can broadcast a 'newClient' message to all clients to update the username.
                        room.broadcast({
                            requestType: "newClient",
                            newClient: {
                                userid: ws.user.userid,
                                username: ws.user.username,
                                avatarUrl: ws.user.avatarUrl,
                                roomId: ws.user.roomId
                            }
                        });
                    }
                }
                break;
                
            case "playerMove":
            case "botMove":
                if (room) {
                    room.gameState.turnOrder.lastGameBoardFen = messageJson.fen;
                    room.gameState.turnOrder.centipawns = messageJson.centipawns;
                    // Increment turn index
                    room.gameState.turnOrder.turnOrderIndex = (room.gameState.turnOrder.turnOrderIndex + 1) % room.gameState.turnOrder.order.length;
                    room.gameState.turnOrder.turnNum++;
                    room.gameState.turnOrder.serverTimestamp = Date.now();

                    room.broadcast({
                        requestType: messageJson.requestType,
                        moveObj: messageJson,
                        turnOrder: room.gameState.turnOrder
                    });
                    
                    // Check if next is a robot
                    room.checkAndTriggerRobotTurn();
                }
                break;

            case "readyUp":
                if (room) {
                    room.readyUsers.add(ws.user.userid);
                    room.broadcastStatus();
                    room.resumeIfReady();
                }
                break;

            case "turnOrderUpdate":
                if (room) {
                    room.gameState.turnOrder = messageJson.turnOrder;
                    room.gameState.turnOrder.serverTimestamp = Date.now();
                    room.pauseGame();
                    room.broadcast({
                        requestType: "turnOrderUpdate",
                        turnOrder: room.gameState.turnOrder
                    });
                }
                break;

            case "resetBoard":
                if (room) {
                    room.gameState.turnOrder.lastGameBoardFen = START_FEN;
                    room.gameState.turnOrder.turnNum = 0;
                    room.gameState.turnOrder.turnOrderIndex = 0;
                    room.gameState.turnOrder.centipawns = 0;
                    room.pauseGame(); // Trigger global pause
                    room.broadcast({
                        requestType: "resetBoard",
                        moveObj: messageJson,
                        turnOrder: room.gameState.turnOrder
                    });
                }
                break;

            case "undoMove":
                if (room) {
                    room.gameState.turnOrder.lastGameBoardFen = messageJson.fen;
                    room.gameState.turnOrder.centipawns = messageJson.centipawns || 0;
                    room.gameState.turnOrder.turnOrderIndex = messageJson.turnOrderIndex;
                    room.gameState.turnOrder.turnNum = messageJson.turnNum;
                    room.pauseGame();
                    room.broadcast({
                        requestType: "undoMove",
                        fen: messageJson.fen,
                        centipawns: messageJson.centipawns || 0,
                        turnOrderIndex: messageJson.turnOrderIndex,
                        turnNum: messageJson.turnNum
                    }, ws.user.userid);
                }
                break;

            case "setBotDifficulty":
                if (room) {
                    room.gameState.botDifficulty = messageJson.difficulty;
                    room.broadcast({
                        requestType: "setBotDifficulty",
                        difficulty: messageJson.difficulty
                    });
                }
                break;
        }
    });

    ws.on('close', function () {
        if (ws.user.isSuperseded) return;

        const room = rooms.get(ws.user.roomId);
        if (!room) return;

        room.broadcast({
            requestType: "playerDisconnectWarning",
            userid: ws.user.userid,
            disconnectTime: Date.now()
        }, ws.user.userid);

        ws.user.disconnectTimeout = setTimeout(() => {
            room.removeUser(ws.user.userid);
            room.broadcast({
                requestType: "playerDisconnect",
                userid: ws.user.userid,
                turnOrder: room.gameState.turnOrder
            });
            room.broadcastStatus();
        }, 15000);
    });
});

function handleInitRoom(ws, messageJson) {
    const roomId = messageJson.roomId || uniqid();
    ws.user.roomId = roomId;

    if (!rooms.has(roomId)) {
        rooms.set(roomId, new Room(roomId));
    }
    const room = rooms.get(roomId);

    // Identity adoption logic
    if (messageJson.myUsers && messageJson.myUsers.length > 0) {
        for (const savedUser of messageJson.myUsers) {
            const existingWs = room.users.get(savedUser.userid);
            if (existingWs) {
                console.log(`Reclaiming session for user ${savedUser.userid}`);
                if (existingWs.user.disconnectTimeout) {
                    clearTimeout(existingWs.user.disconnectTimeout);
                    existingWs.user.disconnectTimeout = null;
                }
                
                // Adopt the old identity
                ws.user.userid = existingWs.user.userid;
                ws.user.username = existingWs.user.username;
                ws.user.avatarUrl = existingWs.user.avatarUrl;

                // Mark the old connection as superseded so its 'close' event doesn't trigger a removal
                existingWs.user.isSuperseded = true;
                if (existingWs.readyState === WebSocket.OPEN || existingWs.readyState === WebSocket.CONNECTING) {
                    existingWs.terminate();
                }
                break;
            }
        }
    }

    room.addUser(ws);
    room.broadcastStatus();
    
    ws.send(JSON.stringify({
        requestType: "init",
        myId: ws.user.userid,
        myUsername: ws.user.username,
        turnOrder: room.gameState.turnOrder,
        allUsers: Array.from(room.users.values()).map(u => ({
            userid: u.user.userid,
            username: u.user.username,
            avatarUrl: u.user.avatarUrl,
            roomId: u.user.roomId
        })),
        roomId: room.id,
        botDifficulty: room.gameState.botDifficulty,
        status: room.gameState.status,
        centipawns: room.gameState.turnOrder.centipawns
    }));
}

function safeParseJson(str) {
    try {
        return JSON.parse(str);
    } catch (e) {
        return null;
    }
}
