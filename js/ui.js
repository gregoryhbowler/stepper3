// UI module - rendering and interaction handling

import { state, getSelectedTrack, setSelectedTrack } from './state.js';
import { ENGINE_SPECS, FX_SPECS } from './audio-engine.js';
import { startSequencer, stopSequencer, resetSequencer, updateTempo } from './sequencer.js';

export let audioEngine = null;
export let patternBank = null;

let dragState = {
    active: false,
    trackId: null,
    stepIndex: null,
    startY: 0,
    startVelocity: 0,
    wasActive: false
};

export function setAudioEngine(engine) {
    audioEngine = engine;
}

export function setPatternBank(bank) {
    patternBank = bank;
}

export function renderApp() {
    const app = document.getElementById('app');
    app.innerHTML = `
        <div class="header">
            <div class="header-title">STEPPER</div>
            <div class="transport-controls">
                <span class="bar-indicator">Bar: <span id="bar-display">1/4</span></span>
                <div class="tempo-control">
                    <label>TEMPO</label>
                    <input type="number" id="tempo-input" value="${state.tempo}" min="40" max="300">
                </div>
                <button class="btn" id="play-btn">PLAY</button>
                <button class="btn" id="reset-btn">RESET</button>
            </div>
        </div>
        
        <div class="pattern-bank">
            <div class="section-title">PATTERNS</div>
            <div class="pattern-slots" id="pattern-slots"></div>
            <div class="pattern-actions">
                <button class="btn small" id="save-pattern-btn">SAVE</button>
                <button class="btn small" id="copy-pattern-btn">COPY</button>
                <button class="btn small warning" id="clear-pattern-btn">CLEAR</button>
                <button class="btn small success" id="magic-btn">MAGIC</button>
            </div>
        </div>
        
        <div class="preset-panel">
            <div class="section-title">PRESETS</div>
            <div class="preset-actions">
                <button class="btn small" id="save-json-btn">SAVE JSON</button>
                <button class="btn small" id="load-json-btn">LOAD JSON</button>
                <button class="btn small" id="export-pattern-btn">EXPORT PATTERN</button>
                <button class="btn small" id="import-pattern-btn">IMPORT PATTERN</button>
            </div>
            <input type="file" id="load-json-input" accept=".json" style="display: none;">
            <input type="file" id="import-pattern-input" accept=".json" style="display: none;">
        </div>
        
        <div class="main-content">
            <div class="tracks-panel" id="tracks-panel"></div>
            <div class="side-panel" id="side-panel"></div>
        </div>
        
        <div class="bottom-controls" id="bottom-controls"></div>
        
        <div id="condition-modal" style="display: none;"></div>
    `;
    
    renderPatternBank();
    renderTracks();
    renderSidePanel();
    renderBottomControls();
    setupEventListeners();
}

export function renderPatternBank() {
    const container = document.getElementById('pattern-slots');
    if (!container) return;
    
    container.innerHTML = '';
    
    for (let i = 0; i < 16; i++) {
        const slot = document.createElement('div');
        slot.className = 'pattern-slot';
        if (i === state.currentPattern) slot.classList.add('active');
        if (patternBank && patternBank.hasPattern(i)) slot.classList.add('has-data');
        
        slot.textContent = String(i + 1).padStart(2, '0');
        slot.onclick = () => selectPattern(i);
        
        container.appendChild(slot);
    }
}

export function renderTracks() {
    const container = document.getElementById('tracks-panel');
    if (!container) return;
    
    // Check if tracks exist - if not, do full render
    const existingTracks = container.querySelectorAll('.track');
    const needsFullRender = existingTracks.length === 0;
    
    if (needsFullRender) {
        // Full render - create all HTML
        const tracksHTML = Object.values(state.tracks).map(track => `
            <div class="track ${track.id === state.selectedTrack ? 'selected' : ''}" data-track="${track.id}">
                <div class="track-header">
                    <div class="track-name">${track.name} — ${ENGINE_SPECS[track.engine]?.name || track.engine}</div>
                    <div class="track-buttons">
                        <button class="track-btn ${track.mute ? 'active' : ''}" data-track="${track.id}" data-action="mute">[M]</button>
                        <button class="track-btn" data-track="${track.id}" data-action="randomize">[R]</button>
                        <button class="track-btn" data-track="${track.id}" data-action="clear">[C]</button>
                    </div>
                </div>
                <div class="steps-grid" data-track="${track.id}">
                    ${generateStepsHTML(track)}
                </div>
            </div>
        `).join('');
        
        container.innerHTML = tracksHTML;
        setupTrackListeners();
    } else {
        // Partial update - only update what changed
        updateTrackVisuals();
    }
}

