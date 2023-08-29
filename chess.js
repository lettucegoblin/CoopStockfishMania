const https = require('https');
const http = require('http');
const express = require('express');
const app = express();
const path = require('path');

const fs = require('fs');
const WebSocket = require('ws');
var uniqid = require('uniqid');
const { type } = require('os');
const randomAnimalName = require('random-animal-name')
const randomAvatarGenerator = require("random-avatar-generator")

const avaGenerator = new randomAvatarGenerator.AvatarGenerator()
// config file
const config = require('./config.json');
certFileLocation = config.certFileLocation;
keyFileLocation = config.keyFileLocation;
port = config.port;

// Serve static files from the "public" directory
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

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

server.listen(port, "127.0.0.1", () => {
    console.log(`Server running at http://127.0.0.1:${port}/`);
});


const wss = new WebSocket.Server({ server });

var rooms = {}

wss.on('connection', function connection(ws, request, client) {
    console.log('new con',request.cookie)
    ws.on('message', function incoming(message) {
        var messageJson = getJsonString(message);
        console.log(messageJson)
        switch(messageJson.requestType){
            case "playerMove":
            case "botMove":
                rooms[ws.user.roomId].gameState.turnOrder.lastGameBoardFen = messageJson.fen
                rooms[ws.user.roomId].gameState.turnOrder.centipawns =  messageJson.centipawns
                wss.clients.forEach(function each(client) {
                    if (client.readyState === WebSocket.OPEN && client.user.userid !== ws.user.userid && client.user.roomId == ws.user.roomId) {
                        var payload = {
                            requestType: messageJson.requestType,
                            moveObj: messageJson,
                        }
                        var data = JSON.stringify(payload);
                        client.send(data);
                    }
                });
                break;
            case "initRoom":
                if(messageJson.roomId == null)
                    ws.user.roomId = uniqid()
                else
                    ws.user.roomId = messageJson.roomId
                if(rooms[ws.user.roomId] == undefined) {
                    rooms[ws.user.roomId] = {
                        users: {},
                        gameState: {
                            turnOrder: {
                                order: [ws.user.userid, "robot"],
                                serverTimestamp: Date.now(),
                                turnNum: 0,
                                turnOrderIndex: 0,
                                lastGameBoardFen: undefined,
                                centipawns: 0
                            }
                        }
                    }
                }
                //user rejoins w/ id  -> 
                //  clear timeout
                //  send playerReconnect
                //  --- in future, should have a secret id sent when making session for auth
                var isReconnect = false;
                var theirUsers = []
                if(messageJson.myUsers != null){
                    for(var i in messageJson.myUsers){
                        var user = messageJson.myUsers[i]
                        var userIsInRoom = rooms[ws.user.roomId].users[user.userid] != undefined
                        if(!userIsInRoom) continue;
                        theirUsers.push(user)
                        var userHasDisconnected = rooms[ws.user.roomId].users[user.userid].disconnect != null
                        console.log(userIsInRoom, userHasDisconnected)
                        if(userIsInRoom && userHasDisconnected){
                            clearTimeout(rooms[ws.user.roomId].users[user.userid].disconnect.timeout)
                            delete rooms[ws.user.roomId].users[user.userid].disconnect
                            ws.user.userid = user.userid
                            ws.user.username = user.username
                            isReconnect = true
                        }
                    }
                }
                ws.user['avatarUrl'] = avaGenerator.generateRandomAvatar(ws.user.username)
                rooms[ws.user.roomId].users[ws.user.userid] = ws.user
                var userArr = []
                var clients = Array.from(wss.clients)
                for(i in clients){
                    var client = clients[i]
                    if (client.readyState === WebSocket.OPEN && client.user.roomId == ws.user.roomId){
                        userArr.push(client.user)
                        if(client.user.userid !== ws.user.userid) {
                            //notify everyone else of my existance
                            var payload = {
                                requestType: "newClient",
                                isReconnect: isReconnect,
                                newClient: ws.user
                            }
                            var data = JSON.stringify(payload);
                            client.send(data);
                        }
                    }
                }
                var payload = {
                    requestType: "init",
                    myId: ws.user.userid,
                    myUsername: ws.user.username,
                    turnOrder: rooms[ws.user.roomId].gameState.turnOrder,
                    allUsers: userArr,
                    roomId: ws.user.roomId,
                    theirUsers: theirUsers,
                    centipawns: rooms[ws.user.roomId].gameState.turnOrder.centipawns
                }
                ws.send(JSON.stringify(payload));
                break;
            case "turnOrderUpdate":
                turnOrderUpdate(messageJson.requestType, messageJson.turnOrder, ws, wss)
                
                break;
            case "resetBoard":
                rooms[ws.user.roomId].gameState.turnOrder.lastGameBoardFen = undefined
                rooms[ws.user.roomId].gameState.turnOrder.turnNum = 0
                rooms[ws.user.roomId].gameState.turnOrder.turnOrderIndex = 0
                //turnNum
                wss.clients.forEach(function each(client) {
                    if (client.readyState === WebSocket.OPEN && client.user.roomId == ws.user.roomId) {
                        var payload = {
                            requestType: messageJson.requestType,
                            moveObj: messageJson,
                        }
                        var data = JSON.stringify(payload);
                        client.send(data);
                    }
                });
                break;
        }
        
    })
    function turnOrderUpdate(requestType, turnOrder, ws, wss){
        rooms[ws.user.roomId].gameState.turnOrder = turnOrder
        rooms[ws.user.roomId].gameState.turnOrder.serverTimestamp = Date.now()

        wss.clients.forEach(function each(client) {
            if (client.readyState === WebSocket.OPEN && client.user.roomId == ws.user.roomId) {
                var payload = {
                    requestType: requestType,
                    turnOrder: rooms[ws.user.roomId].gameState.turnOrder
                }
                var data = JSON.stringify(payload);
                client.send(data);
            }
        });
    }
    ws.on('close', function incoming() {
        console.log('con closed', ws.user.userid)

        //send playerDisconnectWarning ->
        //  ws.user.disconnected = settimeout 
        //  send timestamp, userid
        ws.user.disconnect = {
            disconnectTime: Date.now(),
            timeout: setTimeout(function () {
                //timeout hits
                //  remove user from turnorder
                //  delete user from room
                //  send playerDisconnect
                //      userid
                var newOrder = []
                for(var i = 0; i < rooms[ws.user.roomId].gameState.turnOrder.order.length; i++){
                    if(rooms[ws.user.roomId].gameState.turnOrder.order[i] !== ws.user.userid){
                        newOrder.push(rooms[ws.user.roomId].gameState.turnOrder.order[i])
                    } 
                }
                rooms[ws.user.roomId].gameState.turnOrder.order = newOrder
                rooms[ws.user.roomId].gameState.turnOrder.serverTimestamp = Date.now()

                delete rooms[ws.user.roomId].users[ws.user.userid]
                wss.clients.forEach(function each(client) {
                    if (client.readyState === WebSocket.OPEN && client.user.roomId == ws.user.roomId) {
                        var payload = {
                            requestType: "playerDisconnect",
                            userid: ws.user.userid,
                            turnOrder: rooms[ws.user.roomId].gameState.turnOrder
                        }
                        var data = JSON.stringify(payload);
                        client.send(data);
                    }
                });
                
            }.bind(this), 10000)
        }
        wss.clients.forEach(function each(client) {
            if (client.readyState === WebSocket.OPEN && client.user.userid !== ws.user.userid && client.user.roomId == ws.user.roomId) {
                var payload = {
                    requestType: "playerDisconnectWarning",
                    userid: ws.user.userid,
                    disconnectTime: ws.user.disconnect.disconnectTime
                }
                var data = JSON.stringify(payload);
                client.send(data);
            }
        });
        
    });

    ws.user = {
        userid: uniqid(),
        username: randomAnimalName()
    }
    
    
});

function getJsonString(str) {
    try {
        return JSON.parse(str);
    } catch (e) {
        return false;
    }
}