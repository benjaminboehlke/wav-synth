/**
 * PianoKeyboard.js
 * Interactive on-screen synth keyboard displaying mapped QWERTY keys
 * and highlighting active notes in real-time
 */

export class PianoKeyboard {
  constructor(containerElement, { onNoteOn, onNoteOff }) {
    this.container = containerElement;
    this.onNoteOn = onNoteOn;
    this.onNoteOff = onNoteOff;

    this.octaveOffset = 0;
    this.activeMidiNotes = new Set();
    this.activeMouseNote = null;

    // Standard 17-key layout definition (1.5 octaves: C through E)
    // Offset from C4 (60)
    this.keysDef = [
      { offset: 0,  type: 'white', noteName: 'C',  qwerty: 'A' },
      { offset: 1,  type: 'black', noteName: 'C#', qwerty: 'W' },
      { offset: 2,  type: 'white', noteName: 'D',  qwerty: 'S' },
      { offset: 3,  type: 'black', noteName: 'D#', qwerty: 'E' },
      { offset: 4,  type: 'white', noteName: 'E',  qwerty: 'D' },
      { offset: 5,  type: 'white', noteName: 'F',  qwerty: 'F' },
      { offset: 6,  type: 'black', noteName: 'F#', qwerty: 'T' },
      { offset: 7,  type: 'white', noteName: 'G',  qwerty: 'G' },
      { offset: 8,  type: 'black', noteName: 'G#', qwerty: 'Z' },
      { offset: 9,  type: 'white', noteName: 'A',  qwerty: 'H' },
      { offset: 10, type: 'black', noteName: 'A#', qwerty: 'U' },
      { offset: 11, type: 'white', noteName: 'B',  qwerty: 'J' },
      { offset: 12, type: 'white', noteName: 'C',  qwerty: 'K' },
      { offset: 13, type: 'black', noteName: 'C#', qwerty: '' },
      { offset: 14, type: 'white', noteName: 'D',  qwerty: '' },
      { offset: 15, type: 'black', noteName: 'D#', qwerty: '' },
      { offset: 16, type: 'white', noteName: 'E',  qwerty: '' },
    ];

    this.render();
  }

  setOctave(octaveOffset) {
    this.octaveOffset = octaveOffset;
    this.updateKeyLabels();
  }

  render() {
    this.container.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.className = 'piano-wrapper';

    this.keysDef.forEach((key) => {
      const midiNote = 60 + key.offset + (this.octaveOffset * 12);
      const keyEl = document.createElement('div');
      keyEl.className = `piano-key key-${key.type}`;
      keyEl.dataset.offset = key.offset;
      keyEl.dataset.midi = midiNote;

      const badge = document.createElement('span');
      badge.className = 'key-badge';
      badge.textContent = key.qwerty ? key.qwerty : '';

      const noteLabel = document.createElement('span');
      noteLabel.className = 'note-label';
      const octNum = 4 + this.octaveOffset + (key.offset >= 12 ? 1 : 0);
      noteLabel.textContent = `${key.noteName}${octNum}`;

      keyEl.appendChild(badge);
      keyEl.appendChild(noteLabel);

      // Mouse / Touch Event Listeners
      keyEl.addEventListener('mousedown', (e) => {
        e.preventDefault();
        this.triggerMouseNoteOn(midiNote, keyEl);
      });

      keyEl.addEventListener('mouseenter', (e) => {
        if (e.buttons === 1) { // dragging across keys
          this.triggerMouseNoteOn(midiNote, keyEl);
        }
      });

      keyEl.addEventListener('mouseup', () => this.triggerMouseNoteOff());
      keyEl.addEventListener('mouseleave', () => {
        if (this.activeMouseNote === midiNote) {
          this.triggerMouseNoteOff();
        }
      });

      wrapper.appendChild(keyEl);
    });

    // Global mouseup release
    window.addEventListener('mouseup', () => this.triggerMouseNoteOff());

    this.container.appendChild(wrapper);
  }

  triggerMouseNoteOn(midiNote, keyEl) {
    if (this.activeMouseNote !== null) {
      this.triggerMouseNoteOff();
    }
    this.activeMouseNote = midiNote;
    if (this.onNoteOn) {
      this.onNoteOn(`mouse_${midiNote}`, midiNote, 0.9);
    }
    this.highlightNote(midiNote, true);
  }

  triggerMouseNoteOff() {
    if (this.activeMouseNote !== null) {
      const midiNote = this.activeMouseNote;
      this.activeMouseNote = null;
      if (this.onNoteOff) {
        this.onNoteOff(`mouse_${midiNote}`, midiNote);
      }
      this.highlightNote(midiNote, false);
    }
  }

  highlightNote(midiNote, active) {
    if (active) {
      this.activeMidiNotes.add(midiNote);
    } else {
      this.activeMidiNotes.delete(midiNote);
    }

    const keyEls = this.container.querySelectorAll('.piano-key');
    keyEls.forEach(el => {
      const offset = parseInt(el.dataset.offset, 10);
      const calculatedMidi = 60 + offset + (this.octaveOffset * 12);
      if (this.activeMidiNotes.has(calculatedMidi)) {
        el.classList.add('active');
      } else {
        el.classList.remove('active');
      }
    });
  }

  updateKeyLabels() {
    const keyEls = this.container.querySelectorAll('.piano-key');
    keyEls.forEach(el => {
      const offset = parseInt(el.dataset.offset, 10);
      const calculatedMidi = 60 + offset + (this.octaveOffset * 12);
      el.dataset.midi = calculatedMidi;

      const keyDef = this.keysDef.find(k => k.offset === offset);
      if (keyDef) {
        const noteLabel = el.querySelector('.note-label');
        if (noteLabel) {
          const octNum = 4 + this.octaveOffset + (offset >= 12 ? 1 : 0);
          noteLabel.textContent = `${keyDef.noteName}${octNum}`;
        }
      }

      if (this.activeMidiNotes.has(calculatedMidi)) {
        el.classList.add('active');
      } else {
        el.classList.remove('active');
      }
    });
  }
}