// Force a full re-render (use when loading patterns, etc.)
export function forceRenderTracks() {
    const container = document.getElementById('tracks-panel');
    if (!container) return;
    
    const tracksHTML = Object.values(state.tracks).map(track => `
        <div class="track ${track.id === state.selectedTrack ? 'selected' : ''}" data-track="${track.id}">
            <div class="track-header">
                <div class="track-name">${track.name} — ${ENGINE_SPECS[track.engine]?.name || track.engine}</div>
                <div class="track-buttons">
                    <button class="track-btn ${track.mute ? 'active' : ''}" data-track="${track.id}" data-action="mute">[M]</button>
                    <button class="track-btn" data-track="${track.id}" data-action="randomize">[R]</button>
                    <button class="track-btn" data-track="${track.id}" data-action="clear">[C]</button>
                </div>
            </div>
            <div class="steps-grid" data-track="${track.id}">
                ${generateStepsHTML(track)}
            </div>
        </div>
    `).join('');
    
    container.innerHTML = tracksHTML;
    setupTrackListeners();
}

function updateTrackVisuals() {
    // Update only the visual state without destroying DOM
    Object.values(state.tracks).forEach(track => {
        const trackElement = document.querySelector(`.track[data-track="${track.id}"]`);
        if (!trackElement) return;
        
        // Update selected state
        if (track.id === state.selectedTrack) {
            trackElement.classList.add('selected');
        } else {
            trackElement.classList.remove('selected');
        }
        
        // Update mute button
        const muteBtn = trackElement.querySelector('[data-action="mute"]');
        if (muteBtn) {
            if (track.mute) {
                muteBtn.classList.add('active');
            } else {
                muteBtn.classList.remove('active');
            }
        }
        
        // Update track name (in case engine changed)
        const trackName = trackElement.querySelector('.track-name');
        if (trackName) {
            trackName.textContent = `${track.name} — ${ENGINE_SPECS[track.engine]?.name || track.engine}`;
        }
        
        // Update steps
        const stepsGrid = trackElement.querySelector('.steps-grid');
        if (stepsGrid) {
            track.steps.forEach((isActive, i) => {
                const stepContainers = stepsGrid.querySelectorAll('.step-container');
                if (stepContainers[i]) {
                    const step = stepContainers[i].querySelector('.step');
                    const velocityBar = stepContainers[i].querySelector('.velocity-bar');
                    const velocityDisplay = stepContainers[i].querySelector('.velocity-display');
                    const pLock = stepContainers[i].querySelector('.lock-btn.plock');
                    const slide = stepContainers[i].querySelector('.lock-btn.slide');
                    const conditionLabel = stepContainers[i].querySelector('.condition-label');
                    
                    if (step) {
                        // Update step classes
                        const isPlaying = state.isPlaying && state.currentStep === i;
                        const hasP = track.stepLocks[i] !== null;
                        
                        step.className = 'step';
                        if (isActive) step.classList.add('active');
                        if (isPlaying) step.classList.add('playing');
                        if (hasP) step.classList.add('has-locks');
                        
                        // Update velocity
                        if (velocityBar) {
                            velocityBar.style.height = `${track.velocities[i] * 100}%`;
                        }
                        if (velocityDisplay) {
                            velocityDisplay.textContent = Math.round(track.velocities[i] * 100);
                        }
                    }
                    
                    // Update locks
                    if (pLock) {
                        if (track.stepLocks[i]) {
                            pLock.classList.add('active');
                        } else {
                            pLock.classList.remove('active');
                        }
                    }
                    if (slide) {
                        if (track.stepSlides[i]) {
                            slide.classList.add('active');
                        } else {
                            slide.classList.remove('active');
                        }
                    }
                    
                    // Update condition
                    if (conditionLabel) {
                        conditionLabel.textContent = track.stepConditions[i];
                    }
                }
            });
        }
    });
}

