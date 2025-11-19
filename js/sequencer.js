// Sequencer module - handles playback timing and step triggering

import { state } from './state-woscillators.js';
import { getScaleNotes } from './music-utils.js';
import { ENGINE_SPECS } from './audio-engine-woscillators.js';

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
    
    // Reset synth playing flags
    Object.values(state.tracks).forEach(track => {
        if (track.isSynth && track.synthState) {
            track.synthState.isPlaying = false;
        }
    });

    // Process each track
    Object.values(state.tracks).forEach(track => {
        if (track.mute) return;
        if (track.isSynth) {
            processSynthTrack(track);
        } else {
            processDrumTrack(track);
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

function processDrumTrack(track) {
    const currentStep = state.currentStep;
    if (!track.steps[currentStep]) return;

    const condition = track.stepConditions[currentStep];
    if (!shouldTrigger(condition, state.currentBar)) return;

    const stepLock = track.stepLocks[currentStep];
    const hasSlide = track.stepSlides[currentStep];

    const engine = stepLock?.engine || track.engine;
    const params = stepLock?.params || track.params;
    const fx = stepLock?.fx || track.fx;
    const velocity = track.velocities[currentStep];

    if (hasSlide) {
        const nextStep = findNextActiveStep(track, currentStep);
        if (nextStep !== null) {
            const distance = nextStep > currentStep
                ? (nextStep - currentStep)
                : (16 - currentStep + nextStep);
            const duration = (60 / state.tempo) * (distance / 4);
            const nextLock = track.stepLocks[nextStep];
            const targetParams = nextLock?.params || track.params;
            const targetFX = nextLock?.fx || track.fx;
            playDrumWithSlide(track.id, engine, params, targetParams, fx, targetFX, velocity, duration);
        } else {
            audioEngine.playDrum(track.id, engine, params, fx, velocity);
        }
    } else {
        audioEngine.playDrum(track.id, engine, params, fx, velocity);
    }
}

function processSynthTrack(track) {
    if (!track.synthState) {
        track.synthState = { accumulator: 0, stepIndex: -1, isPlaying: false };
    }

    const stepCount = track.stepCount || track.maxSteps || 16;
    if (stepCount <= 0) return;
    const rate = track.rateMultiplier || 1;

    track.synthState.accumulator = (track.synthState.accumulator || 0) + rate;

    while (track.synthState.accumulator >= 1) {
        track.synthState.accumulator -= 1;
        track.synthState.stepIndex = (track.synthState.stepIndex + 1) % stepCount;
        triggerSynthStep(track, track.synthState.stepIndex);
    }
}

function triggerSynthStep(track, stepIndex) {
    if (!track.steps[stepIndex]) return;
    const condition = track.stepConditions[stepIndex];
    if (!shouldTrigger(condition, state.currentBar)) return;

    const engine = track.engine;
    const fx = track.fx;
    const baseParams = track.params;
    const velocity = track.velocities[stepIndex];

    const noteData = resolveSynthNote(track, stepIndex);
    const lfoResult = applySynthLFOs(track, baseParams, noteData.scaleNotes, noteData.baseIndex);
    const note = getNoteFromScale(noteData.scaleNotes, noteData.baseIndex + track.transpose + Math.round(lfoResult.noteOffset));

    const params = { ...lfoResult.params, note };

    track.synthState.isPlaying = true;

    audioEngine.playDrum(track.id, engine, params, fx, velocity);
}

function resolveSynthNote(track, stepIndex) {
    const rangeEnd = track.rangeStart + track.rangeSpan - 1;
    const scaleNotes = getScaleNotes(track.rootNote, track.scale, track.rangeStart, rangeEnd);
    const maxIndex = Math.max(scaleNotes.length - 1, 0);
    const baseIndex = Math.min(track.noteIndices[stepIndex] || 0, maxIndex);
    return { scaleNotes, baseIndex };
}

function getNoteFromScale(scaleNotes, index) {
    if (!scaleNotes.length) return 60;
    const clamped = Math.max(0, Math.min(scaleNotes.length - 1, index));
    return scaleNotes[clamped];
}

function applySynthLFOs(track, params, scaleNotes, baseIndex) {
    if (!track.lfos) return { params: { ...params }, noteOffset: 0 };
    const contextTime = audioEngine?.audioContext?.currentTime || performance.now() / 1000;
    const updatedParams = { ...params };
    let transposeOffset = 0;

    track.lfos.forEach(lfo => {
        if (!lfo || lfo.depth <= 0 || lfo.destination === 'none') return;
        const value = evaluateLFO(lfo, contextTime);
        if (lfo.destination === 'transpose') {
            transposeOffset += value * lfo.depth * 12;
        } else {
            const spec = ENGINE_SPECS[track.engine]?.params?.[lfo.destination];
            if (spec) {
                const range = spec.max - spec.min;
                const delta = value * lfo.depth * range * 0.5;
                const nextValue = Math.max(spec.min, Math.min(spec.max, (updatedParams[lfo.destination] ?? spec.min) + delta));
                updatedParams[lfo.destination] = nextValue;
            }
        }
    });

    return { params: updatedParams, noteOffset: transposeOffset };
}

function evaluateLFO(lfo, time) {
    const rate = Math.max(0.01, lfo.rate || 0.5);
    const phase = (time * rate) % 1;
    switch (lfo.wave) {
        case 'triangle':
            return phase < 0.5 ? (phase * 4 - 1) : (3 - phase * 4);
        case 'ramp_up':
            return phase * 2 - 1;
        case 'ramp_down':
            return (1 - phase) * 2 - 1;
        case 'square':
            return phase < 0.5 ? 1 : -1;
        case 'random':
            return Math.random() * 2 - 1;
        case 'exp_up':
            return Math.pow(phase, 2) * 2 - 1;
        case 'exp_down':
            return (1 - Math.pow(phase, 2)) * 2 - 1;
        case 'sine':
        default:
            return Math.sin(phase * Math.PI * 2);
    }
}

export function updateTempo(newTempo) {
    state.tempo = newTempo;
    
    if (state.isPlaying) {
        stopSequencer();
        startSequencer();
    }
}
