/**
 * MidiController.js
 * Handles Web MIDI API access, device connection, MIDI Note events,
 * and MIDI Control Change (CC) parameter mapping with localStorage persistence.
 */

const STORAGE_KEY = 'wav_synth_midi_mappings';

export class MidiController {
  constructor({ onNoteOn, onNoteOff, onStatusChange, onControlChange, onMidiLearnCC }) {
    this.onNoteOn = onNoteOn;
    this.onNoteOff = onNoteOff;
    this.onStatusChange = onStatusChange;
    this.onControlChange = onControlChange;
    this.onMidiLearnCC = onMidiLearnCC;

    this.midiAccess = null;
    this.connectedDevices = [];
    this.isLearning = false;

    // ccNumber (number) -> paramId (string)
    this.mappings = new Map();

    this.loadMappings();
    this.init();
  }

  async init() {
    if (!navigator.requestMIDIAccess) {
      if (this.onStatusChange) {
        this.onStatusChange({ supported: false, devices: [], statusText: 'Web MIDI API not supported in this browser' });
      }
      return;
    }

    try {
      this.midiAccess = await navigator.requestMIDIAccess();
      this.updateDevices();

      // Listen for MIDI device connection/disconnection events
      this.midiAccess.onstatechange = () => {
        this.updateDevices();
      };

    } catch (err) {
      console.warn('MIDI Access request failed:', err);
      if (this.onStatusChange) {
        this.onStatusChange({ supported: true, devices: [], statusText: 'MIDI Permission Denied or Failed' });
      }
    }
  }

  updateDevices() {
    if (!this.midiAccess) return;

    const inputs = Array.from(this.midiAccess.inputs.values());
    this.connectedDevices = inputs.map(i => i.name || 'MIDI Input Device');

    inputs.forEach(input => {
      // Avoid duplicate handler attachment
      input.onmidimessage = (msg) => this.handleMidiMessage(msg);
    });

    const isConnected = inputs.length > 0;
    const statusText = isConnected
      ? `Connected: ${this.connectedDevices.join(', ')}`
      : 'No MIDI Keyboard Detected (QWERTY Active)';

    if (this.onStatusChange) {
      this.onStatusChange({
        supported: true,
        devices: this.connectedDevices,
        isConnected,
        statusText
      });
    }
  }

  setLearningMode(learning) {
    this.isLearning = learning;
  }

  bindCc(ccNumber, paramId) {
    // Remove existing CC mapping for this param if any
    for (const [cc, pId] of this.mappings.entries()) {
      if (pId === paramId) {
        this.mappings.delete(cc);
      }
    }
    this.mappings.set(ccNumber, paramId);
    this.saveMappings();
  }

  unbindParam(paramId) {
    for (const [cc, pId] of this.mappings.entries()) {
      if (pId === paramId) {
        this.mappings.delete(cc);
      }
    }
    this.saveMappings();
  }

  unbindCc(ccNumber) {
    this.mappings.delete(ccNumber);
    this.saveMappings();
  }

  clearMappings() {
    this.mappings.clear();
    this.saveMappings();
  }

  getMappedCc(paramId) {
    for (const [cc, pId] of this.mappings.entries()) {
      if (pId === paramId) return cc;
    }
    return null;
  }

  getAllMappings() {
    const result = {};
    for (const [cc, pId] of this.mappings.entries()) {
      result[pId] = cc;
    }
    return result;
  }

  loadMappings() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const obj = JSON.parse(saved);
        Object.entries(obj).forEach(([ccStr, paramId]) => {
          this.mappings.set(parseInt(ccStr, 10), paramId);
        });
      }
    } catch (e) {
      console.warn('Could not load MIDI mappings from localStorage', e);
    }
  }

  saveMappings() {
    try {
      const obj = {};
      for (const [cc, paramId] of this.mappings.entries()) {
        obj[cc] = paramId;
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
    } catch (e) {
      console.warn('Could not save MIDI mappings to localStorage', e);
    }
  }

  handleMidiMessage(event) {
    const [command, note, velocity] = event.data;
    const cmdType = command & 0xf0;

    if (cmdType === 0x90 && velocity > 0) {
      // Note On
      const normVelocity = velocity / 127;
      if (this.onNoteOn) {
        this.onNoteOn(`midi_${note}`, note, normVelocity);
      }
    } else if (cmdType === 0x80 || (cmdType === 0x90 && velocity === 0)) {
      // Note Off
      if (this.onNoteOff) {
        this.onNoteOff(`midi_${note}`, note);
      }
    } else if (cmdType === 0xb0) {
      // Control Change (CC)
      const ccNumber = note;
      const ccValue = velocity; // 0..127
      const normValue = ccValue / 127;

      if (this.isLearning && this.onMidiLearnCC) {
        this.onMidiLearnCC(ccNumber, ccValue);
      }

      if (this.mappings.has(ccNumber)) {
        const paramId = this.mappings.get(ccNumber);
        if (this.onControlChange) {
          this.onControlChange(paramId, normValue, ccValue, ccNumber);
        }
      }
    }
  }
}