function generateStepsHTML(track) {
    return Array(16).fill(0).map((_, i) => {
        const isActive = track.steps[i];
        const velocity = track.velocities[i];
        const condition = track.stepConditions[i];
        const hasP = track.stepLocks[i] !== null;
        const hasS = track.stepSlides[i];
        const isPlaying = state.isPlaying && state.currentStep === i;
        
        let stepClass = 'step';
        if (isActive) stepClass += ' active';
        if (isPlaying) stepClass += ' playing';
        if (hasP) stepClass += ' has-locks';
        
        return `
            <div class="step-container">
                <div class="lock-buttons">
                    <button class="lock-btn plock ${hasP ? 'active' : ''}" data-track="${track.id}" data-step="${i}" data-lock="p">[P]</button>
                    <button class="lock-btn slide ${hasS ? 'active' : ''}" data-track="${track.id}" data-step="${i}" data-lock="s">[S]</button>
                </div>
                <div class="${stepClass}" data-track="${track.id}" data-step="${i}">
                    <div class="velocity-bar" style="height: ${velocity * 100}%"></div>
                    <div class="velocity-display">${Math.round(velocity * 100)}</div>
                </div>
                <div class="condition-label" data-track="${track.id}" data-step="${i}">${condition}</div>
            </div>
        `;
    }).join('');
}

export function renderSidePanel() {
    const panel = document.getElementById('side-panel');
    if (!panel) return;
    
    const track = getSelectedTrack();
    if (!track) return;
    
    const hasNormalState = track.normalState !== null;
    
    panel.innerHTML = `
        <div class="side-panel-header">
            <div class="side-panel-title">${track.name} — ${ENGINE_SPECS[track.engine]?.name || track.engine} ●</div>
            <button class="btn small close-btn">[CLOSE]</button>
            <button class="btn small" id="trigger-btn">TRIGGER</button>
        </div>
        
        <div class="section-title">ENGINE</div>
        <div class="engine-selector" id="engine-selector"></div>
        
        <div class="normal-state-buttons">
            <button class="btn small" id="set-normal-btn">SET NORMAL <span class="normal-indicator ${hasNormalState ? 'visible' : ''}">●</span></button>
            <button class="btn small" id="recall-normal-btn">RECALL NORMAL</button>
        </div>
        
        <div class="morph-section">
            <div class="section-title">SOUND MORPH</div>
            <div class="morph-controls">
                <button class="btn small" id="generate-morph-btn">GENERATE</button>
                <button class="btn small" id="lock-morph-btn">LOCK</button>
            </div>
            <div class="morph-slider-container">
                <label>Current → Random</label>
                <input type="range" class="slider" id="morph-slider" min="0" max="100" value="${track.morphAmount}" />
                <span class="morph-amount">${track.morphAmount}%</span>
            </div>
        </div>
        
        <div class="section-title">PARAMETERS</div>
        <div class="parameters-section" id="parameters-section"></div>
        
        <div class="section-title">FX CHAIN</div>
        <div class="parameters-section" id="fx-section"></div>
        
        <div class="section-title">QUICK ACTIONS</div>
        <div class="quick-actions">
            <button class="btn small" id="randomize-pattern-btn">RANDOMIZE PATTERN</button>
            <button class="btn small" id="test-sound-btn">TEST SOUND</button>
            <button class="btn small warning" id="clear-locks-btn">CLEAR ALL LOCKS</button>
        </div>
    `;
    
    renderEngineSelector();
    renderParameters();
    renderFX();
    setupSidePanelListeners();
}

function renderEngineSelector() {
    const container = document.getElementById('engine-selector');
    if (!container) return;
    
    const track = getSelectedTrack();
    const engines = ['808', 'fm', 'snare', 'noise', 'modal', 'physical', 'additive', 'fm2', 'ks', 'buchla'];
    
    container.innerHTML = engines.map(engineId => `
        <button class="engine-btn ${track.engine === engineId ? 'active' : ''}" data-engine="${engineId}">
            ${ENGINE_SPECS[engineId]?.name || engineId}
        </button>
    `).join('');
}

