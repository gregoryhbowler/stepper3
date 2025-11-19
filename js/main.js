// Main entry point - initializes and connects all modules.

import { DrumSynthEngine } from './audio-engine-woscillators.js';
import { initializeTracks, saveCompleteState, loadCompleteState, state } from './state-woscillators.js';
import { setAudioEngine, setRenderCallback, startSequencer, stopSequencer } from './sequencer.js';
import { PatternBank } from './pattern-bank.js';
import { 
    renderApp, 
    updateBarDisplay, 
    renderTracks,
    setAudioEngine as setUIAudioEngine,
    setPatternBank as setUIPatternBank
} from './ui.js';

let audioEngine;
let patternBank;
let initialized = false;

async function init() {
    // Initialize state
    initializeTracks();
    
    // Initialize audio engine
    audioEngine = new DrumSynthEngine();
    
    // Initialize pattern bank
    patternBank = new PatternBank();
    
    // Connect modules
    setAudioEngine(audioEngine);
    setUIAudioEngine(audioEngine);
    setUIPatternBank(patternBank);
    
    // Set up render callback for sequencer
    setRenderCallback(() => {
        renderTracks();
        updateBarDisplay();
    });
    
    // Render initial UI
    renderApp();
    
    // Initialize audio on first user interaction
    document.addEventListener('click', initAudio, { once: true });
    document.addEventListener('keydown', initAudio, { once: true });
}

async function initAudio() {
    if (initialized) return;
    
    try {
        await audioEngine.initialize();
        
        // Initialize master FX with default state
        audioEngine.updateMasterFX(state.masterFX);
        
        initialized = true;
        console.log('Audio engine initialized');
    } catch (error) {
        console.error('Failed to initialize audio:', error);
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

// Export for debugging
window.debugState = () => {
    console.log('Current state:', saveCompleteState());
    console.log('Pattern bank:', patternBank.patterns);
};
