// State management for the drum machine - updated for Plaits engines

export const state = {
    isPlaying: false,
    tempo: 128,
    currentStep: -1,
    currentBar: 0,
    stepInBar: 0,
    selectedTrack: 'kick',
    conditionModalStep: null,
    conditionModalTrack: null,
    globalMorphAmount: 0,
    globalTargetParams: null,
    currentPattern: 0,
    masterFX: {
        waspFilter: 0,
        waspFreq: 2000,
        waspRes: 5,
        waspDrive: 2,
        drive: 1,
        distortion: 0,
        resonator: 0,
        resFreq: 440,
        resDecay: 0.3,
        delay: 0,
        delayTime: 0.25,
        reverb: 0,
        reverbSize: 2
    },
    tracks: {}
};

function createDefaultLFO() {
    return {
        destination: 'none',
        wave: 'sine',
        depth: 0,
        rate: 0.5
    };
}

export function initializeTrack(trackId, name, engine, options = {}) {
    const maxSteps = options.maxSteps || 16;

    const track = {
        id: trackId,
        name: name,
        mute: false,
        engine: engine,
        params: getDefaultParams(engine),
        fx: {
            waspFilter: 0,
            waspFreq: 2000,
            waspRes: 5,
            waspDrive: 2,
            drive: 1,
            distortion: 0,
            resonator: 0,
            resFreq: 440,
            resDecay: 0.3,
            delay: 0,
            delayTime: 0.25,
            reverb: 0,
            reverbSize: 2
        },
        normalState: null,
        morphAmount: 0,
        targetParams: null,
        steps: Array(maxSteps).fill(false),
        velocities: Array(maxSteps).fill(0.8),
        stepConditions: Array(maxSteps).fill('1:1'),
        stepLocks: Array(maxSteps).fill(null),
        stepSlides: Array(maxSteps).fill(false),
        maxSteps,
        stepCount: Math.min(options.stepCount || maxSteps, maxSteps),
        rateMultiplier: 1,
        isSynth: options.type === 'synth',
        noteIndices: Array(maxSteps).fill(0),
        rootNote: 60,
        scale: 'ionian',
        rangeStart: 48,
        rangeSpan: 24,
        transpose: 0,
        lfos: [createDefaultLFO(), createDefaultLFO(), createDefaultLFO()],
        synthState: {
            accumulator: 0,
            stepIndex: -1
        }
    };

    // Initialize normal state
    track.normalState = {
        engine: engine,
        params: { ...track.params },
        fx: { ...track.fx }
    };

    if (!track.isSynth) {
        track.stepCount = track.maxSteps;
    }

    state.tracks[trackId] = track;
    return track;
}

function getDefaultParams(engine) {
    const defaults = {
        // Kick Drum (Plaits Engine 13)
        'plaits_kick': {
            note: 36,
            harmonics: 0.5,
            timbre: 0.3,
            morph: 0.5,
            fm: 0,
            decay: 0.5,
            fade: 0,
            volume: 0.9,
            engine: 13
        },
        // Snare Drum (Plaits Engine 14)
        'plaits_snare': {
            note: 60,
            harmonics: 0.5,
            timbre: 0.6,
            morph: 0.7,
            fm: 0,
            decay: 0.15,
            fade: 0,
            volume: 0.9,
            engine: 14
        },
        // Hi-Hat (Plaits Engine 15)
        'plaits_hihat': {
            note: 72,
            harmonics: 0.6,
            timbre: 0.5,
            morph: 0.8,
            fm: 0,
            decay: 0.08,
            fade: 0,
            volume: 0.8,
            engine: 15
        },
        // Modal (Plaits Engine 12) - good for toms
        'plaits_modal': {
            note: 48,
            harmonics: 0.5,
            timbre: 0.5,
            morph: 0.6,
            fm: 0,
            decay: 1.0,
            fade: 0,
            volume: 0.8,
            engine: 12
        },
        // FM Synth (Plaits Engine 2) - good for percs
        'plaits_fm': {
            note: 60,
            harmonics: 0.5,
            timbre: 0.5,
            morph: 0,
            fm: 0,
            decay: 0.3,
            fade: 0,
            volume: 0.8,
            engine: 2
        },
        // Noise (Plaits Engine 9) - alternative for cymbals
        'plaits_noise': {
            note: 60,
            harmonics: 0.5,
            timbre: 0.5,
            morph: 0.3,
            fm: 0,
            decay: 0.2,
            fade: 0,
            volume: 0.8,
            engine: 9
        },
        // Virtual Analog (Plaits Engine 0)
        'plaits_va': {
            note: 48,
            harmonics: 0.5,
            timbre: 0.5,
            morph: 0.5,
            fm: 0,
            decay: 0.5,
            fade: 0,
            volume: 0.8,
            engine: 0
        },
        // Waveshaper (Plaits Engine 1)
        'plaits_ws': {
            note: 48,
            harmonics: 0.5,
            timbre: 0.5,
            morph: 0.5,
            fm: 0,
            decay: 0.5,
            fade: 0,
            volume: 0.8,
            engine: 1
        },
        // Granular (Plaits Engine 3)
        'plaits_grain': {
            note: 48,
            harmonics: 0.5,
            timbre: 0.5,
            morph: 0.5,
            fm: 0,
            decay: 0.8,
            fade: 0,
            volume: 0.8,
            engine: 3
        },
        // Additive (Plaits Engine 4)
        'plaits_add': {
            note: 48,
            harmonics: 0.5,
            timbre: 0.5,
            morph: 0,
            fm: 0,
            decay: 0.5,
            fade: 0,
            volume: 0.8,
            engine: 4
        },
        // Wavetable (Plaits Engine 5)
        'plaits_wt': {
            note: 48,
            harmonics: 0,
            timbre: 0.5,
            morph: 0,
            fm: 0,
            decay: 0.5,
            fade: 0,
            volume: 0.8,
            engine: 5
        },
        // Chord (Plaits Engine 6)
        'plaits_chord': {
            note: 48,
            harmonics: 0.3,
            timbre: 0.5,
            morph: 0.5,
            fm: 0,
            decay: 0.5,
            fade: 0,
            volume: 0.8,
            engine: 6
        },
        // Vowel/Speech (Plaits Engine 7)
        'plaits_vowel': {
            note: 48,
            harmonics: 0.5,
            timbre: 0.5,
            morph: 0.2,
            fm: 0,
            decay: 0.5,
            fade: 0,
            volume: 0.8,
            engine: 7
        },
        // Swarm (Plaits Engine 8)
        'plaits_swarm': {
            note: 48,
            harmonics: 0.6,
            timbre: 0.4,
            morph: 0.5,
            fm: 0,
            decay: 0.7,
            fade: 0,
            volume: 0.8,
            engine: 8
        },
        // Particle (Plaits Engine 10)
        'plaits_particle': {
            note: 48,
            harmonics: 0.6,
            timbre: 0.5,
            morph: 0.5,
            fm: 0,
            decay: 0.6,
            fade: 0,
            volume: 0.8,
            engine: 10
        },
        // String (Plaits Engine 11)
        'plaits_string': {
            note: 36,
            harmonics: 0.5,
            timbre: 0.6,
            morph: 0.3,
            fm: 0,
            decay: 1.5,
            fade: 0,
            volume: 0.8,
            engine: 11
        }
    };
    
    return defaults[engine] || defaults['plaits_kick'];
}

