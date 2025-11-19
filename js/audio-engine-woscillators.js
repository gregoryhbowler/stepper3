// Audio synthesis engine for drum machine - using woscillators (Plaits)

export class DrumSynthEngine {
    constructor() {
        this.audioContext = null;
        this.masterGain = null;
        this.masterFXInput = null;
        this.trackGains = {};
        this.masterFXNodes = {};
        this.currentMasterFX = null;
        this.initialized = false;
        this.woscLoaded = false;
        
        // Active oscillator voices for cleanup
        this.activeVoices = new Map();
    }
    
    async initialize() {
        if (this.initialized) return;
        
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            
            // Load woscillators module - should already be loaded by index.html
            if (!window.woscillators || !window.woscillators.wosc) {
                throw new Error('woscillators not available - library failed to load');
            }
            
            await window.woscillators.wosc.loadOscillator(this.audioContext);
            this.woscLoaded = true;
            console.log('Woscillators (Plaits) loaded successfully');
            
            // Create master gain
            this.masterGain = this.audioContext.createGain();
            this.masterGain.gain.value = 0.7;
            
            // Create master FX chain input
            this.masterFXInput = this.audioContext.createGain();
            this.masterFXInput.gain.value = 1.0;
            
            // Initial connection (will be rebuilt when FX change)
            this.masterFXInput.connect(this.masterGain);
            this.masterGain.connect(this.audioContext.destination);
            
            // Create track gains - connect to master FX input
            const trackIds = ['kick', 'snare', 'hihat', 'tom', 'perc', 'cymbal'];
            trackIds.forEach(id => {
                const gain = this.audioContext.createGain();
                gain.gain.value = 1.0;
                gain.connect(this.masterFXInput);
                this.trackGains[id] = gain;
            });
            
            this.initialized = true;
        } catch (error) {
            console.error('Failed to initialize audio:', error);
            throw error;
        }
    }
    
    async ensureInitialized() {
        if (!this.initialized) {
            await this.initialize();
        }
        if (this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }
    }
    
    // Update master FX chain
    updateMasterFX(fx) {
        if (!this.initialized) return;
        
        // Store current FX settings
        this.currentMasterFX = { ...fx };
        
        // Disconnect all track gains from current chain
        const trackIds = ['kick', 'snare', 'hihat', 'tom', 'perc', 'cymbal'];
        trackIds.forEach(id => {
            if (this.trackGains[id]) {
                this.trackGains[id].disconnect();
            }
        });
        
        // Disconnect old master FX input
        this.masterFXInput.disconnect();
        
        // Rebuild master FX chain
        let currentNode = this.masterFXInput;
        currentNode = this.applyMasterFXChain(currentNode, fx);
        
        // Connect final node to master gain
        currentNode.connect(this.masterGain);
        
        // Reconnect all track gains to new chain input
        trackIds.forEach(id => {
            if (this.trackGains[id]) {
                this.trackGains[id].connect(this.masterFXInput);
            }
        });
    }
    
    // Apply master FX chain
    applyMasterFXChain(input, fx) {
        const ctx = this.audioContext;
        let output = input;
        
        // 1. Wasp Filter
        if (fx.waspFilter > 0) {
            const dry = ctx.createGain();
            dry.gain.value = 1 - fx.waspFilter;
            
            const wet = ctx.createGain();
            wet.gain.value = fx.waspFilter;
            
            // Pre-drive
            const preShaper = ctx.createWaveShaper();
            preShaper.curve = this.makeDistortionCurve(fx.waspDrive * 0.9);
            
            // Four cascaded lowpass filters
            let waspChain = preShaper;
            for (let i = 0; i < 4; i++) {
                const filter = ctx.createBiquadFilter();
                filter.type = 'lowpass';
                filter.frequency.value = fx.waspFreq;
                filter.Q.value = fx.waspRes / 4;
                waspChain.connect(filter);
                waspChain = filter;
            }
            
            waspChain.connect(wet);
            
            output.connect(preShaper);
            output.connect(dry);
            
            const mixer = ctx.createGain();
            dry.connect(mixer);
            wet.connect(mixer);
            output = mixer;
        }
        
        // 2. Drive
        if (fx.drive > 1) {
            const driveShaper = ctx.createWaveShaper();
            driveShaper.curve = this.makeDistortionCurve(fx.drive);
            output.connect(driveShaper);
            output = driveShaper;
        }
        
        // 3. Distortion
        if (fx.distortion > 0) {
            const distShaper = ctx.createWaveShaper();
            const amount = fx.distortion * 50;
            const curve = new Float32Array(256);
            for (let i = 0; i < 256; i++) {
                const x = (i * 2 / 256) - 1;
                const ex = Math.exp(amount * x);
                const eMx = Math.exp(-amount * x);
                curve[i] = (ex - eMx) / (ex + eMx);
            }
            distShaper.curve = curve;
            
            const compensation = ctx.createGain();
            compensation.gain.value = 1 / (1 + fx.distortion);
            
            output.connect(distShaper);
            distShaper.connect(compensation);
            output = compensation;
        }
        
        // 4. Resonator
        if (fx.resonator > 0) {
            const dry = ctx.createGain();
            dry.gain.value = 1 - fx.resonator * 0.3;
            
            const wet = ctx.createGain();
            wet.gain.value = fx.resonator * 0.7;
            
            const resDelay = ctx.createDelay(2);
            resDelay.delayTime.value = 1 / fx.resFreq;
            
            const resFilter = ctx.createBiquadFilter();
            resFilter.type = 'bandpass';
            resFilter.frequency.value = fx.resFreq;
            resFilter.Q.value = 20;
            
            const resFeedback = ctx.createGain();
            resFeedback.gain.value = 0.85 * fx.resonator;
            
            output.connect(resDelay);
            resDelay.connect(resFilter);
            resFilter.connect(resFeedback);
            resFeedback.connect(resDelay);
            resFilter.connect(wet);
            
            output.connect(dry);
            
            const mixer = ctx.createGain();
            dry.connect(mixer);
            wet.connect(mixer);
            output = mixer;
        }
        
        // 5. Delay
        if (fx.delay > 0) {
            const dry = ctx.createGain();
            dry.gain.value = 1;
            
            const wet = ctx.createGain();
            wet.gain.value = fx.delay * 0.5;
            
            const delayNode = ctx.createDelay(2);
            delayNode.delayTime.value = fx.delayTime;
            
            const delayFeedback = ctx.createGain();
            delayFeedback.gain.value = 0.4 * fx.delay;
            
            output.connect(delayNode);
            delayNode.connect(delayFeedback);
            delayFeedback.connect(delayNode);
            delayNode.connect(wet);
            
            output.connect(dry);
            
            const mixer = ctx.createGain();
            dry.connect(mixer);
            wet.connect(mixer);
            output = mixer;
        }
        
        // 6. Reverb
        if (fx.reverb > 0) {
            const dry = ctx.createGain();
            dry.gain.value = 1;
            
            const wet = ctx.createGain();
            wet.gain.value = fx.reverb * 0.4;
            
            // Generate impulse response
            const sampleRate = ctx.sampleRate;
            const length = sampleRate * fx.reverbSize;
            const impulse = ctx.createBuffer(2, length, sampleRate);
            
            for (let channel = 0; channel < 2; channel++) {
                const data = impulse.getChannelData(channel);
                for (let i = 0; i < length; i++) {
                    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2);
                }
            }
            
            const convolver = ctx.createConvolver();
            convolver.buffer = impulse;
            
            output.connect(convolver);
            convolver.connect(wet);
            
            output.connect(dry);
            
            const mixer = ctx.createGain();
            dry.connect(mixer);
            wet.connect(mixer);
            output = mixer;
        }
        
        return output;
    }
    
    // Create Plaits oscillator with parameters
    createPlaitsVoice(params, startTime, durationOverride) {
        if (!this.woscLoaded) {
            console.warn('Woscillators not loaded, cannot create voice');
            return null;
        }

        const ctx = this.audioContext;
        const now = startTime || ctx.currentTime;
        const rawDecay = Number.isFinite(params.decay) ? params.decay : 0.5;
        const normalizedDecay = Math.min(Math.max(rawDecay, 0), 1);
        const voiceDuration = Math.max(durationOverride ?? normalizedDecay ?? 0.5, 0.02);

        try {
            // Create oscillator using window.woscillators.wosc
            const osc = window.woscillators.wosc.createOscillator(ctx);
            
            // Set engine (0-15 for Plaits models)
            osc.engine = params.engine || 0;
            
            // Set note (MIDI note 0-127)
            osc.note = params.note || 60;
            
            // Set macro parameters (0-1 range)
            osc.harmonics = params.harmonics || 0.5;
            osc.timbre = params.timbre || 0.5;
            osc.morph = params.morph || 0.5;
            osc.frequencyModulationAmount = params.fm || 0;

            // Set envelope/LPG parameters
            osc.decay = normalizedDecay;
            osc.fade = params.fade || 0; // Crossfade between outputs
            osc.volume = params.volume || 0.8;

            // Trigger behavior
            osc.modTriggerPatched = true;
            osc.modTrigger = 1; // Trigger the sound
            
            // Level envelope behavior
            osc.modLevelPatched = true;
            osc.modLevel = 1;
            
            // Create envelope gain for additional control
            const envGain = ctx.createGain();
            envGain.gain.setValueAtTime(0, now);
            envGain.gain.linearRampToValueAtTime(1, now + 0.001);
            envGain.gain.setValueAtTime(1, now + voiceDuration * 0.7);
            envGain.gain.linearRampToValueAtTime(0, now + voiceDuration);

            osc.connect(envGain);

            // Start the oscillator
            osc.start(now);

            // Store voice for cleanup
            const voiceId = `${Date.now()}-${Math.random()}`;
            this.activeVoices.set(voiceId, { osc, envGain, stopTime: now + voiceDuration + 0.1 });

            // Schedule cleanup
            setTimeout(() => {
                this.cleanupVoice(voiceId);
            }, (voiceDuration + 0.2) * 1000);

            return { output: envGain, stopTime: now + voiceDuration + 0.1, voiceId };
        } catch (error) {
            console.error('Failed to create Plaits voice:', error);
            return null;
        }
    }
    
    cleanupVoice(voiceId) {
        const voice = this.activeVoices.get(voiceId);
        if (voice) {
            try {
                voice.osc.stop();
                voice.osc.dispose();
                this.activeVoices.delete(voiceId);
            } catch (error) {
                console.warn('Error cleaning up voice:', error);
            }
        }
    }
    
    makeDistortionCurve(amount) {
        const samples = 256;
        const curve = new Float32Array(samples);
        
        for (let i = 0; i < samples; i++) {
            const x = (i * 2 / samples) - 1;
            curve[i] = Math.tanh(x * amount) / Math.tanh(amount);
        }
        
        return curve;
    }
    
    // Main playback method
    async playDrum(trackId, engine, params, fx, velocity) {
        await this.ensureInitialized();
        
        if (!this.woscLoaded) {
            console.warn('Woscillators not loaded yet');
            return;
        }
        
        const ctx = this.audioContext;
        const now = ctx.currentTime;
        
        // Create Plaits voice
        const rawDecay = Number.isFinite(params.decay) ? params.decay : 0.5;
        const normalizedDecay = Math.min(Math.max(rawDecay, 0), 1);
        const envelopeDuration = Math.max(normalizedDecay, 0.02);
        const voice = this.createPlaitsVoice(params, now, envelopeDuration);
        
        if (!voice) {
            console.warn('Failed to create voice');
            return;
        }
        
        // Apply FX chain
        let output = voice.output;
        output = this.applyFX(output, fx, now, voice.stopTime - now);
        
        // Apply velocity
        const velocityGain = ctx.createGain();
        velocityGain.gain.value = velocity;
        output.connect(velocityGain);
        
        // Connect to track output
        velocityGain.connect(this.trackGains[trackId]);
    }
    
    // FX Chain (same as before)
    applyFX(input, fx, startTime, duration) {
        const ctx = this.audioContext;
        let output = input;
        
        // 1. Wasp Filter
        if (fx.waspFilter > 0) {
            const dry = ctx.createGain();
            dry.gain.value = 1 - fx.waspFilter;
            
            const wet = ctx.createGain();
            wet.gain.value = fx.waspFilter;
            
            const preShaper = ctx.createWaveShaper();
            preShaper.curve = this.makeDistortionCurve(fx.waspDrive * 0.9);
            
            let waspChain = preShaper;
            for (let i = 0; i < 4; i++) {
                const filter = ctx.createBiquadFilter();
                filter.type = 'lowpass';
                filter.frequency.value = fx.waspFreq;
                filter.Q.value = fx.waspRes / 4;
                waspChain.connect(filter);
                waspChain = filter;
            }
            
            waspChain.connect(wet);
            input.connect(preShaper);
            input.connect(dry);
            
            const mixer = ctx.createGain();
            dry.connect(mixer);
            wet.connect(mixer);
            output = mixer;
        }
        
        // 2. Drive
        if (fx.drive > 1) {
            const driveShaper = ctx.createWaveShaper();
            driveShaper.curve = this.makeDistortionCurve(fx.drive);
            output.connect(driveShaper);
            output = driveShaper;
        }
        
        // 3. Distortion
        if (fx.distortion > 0) {
            const distShaper = ctx.createWaveShaper();
            const amount = fx.distortion * 50;
            const curve = new Float32Array(256);
            for (let i = 0; i < 256; i++) {
                const x = (i * 2 / 256) - 1;
                const ex = Math.exp(amount * x);
                const eMx = Math.exp(-amount * x);
                curve[i] = (ex - eMx) / (ex + eMx);
            }
            distShaper.curve = curve;
            
            const compensation = ctx.createGain();
            compensation.gain.value = 1 / (1 + fx.distortion);
            
            output.connect(distShaper);
            distShaper.connect(compensation);
            output = compensation;
        }
        
        // 4. Resonator
        if (fx.resonator > 0) {
            const dry = ctx.createGain();
            dry.gain.value = 1 - fx.resonator * 0.3;
            
            const wet = ctx.createGain();
            wet.gain.value = fx.resonator * 0.7;
            
            const resDelay = ctx.createDelay(2);
            resDelay.delayTime.value = 1 / fx.resFreq;
            
            const resFilter = ctx.createBiquadFilter();
            resFilter.type = 'bandpass';
            resFilter.frequency.value = fx.resFreq;
            resFilter.Q.value = 20;
            
            const resFeedback = ctx.createGain();
            resFeedback.gain.value = 0.85 * fx.resonator;
            
            output.connect(resDelay);
            resDelay.connect(resFilter);
            resFilter.connect(resFeedback);
            resFeedback.connect(resDelay);
            resFilter.connect(wet);
            
            output.connect(dry);
            
            const mixer = ctx.createGain();
            dry.connect(mixer);
            wet.connect(mixer);
            output = mixer;
        }
        
        // 5. Delay
        if (fx.delay > 0) {
            const dry = ctx.createGain();
            dry.gain.value = 1;
            
            const wet = ctx.createGain();
            wet.gain.value = fx.delay * 0.5;
            
            const delayNode = ctx.createDelay(2);
            delayNode.delayTime.value = fx.delayTime;
            
            const delayFeedback = ctx.createGain();
            delayFeedback.gain.value = 0.4 * fx.delay;
            
            output.connect(delayNode);
            delayNode.connect(delayFeedback);
            delayFeedback.connect(delayNode);
            delayNode.connect(wet);
            
            output.connect(dry);
            
            const mixer = ctx.createGain();
            dry.connect(mixer);
            wet.connect(mixer);
            output = mixer;
        }
        
        // 6. Reverb
        if (fx.reverb > 0) {
            const dry = ctx.createGain();
            dry.gain.value = 1;
            
            const wet = ctx.createGain();
            wet.gain.value = fx.reverb * 0.4;
            
            const sampleRate = ctx.sampleRate;
            const length = sampleRate * fx.reverbSize;
            const impulse = ctx.createBuffer(2, length, sampleRate);
            
            for (let channel = 0; channel < 2; channel++) {
                const data = impulse.getChannelData(channel);
                for (let i = 0; i < length; i++) {
                    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2);
                }
            }
            
            const convolver = ctx.createConvolver();
            convolver.buffer = impulse;
            
            output.connect(convolver);
            convolver.connect(wet);
            
            output.connect(dry);
            
            const mixer = ctx.createGain();
            dry.connect(mixer);
            wet.connect(mixer);
            output = mixer;
        }
        
        return output;
    }
    
    // Cleanup method
    dispose() {
        // Clean up all active voices
        this.activeVoices.forEach((voice, voiceId) => {
            this.cleanupVoice(voiceId);
        });
        
        // Teardown woscillators
        if (this.woscLoaded && window.woscillators && window.woscillators.wosc) {
            window.woscillators.wosc.teardown();
        }
    }
}

