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
		centipawns: 0
	}

	var myId = 1234

	var robots = {
		412412:{
			name: 'Robottington Fernandlet',
			avatarImg: '',
			id: 412412
		}
	}
	var defaultRobot = undefined
	function initPlayers(){
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
			if(userid == 'robot'){
				turnOrderDiv.appendChild(defaultRobot.cloneNode(true))
			} else{
				turnOrderDiv.appendChild(networkSync.players[userid].avatarDiv.cloneNode(true))
			}
			
			
		}
		$('#turnOrder .avatarRim .gearIcon').click(function(e){
			console.log('clciky', e)
		})
		updateTurnOrderHighlight()
		//turnOrderDiv.appendChild(defaultRobot.cloneNode(true))
	}

	function addRobotAva(robot){
		var avatarRim = document.createElement('div')
		var playerName = document.createElement('div')
		var gearIcon = document.createElement('div')

		avatarRim.classList.add('avatarRim','robotIcon')
		playerName.classList.add('playerName')
		gearIcon.classList.add('gearIcon')

		playerName.innerText = robot.name
		$(avatarRim).attr('data-id', 'robot')
		avatarRim.appendChild(playerName)
		avatarRim.appendChild(gearIcon)
		defaultRobot = avatarRim
		playerDiv.appendChild(avatarRim)
	}
	function addPlayerAva(userid){
		var avatarRim = document.createElement('div')
		var playerName = document.createElement('div')
		var disconnectText = document.createElement('div')
		
		disconnectText.classList.add('disconnectText')
		avatarRim.classList.add('avatarRim','playerIcon')
		if(userid == networkSync.myId)
			avatarRim.classList.add('myPlayerIcon')
		playerName.classList.add('playerName')

		disconnectText.innerText = 'DISCONNECTED'
		playerName.innerText = networkSync.players[userid].username
		networkSync.players[userid].avatarDiv = avatarRim
		avatarRim.style.backgroundImage = 'url('+networkSync.players[userid].avatarUrl+')'
		$(avatarRim).attr('data-id', userid)
		avatarRim.appendChild(disconnectText)
		avatarRim.appendChild(playerName)
		playerDiv.appendChild(avatarRim)
	}

	// Create WebSocket connection.
	let socket = null;
	port = window.location.port
	websocketSecurity = window.location.protocol == 'http:' ? 'ws' : 'wss' 
	socket = new WebSocket(`${websocketSecurity}://${window.location.hostname}:${port}`);
	// example ws://yourwebsite.com:42000

    // Connection opened
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
			//var myUsers = JSON.parse(localStorage.getItem('myUsers')) || []
			localStorage.setItem('myUsers', JSON.stringify(users))
		}
		
	}
	function addUserToStorage(id, username){
		var myUsers = JSON.parse(localStorage.getItem('myUsers')) || []

		myUsers.push({
			userid: id,
			username: username
		})
		localStorage.setItem('myUsers', JSON.stringify(myUsers))
	}
    socket.addEventListener('message', function (event) {
        var payload = JSON.parse(event.data)
		var directive = payload.requestType
		console.log('network', payload)
		switch(directive){
			case "playerMove":
            case "botMove":
				var moveObj = payload["moveObj"].moveObj
				networkSync.turnOrder.turnNum = payload["moveObj"].turnNum
				networkSync.turnOrder.turnOrderIndex = payload["moveObj"].turnOrderIndex
				console.log(networkSync.turnOrder.turnOrderIndex)
				
				networkMove(moveObj, payload["moveObj"].fen)
				updateTurnOrderHighlight()
				setCentipawn(payload["moveObj"].centipawns)
				break;
			case "init":
				console.log(payload)
				if( networkSync.roomId != payload.roomId ){
					networkSync.roomId = payload.roomId
					const url = new URL(window.location);
					url.searchParams.set('room', networkSync.roomId);
					window.history.pushState({}, '', url);
				}
				cullUsersInStorage(payload.theirUsers)
				
				addUserToStorage(payload.myId, payload.myUsername)
				networkSync.myId = payload.myId;
				networkSync.roomId = payload.roomId
				networkSync.turnOrder = payload.turnOrder

				for(index in payload.allUsers){
					var user = payload.allUsers[index]
					networkSync.userIds.push(user.userid)
					networkSync.players[user.userid] = user
				}
				initPlayers()
				updateTurnOrderUI()
				initBoard(networkSync.turnOrder)
				setCentipawn(payload.centipawns)
				doNextMoveIfBot()
				break;
			case "turnOrderUpdate":
				if(payload.turnOrder.serverTimestamp > networkSync.turnOrder.serverTimestamp){
					networkSync.turnOrder = payload.turnOrder
					updateTurnOrderUI()
				}
				
				break;
			case "newClient":
				console.log(payload)
				var userid = payload.newClient.userid
				$(".avatarRim.playerDisconnected[data-id='"+userid+"']" ).removeClass('playerDisconnected')
				if(networkSync.userIds.indexOf(userid) < 0){
					networkSync.userIds.push(userid)
					networkSync.players[userid] = payload.newClient
					addPlayerAva(userid)
				}
				break;
			case "playerDisconnectWarning":
				//'playerDisconnected'
				$(".avatarRim[data-id='"+payload.userid+"']" ).addClass('playerDisconnected')
				break;
			case "playerDisconnect":
				console.log(payload)
				var delIndex = networkSync.userIds.indexOf(payload.userid)

				if(delIndex > -1){
					$(".avatarRim[data-id='"+payload.userid+"']").remove()
					//$(networkSync.players[payload.userid].avatarDiv).remove()
					delete networkSync.players[payload.userid]
					networkSync.userIds.splice(delIndex, 1)
				}
				networkSync.turnOrder = payload.turnOrder
				updateTurnOrderUI()
				break;
			case "resetBoard":
				resetBoard()
				break;
		}
		

    });
	function initBoard(){
		if(networkSync.turnOrder.lastGameBoardFen){
			game.load(networkSync.turnOrder.lastGameBoardFen)
			board.position(game.fen())
		}
	}

	function networkMove(moveObj, fen){
		game.move(moveObj)
		
		console.log('networkMove', game.fen(), fen, game.fen() == fen )
		if(game.fen() !== fen){
			//we outta sync
			game.load(fen)
		}
		board.position(game.fen())
	}
	
	var turnOrderDiv = document.getElementById('turnOrder')
	var playersSortable = new Sortable(playerDiv, {
		group: {
			name: 'shared',
			pull: 'clone' // To clone: set pull to 'clone'
		},
		onAdd: function(e){
			console.log(e)
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
		doNextMoveIfBot()
	}
	var turnOrderSortable = new Sortable(turnOrderDiv, {
		group: {
			name: 'shared',
			pull: true
		},
		dataIdAttr: 'data-id',
		// Element is dropped into the list from another list
		onAdd: function(e){
			console.log('turnOrderAdded', turnOrderSortable.toArray())
			sendTurnOrderUpdate()
			updateTurnOrderHighlight()
		}, 
		// Changed sorting within list
		onUpdate: function (evt) {
			console.log('turnOrderUpdated', turnOrderSortable.toArray())
			sendTurnOrderUpdate()
			updateTurnOrderHighlight()
		},
		// Element is removed from the list into another list
		onRemove: function (evt) {
			console.log('turnOrderRemoved', turnOrderSortable.toArray())
			sendTurnOrderUpdate()
			updateTurnOrderHighlight()
			// same properties as onEnd
		},
		// Element is chosen
		onChoose: function (/**Event*/evt) {
			$(playerDiv).addClass('deletePlayerOverlay')
			console.log('onChoose',evt)//evt.oldIndex;  // element index within parent
		},

		// Element is unchosen
		onUnchoose: function(/**Event*/evt) {
			console.log('onUnchoose',evt)
			$(playerDiv).removeClass('deletePlayerOverlay')
			// same properties as onEnd
		},
		animation: 150
	});
	function resizeboard(){
		var minWinSize = Math.min(window.innerHeight, window.innerWidth)
		var maxBoardSize = Math.max(boardDiv.offsetHeight, boardDiv.offsetWidth)
		var wrapper = document.getElementById('boardWrapper')
		
		if(window.innerHeight >= window.innerWidth){
			//portrait
			boardDiv.style.maxWidth = wrapper.clientHeight
		}else{
			boardDiv.style.maxWidth = wrapper.clientHeight
		}
		
		
		board.resize()
		$('#evalBar').css('height', $('#myBoard > div')[0].clientHeight - 14)
	}
	// NOTE: this example uses the chess.js library:
	// https://github.com/jhlywa/chess.js
	var boardDiv = document.getElementById('myBoard')
	var board = null
	var game = new Chess()
	var stockfish = STOCKFISH();
	
	stockfish.onmessage = function(event) {
		//bestmove e2e4 ponder d7d5
		var match = event.match(/^bestmove ([a-h][1-8])([a-h][1-8])([qrbn])?/);
		if(match){
			var delayDiff = Date.now() - chessDelay;
			if(delayDiff < 1000) {
				delayDiff = 1000 - delayDiff
			} else{
				delayDiff = 0
			}
			setTimeout(function(){
				var moveObj = {from: match[1], to: match[2], promotion: match[3]}
			
				game.move(moveObj);
				notifyMove(moveObj, false)
				board.position(game.fen())
				
				doNextMoveIfBot()
			}, delayDiff)
			
		}else if(event.indexOf('info depth') == 0){
			var arr = event.split(' ')
			var centipawnsMarker = arr.indexOf('cp')
			if(centipawnsMarker != -1){
				
				var centipawns = arr[centipawnsMarker + 1]
				if(game.turn() == 'b'){
					if(centipawns != 0) // prevents -0
						centipawns *= -1 // change to in terms of white
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
	function doNextMoveIfBot(){
		if(getCurrentTurn() == 'robot'){
            allowDoubleMoves()
			chessDelay = Date.now()
			stockfish.postMessage("position fen " + game.fen())
			
			stockfish.postMessage("go depth 1");
		}
	}
	//moveObj = {from, to, promotion}
	function notifyMove(moveObj, isPlayer = true){
		//var history = game.history()
		//history.pop()
		if(++networkSync.turnOrder.turnOrderIndex >= turnOrderSortable.toArray().length)
			networkSync.turnOrder.turnOrderIndex = 0
		var payload = {
			turnNum: ++networkSync.turnOrder.turnNum, //game.history().length,
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
		// do not pick up pieces if the game is over
		if (game.game_over()) return false

		// only pick up pieces for White
		var isWhiteTurn = networkSync.turnOrder.turnOrderIndex % 2 == 0
		var piecePickedUpIsBlack = piece.search(/^b/) !== -1
		
		if ( (isWhiteTurn && piecePickedUpIsBlack) || (!isWhiteTurn && !piecePickedUpIsBlack) ) return false 

		if(networkSync.myId != getCurrentTurn()) return false
	}

	function makeRandomMove () {
		var possibleMoves = game.moves()

		// game over
		if (possibleMoves.length === 0) return

		var randomIdx = Math.floor(Math.random() * possibleMoves.length)
		game.move(possibleMoves[randomIdx])
		board.position(game.fen())
	}

	function allowDoubleMoves(){
		var isWhiteTurn = networkSync.turnOrder.turnOrderIndex % 2 == 0
		var gameStateIsWhite = game.turn() == "w"  
		if( (!isWhiteTurn && gameStateIsWhite) || (isWhiteTurn && !gameStateIsWhite)){
			//game and turn order not in sync, lets manually change it
			var arr = game.fen().split(' ')
			arr[1] = isWhiteTurn ? 'w' : 'b'
			arr[3] = '-'
			var newfen = arr.join(' ')
			board.position(newfen)
			game.load(newfen)
		}
	}

	function onDrop (source, target) {
		// see if the move is legal
		var moveObj = {
			from: source,
			to: target,
			promotion: 'q' // NOTE: always promote to a queen for example simplicity
		}
		allowDoubleMoves()
		
		var move = game.move(moveObj)

		// illegal move
		if (move === null) return 'snapback'
		notifyMove(moveObj)
		updateTurnOrderHighlight()
		//debugger
		doNextMoveIfBot()
//stockfish.postMessage("position startpos moves" + get_moves())
		// make random legal move for black
		// window.setTimeout(makeRandomMove, 250)
	}
	function get_moves()
    {
        var moves = '';
        var history = game.history({verbose: true});
        
        for(var i = 0; i < history.length; ++i) {
            var move = history[i];
            moves += ' ' + move.from + move.to + (move.promotion ? move.promotion : '');
        }
        
        return moves;
    }

	// update the board position after the piece snap
	// for castling, en passant, pawn promotion
	function onSnapEnd () {
	  board.position(game.fen())
	}
	function onMoveEnd(){
		updateTurnOrderHighlight()
	}
	function getCurrentTurn(add = 0){
		//
		var userIdArr = turnOrderSortable.toArray()
		var history = networkSync.turnOrder.turnOrderIndex  //game.history()
		//.currentTurn

		var currentTurn =  history % userIdArr.length
		var userid = userIdArr[currentTurn];
		return userid
	}

	function updateTurnOrderHighlight(){
		var userid = getCurrentTurn()
		$(".avatarRim.currentTurn").removeClass('currentTurn')
		//if(userid != 'robot'){
		$('#turnOrder .avatarRim:nth('+networkSync.turnOrder.turnOrderIndex+')').addClass('currentTurn')
		//}
			//$(".avatarRim[data-id='"+userid+"']" ).addClass('currentTurn')
	}

	var config = {
	  draggable: true,
	  position: 'start',
	  onDragStart: onDragStart,
	  onDrop: onDrop,
	  onSnapEnd: onSnapEnd,
	  onMoveEnd: onMoveEnd,
	  pieceTheme: 'img/chesspieces/wikipedia/{piece}.png'
	}
	
	board = Chessboard('myBoard', config)
	stockfish.postMessage("uci")
	stockfish.postMessage("setoption name Skill Level value 10")
	stockfish.postMessage('setoption name Skill Level Maximum Error value 900')
	stockfish.postMessage('setoption name Skill Level Probability value 10')
	$(window).resize(resizeboard)
	
	resizeboard()
	//stockfish.postMessage("ucinewgame")
	//stockfish.postMessage("position " + board.fen())
	function resetBoard(){
		game.reset()
		board.position(game.fen())
		networkSync.turnOrder.turnOrderIndex = 0
		networkSync.turnOrder.turnNum = 0
		updateTurnOrderUI()
		setCentipawn(0)
	}
	$('#restartGame').click(function(){
		//reset board 
		var payload = {
			requestType: 'resetBoard'
		}
		socket.send(JSON.stringify(payload));
		doNextMoveIfBot()
	})