function renderParameters() {
    const container = document.getElementById('parameters-section');
    if (!container) return;
    
    const track = getSelectedTrack();
    const spec = ENGINE_SPECS[track.engine];
    if (!spec) return;
    
    // Show actual current params (live values)
    const displayParams = track.params;
    
    container.innerHTML = Object.entries(spec.params).map(([key, param]) => {
        const value = displayParams[key];
        return `
            <div class="param-control">
                <label class="param-label">${param.label}</label>
                <input type="range" class="slider" data-param="${key}" 
                    min="${param.min}" max="${param.max}" step="${param.step}" value="${value}" />
                <span class="param-value">${value.toFixed(param.step < 0.01 ? 3 : 2)}</span>
            </div>
        `;
    }).join('');
}

function renderFX() {
    const container = document.getElementById('fx-section');
    if (!container) return;
    
    const track = getSelectedTrack();
    
    container.innerHTML = Object.entries(FX_SPECS).map(([key, spec]) => {
        const value = track.fx[key];
        return `
            <div class="param-control">
                <label class="param-label">${spec.label}</label>
                <input type="range" class="slider" data-fx="${key}" 
                    min="${spec.min}" max="${spec.max}" step="${spec.step}" value="${value}" />
                <span class="param-value">${value.toFixed(spec.step < 0.01 ? 3 : 2)}</span>
            </div>
        `;
    }).join('');
}

export function renderBottomControls() {
    const container = document.getElementById('bottom-controls');
    if (!container) return;
    
    container.innerHTML = `
        <div class="morph-section">
            <div class="section-title">GLOBAL MORPH</div>
            <div class="morph-controls">
                <button class="btn small" id="global-generate-btn">GENERATE</button>
                <button class="btn small" id="global-lock-btn">LOCK</button>
            </div>
            <div class="morph-slider-container">
                <label>Current → Random</label>
                <input type="range" class="slider" id="global-morph-slider" min="0" max="100" value="${state.globalMorphAmount}" />
                <span class="morph-amount">${state.globalMorphAmount}%</span>
            </div>
        </div>
        
        <div class="section-title">MASTER FX</div>
        <div class="parameters-section" id="master-fx-section"></div>
    `;
    
    renderMasterFX();
    setupBottomControlsListeners();
}

function renderMasterFX() {
    const container = document.getElementById('master-fx-section');
    if (!container) return;
    
    container.innerHTML = Object.entries(FX_SPECS).map(([key, spec]) => {
        const value = state.masterFX[key];
        return `
            <div class="param-control">
                <label class="param-label">${spec.label}</label>
                <input type="range" class="slider" data-master-fx="${key}" 
                    min="${spec.min}" max="${spec.max}" step="${spec.step}" value="${value}" />
                <span class="param-value">${value.toFixed(spec.step < 0.01 ? 3 : 2)}</span>
            </div>
        `;
    }).join('');
}

function getMorphedParams(track) {
    if (!track.targetParams || track.morphAmount === 0) {
        return track.params;
    }
    
    const t = track.morphAmount / 100;
    const morphed = {};
    
    Object.keys(track.params).forEach(key => {
        const current = track.params[key];
        const target = track.targetParams.params[key];
        if (target !== undefined) {
            morphed[key] = current + (target - current) * t;
        } else {
            morphed[key] = current;
        }
    });
    
    return morphed;
}

// Event Listeners Setup
function setupEventListeners() {
    // Transport controls
    document.getElementById('play-btn')?.addEventListener('click', togglePlay);
    document.getElementById('reset-btn')?.addEventListener('click', resetSequencer);
    document.getElementById('tempo-input')?.addEventListener('change', (e) => {
        updateTempo(parseInt(e.target.value));
    });
    
    // Pattern bank
    document.getElementById('save-pattern-btn')?.addEventListener('click', () => {
        patternBank.savePattern(state.currentPattern);
        renderPatternBank();
        showFeedback('SAVED!');
    });
    
    document.getElementById('copy-pattern-btn')?.addEventListener('click', () => {
        patternBank.copyPattern(state.currentPattern);
        showFeedback('COPIED!');
    });
    
    document.getElementById('clear-pattern-btn')?.addEventListener('click', () => {
        if (confirm('Clear this pattern slot?')) {
            patternBank.clearPattern(state.currentPattern);
            renderPatternBank();
            showFeedback('CLEARED!');
        }
    });
    
    document.getElementById('magic-btn')?.addEventListener('click', async () => {
        await patternBank.loadMagicPattern();
        forceRenderTracks();
        showFeedback('MAGIC!');
    });
    
    // JSON import/export
    setupJSONHandlers();
}