// Engine parameter specifications for Plaits engines
// Plaits has 16 synthesis models (engines 0-15)
export const ENGINE_SPECS = {
    // Engine 13: Kick Drum
    'plaits_kick': {
        name: 'Kick Drum',
        params: {
            note: { label: 'Note', min: 24, max: 60, step: 1, default: 36 },
            harmonics: { label: 'Tone', min: 0, max: 1, step: 0.01, default: 0.5 },
            timbre: { label: 'Attack', min: 0, max: 1, step: 0.01, default: 0.3 },
            morph: { label: 'Punch', min: 0, max: 1, step: 0.01, default: 0.5 },
            fm: { label: 'FM Amount', min: 0, max: 10, step: 0.1, default: 0 },
            decay: { label: 'Decay', min: 0.05, max: 1.5, step: 0.01, default: 0.5 },
            fade: { label: 'Fade', min: 0, max: 1, step: 0.01, default: 0 },
            volume: { label: 'Volume', min: 0, max: 1, step: 0.01, default: 0.9 },
            engine: { label: 'Engine', min: 13, max: 13, step: 1, default: 13 }
        }
    },
    // Engine 14: Snare Drum
    'plaits_snare': {
        name: 'Snare Drum',
        params: {
            note: { label: 'Note', min: 40, max: 80, step: 1, default: 60 },
            harmonics: { label: 'Tone', min: 0, max: 1, step: 0.01, default: 0.5 },
            timbre: { label: 'Snap', min: 0, max: 1, step: 0.01, default: 0.6 },
            morph: { label: 'Noise', min: 0, max: 1, step: 0.01, default: 0.7 },
            fm: { label: 'FM Amount', min: 0, max: 10, step: 0.1, default: 0 },
            decay: { label: 'Decay', min: 0.02, max: 0.5, step: 0.01, default: 0.15 },
            fade: { label: 'Fade', min: 0, max: 1, step: 0.01, default: 0 },
            volume: { label: 'Volume', min: 0, max: 1, step: 0.01, default: 0.9 },
            engine: { label: 'Engine', min: 14, max: 14, step: 1, default: 14 }
        }
    },
    // Engine 15: Hi-Hat
    'plaits_hihat': {
        name: 'Hi-Hat',
        params: {
            note: { label: 'Note', min: 60, max: 96, step: 1, default: 72 },
            harmonics: { label: 'Tone', min: 0, max: 1, step: 0.01, default: 0.6 },
            timbre: { label: 'Metallic', min: 0, max: 1, step: 0.01, default: 0.5 },
            morph: { label: 'Noise', min: 0, max: 1, step: 0.01, default: 0.8 },
            fm: { label: 'FM Amount', min: 0, max: 10, step: 0.1, default: 0 },
            decay: { label: 'Decay', min: 0.01, max: 0.3, step: 0.01, default: 0.08 },
            fade: { label: 'Fade', min: 0, max: 1, step: 0.01, default: 0 },
            volume: { label: 'Volume', min: 0, max: 1, step: 0.01, default: 0.8 },
            engine: { label: 'Engine', min: 15, max: 15, step: 1, default: 15 }
        }
    },
    // Engine 12: Modal - good for toms
    'plaits_modal': {
        name: 'Modal',
        params: {
            note: { label: 'Note', min: 24, max: 96, step: 1, default: 48 },
            harmonics: { label: 'Structure', min: 0, max: 1, step: 0.01, default: 0.5 },
            timbre: { label: 'Brightness', min: 0, max: 1, step: 0.01, default: 0.5 },
            morph: { label: 'Damping', min: 0, max: 1, step: 0.01, default: 0.6 },
            fm: { label: 'FM Amount', min: 0, max: 10, step: 0.1, default: 0 },
            decay: { label: 'Decay', min: 0.1, max: 3, step: 0.01, default: 1.0 },
            fade: { label: 'Fade', min: 0, max: 1, step: 0.01, default: 0 },
            volume: { label: 'Volume', min: 0, max: 1, step: 0.01, default: 0.8 },
            engine: { label: 'Engine', min: 12, max: 12, step: 1, default: 12 }
        }
    },
    // Engine 2: FM Synth - good for percs
    'plaits_fm': {
        name: 'FM Synth',
        params: {
            note: { label: 'Note', min: 24, max: 96, step: 1, default: 48 },
            harmonics: { label: 'Ratio', min: 0, max: 1, step: 0.01, default: 0.5 },
            timbre: { label: 'Index', min: 0, max: 1, step: 0.01, default: 0.5 },
            morph: { label: 'Feedback', min: 0, max: 1, step: 0.01, default: 0 },
            fm: { label: 'FM Amount', min: 0, max: 10, step: 0.1, default: 0 },
            decay: { label: 'Decay', min: 0.05, max: 2, step: 0.01, default: 0.5 },
            fade: { label: 'Fade', min: 0, max: 1, step: 0.01, default: 0 },
            volume: { label: 'Volume', min: 0, max: 1, step: 0.01, default: 0.8 },
            engine: { label: 'Engine', min: 2, max: 2, step: 1, default: 2 }
        }
    },
    // Engine 9: Noise - alternative for cymbals
    'plaits_noise': {
        name: 'Noise',
        params: {
            note: { label: 'Note', min: 24, max: 96, step: 1, default: 60 },
            harmonics: { label: 'Type', min: 0, max: 1, step: 0.01, default: 0.5 },
            timbre: { label: 'Filter', min: 0, max: 1, step: 0.01, default: 0.5 },
            morph: { label: 'Resonance', min: 0, max: 1, step: 0.01, default: 0.3 },
            fm: { label: 'FM Amount', min: 0, max: 10, step: 0.1, default: 0 },
            decay: { label: 'Decay', min: 0.01, max: 1, step: 0.01, default: 0.1 },
            fade: { label: 'Fade', min: 0, max: 1, step: 0.01, default: 0 },
            volume: { label: 'Volume', min: 0, max: 1, step: 0.01, default: 0.8 },
            engine: { label: 'Engine', min: 9, max: 9, step: 1, default: 9 }
        }
    },
    // Engine 0: Virtual Analog
'plaits_va': {
    name: 'Virtual Analog',
    params: {
        note: { label: 'Note', min: 24, max: 96, step: 1, default: 48 },
        harmonics: { label: 'Waveform', min: 0, max: 1, step: 0.01, default: 0.5 },
        timbre: { label: 'PWM/Sync', min: 0, max: 1, step: 0.01, default: 0.5 },
        morph: { label: 'Wavefold', min: 0, max: 1, step: 0.01, default: 0.5 },
        fm: { label: 'FM Amount', min: 0, max: 10, step: 0.1, default: 0 },
        decay: { label: 'Decay', min: 0.05, max: 2, step: 0.01, default: 0.5 },
        fade: { label: 'Fade', min: 0, max: 1, step: 0.01, default: 0 },
        volume: { label: 'Volume', min: 0, max: 1, step: 0.01, default: 0.8 },
        engine: { label: 'Engine', min: 0, max: 0, step: 1, default: 0 }
    }
},
// Engine 1: Waveshaper
'plaits_ws': {
    name: 'Waveshaper',
    params: {
        note: { label: 'Note', min: 24, max: 96, step: 1, default: 48 },
        harmonics: { label: 'Amount', min: 0, max: 1, step: 0.01, default: 0.5 },
        timbre: { label: 'Asymmetry', min: 0, max: 1, step: 0.01, default: 0.5 },
        morph: { label: 'Shape', min: 0, max: 1, step: 0.01, default: 0.5 },
        fm: { label: 'FM Amount', min: 0, max: 10, step: 0.1, default: 0 },
        decay: { label: 'Decay', min: 0.05, max: 2, step: 0.01, default: 0.5 },
        fade: { label: 'Fade', min: 0, max: 1, step: 0.01, default: 0 },
        volume: { label: 'Volume', min: 0, max: 1, step: 0.01, default: 0.8 },
        engine: { label: 'Engine', min: 1, max: 1, step: 1, default: 1 }
    }
},
// Engine 3: Granular
'plaits_grain': {
    name: 'Granular',
    params: {
        note: { label: 'Note', min: 24, max: 96, step: 1, default: 48 },
        harmonics: { label: 'Overlap', min: 0, max: 1, step: 0.01, default: 0.5 },
        timbre: { label: 'Grain Size', min: 0, max: 1, step: 0.01, default: 0.5 },
        morph: { label: 'Randomness', min: 0, max: 1, step: 0.01, default: 0.5 },
        fm: { label: 'FM Amount', min: 0, max: 10, step: 0.1, default: 0 },
        decay: { label: 'Decay', min: 0.1, max: 2, step: 0.01, default: 0.8 },
        fade: { label: 'Fade', min: 0, max: 1, step: 0.01, default: 0 },
        volume: { label: 'Volume', min: 0, max: 1, step: 0.01, default: 0.8 },
        engine: { label: 'Engine', min: 3, max: 3, step: 1, default: 3 }
    }
},
// Engine 4: Additive
'plaits_add': {
    name: 'Additive',
    params: {
        note: { label: 'Note', min: 24, max: 96, step: 1, default: 48 },
        harmonics: { label: 'Harmonics', min: 0, max: 1, step: 0.01, default: 0.5 },
        timbre: { label: 'Brightness', min: 0, max: 1, step: 0.01, default: 0.5 },
        morph: { label: 'Detune', min: 0, max: 1, step: 0.01, default: 0 },
        fm: { label: 'FM Amount', min: 0, max: 10, step: 0.1, default: 0 },
        decay: { label: 'Decay', min: 0.05, max: 2, step: 0.01, default: 0.5 },
        fade: { label: 'Fade', min: 0, max: 1, step: 0.01, default: 0 },
        volume: { label: 'Volume', min: 0, max: 1, step: 0.01, default: 0.8 },
        engine: { label: 'Engine', min: 4, max: 4, step: 1, default: 4 }
    }
},
// Engine 5: Wavetable
'plaits_wt': {
    name: 'Wavetable',
    params: {
        note: { label: 'Note', min: 24, max: 96, step: 1, default: 48 },
        harmonics: { label: 'Bank', min: 0, max: 1, step: 0.01, default: 0 },
        timbre: { label: 'Position', min: 0, max: 1, step: 0.01, default: 0.5 },
        morph: { label: 'Warp', min: 0, max: 1, step: 0.01, default: 0 },
        fm: { label: 'FM Amount', min: 0, max: 10, step: 0.1, default: 0 },
        decay: { label: 'Decay', min: 0.05, max: 2, step: 0.01, default: 0.5 },
        fade: { label: 'Fade', min: 0, max: 1, step: 0.01, default: 0 },
        volume: { label: 'Volume', min: 0, max: 1, step: 0.01, default: 0.8 },
        engine: { label: 'Engine', min: 5, max: 5, step: 1, default: 5 }
    }
},
// Engine 6: Chord
'plaits_chord': {
    name: 'Chord',
    params: {
        note: { label: 'Note', min: 24, max: 96, step: 1, default: 48 },
        harmonics: { label: 'Chord Type', min: 0, max: 1, step: 0.01, default: 0.3 },
        timbre: { label: 'Inversion', min: 0, max: 1, step: 0.01, default: 0.5 },
        morph: { label: 'Waveform', min: 0, max: 1, step: 0.01, default: 0.5 },
        fm: { label: 'FM Amount', min: 0, max: 10, step: 0.1, default: 0 },
        decay: { label: 'Decay', min: 0.1, max: 3, step: 0.01, default: 0.5 },
        fade: { label: 'Fade', min: 0, max: 1, step: 0.01, default: 0 },
        volume: { label: 'Volume', min: 0, max: 1, step: 0.01, default: 0.8 },
        engine: { label: 'Engine', min: 6, max: 6, step: 1, default: 6 }
    }
},
// Engine 7: Vowel/Speech
'plaits_vowel': {
    name: 'Vowel/Speech',
    params: {
        note: { label: 'Note', min: 24, max: 96, step: 1, default: 48 },
        harmonics: { label: 'Formant', min: 0, max: 1, step: 0.01, default: 0.5 },
        timbre: { label: 'Vowel', min: 0, max: 1, step: 0.01, default: 0.5 },
        morph: { label: 'Noise', min: 0, max: 1, step: 0.01, default: 0.2 },
        fm: { label: 'FM Amount', min: 0, max: 10, step: 0.1, default: 0 },
        decay: { label: 'Decay', min: 0.05, max: 2, step: 0.01, default: 0.5 },
        fade: { label: 'Fade', min: 0, max: 1, step: 0.01, default: 0 },
        volume: { label: 'Volume', min: 0, max: 1, step: 0.01, default: 0.8 },
        engine: { label: 'Engine', min: 7, max: 7, step: 1, default: 7 }
    }
},
// Engine 8: Swarm
'plaits_swarm': {
    name: 'Swarm',
    params: {
        note: { label: 'Note', min: 24, max: 96, step: 1, default: 48 },
        harmonics: { label: 'Density', min: 0, max: 1, step: 0.01, default: 0.6 },
        timbre: { label: 'Speed', min: 0, max: 1, step: 0.01, default: 0.4 },
        morph: { label: 'Chaos', min: 0, max: 1, step: 0.01, default: 0.5 },
        fm: { label: 'FM Amount', min: 0, max: 10, step: 0.1, default: 0 },
        decay: { label: 'Decay', min: 0.1, max: 3, step: 0.01, default: 0.7 },
        fade: { label: 'Fade', min: 0, max: 1, step: 0.01, default: 0 },
        volume: { label: 'Volume', min: 0, max: 1, step: 0.01, default: 0.8 },
        engine: { label: 'Engine', min: 8, max: 8, step: 1, default: 8 }
    }
},
// Engine 10: Particle
'plaits_particle': {
    name: 'Particle',
    params: {
        note: { label: 'Note', min: 24, max: 96, step: 1, default: 48 },
        harmonics: { label: 'Density', min: 0, max: 1, step: 0.01, default: 0.6 },
        timbre: { label: 'Filter', min: 0, max: 1, step: 0.01, default: 0.5 },
        morph: { label: 'Randomness', min: 0, max: 1, step: 0.01, default: 0.5 },
        fm: { label: 'FM Amount', min: 0, max: 10, step: 0.1, default: 0 },
        decay: { label: 'Decay', min: 0.1, max: 2, step: 0.01, default: 0.6 },
        fade: { label: 'Fade', min: 0, max: 1, step: 0.01, default: 0 },
        volume: { label: 'Volume', min: 0, max: 1, step: 0.01, default: 0.8 },
        engine: { label: 'Engine', min: 10, max: 10, step: 1, default: 10 }
    }
},
// Engine 11: String
'plaits_string': {
    name: 'String',
    params: {
        note: { label: 'Note', min: 24, max: 72, step: 1, default: 36 },
        harmonics: { label: 'Harmonics', min: 0, max: 1, step: 0.01, default: 0.5 },
        timbre: { label: 'Brightness', min: 0, max: 1, step: 0.01, default: 0.6 },
        morph: { label: 'Damping', min: 0, max: 1, step: 0.01, default: 0.3 },
        fm: { label: 'FM Amount', min: 0, max: 10, step: 0.1, default: 0 },
        decay: { label: 'Decay', min: 0.2, max: 4, step: 0.01, default: 1.5 },
        fade: { label: 'Fade', min: 0, max: 1, step: 0.01, default: 0 },
        volume: { label: 'Volume', min: 0, max: 1, step: 0.01, default: 0.8 },
        engine: { label: 'Engine', min: 11, max: 11, step: 1, default: 11 }
    }
}
};

