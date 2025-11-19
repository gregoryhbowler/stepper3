export const NOTE_OPTIONS = Array.from({ length: 96 }, (_, i) => {
    const midi = i + 12; // C0
    return {
        midi,
        label: midiToNoteName(midi)
    };
});

export const SCALE_DEFINITIONS = [
    { id: 'ionian', name: 'Ionian (Major)', intervals: [0, 2, 4, 5, 7, 9, 11] },
    { id: 'dorian', name: 'Dorian', intervals: [0, 2, 3, 5, 7, 9, 10] },
    { id: 'phrygian', name: 'Phrygian', intervals: [0, 1, 3, 5, 7, 8, 10] },
    { id: 'lydian', name: 'Lydian', intervals: [0, 2, 4, 6, 7, 9, 11] },
    { id: 'mixolydian', name: 'Mixolydian', intervals: [0, 2, 4, 5, 7, 9, 10] },
    { id: 'aeolian', name: 'Aeolian (Natural Minor)', intervals: [0, 2, 3, 5, 7, 8, 10] },
    { id: 'locrian', name: 'Locrian', intervals: [0, 1, 3, 5, 6, 8, 10] },
    { id: 'harmonic_minor', name: 'Harmonic Minor', intervals: [0, 2, 3, 5, 7, 8, 11] },
    { id: 'melodic_minor', name: 'Melodic Minor', intervals: [0, 2, 3, 5, 7, 9, 11] },
    { id: 'whole_tone', name: 'Whole Tone', intervals: [0, 2, 4, 6, 8, 10] },
    { id: 'chromatic', name: 'Chromatic', intervals: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
    { id: 'major_pentatonic', name: 'Major Pentatonic', intervals: [0, 2, 4, 7, 9] },
    { id: 'minor_pentatonic', name: 'Minor Pentatonic', intervals: [0, 3, 5, 7, 10] },
    { id: 'blues', name: 'Blues', intervals: [0, 3, 5, 6, 7, 10] },
    { id: 'hungarian_minor', name: 'Hungarian Minor', intervals: [0, 2, 3, 6, 7, 8, 11] },
    { id: 'persian', name: 'Persian', intervals: [0, 1, 4, 5, 6, 8, 11] },
    { id: 'hirajoshi', name: 'Hirajoshi', intervals: [0, 2, 3, 7, 8] },
    { id: 'insen', name: 'Insen', intervals: [0, 1, 5, 7, 10] },
    { id: 'kumoi', name: 'Kumoi', intervals: [0, 2, 3, 7, 9] },
    { id: 'neapolitan_minor', name: 'Neapolitan Minor', intervals: [0, 1, 3, 5, 7, 8, 11] }
];

export const LFO_WAVES = [
    'sine',
    'triangle',
    'ramp_up',
    'ramp_down',
    'square',
    'random',
    'exp_up',
    'exp_down'
];

export const SEQUENCER_RATES = [0.25, 0.5, 1, 2, 4];

export function midiToNoteName(midi) {
    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const octave = Math.floor(midi / 12) - 1;
    const note = noteNames[midi % 12];
    return `${note}${octave}`;
}

export function getScaleDefinition(scaleId) {
    return SCALE_DEFINITIONS.find(scale => scale.id === scaleId) || SCALE_DEFINITIONS[0];
}

export function getScaleNotes(rootMidi, scaleId, rangeStart, rangeEnd) {
    const scale = getScaleDefinition(scaleId);
    const result = [];

    for (let note = rangeStart; note <= rangeEnd; note++) {
        const relative = ((note - rootMidi) % 12 + 12) % 12;
        if (scale.intervals.includes(relative)) {
            result.push(note);
        }
    }

    if (result.length === 0) {
        result.push(rootMidi);
    }

    return result;
}

export function clampIndex(value, max) {
    if (max <= 0) return 0;
    return Math.max(0, Math.min(max - 1, value));
}

export function cycleScaleIndex(scaleNotes, note, offset) {
    if (scaleNotes.length === 0) return note;
    const baseIndex = scaleNotes.indexOf(note);
    const safeIndex = baseIndex === -1 ? 0 : baseIndex;
    const newIndex = clampIndex(safeIndex + offset, scaleNotes.length);
    return scaleNotes[newIndex];
}