function setupTrackListeners() {
    // Track selection - enabled during playback
    document.querySelectorAll('.track').forEach(trackElement => {
        // Use a simpler approach - handle at the track level and check what was clicked
        trackElement.addEventListener('click', function(e) {
            const clickedElement = e.target;
            
            // If clicked element or any parent is a button, return
            if (clickedElement.closest('button')) {
                return;
            }
            
            // If clicked element or any parent is a step, return  
            if (clickedElement.closest('.step')) {
                return;
            }
            
            // If clicked on condition label, return
            if (clickedElement.classList.contains('condition-label')) {
                return;
            }
            
            // Otherwise, select this track
            const trackId = this.dataset.track;
            
            // Update selected track in state
            setSelectedTrack(trackId);
            
            // Update visual selection without full re-render
            document.querySelectorAll('.track').forEach(t => {
                if (t.dataset.track === trackId) {
                    t.classList.add('selected');
                } else {
                    t.classList.remove('selected');
                }
            });
            
            // Update side panel to show new track
            renderSidePanel();
        });
    });
    
    // Track buttons
    document.querySelectorAll('.track-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const trackId = btn.dataset.track;
            const action = btn.dataset.action;
            const track = state.tracks[trackId];
            
            if (action === 'mute') {
                track.mute = !track.mute;
                renderTracks(); // Just visual update, no need to force
            } else if (action === 'randomize') {
                randomizeTrackPattern(track);
                forceRenderTracks(); // Steps changed, need full render
            } else if (action === 'clear') {
                clearTrackPattern(track);
                forceRenderTracks(); // Steps changed, need full render
            }
        });
    });
    
    // Step interactions
    setupStepListeners();
    setupLockListeners();
    setupConditionListeners();
}

function setupStepListeners() {
    document.querySelectorAll('.step').forEach(step => {
        step.addEventListener('mousedown', handleStepMouseDown);
        step.addEventListener('mousemove', handleStepMouseMove);
        step.addEventListener('mouseup', handleStepMouseUp);
        step.addEventListener('mouseleave', handleStepMouseUp);
    });
}

function handleStepMouseDown(e) {
    const step = e.currentTarget;
    const trackId = step.dataset.track;
    const stepIndex = parseInt(step.dataset.step);
    const track = state.tracks[trackId];
    
    dragState = {
        active: true,
        trackId,
        stepIndex,
        startY: e.clientY,
        startVelocity: track.velocities[stepIndex],
        wasActive: track.steps[stepIndex]
    };
    
    e.preventDefault();
}

function handleStepMouseMove(e) {
    if (!dragState.active) return;
    
    const deltaY = dragState.startY - e.clientY;
    
    if (Math.abs(deltaY) > 3) {
        const track = state.tracks[dragState.trackId];
        const newVelocity = Math.max(0, Math.min(1, dragState.startVelocity + (deltaY * 0.01)));
        track.velocities[dragState.stepIndex] = newVelocity;
        
        if (!dragState.wasActive) {
            track.steps[dragState.stepIndex] = true;
        }
        
        renderTracks();
    }
}

function handleStepMouseUp(e) {
    if (!dragState.active) return;
    
    const deltaY = Math.abs(dragState.startY - e.clientY);
    
    if (deltaY <= 3) {
        // Toggle step
        const track = state.tracks[dragState.trackId];
        track.steps[dragState.stepIndex] = !track.steps[dragState.stepIndex];
        renderTracks();
    }
    
    dragState.active = false;
}

function setupLockListeners() {
    document.querySelectorAll('.lock-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const trackId = btn.dataset.track;
            const stepIndex = parseInt(btn.dataset.step);
            const lockType = btn.dataset.lock;
            const track = state.tracks[trackId];
            
            if (lockType === 'p') {
                if (track.stepLocks[stepIndex]) {
                    track.stepLocks[stepIndex] = null;
                } else {
                    // Lock current live parameters
                    track.stepLocks[stepIndex] = {
                        engine: track.engine,
                        params: { ...track.params },
                        fx: { ...track.fx }
                    };
                }
            } else if (lockType === 's') {
                track.stepSlides[stepIndex] = !track.stepSlides[stepIndex];
            }
            
            renderTracks();
        });
    });
}

function setupConditionListeners() {
    document.querySelectorAll('.condition-label').forEach(label => {
        label.addEventListener('click', (e) => {
            e.stopPropagation();
            const trackId = label.dataset.track;
            const stepIndex = parseInt(label.dataset.step);
            showConditionModal(trackId, stepIndex);
        });
    });
}