export const FX_SPECS = {
    waspFilter: { label: 'Wasp Mix', min: 0, max: 1, step: 0.01, default: 0 },
    waspFreq: { label: 'Wasp Freq', min: 100, max: 8000, step: 10, default: 2000 },
    waspRes: { label: 'Wasp Res', min: 0.5, max: 30, step: 0.1, default: 5 },
    waspDrive: { label: 'Wasp Drive', min: 1, max: 10, step: 0.1, default: 2 },
    drive: { label: 'Drive', min: 1, max: 20, step: 0.1, default: 1 },
    distortion: { label: 'Distortion', min: 0, max: 1, step: 0.01, default: 0 },
    resonator: { label: 'Resonator', min: 0, max: 1, step: 0.01, default: 0 },
    resFreq: { label: 'Res Freq', min: 100, max: 2000, step: 10, default: 440 },
    resDecay: { label: 'Res Decay', min: 0.05, max: 2, step: 0.01, default: 0.3 },
    delay: { label: 'Delay', min: 0, max: 1, step: 0.01, default: 0 },
    delayTime: { label: 'Delay Time', min: 0.05, max: 1, step: 0.01, default: 0.25 },
    reverb: { label: 'Reverb', min: 0, max: 1, step: 0.01, default: 0 },
    reverbSize: { label: 'Reverb Size', min: 0.5, max: 4, step: 0.1, default: 2 }
};