export function getTrack(trackId) {
    return state.tracks[trackId];
}

export function setSelectedTrack(trackId) {
    state.selectedTrack = trackId;
}

export function getSelectedTrack() {
    return state.tracks[state.selectedTrack];
}

// Initialize default tracks with Plaits engines
export function initializeTracks() {
    initializeTrack('kick', 'KICK', 'plaits_kick');
    initializeTrack('snare', 'SNARE', 'plaits_snare');
    initializeTrack('hihat', 'HI-HAT', 'plaits_hihat');
    initializeTrack('tom', 'TOM', 'plaits_modal');
    initializeTrack('perc', 'PERC', 'plaits_fm');
    initializeTrack('cymbal', 'CYMBAL', 'plaits_noise');
    initializeTrack('bass', 'BASS', 'plaits_va', { type: 'synth', maxSteps: 32, stepCount: 16 });
    initializeTrack('lead', 'LEAD', 'plaits_va', { type: 'synth', maxSteps: 32, stepCount: 16 });
}

// Save/Load state functions
export function saveCompleteState() {
    return {
        version: '2.0', // Bumped version for Plaits
        tempo: state.tempo,
        currentPattern: state.currentPattern,
        masterFX: { ...state.masterFX },
        tracks: Object.fromEntries(
            Object.entries(state.tracks).map(([id, track]) => [
                id,
                {
                    name: track.name,
                    mute: track.mute,
                    engine: track.engine,
                    params: { ...track.params },
                    fx: { ...track.fx },
                    normalState: track.normalState ? {
                        engine: track.normalState.engine,
                        params: { ...track.normalState.params },
                        fx: { ...track.normalState.fx }
                    } : null,
                    morphAmount: track.morphAmount,
                    targetParams: track.targetParams,
                    synthSettings: track.isSynth ? {
                        stepCount: track.stepCount,
                        rateMultiplier: track.rateMultiplier,
                        rootNote: track.rootNote,
                        scale: track.scale,
                        rangeStart: track.rangeStart,
                        rangeSpan: track.rangeSpan,
                        transpose: track.transpose,
                        noteIndices: [...track.noteIndices],
                        lfos: track.lfos.map(lfo => ({ ...lfo }))
                    } : null
                }
            ])
        )
    };
}

export function loadCompleteState(data) {
    // Support both old (1.0) and new (2.0) formats
    if (data.version !== '1.0' && data.version !== '2.0') {
        throw new Error('Invalid state version');
    }
    
    state.tempo = data.tempo;
    state.currentPattern = data.currentPattern || 0;
    state.masterFX = { ...data.masterFX };
    
    Object.entries(data.tracks).forEach(([id, trackData]) => {
        const track = state.tracks[id];
        if (track) {
            track.mute = trackData.mute;
            track.engine = trackData.engine;
            track.params = { ...trackData.params };
            track.fx = { ...trackData.fx };
            track.normalState = trackData.normalState ? {
                engine: trackData.normalState.engine,
                params: { ...trackData.normalState.params },
                fx: { ...trackData.normalState.fx }
            } : null;
            track.morphAmount = trackData.morphAmount || 0;
            track.targetParams = trackData.targetParams || null;

            if (track.isSynth && trackData.synthSettings) {
                const synthSettings = trackData.synthSettings;
                track.stepCount = synthSettings.stepCount || track.stepCount;
                track.rateMultiplier = synthSettings.rateMultiplier || track.rateMultiplier;
                track.rootNote = synthSettings.rootNote ?? track.rootNote;
                track.scale = synthSettings.scale || track.scale;
                track.rangeStart = synthSettings.rangeStart ?? track.rangeStart;
                track.rangeSpan = synthSettings.rangeSpan || track.rangeSpan;
                track.transpose = synthSettings.transpose ?? track.transpose;
                if (Array.isArray(synthSettings.noteIndices)) {
                    track.noteIndices = [...synthSettings.noteIndices];
                }
                if (Array.isArray(synthSettings.lfos)) {
                    track.lfos = synthSettings.lfos.map(lfo => ({ ...lfo }));
                }
            }
        }
    });
}
