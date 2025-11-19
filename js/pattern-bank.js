// Pattern bank module - manages 16 pattern slots and magic pattern loading

import { state } from './state.js';

export class PatternBank {
    constructor() {
        this.patterns = Array(16).fill(null);
        this.clipboard = null;
    }
    
    savePattern(index) {
        const pattern = {};
        
        Object.entries(state.tracks).forEach(([trackId, track]) => {
            pattern[trackId] = {
                steps: [...track.steps],
                velocities: [...track.velocities],
                stepConditions: [...track.stepConditions],
                stepLocks: track.stepLocks.map(lock => 
                    lock ? {
                        engine: lock.engine,
                        params: { ...lock.params },
                        fx: { ...lock.fx }
                    } : null
                ),
                stepSlides: [...track.stepSlides]
            };
        });
        
        this.patterns[index] = pattern;
    }
    
    loadPattern(index) {
        const pattern = this.patterns[index];
        if (!pattern) return false;
        
        Object.entries(pattern).forEach(([trackId, trackData]) => {
            const track = state.tracks[trackId];
            if (track) {
                track.steps = [...trackData.steps];
                track.velocities = [...trackData.velocities];
                track.stepConditions = [...trackData.stepConditions];
                track.stepLocks = trackData.stepLocks.map(lock => 
                    lock ? {
                        engine: lock.engine,
                        params: { ...lock.params },
                        fx: { ...lock.fx }
                    } : null
                );
                track.stepSlides = [...trackData.stepSlides];
            }
        });
        
        return true;
    }
    
    clearPattern(index) {
        this.patterns[index] = null;
    }
    
    hasPattern(index) {
        return this.patterns[index] !== null;
    }
    
    copyPattern(index) {
        this.clipboard = this.patterns[index];
    }
    
    pastePattern(index) {
        if (this.clipboard) {
            this.patterns[index] = JSON.parse(JSON.stringify(this.clipboard));
        }
    }
    
    async loadMagicPattern() {
        try {
            const response = await fetch('data/patterns-source.json');
            const data = await response.json();
            
            // Select random pattern
            const pattern = data[Math.floor(Math.random() * data.length)];
            
            // Select random bank
            const bank = pattern.banks[Math.floor(Math.random() * pattern.banks.length)];
            
            // Clear all tracks
            Object.values(state.tracks).forEach(track => {
                track.steps = Array(16).fill(false);
                track.velocities = Array(16).fill(0.8);
            });
            
            // Map drums to tracks
            Object.entries(bank).forEach(([drumType, steps]) => {
                const trackId = mapDrumToTrack(drumType);
                const track = state.tracks[trackId];
                
                if (track) {
                    steps.forEach((hit, i) => {
                        if (hit === 1) {
                            track.steps[i] = true;
                            track.velocities[i] = 0.7 + Math.random() * 0.3;
                        }
                    });
                }
            });
            
            return true;
        } catch (error) {
            console.error('Failed to load magic pattern:', error);
            return false;
        }
    }
    
    exportPattern(index) {
        const pattern = this.patterns[index];
        if (!pattern) return null;
        
        return {
            version: '1.0',
            pattern: pattern
        };
    }
    
    importPattern(index, data) {
        if (data.version === '1.0' && data.pattern) {
            this.patterns[index] = data.pattern;
            return true;
        }
        return false;
    }
    
    exportAllPatterns() {
        return {
            version: '1.0',
            patterns: this.patterns
        };
    }
    
    importAllPatterns(data) {
        if (data.version === '1.0' && data.patterns) {
            this.patterns = data.patterns;
            return true;
        }
        return false;
    }
}

function mapDrumToTrack(drumType) {
    const mapping = {
        'BD': 'kick',
        'SD': 'snare',
        'CH': 'hihat',
        'HH': 'hihat',
        'OH': 'hihat',
        'LT': 'tom',
        'MT': 'tom',
        'HT': 'tom',
        'RS': 'perc',
        'CB': 'perc',
        'CY': 'cymbal',
        'RC': 'cymbal',
        'CR': 'cymbal'
    };
    
    // Handle claps randomly
    if (drumType === 'CP') {
        return Math.random() > 0.5 ? 'snare' : 'perc';
    }
    
    // Use mapping or random track
    if (mapping[drumType]) {
        return mapping[drumType];
    } else {
        const tracks = ['kick', 'snare', 'hihat', 'tom', 'perc', 'cymbal'];
        return tracks[Math.floor(Math.random() * tracks.length)];
    }
}
