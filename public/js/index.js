	var playerDiv = document.getElementById('players')
	var networkSync = {
		myId: undefined,
		roomId: undefined,
		userIds: [],
		players: {},
		robots: {},
		turnOrder: {
			turnOrderIndex: 0,
			order: [],
			serverTimestamp: 0,
			turnNum: 0
		},
		centipawns: 0,
        status: "active"
	}

	var myId = 1234
	var botDifficulty = 10; // Fallback default
	var editingRobotId = null;

	var robots = {
		'robot_base': {
			name: 'Stockfish Bot',
			id: 'robot_base',
			level: 10
		}
	};

	function initPlayers(){
        $(playerDiv).empty()
		for(robotId in robots){
			addRobotAva(robots[robotId])
		}
		for(userid in networkSync.players){
			addPlayerAva(userid)
		}
	}
	function updateTurnOrderUI(){
		$(turnOrderDiv).empty()
		console.log(networkSync.turnOrder)
		for(var i = 0; i < networkSync.turnOrder.order.length; i++){
			var userid = networkSync.turnOrder.order[i]
			if(userid.startsWith('robot')){
                // Format: robot_10_uniqueid or robot_10
                var parts = userid.split('_');
                var level = parts[1] || 10;
                
                var botEl = robots['robot_base'].avatarDiv.cloneNode(true);
                $(botEl).attr('data-id', userid);
                $(botEl).find('.botLevel').text('Lvl ' + level);
                $(botEl).find('.gearIcon').show().click((function(uid) {
                    return function(e) {
                        e.stopPropagation();
                        editingRobotId = uid;
                        document.getElementById('difficultyModal').style.display = 'block';
                        var currentLevel = uid.split('_')[1] || 10;
                        document.getElementById('difficultySlider').value = currentLevel;
                        document.getElementById('difficultyValue').textContent = 'Level: ' + currentLevel;
                    }
                })(userid));
				turnOrderDiv.appendChild(botEl)
			} else{
                if(networkSync.players[userid]){
				    turnOrderDiv.appendChild(networkSync.players[userid].avatarDiv.cloneNode(true))
                }
			}
		}
		updateTurnOrderHighlight()
	}

	function addRobotAva(robot){
		var avatarRim = document.createElement('div')
		var playerName = document.createElement('div')
		var gearIcon = document.createElement('div')
        var botLevel = document.createElement('div')

		avatarRim.classList.add('avatarRim','robotIcon')
        avatarRim.style.filter = "hue-rotate(280deg) saturate(1.5) contrast(1.2)" // Redden eyes/look
		playerName.classList.add('playerName')
		gearIcon.classList.add('gearIcon')
        botLevel.classList.add('botLevel')

		playerName.innerText = robot.name
        botLevel.innerText = "Lvl " + robot.level
		$(avatarRim).attr('data-id', robot.id)
		avatarRim.appendChild(playerName)
		avatarRim.appendChild(gearIcon)
        avatarRim.appendChild(botLevel)
		robot.avatarDiv = avatarRim
		playerDiv.appendChild(avatarRim)
	}
	function addPlayerAva(userid){
		var avatarRim = document.createElement('div')
		var playerName = document.createElement('div')
		var disconnectText = document.createElement('div')
        var readyIndicator = document.createElement('div')
		
		disconnectText.classList.add('disconnectText')
		avatarRim.classList.add('avatarRim','playerIcon')
        readyIndicator.classList.add('readyIndicator')
        playerName.classList.add('playerName')
        disconnectText.innerText = 'DISCONNECTED'

		if(userid == networkSync.myId) {
			avatarRim.classList.add('myPlayerIcon')
            playerName.innerText = networkSync.players[userid].username + ' (you)'
        } else {
            playerName.innerText = networkSync.players[userid].username
        }
		networkSync.players[userid].avatarDiv = avatarRim
		avatarRim.style.backgroundImage = 'url('+networkSync.players[userid].avatarUrl+')'
		$(avatarRim).attr('data-id', userid)
		avatarRim.appendChild(disconnectText)
        avatarRim.appendChild(readyIndicator)
		avatarRim.appendChild(playerName)
		playerDiv.appendChild(avatarRim)

        if(userid == networkSync.myId) {
            $(playerName).css('cursor', 'pointer').attr('title', 'Click to rename').click(function(e) {
                e.stopPropagation();
                var newName = prompt("Enter your new name:", networkSync.players[userid].username);
                if (newName && newName.trim() !== "") {
                    // We need a way to tell the server we changed our name.
                    socket.send(JSON.stringify({requestType: "rename", username: newName.trim()}));
                    // The server needs to handle 'rename' and update all clients.
                }
            });
        }
	}

	// Create WebSocket connection.
	let socket = null;
	port = window.location.port
	websocketSecurity = window.location.protocol == 'http:' ? 'ws' : 'wss'
	let wsPath = port ? `${websocketSecurity}://${window.location.hostname}:${port}` : `${websocketSecurity}://${window.location.hostname}${window.location.pathname}`;
	socket = new WebSocket(wsPath);

    socket.addEventListener('open', function (event) {
    	var urlParams = new URLSearchParams(window.location.search);
    	var potentialRoomId = urlParams.get('room')
    	networkSync.roomId = potentialRoomId
    	var payload = {
    		requestType: 'initRoom',
    		roomId: potentialRoomId,
    		myUsers: JSON.parse(localStorage.getItem('myUsers')) || []
    	}
    	socket.send(JSON.stringify(payload));
    });
    function cullUsersInStorage(users){
    	if(users){
    		localStorage.setItem('myUsers', JSON.stringify(users))
    	}
    }
    function addUserToStorage(id, username){
    	var myUsers = JSON.parse(localStorage.getItem('myUsers')) || []
    // Avoid duplicates
    if (!myUsers.some(u => u.userid === id)) {
    	    myUsers.push({
    		    userid: id,
    		    username: username
    	    })
    // Keep only last 5 sessions to avoid bloat
    if (myUsers.length > 5) myUsers.shift();
    	    localStorage.setItem('myUsers', JSON.stringify(myUsers))
    }
    }
    socket.addEventListener('message', function (event) {
    var payload = JSON.parse(event.data)
    	var directive = payload.requestType
    	switch(directive){
    		case "playerMove":
    case "botMove":
    			networkSync.turnOrder = payload.turnOrder
    			networkMove(payload.moveObj.moveObj, payload.moveObj.fen)
    			updateTurnOrderHighlight()
    			setCentipawn(payload.moveObj.centipawns)
    			break;
    		case "init":
    			if( networkSync.roomId != payload.roomId ){
    				networkSync.roomId = payload.roomId
    				const url = new URL(window.location);
    				url.searchParams.set('room', networkSync.roomId);
    				window.history.pushState({}, '', url);
    			}
    			networkSync.myId = payload.myId;
    			networkSync.roomId = payload.roomId
    			networkSync.turnOrder = payload.turnOrder
    networkSync.status = payload.status

    addUserToStorage(payload.myId, payload.myUsername);

    // Fix: Properly populate networkSync.players and userIds
                networkSync.userIds = []
                networkSync.players = {}
                for(index in payload.allUsers){
					var user = payload.allUsers[index]
					networkSync.userIds.push(user.userid)
					networkSync.players[user.userid] = user
				}

				initPlayers()
				updateTurnOrderUI()
				initBoard()
				setCentipawn(payload.centipawns)
                $('#undoButton, #flipBoardButton').show()

                // Trigger robot move if it's currently a robot's turn
                if(getCurrentTurn() == 'robot' && networkSync.status === "active"){
                    doRobotMove(game.fen(), botDifficulty)
                }
				break;
			case "setBotDifficulty":
				updateStockfishDifficulty(payload.difficulty)
				document.getElementById('difficultySlider').value = payload.difficulty
				document.getElementById('difficultyValue').textContent = 'Level: ' + payload.difficulty
				break;
			case "turnOrderUpdate":
				networkSync.turnOrder = payload.turnOrder
				updateTurnOrderUI()
				break;
			case "newClient":
				var userid = payload.newClient.userid
				$(".avatarRim.playerDisconnected[data-id='"+userid+"']" ).removeClass('playerDisconnected')
				if(networkSync.userIds.indexOf(userid) < 0){
					networkSync.userIds.push(userid)
					networkSync.players[userid] = payload.newClient
					addPlayerAva(userid)
				}
				break;
			case "playerDisconnectWarning":
				$(".avatarRim[data-id='"+payload.userid+"']" ).addClass('playerDisconnected')
				break;
			case "playerDisconnect":
				var delIndex = networkSync.userIds.indexOf(payload.userid)
				if(delIndex > -1){
					$(".avatarRim[data-id='"+payload.userid+"']").remove()
					delete networkSync.players[payload.userid]
					networkSync.userIds.splice(delIndex, 1)
				}
				networkSync.turnOrder = payload.turnOrder
				updateTurnOrderUI()
				break;
			case "resetBoard":
				networkSync.turnOrder = payload.turnOrder || networkSync.turnOrder
				resetBoard()
				break;
			case "undoMove":
				if(payload.fen){
					game.load(payload.fen)
				} else {
					game.undo()
				}
				board.position(game.fen())
				setCentipawn(payload.centipawns || 0)
				networkSync.turnOrder.turnOrderIndex = payload.turnOrderIndex
				networkSync.turnOrder.turnNum = payload.turnNum
				updateTurnOrderHighlight()
				checkGameOver()
				break;
            case "gameStatusUpdate":
                networkSync.status = payload.status
                updateGameStatusUI(payload)
                break;
            case "triggerRobotMove":
                if(networkSync.status === "active"){
                    doRobotMove(payload.fen, payload.difficulty)
                }
                break;
		}
    });

    function updateGameStatusUI(payload){
        if(payload.status === "paused"){
            $('#pauseOverlay').show()
        } else {
            $('#pauseOverlay').hide()
        }
        // Update ready indicators
        $('.readyIndicator').removeClass('isReady')
        payload.readyUsers.forEach(uid => {
            $(`.avatarRim[data-id="${uid}"] .readyIndicator`).addClass('isReady')
        })

        // Synchronize player list and clear disconnect warnings
        if (payload.allUsers) {
            var changed = false;
            payload.allUsers.forEach(u => {
                // Clear disconnect warning
                $(`.avatarRim[data-id="${u.userid}"]`).removeClass('playerDisconnected');
                
                // Add missing players to local state
                if (!networkSync.players[u.userid]) {
                    networkSync.players[u.userid] = u;
                    if (networkSync.userIds.indexOf(u.userid) === -1) {
                        networkSync.userIds.push(u.userid);
                    }
                    changed = true;
                }
            });

            if (changed) {
                initPlayers();
                updateTurnOrderUI();
            }
        }
    }

	function initBoard(){
		if(networkSync.turnOrder.lastGameBoardFen){
			game.load(networkSync.turnOrder.lastGameBoardFen)
			board.position(game.fen())
		}
	}

	function networkMove(moveObj, fen){
		game.move(moveObj)
		if(game.fen() !== fen){
			game.load(fen)
		}
		board.position(game.fen())
		checkGameOver()
	}

	var gameOverTimeout = null

	function checkGameOver() {
		var gameOverDiv = document.getElementById('gameOver')
		var gameOverText = document.getElementById('gameOverText')
        var endOverlay = document.getElementById('endGameOverlay')
        var endTitle = document.getElementById('endGameTitle')
        var endDesc = document.getElementById('endGameDescription')

		if (game.game_over()) {
			var title = 'Game Over'
            var description = ''

			if (game.in_checkmate()) {
				var winner = game.turn() === 'w' ? 'Black' : 'White'
                title = 'Checkmate!'
				description = winner + ' wins'
			} else if (game.in_draw()) {
                title = 'Draw'
				description = 'Agreement or 50-move rule'
			} else if (game.in_stalemate()) {
                title = 'Stalemate'
				description = 'No legal moves'
			} else if (game.in_threefold_repetition()) {
                title = 'Draw'
				description = 'Threefold repetition'
			} else if (game.insufficient_material()) {
                title = 'Draw'
				description = 'Insufficient material'
			}

            // Update Overlay
            endTitle.textContent = title
            endDesc.textContent = description
            $(endOverlay).css('display', 'flex')

			gameOverText.textContent = title + " - " + description
			if (gameOverTimeout) {
				clearTimeout(gameOverTimeout)
			}
			gameOverDiv.classList.remove('hide')
			gameOverDiv.classList.add('show')
			gameOverTimeout = setTimeout(function() {
				gameOverDiv.classList.remove('show')
				gameOverDiv.classList.add('hide')
			}, 5000)

            // Auto-restart logic
            if (document.getElementById('autoRestartCheckbox').checked) {
                console.log("Auto-restarting game in 5 seconds...");
                setTimeout(function() {
                    if (game.game_over()) {
                        socket.send(JSON.stringify({requestType: 'resetBoard', autoRestart: true}));
                    }
                }, 5000);
            }
		} else {
            $(endOverlay).hide()
			gameOverDiv.classList.remove('show')
			gameOverDiv.classList.add('hide')
		}
	}
	
	var turnOrderDiv = document.getElementById('turnOrder')
	var playersSortable = new Sortable(playerDiv, {
		group: {
			name: 'shared',
			pull: 'clone'
		},
		onAdd: function(e){
			$(e.item).remove()
		},
		animation: 150
	});

	function sendTurnOrderUpdate(){
		networkSync.turnOrder.order = turnOrderSortable.toArray()
		if(networkSync.turnOrder.turnOrderIndex >= networkSync.turnOrder.order.length){
			networkSync.turnOrder.turnOrderIndex = 0
		}
		var payload = {
			requestType: 'turnOrderUpdate',
			turnOrder: networkSync.turnOrder
		}
		socket.send(JSON.stringify(payload));
	}
	var turnOrderSortable = new Sortable(turnOrderDiv, {
		group: {
			name: 'shared',
			pull: true
		},
		dataIdAttr: 'data-id',
		onAdd: function(e){
            var item = e.item;
            if ($(item).attr('data-id') === 'robot_base') {
                var uniqueId = 'robot_10_' + Math.floor(Math.random() * 1000000);
                $(item).attr('data-id', uniqueId);
            }
			sendTurnOrderUpdate()
			updateTurnOrderHighlight()
		}, 
		onUpdate: function (evt) {
			sendTurnOrderUpdate()
			updateTurnOrderHighlight()
		},
		onRemove: function (evt) {
			sendTurnOrderUpdate()
			updateTurnOrderHighlight()
		},
		onChoose: function (evt) {
			$(playerDiv).addClass('deletePlayerOverlay')
		},
		onUnchoose: function(evt) {
			$(playerDiv).removeClass('deletePlayerOverlay')
		},
		animation: 150
	});
	function resizeboard(){
		var wrapper = document.getElementById('boardWrapper')
        var boardWidth = Math.min(wrapper.clientWidth - 50, wrapper.clientHeight - 20)
		boardDiv.style.width = boardWidth + 'px'
		board.resize()
		$('#evalBar').css('height', $('#myBoard > div')[0].clientHeight - 14)
	}
	var boardDiv = document.getElementById('myBoard')
	var board = null
	var game = new Chess()
	var stockfish = STOCKFISH();
	
	stockfish.onmessage = function(event) {
		var match = event.match(/^bestmove ([a-h][1-8])([a-h][1-8])([qrbn])?/);
		if(match){
			var delayDiff = Date.now() - chessDelay;
			delayDiff = Math.max(0, 1000 - delayDiff)
			setTimeout(function(){
				var moveObj = {from: match[1], to: match[2], promotion: match[3]}
				var move = game.move(moveObj);
                if (move) {
				    notifyMove(moveObj, false)
				    board.position(game.fen())
				    checkGameOver()
                } else {
                    console.error("Stockfish suggested illegal move or failed:", moveObj)
                }
			}, delayDiff)
		}else if(event.indexOf('info depth') == 0){
			var arr = event.split(' ')
			var centipawnsMarker = arr.indexOf('cp')
			if(centipawnsMarker != -1){
				var centipawns = arr[centipawnsMarker + 1]
				if(game.turn() == 'b'){
					if(centipawns != 0)
						centipawns *= -1
				}
				setCentipawn(centipawns)
			}
		}
	};
	function setCentipawn(centipawns){
		if(centipawns >= 0){
			$('#centipawns').addClass('whiteSide')
		} else{
			$('#centipawns').removeClass('whiteSide')
		}
		var pawns = centipawns / 100;
		var percentPerPawn = 50 - pawns * 2;
		$('#blackBar').css('height', percentPerPawn + '%')
		$('#centipawns').text(pawns.toFixed(2))
		networkSync.centipawns = centipawns
	}
	var chessDelay = 0;

    function doRobotMove(fen, difficulty){
        allowDoubleMoves()
        chessDelay = Date.now()
        // Update Stockfish to this robot's specific difficulty before making the move
		var maxError = difficulty < 10 ? 1000 - (difficulty * 50) : 500 - ((difficulty - 10) * 40)
		stockfish.postMessage("setoption name Skill Level value " + difficulty)
		stockfish.postMessage('setoption name Skill Level Maximum Error value ' + maxError)
		stockfish.postMessage('setoption name Skill Level Probability value ' + Math.max(1, difficulty))

        stockfish.postMessage("position fen " + fen)
        stockfish.postMessage("go depth 1");
    }

	function notifyMove(moveObj, isPlayer = true){
		if(++networkSync.turnOrder.turnOrderIndex >= turnOrderSortable.toArray().length)
			networkSync.turnOrder.turnOrderIndex = 0
		var payload = {
			turnNum: ++networkSync.turnOrder.turnNum,
			turnOrderIndex: networkSync.turnOrder.turnOrderIndex,
            requestType: isPlayer ? "playerMove" : "botMove",
			moveObj: moveObj,
			fen: game.fen(),
			centipawns: networkSync.centipawns
        }
        socket.send(JSON.stringify(payload))
		updateTurnOrderHighlight()
	}

	function onDragStart (source, piece, position, orientation) {
		if (game.game_over() || networkSync.status === "paused") return false
		var isWhiteTurn = networkSync.turnOrder.turnOrderIndex % 2 == 0
		var piecePickedUpIsBlack = piece.search(/^b/) !== -1
		if ( (isWhiteTurn && piecePickedUpIsBlack) || (!isWhiteTurn && !piecePickedUpIsBlack) ) return false 
		if(networkSync.myId != getCurrentTurn()) return false
	}

	function allowDoubleMoves(){
		var isWhiteTurn = networkSync.turnOrder.turnOrderIndex % 2 == 0
		var gameStateIsWhite = game.turn() == "w"  
		if( (!isWhiteTurn && gameStateIsWhite) || (isWhiteTurn && !gameStateIsWhite)){
			var arr = game.fen().split(' ')
			arr[1] = isWhiteTurn ? 'w' : 'b'
			arr[3] = '-'
			var newfen = arr.join(' ')
			board.position(newfen)
			game.load(newfen)
		}
	}

	function onDrop (source, target) {
		var moveObj = {
			from: source,
			to: target,
			promotion: 'q'
		}
		allowDoubleMoves()
		var move = game.move(moveObj)
		if (move === null) return 'snapback'
		notifyMove(moveObj)
		updateTurnOrderHighlight()
		checkGameOver()
	}

	function onSnapEnd () {
	  board.position(game.fen())
	}
	function onMoveEnd(){
		updateTurnOrderHighlight()
	}
	function getCurrentTurn(){
		var userIdArr = turnOrderSortable.toArray()
		var currentTurn =  networkSync.turnOrder.turnOrderIndex % userIdArr.length
		return userIdArr[currentTurn];
	}

	function updateTurnOrderHighlight(){
		$(".avatarRim.currentTurn").removeClass('currentTurn')
		$('#turnOrder .avatarRim:nth-child('+(networkSync.turnOrder.turnOrderIndex+1)+')').addClass('currentTurn')

        // Highlight board rim if it's my turn
        if (getCurrentTurn() === networkSync.myId) {
            $('#myBoard').addClass('myTurnHighlight');
        } else {
            $('#myBoard').removeClass('myTurnHighlight');
        }
	}

	var boardConfig = {
	  draggable: true,
	  position: 'start',
	  onDragStart: onDragStart,
	  onDrop: onDrop,
	  onSnapEnd: onSnapEnd,
	  onMoveEnd: onMoveEnd,
	  pieceTheme: 'img/chesspieces/wikipedia/{piece}.png'
	}
	
	board = Chessboard('myBoard', boardConfig)
	stockfish.postMessage("uci")

	function updateStockfishDifficulty(level) {
		botDifficulty = level
        $('.robotIcon .botLevel').text("Lvl " + level)
		stockfish.postMessage("setoption name Skill Level value " + level)
		var maxError = level < 10 ? 1000 - (level * 50) : 500 - ((level - 10) * 40)
		stockfish.postMessage('setoption name Skill Level Maximum Error value ' + maxError)
		stockfish.postMessage('setoption name Skill Level Probability value ' + Math.max(1, level))
	}

	updateStockfishDifficulty(botDifficulty)
	$(window).resize(resizeboard)
	resizeboard()

	function resetBoard(){
		game.reset()
		board.position(game.fen())
		networkSync.turnOrder.turnOrderIndex = 0
		networkSync.turnOrder.turnNum = 0
        networkSync.turnOrder.lastGameBoardFen = game.fen() // Ensure we have a start FEN
		updateTurnOrderUI()
        updateTurnOrderHighlight() // Reset highlight to White (index 0)
		setCentipawn(0)
		checkGameOver()
	}
	$('#restartGame, .restartBtn').click(function(){
		socket.send(JSON.stringify({requestType: 'resetBoard'}));
	})

	$('#flipBoardButton').click(function(){
		board.flip();
	})

	$('#undoButton').click(function(){
		let history = game.history();
		if (history.length === 0) return;

		let orderArray = turnOrderSortable.toArray();
		let toIndex = networkSync.turnOrder.turnOrderIndex;
		let tNum = networkSync.turnOrder.turnNum;

		// Undo at least one move
		game.undo();
		if (--toIndex < 0) toIndex = orderArray.length - 1;
		tNum--;

		// Keep undoing if the current turn belongs to a robot
		while (orderArray[toIndex] && orderArray[toIndex].startsWith('robot') && game.history().length > 0) {
			game.undo();
			if (--toIndex < 0) toIndex = orderArray.length - 1;
			tNum--;
		}

		var payload = {
			requestType: 'undoMove',
			fen: game.fen(),
			centipawns: 0,
			turnOrderIndex: toIndex,
			turnNum: tNum
		};
		socket.send(JSON.stringify(payload));
		updateTurnOrderHighlight();
	})

    $('#readyButton').click(function(){
        socket.send(JSON.stringify({requestType: 'readyUp'}))
    })

	$('#tutorialButton').click(function(){
		tour.start()
	})

	var modal = document.getElementById('difficultyModal')
	var closeBtn = document.querySelector('.close')
	var slider = document.getElementById('difficultySlider')
	var valueDisplay = document.getElementById('difficultyValue')
	var saveBtn = document.getElementById('saveDifficulty')

	closeBtn.onclick = function() { modal.style.display = 'none' }
	window.onclick = function(event) { if (event.target == modal) modal.style.display = 'none' }
	slider.oninput = function() { valueDisplay.textContent = 'Level: ' + this.value }
	saveBtn.onclick = function() {
	    var newLevel = parseInt(slider.value);
	    if (editingRobotId) {
	        var parts = editingRobotId.split('_');
	        parts[1] = newLevel;
	        var newId = parts.join('_');

	        var orderArray = networkSync.turnOrder.order;
	        var idx = orderArray.indexOf(editingRobotId);
	        if (idx !== -1) {
	            orderArray[idx] = newId;
	            var payload = {
	                requestType: 'turnOrderUpdate',
	                turnOrder: networkSync.turnOrder
	            };
	            socket.send(JSON.stringify(payload));
	        }
	    }
	    socket.send(JSON.stringify({requestType: "readyUp"}));
	    modal.style.display = 'none'
	}
