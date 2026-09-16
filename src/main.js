/**
 * main.js
 * Application entry point wiring up UI, Audio Engine, Controllers, and Visualizers
 */

import { AudioEngine } from './audio/AudioEngine.js';
import { WaveformVisualizer } from './ui/WaveformVisualizer.js';
import { PianoKeyboard } from './ui/PianoKeyboard.js';
import { KeyboardController } from './controllers/KeyboardController.js';
import { MidiController } from './controllers/MidiController.js';
import { PRESETS } from './ui/PresetManager.js';

document.addEventListener('DOMContentLoaded', () => {
  // 1. Initialize Audio Engine
  const audioEngine = new AudioEngine();

  // Active note state tracker to handle polyphony across controllers
  const noteVelocityMap = new Map();

  // Helper note triggers
  const handleNoteOn = (keyId, midiNote, velocity = 0.8) => {
    noteVelocityMap.set(keyId, midiNote);
    audioEngine.noteOn(keyId, midiNote, velocity);
    pianoKeyboard.highlightNote(midiNote, true);
  };

  const handleNoteOff = (keyId, midiNote) => {
    noteVelocityMap.delete(keyId);
    audioEngine.noteOff(keyId);
    // Check if another active key is still holding this MIDI note
    const stillActive = Array.from(noteVelocityMap.values()).includes(midiNote);
    if (!stillActive) {
      pianoKeyboard.highlightNote(midiNote, false);
    }
  };

  // 2. Initialize Piano Keyboard UI
  const pianoContainer = document.getElementById('piano-container');
  const pianoKeyboard = new PianoKeyboard(pianoContainer, {
    onNoteOn: (keyId, midiNote, velocity) => handleNoteOn(keyId, midiNote, velocity),
    onNoteOff: (keyId, midiNote) => handleNoteOff(keyId, midiNote)
  });

  // 3. Initialize Waveform Visualizer Canvas
  const canvasElement = document.getElementById('waveform-canvas');
  const visualizer = new WaveformVisualizer(canvasElement, audioEngine, (newPos) => {
    updateParamUI('position', newPos);
    audioEngine.updateParam('position', newPos);
  });

  // 4. Initialize QWERTY Keyboard Controller (A,W,S,E,D,F,T,G,Z,H,J + X/Y)
  const keyboardController = new KeyboardController({
    onNoteOn: (keyId, midiNote, velocity) => handleNoteOn(keyId, midiNote, velocity),
    onNoteOff: (keyId, midiNote) => handleNoteOff(keyId, midiNote),
    onOctaveChange: (octaveOffset) => {
      pianoKeyboard.setOctave(octaveOffset);
      updateOctaveDisplay(octaveOffset);
    }
  });

  // Octave Display Updater
  const octaveDisplay = document.getElementById('octave-display');
  const updateOctaveDisplay = (octaveOffset) => {
    const octName = keyboardController.getOctaveName();
    const sign = octaveOffset >= 0 ? `+${octaveOffset}` : `${octaveOffset}`;
    octaveDisplay.textContent = `${octName} (${sign})`;
  };

  // 5. Initialize Web MIDI Controller
  const midiDot = document.getElementById('midi-dot');
  const midiStatusText = document.getElementById('midi-status-text');

  const midiController = new MidiController({
    onNoteOn: (keyId, midiNote, velocity) => handleNoteOn(keyId, midiNote, velocity),
    onNoteOff: (keyId, midiNote) => handleNoteOff(keyId, midiNote),
    onStatusChange: (status) => {
      midiStatusText.textContent = status.statusText;
      if (status.isConnected) {
        midiDot.classList.add('active');
      } else {
        midiDot.classList.remove('active');
      }
    }
  });

  // 6. Optimized Audio File Loader & Drag-and-Drop System
  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('file-input');
  const dragOverlay = document.getElementById('drag-overlay');
  const progressContainer = document.getElementById('file-progress-container');
  const progressFill = document.getElementById('file-progress-fill');
  const progressStatusText = document.getElementById('progress-status-text');
  const progressPercentText = document.getElementById('progress-percent-text');

  const metaName = document.getElementById('meta-name');
  const metaDuration = document.getElementById('meta-duration');
  const metaRate = document.getElementById('meta-rate');
  const metaChannels = document.getElementById('meta-channels');

  // Allow re-selecting the same file
  fileInput.addEventListener('click', () => {
    fileInput.value = '';
  });

  // Window-wide Drag & Drop Overlay Handling
  let dragCounter = 0;

  window.addEventListener('dragenter', (e) => {
    e.preventDefault();
    dragCounter++;
    if (e.dataTransfer && e.dataTransfer.types && Array.from(e.dataTransfer.types).includes('Files')) {
      dragOverlay.classList.remove('hidden');
    }
  });

  window.addEventListener('dragover', (e) => {
    e.preventDefault();
  });

  window.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dragCounter--;
    if (dragCounter <= 0) {
      dragCounter = 0;
      dragOverlay.classList.add('hidden');
    }
  });

  window.addEventListener('drop', (e) => {
    e.preventDefault();
    dragCounter = 0;
    dragOverlay.classList.add('hidden');

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      processAudioFile(files[0]);
    }
  });

  // Dropzone specific highlight
  ['dragenter', 'dragover'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropZone.classList.add('dragover');
    });
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropZone.classList.remove('dragover');
    });
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files.length > 0) {
      processAudioFile(e.target.files[0]);
    }
  });

  // Toast Notification Helper
  const toastBanner = document.getElementById('toast-banner');
  const toastIcon = document.getElementById('toast-icon');
  const toastMessage = document.getElementById('toast-message');
  let toastTimer = null;

  function showToast(msg, icon = '✨', isError = false) {
    if (toastTimer) clearTimeout(toastTimer);
    toastIcon.textContent = icon;
    toastMessage.textContent = msg;
    if (isError) {
      toastBanner.classList.add('error');
    } else {
      toastBanner.classList.remove('error');
    }
    toastBanner.classList.remove('hidden');

    toastTimer = setTimeout(() => {
      toastBanner.classList.add('hidden');
    }, 4000);
  }

  async function processAudioFile(file) {
    if (!file) return;

    showToast(`Loading "${file.name}"...`, '⌛');

    // Show Progress Bar
    progressContainer.classList.remove('hidden');
    progressFill.style.width = '0%';
    progressPercentText.textContent = '0%';
    progressStatusText.textContent = 'Reading file...';
    metaName.textContent = file.name || 'Loading...';

    const updateProgress = (percent, statusMsg) => {
      progressFill.style.width = `${percent}%`;
      progressPercentText.textContent = `${percent}%`;
      if (statusMsg) progressStatusText.textContent = statusMsg;
    };

    try {
      const meta = await audioEngine.loadAudioFile(file, updateProgress);
      
      metaName.textContent = meta.name;
      metaDuration.textContent = `${meta.duration.toFixed(2)} s`;
      metaRate.textContent = `${(meta.sampleRate / 1000).toFixed(1)} kHz`;
      metaChannels.textContent = meta.numberOfChannels === 1 ? '1 (Mono)' : '2 (Stereo)';

      // Hide progress bar after short delay
      setTimeout(() => {
        progressContainer.classList.add('hidden');
      }, 600);

      showToast(`Loaded sample "${meta.name}" (${meta.duration.toFixed(1)}s)`, '🎵');

      // Trigger brief audition pulse so user hears the loaded sample!
      setTimeout(() => {
        handleNoteOn('preview', 60, 0.7);
        setTimeout(() => handleNoteOff('preview', 60), 350);
      }, 200);

    } catch (err) {
      console.error('Error decoding audio file:', err);
      showToast(`Could not decode "${file.name}". Ensure it is a valid audio file.`, '⚠️', true);
      metaName.textContent = 'Error loading file';
      progressContainer.classList.add('hidden');
    }
  }

  // 7. Granular Control Sliders Mapping & Sync
  const paramControls = [
    { id: 'position', formatter: val => `${Math.round(val * 100)}%` },
    { id: 'spray', formatter: val => `${Math.round(val * 100)}%` },
    { id: 'grainSize', formatter: val => `${Math.round(val * 1000)} ms` },
    { id: 'density', formatter: val => `${val}/sec` },
    { id: 'pitchShift', formatter: val => `${val > 0 ? '+' : ''}${val} st` },
    { id: 'detune', formatter: val => `${val} cents` },
    { id: 'stereoWidth', formatter: val => `${Math.round(val * 100)}%` },
    { id: 'volume', formatter: val => `${Math.round(val * 100)}%` },
    { id: 'attack', formatter: val => `${val.toFixed(2)} s` },
    { id: 'release', formatter: val => `${val.toFixed(2)} s` },
    { id: 'cutoff', formatter: val => val >= 1000 ? `${(val / 1000).toFixed(1)} kHz` : `${val} Hz` },
    { id: 'reverbLevel', formatter: val => `${Math.round(val * 100)}%` }
  ];

  function updateParamUI(paramId, value) {
    const inputEl = document.getElementById(`param-${paramId}`);
    const valEl = document.getElementById(`val-${paramId}`);
    const config = paramControls.find(p => p.id === paramId);

    if (inputEl) inputEl.value = value;
    if (valEl && config) valEl.textContent = config.formatter(value);
  }

  paramControls.forEach(({ id }) => {
    const inputEl = document.getElementById(`param-${id}`);
    if (inputEl) {
      inputEl.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        audioEngine.updateParam(id, val);
        updateParamUI(id, val);
      });
    }
  });

  // 8. Preset Manager Buttons Binding
  const presetBtns = document.querySelectorAll('.preset-btn');
  presetBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const presetKey = btn.dataset.preset;
      const preset = PRESETS[presetKey];
      if (preset) {
        Object.entries(preset.params).forEach(([paramId, val]) => {
          audioEngine.updateParam(paramId, val);
          updateParamUI(paramId, val);
        });
      }
    });
  });
});
