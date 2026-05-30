const tour = new Shepherd.Tour({
    useModalOverlay: true,
    defaultStepOptions: {
        classes: 'shadow-md bg-purple-dark',
        scrollTo: true,
        cancelIcon: {
            enabled: true
        }
    }
});

const isMobile = window.innerWidth < 650;

tour.addStep({
    id: 'intro',
    text: 'Welcome to Coop Chess! Drag players into the turn order to start.',
    attachTo: { element: '#players', on: isMobile ? 'top' : 'left' },
    buttons: [{ text: 'Skip', action: tour.complete, classes: 'shepherd-button-secondary' }, { text: 'Next', action: tour.next }]
});

tour.addStep({
    id: 'robots',
    text: 'You can add multiple robots for bot-vs-bot action. Click the gear to change their difficulty.',
    attachTo: { element: '.robotIcon', on: isMobile ? 'top' : 'left' },
    buttons: [{ text: 'Next', action: tour.next }]
});

tour.addStep({
    id: 'share',
    text: 'Share this URL with friends to play together in the same room!',
    buttons: [{ 
        text: 'Finish', 
        action: () => {
            localStorage.setItem('tour', Date.now());
            tour.complete();
        } 
    }]
});

// Auto-start logic
const lastSeen = localStorage.getItem('tour');
if (!lastSeen || (Date.now() - lastSeen > 1000 * 60 * 60 * 24 * 7)) {
    tour.start();
}