function setupSidePanelListeners() {
    // Engine selector
    document.querySelectorAll('.engine-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const track = getSelectedTrack();
            track.engine = btn.dataset.engine;
            
            // Get default params for new engine
            const spec = ENGINE_SPECS[track.engine];
            track.params = {};
            Object.entries(spec.params).forEach(([key, param]) => {
                track.params[key] = param.default;
            });
            
            // Reset morph
            track.targetParams = null;
            track.morphAmount = 0;
            
            renderTracks();
            renderSidePanel();
        });
    });
    
    // Normal state buttons
    document.getElementById('set-normal-btn')?.addEventListener('click', () => {
        const track = getSelectedTrack();
        track.normalState = {
            engine: track.engine,
            params: { ...track.params },
            fx: { ...track.fx }
        };
        renderSidePanel();
        showFeedback('NORMAL STATE SAVED!');
    });
    
    document.getElementById('recall-normal-btn')?.addEventListener('click', () => {
        const track = getSelectedTrack();
        if (track.normalState) {
            track.engine = track.normalState.engine;
            track.params = { ...track.normalState.params };
            track.fx = { ...track.normalState.fx };
            track.targetParams = null;
            track.morphAmount = 0;
            renderTracks();
            renderSidePanel();
            showFeedback('NORMAL STATE RECALLED!');
        }
    });
    
    // Morph controls
    document.getElementById('generate-morph-btn')?.addEventListener('click', () => {
        const track = getSelectedTrack();
        const spec = ENGINE_SPECS[track.engine];
        
        track.targetParams = {
            engine: track.engine,
            params: {}
        };
        
        Object.entries(spec.params).forEach(([key, param]) => {
            const range = param.max - param.min;
            track.targetParams.params[key] = param.min + Math.random() * range;
        });
        
        showFeedback('GENERATED!');
    });
    
    document.getElementById('lock-morph-btn')?.addEventListener('click', () => {
        const track = getSelectedTrack();
        if (track.targetParams && track.morphAmount > 0) {
            const morphed = getMorphedParams(track);
            track.params = { ...morphed };
            track.targetParams = null;
            track.morphAmount = 0;
            renderSidePanel();
            showFeedback('LOCKED!');
        }
    });
    
    // Morph slider - updates live params
    const morphSlider = document.getElementById('morph-slider');
    if (morphSlider) {
        const updateMorph = (e) => {
            const track = getSelectedTrack();
            const newAmount = parseInt(e.target.value);
            track.morphAmount = newAmount;
            
            // Apply morph to live params
            if (track.targetParams && newAmount > 0) {
                const morphed = getMorphedParams(track);
                Object.keys(morphed).forEach(key => {
                    track.params[key] = morphed[key];
                });
            }
            
            // Update display
            const amountDisplay = morphSlider.parentElement.querySelector('.morph-amount');
            if (amountDisplay) {
                amountDisplay.textContent = `${newAmount}%`;
            }
            
            // Re-render parameters to show new values
            renderParameters();
        };
        morphSlider.addEventListener('input', updateMorph);
        morphSlider.addEventListener('change', updateMorph);
    }
    
    // Parameter sliders - update live params immediately
    document.querySelectorAll('[data-param]').forEach(slider => {
        const updateParam = (e) => {
            const track = getSelectedTrack();
            const value = parseFloat(e.target.value);
            track.params[slider.dataset.param] = value;
            
            // Update display value immediately
            const valueDisplay = slider.parentElement.querySelector('.param-value');
            if (valueDisplay) {
                const spec = ENGINE_SPECS[track.engine];
                const paramSpec = spec.params[slider.dataset.param];
                valueDisplay.textContent = value.toFixed(paramSpec.step < 0.01 ? 3 : 2);
            }
        };
        slider.addEventListener('input', updateParam);
        slider.addEventListener('change', updateParam);
    });
    
    // FX sliders - immediate updates
    document.querySelectorAll('[data-fx]').forEach(slider => {
        const updateFX = (e) => {
            const track = getSelectedTrack();
            const value = parseFloat(e.target.value);
            track.fx[slider.dataset.fx] = value;
            
            // Update display value immediately
            const valueDisplay = slider.parentElement.querySelector('.param-value');
            if (valueDisplay) {
                const spec = FX_SPECS[slider.dataset.fx];
                valueDisplay.textContent = value.toFixed(spec.step < 0.01 ? 3 : 2);
            }
        };
        slider.addEventListener('input', updateFX);
        slider.addEventListener('change', updateFX);
    });
    
    // Quick actions
    document.getElementById('trigger-btn')?.addEventListener('click', async () => {
        const track = getSelectedTrack();
        await audioEngine.playDrum(track.id, track.engine, track.params, track.fx, 0.8);
    });
    
    document.getElementById('test-sound-btn')?.addEventListener('click', async () => {
        const track = getSelectedTrack();
        await audioEngine.playDrum(track.id, track.engine, track.params, track.fx, 0.8);
    });
    
    document.getElementById('randomize-pattern-btn')?.addEventListener('click', () => {
        const track = getSelectedTrack();
        randomizeTrackPattern(track);
        renderTracks();
    });
    
    document.getElementById('clear-locks-btn')?.addEventListener('click', () => {
        const track = getSelectedTrack();
        track.stepLocks = Array(16).fill(null);
        track.stepSlides = Array(16).fill(false);
        renderTracks();
        showFeedback('LOCKS CLEARED!');
    });
}

