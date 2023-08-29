const tour = new Shepherd.Tour({
	useModalOverlay: true,
	defaultStepOptions: {
		classes: 'shadow-md bg-purple-dark',
		scrollTo: true
	}
});
isMobile = false;
if(window.innerWidth < 650){
    isMobile = true;
}

tour.addStep({
  id: 'players-step',
  text: 'This is the player pool. These are all the players connected to the game. You can drag and drop them below to add them to the turn order.',
  attachTo: {
    element: '#players',
    on: isMobile ? 'top' : 'left'
  },
  classes: 'player-step-extra-class',
  buttons: [
    {
      text: 'Next',
      action: tour.next
    }
  ]
});
tour.addStep({
  id: 'you-step',
  text: 'This is you. By default you\'re in the turn order below. You can add yourself to the turn order as many times as you want.',
  attachTo: {
    element: '#players .myPlayerIcon',
    on: isMobile ? 'top' : 'left'
  },
  classes: 'you-step-extra-class',
  buttons: [
    {
      text: 'Next',
      action: tour.next
    }
  ]
});
tour.addStep({
  id: 'robot-step',
  text: 'This is a robot. One robot is added to the turn order automatically for you to play against. You can add as many robots as you want. In effect you can have two robots playing against each other, two humans playing against each other, or any combination of humans and robots. Including bizarre situations of a 1v2 where white moves twice in a row!',
  attachTo: {
    element: '#players .robotIcon',
    on: isMobile ? 'top' : 'left'
  },
  classes: 'robot-step-extra-class',
  buttons: [
    {
      text: 'Next',
      action: tour.next
    }
  ]
});
tour.addStep({
  id: 'turn-order-step',
  text: 'Try dragging a robot to the turn order. You can add as many robots as you want. If you\'ve invited another player you can add them as well.',
  attachTo: {
    element: '#turnOrderWrapper',
    on: isMobile ? 'top' : 'left'
  },
  classes: 'turnOrderWrapper-step-extra-class',
  buttons: [
    {
      text: 'Next',
      action: tour.next
    }
  ]
});

tour.addStep({
  id: 'share-step',
  text: `This is a multiplayer game. You can share the link to this game with your friends. They can join the game and play with you. Additionally you can change the url room=... to whatever you'd like! <br><br> <input type="text" value="${window.location.href}" id="shareLink"><button id="shareButtonCopy" onclick="copyShareLink()">Copy text</button><button onclick="shareMobile()">Share Page</button>`,
  classes: 'share-step-extra-class',
  buttons: [
    {
      text: 'Next',
      action: () => {
		// store in local storage that we've seen the tour with a timestamp
		localStorage.setItem('tour', Date.now());
		tour.next();
	  }
    }
  ]
});

// Check if tour has already been seen
if (!localStorage.getItem('tour')) {
  tour.start();
} else{
	// if tour was seen more than a week ago, show it again
	if(Date.now() - localStorage.getItem('tour') > 1000 * 60 * 60 * 24 * 7){
		tour.start();
	}
}

function copyShareLink() {
  var copyText = document.getElementById("shareLink");
  copyText.select();
  copyText.setSelectionRange(0, 99999); /* For mobile devices */
  document.execCommand("copy");
  document.getElementById('shareButtonCopy').innerHTML = "Copied!";
}
function shareMobile(){
	if (navigator.share) {
	navigator.share({
		title: document.title,
		text: "Hello World",
		url: window.location.href
	})
	.then(() => console.log('Successful share'))
	.catch(error => console.log('Error sharing:', error));
	}
}