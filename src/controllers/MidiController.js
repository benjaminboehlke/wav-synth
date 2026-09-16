/**
 * MidiController.js
 * Handles Web MIDI API access, device connection, and MIDI Note events
 */

export class MidiController {
  constructor({ onNoteOn, onNoteOff, onStatusChange }) {
    this.onNoteOn = onNoteOn;
    this.onNoteOff = onNoteOff;
    this.onStatusChange = onStatusChange;
    this.midiAccess = null;
    this.connectedDevices = [];

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
      this.midiAccess.onstatechange = (e) => {
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

  handleMidiMessage(event) {
    const [command, note, velocity] = event.data;

    // Command types (ignoring channel bits 0-15)
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
    }
  }
}