function setupBottomControlsListeners() {
    document.getElementById('global-generate-btn')?.addEventListener('click', () => {
        Object.values(state.tracks).forEach(track => {
            const spec = ENGINE_SPECS[track.engine];
            track.targetParams = {
                engine: track.engine,
                params: {}
            };
            
            Object.entries(spec.params).forEach(([key, param]) => {
                const range = param.max - param.min;
                track.targetParams.params[key] = param.min + Math.random() * range;
            });
        });
        
        showFeedback('GLOBAL MORPH GENERATED!');
    });
    
    document.getElementById('global-lock-btn')?.addEventListener('click', () => {
        Object.values(state.tracks).forEach(track => {
            if (track.targetParams && track.morphAmount > 0) {
                const morphed = getMorphedParams(track);
                track.params = { ...morphed };
                track.targetParams = null;
                track.morphAmount = 0;
            }
        });
        
        state.globalMorphAmount = 0;
        renderSidePanel();
        renderBottomControls();
        showFeedback('GLOBAL MORPH LOCKED!');
    });
    
    const globalMorphSlider = document.getElementById('global-morph-slider');
    if (globalMorphSlider) {
        const updateGlobalMorph = (e) => {
            const amount = parseInt(e.target.value);
            state.globalMorphAmount = amount;
            
            Object.values(state.tracks).forEach(track => {
                track.morphAmount = amount;
                
                // Apply morph to live params
                if (track.targetParams && amount > 0) {
                    const morphed = getMorphedParams(track);
                    Object.keys(morphed).forEach(key => {
                        track.params[key] = morphed[key];
                    });
                }
            });
            
            // Update display
            const amountDisplay = globalMorphSlider.parentElement.querySelector('.morph-amount');
            if (amountDisplay) {
                amountDisplay.textContent = `${amount}%`;
            }
            
            renderSidePanel();
        };
        globalMorphSlider.addEventListener('input', updateGlobalMorph);
        globalMorphSlider.addEventListener('change', updateGlobalMorph);
    }
    
    document.querySelectorAll('[data-master-fx]').forEach(slider => {
        const updateMasterFX = (e) => {
            const value = parseFloat(e.target.value);
            state.masterFX[slider.dataset.masterFx] = value;
            
            // Update display value immediately
            const valueDisplay = slider.parentElement.querySelector('.param-value');
            if (valueDisplay) {
                const spec = FX_SPECS[slider.dataset.masterFx];
                valueDisplay.textContent = value.toFixed(spec.step < 0.01 ? 3 : 2);
            }
            
            if (audioEngine && audioEngine.updateMasterFX) {
                audioEngine.updateMasterFX(state.masterFX);
            }
        };
        slider.addEventListener('input', updateMasterFX);
        slider.addEventListener('change', updateMasterFX);
    });
}

// Helper functions
function togglePlay() {
    if (state.isPlaying) {
        stopSequencer();
        document.getElementById('play-btn').textContent = 'PLAY';
        document.getElementById('play-btn').classList.remove('playing');
    } else {
        startSequencer();
        document.getElementById('play-btn').textContent = 'STOP';
        document.getElementById('play-btn').classList.add('playing');
    }
}

