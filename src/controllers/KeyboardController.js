/**
 * KeyboardController.js
 * Handles QWERTY computer keyboard events for synth playback and octave shifting
 */

export class KeyboardController {
  constructor({ onNoteOn, onNoteOff, onOctaveChange }) {
    this.onNoteOn = onNoteOn;
    this.onNoteOff = onNoteOff;
    this.onOctaveChange = onOctaveChange;

    this.octave = 0; // Octave offset: -3 to +4 (0 means C4 = MIDI 60)
    this.activeKeys = new Set(); // Currently held physical keys

    // Note map relative to C4 (MIDI 60)
    // Keys: A, W, S, E, D, F, T, G, Z, H, J (and U for A#, K for High C)
    this.keyToPitchOffset = {
      'KeyA': 0,   // C
      'KeyW': 1,   // C#
      'KeyS': 2,   // D
      'KeyE': 3,   // D#
      'KeyD': 4,   // E
      'KeyF': 5,   // F
      'KeyT': 6,   // F#
      'KeyG': 7,   // G
      'KeyZ': 8,   // G# (or A-flat)
      'KeyH': 9,   // A
      'KeyU': 10,  // A#
      'KeyJ': 11,  // B
      'KeyK': 12   // C5 (High C)
    };

    // Character key fallback mapping for various keyboard layouts
    this.charToPitchOffset = {
      'a': 0, 'w': 1, 's': 2, 'e': 3, 'd': 4, 'f': 5,
      't': 6, 'g': 7, 'z': 8, 'h': 9, 'u': 10, 'j': 11, 'k': 12
    };

    this.initListeners();
  }

  initListeners() {
    window.addEventListener('keydown', (e) => this.handleKeyDown(e));
    window.addEventListener('keyup', (e) => this.handleKeyUp(e));
  }

  getPitchOffset(e) {
    if (this.keyToPitchOffset[e.code] !== undefined) {
      return { offset: this.keyToPitchOffset[e.code], keyId: e.code };
    }
    const char = e.key.toLowerCase();
    if (this.charToPitchOffset[char] !== undefined) {
      return { offset: this.charToPitchOffset[char], keyId: `char_${char}` };
    }
    return null;
  }

  handleKeyDown(e) {
    // Ignore input typing if user is focused on an input or textarea
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) {
      return;
    }

    if (e.repeat) return; // Prevent key repeat retriggers

    const code = e.code;
    const char = e.key.toUpperCase();

    // Octave Shifting: X (Up) and Y (Down)
    if (code === 'KeyX' || char === 'X') {
      this.setOctave(this.octave + 1);
      e.preventDefault();
      return;
    }

    if (code === 'KeyY' || char === 'Y') {
      this.setOctave(this.octave - 1);
      e.preventDefault();
      return;
    }

    // Check Note Keys
    const pitch = this.getPitchOffset(e);
    if (pitch !== null) {
      const keyIdentifier = pitch.keyId;
      if (!this.activeKeys.has(keyIdentifier)) {
        this.activeKeys.add(keyIdentifier);
        const midiNote = 60 + pitch.offset + (this.octave * 12);
        if (this.onNoteOn) {
          this.onNoteOn(`qwerty_${keyIdentifier}`, midiNote, 0.85);
        }
      }
      e.preventDefault();
    }
  }

  handleKeyUp(e) {
    const pitch = this.getPitchOffset(e);
    if (pitch !== null) {
      const keyIdentifier = pitch.keyId;
      if (this.activeKeys.has(keyIdentifier)) {
        this.activeKeys.delete(keyIdentifier);
        const midiNote = 60 + pitch.offset + (this.octave * 12);
        if (this.onNoteOff) {
          this.onNoteOff(`qwerty_${keyIdentifier}`, midiNote);
        }
      }
    }
  }

  setOctave(newOctave) {
    // Clamp octave offset between -3 and +4 (C1 to C8 range)
    this.octave = Math.max(-3, Math.min(4, newOctave));
    if (this.onOctaveChange) {
      this.onOctaveChange(this.octave);
    }
  }

  getOctaveName() {
    const baseOctave = 4 + this.octave;
    return `C${baseOctave}`;
  }
}
