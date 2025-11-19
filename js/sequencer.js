// Sequencer module - handles playback timing and step triggering

import { state } from './state.js';

export let audioEngine = null;
export let renderCallback = null;

let sequencerInterval = null;

export function setAudioEngine(engine) {
    audioEngine = engine;
}

export function setRenderCallback(callback) {
    renderCallback = callback;
}

export function startSequencer() {
    if (sequencerInterval) return;
    
    const stepDuration = (60 / state.tempo) * 1000 / 4; // 16th notes
    
    sequencerInterval = setInterval(() => {
        step();
    }, stepDuration);
    
    state.isPlaying = true;
}

export function stopSequencer() {
    if (sequencerInterval) {
        clearInterval(sequencerInterval);
        sequencerInterval = null;
    }
    
    state.currentStep = -1;
    state.isPlaying = false;
    
    if (renderCallback) {
        renderCallback();
    }
}

export function resetSequencer() {
    const wasPlaying = state.isPlaying;
    
    if (wasPlaying) {
        stopSequencer();
    }
    
    state.currentStep = -1;
    state.currentBar = 0;
    state.stepInBar = 0;
    
    if (renderCallback) {
        renderCallback();
    }
    
    if (wasPlaying) {
        startSequencer();
    }
}

function step() {
    // Increment step
    state.currentStep = (state.currentStep + 1) % 16;
    state.stepInBar++;
    
    // Check if we completed a bar
    if (state.stepInBar >= 16) {
        state.stepInBar = 0;
        state.currentBar = (state.currentBar + 1) % 4;
    }
    
    // Process each track
    Object.values(state.tracks).forEach(track => {
        if (track.mute) return;
        if (!track.steps[state.currentStep]) return;
        
        // Check step condition
        const condition = track.stepConditions[state.currentStep];
        if (!shouldTrigger(condition, state.currentBar)) return;
        
        // Get parameters for this step
        const stepLock = track.stepLocks[state.currentStep];
        const hasSlide = track.stepSlides[state.currentStep];
        
        let engine, params, fx;
        
        if (stepLock) {
            // Use P-locked parameters
            engine = stepLock.engine;
            params = stepLock.params;
            fx = stepLock.fx;
        } else {
            // Use current live parameters (these are already morphed if morph is active)
            engine = track.engine;
            params = track.params;
            fx = track.fx;
        }
        
        const velocity = track.velocities[state.currentStep];
        
        // Play sound
        if (hasSlide) {
            // Find next active step
            const nextStep = findNextActiveStep(track, state.currentStep);
            if (nextStep !== null) {
                const distance = nextStep > state.currentStep ? 
                    (nextStep - state.currentStep) : 
                    (16 - state.currentStep + nextStep);
                
                const duration = (60 / state.tempo) * (distance / 4);
                
                // Get target parameters
                const nextLock = track.stepLocks[nextStep];
                const targetEngine = nextLock?.engine || track.engine;
                const targetParams = nextLock?.params || track.params;
                const targetFX = nextLock?.fx || track.fx;
                
                // Play with slide (parameter automation)
                playDrumWithSlide(track.id, engine, params, targetParams, fx, targetFX, velocity, duration);
            } else {
                // No next step, play normally
                audioEngine.playDrum(track.id, engine, params, fx, velocity);
            }
        } else {
            // Normal playback
            audioEngine.playDrum(track.id, engine, params, fx, velocity);
        }
    });
    
    // Update visual
    if (renderCallback) {
        renderCallback();
    }
}

function shouldTrigger(condition, currentBar) {
    if (condition === '1:1') return true;
    
    const [triggerBar, totalBars] = condition.split(':').map(Number);
    const barInPattern = currentBar % totalBars;
    
    return barInPattern === (triggerBar - 1);
}

function findNextActiveStep(track, fromStep) {
    // Search forward from current step
    for (let i = 1; i < 16; i++) {
        const checkStep = (fromStep + i) % 16;
        if (track.steps[checkStep]) {
            return checkStep;
        }
    }
    return null;
}

function playDrumWithSlide(trackId, engine, startParams, targetParams, startFX, targetFX, velocity, duration) {
    // For simplicity, use extended decay with start params
    // Full parameter interpolation would require more complex synthesis
    const extendedParams = { ...startParams, decay: Math.min(duration, 2) };
    audioEngine.playDrum(trackId, engine, extendedParams, startFX, velocity);
}

export function updateTempo(newTempo) {
    state.tempo = newTempo;
    
    if (state.isPlaying) {
        stopSequencer();
        startSequencer();
    }
}