function selectPattern(index) {
    state.currentPattern = index;
    
    if (patternBank.hasPattern(index)) {
        patternBank.loadPattern(index);
        renderTracks();
        renderSidePanel();
    }
    
    renderPatternBank();
}

function randomizeTrackPattern(track) {
    for (let i = 0; i < 16; i++) {
        track.steps[i] = Math.random() > 0.6;
        track.velocities[i] = 0.6 + Math.random() * 0.4;
    }
}

function clearTrackPattern(track) {
    track.steps = Array(16).fill(false);
    track.velocities = Array(16).fill(0.8);
}

function showConditionModal(trackId, stepIndex) {
    const modal = document.getElementById('condition-modal');
    const track = state.tracks[trackId];
    const currentCondition = track.stepConditions[stepIndex];
    
    const conditions = ['1:1', '1:2', '2:2', '1:3', '2:3', '3:3', '1:4', '2:4', '3:4', '4:4'];
    
    modal.innerHTML = `
        <div class="modal-overlay">
            <div class="modal">
                <div class="modal-title">SELECT CONDITION</div>
                <div class="condition-options">
                    ${conditions.map(cond => `
                        <div class="condition-option ${cond === currentCondition ? 'active' : ''}" data-condition="${cond}">
                            ${cond}
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
    `;
    
    modal.style.display = 'block';
    
    modal.querySelectorAll('.condition-option').forEach(opt => {
        opt.addEventListener('click', () => {
            track.stepConditions[stepIndex] = opt.dataset.condition;
            modal.style.display = 'none';
            renderTracks();
        });
    });
    
    modal.querySelector('.modal-overlay').addEventListener('click', (e) => {
        if (e.target.classList.contains('modal-overlay')) {
            modal.style.display = 'none';
        }
    });
}

function setupJSONHandlers() {
    document.getElementById('save-json-btn')?.addEventListener('click', () => {
        const stateData = {
            ...state.saveCompleteState(),
            patterns: patternBank.exportAllPatterns().patterns
        };
        
        const json = JSON.stringify(stateData, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `stepper-preset-${getTimestamp()}.json`;
        a.click();
        
        URL.revokeObjectURL(url);
        showFeedback('SAVED!');
    });
    
    document.getElementById('load-json-btn')?.addEventListener('click', () => {
        document.getElementById('load-json-input').click();
    });
    
    document.getElementById('load-json-input')?.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const data = JSON.parse(event.target.result);
                state.loadCompleteState(data);
                
                if (data.patterns) {
                    patternBank.importAllPatterns({ version: '1.0', patterns: data.patterns });
                }
                
                renderApp();
                showFeedback('LOADED!');
            } catch (error) {
                alert('Error loading file: ' + error.message);
            }
        };
        reader.readAsText(file);
    });
    
    document.getElementById('export-pattern-btn')?.addEventListener('click', () => {
        const patternData = patternBank.exportPattern(state.currentPattern);
        if (!patternData) {
            alert('No pattern to export');
            return;
        }
        
        const json = JSON.stringify(patternData, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `stepper-pattern-${state.currentPattern + 1}-${getTimestamp()}.json`;
        a.click();
        
        URL.revokeObjectURL(url);
        showFeedback('EXPORTED!');
    });
    
    document.getElementById('import-pattern-btn')?.addEventListener('click', () => {
        document.getElementById('import-pattern-input').click();
    });
    
    document.getElementById('import-pattern-input')?.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const data = JSON.parse(event.target.result);
                patternBank.importPattern(state.currentPattern, data);
                patternBank.loadPattern(state.currentPattern);
                renderApp();
                showFeedback('IMPORTED!');
            } catch (error) {
                alert('Error importing pattern: ' + error.message);
            }
        };
        reader.readAsText(file);
    });
}

function showFeedback(message) {
    const feedback = document.createElement('div');
    feedback.className = 'feedback';
    feedback.textContent = message;
    document.body.appendChild(feedback);
    
    setTimeout(() => {
        feedback.remove();
    }, 3000);
}

function getTimestamp() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
}

export function updateBarDisplay() {
    const display = document.getElementById('bar-display');
    if (display) {
        display.textContent = `${state.currentBar + 1}/4`;
    }
}
