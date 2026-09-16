/**
 * main.js
 * Application entry point wiring up UI, Audio Engine, Controllers, Visualizers,
 * and Interactive MIDI CC Parameter Learning System
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

  // 5. Granular Control Sliders Configuration & Range Definitions
  const paramControls = [
    { id: 'position', min: 0, max: 1, name: 'Position', formatter: val => `${Math.round(val * 100)}%` },
    { id: 'spray', min: 0, max: 0.3, name: 'Spray (Jitter)', formatter: val => `${Math.round(val * 100)}%` },
    { id: 'grainSize', min: 0.02, max: 0.5, name: 'Grain Size', formatter: val => `${Math.round(val * 1000)} ms` },
    { id: 'density', min: 5, max: 60, name: 'Grain Density', formatter: val => `${val}/sec` },
    { id: 'pitchShift', min: -12, max: 12, name: 'Pitch Transpose', formatter: val => `${val > 0 ? '+' : ''}${val} st` },
    { id: 'detune', min: 0, max: 50, name: 'Random Detune', formatter: val => `${val} cents` },
    { id: 'stereoWidth', min: 0, max: 1, name: 'Stereo Pan Width', formatter: val => `${Math.round(val * 100)}%` },
    { id: 'volume', min: 0, max: 1, name: 'Master Volume', formatter: val => `${Math.round(val * 100)}%` },
    { id: 'attack', min: 0.005, max: 1.5, name: 'Attack', formatter: val => `${val.toFixed(2)} s` },
    { id: 'release', min: 0.02, max: 3.0, name: 'Release', formatter: val => `${val.toFixed(2)} s` },
    { id: 'cutoff', min: 200, max: 20000, name: 'Lowpass Filter', formatter: val => val >= 1000 ? `${(val / 1000).toFixed(1)} kHz` : `${val} Hz` },
    { id: 'reverbLevel', min: 0, max: 1, name: 'Space Reverb', formatter: val => `${Math.round(val * 100)}%` }
  ];

  function updateParamUI(paramId, value) {
    const inputEl = document.getElementById(`param-${paramId}`);
    const valEl = document.getElementById(`val-${paramId}`);
    const config = paramControls.find(p => p.id === paramId);

    if (inputEl) inputEl.value = value;
    if (valEl && config) valEl.textContent = config.formatter(value);
  }

  // 6. Initialize Web MIDI Controller & Control Change (CC) Engine
  const midiDot = document.getElementById('midi-dot');
  const midiStatusText = document.getElementById('midi-status-text');

  let isMidiLearnActive = false;
  let activeTargetParam = null;

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
    },
    onControlChange: (paramId, normValue, rawCcValue, ccNumber) => {
      const config = paramControls.find(p => p.id === paramId);
      if (!config) return;

      const scaledValue = config.min + normValue * (config.max - config.min);
      audioEngine.updateParam(paramId, scaledValue);
      updateParamUI(paramId, scaledValue);
    },
    onMidiLearnCC: (ccNumber) => {
      if (!isMidiLearnActive || !activeTargetParam) return;

      midiController.bindCc(ccNumber, activeTargetParam);
      const config = paramControls.find(p => p.id === activeTargetParam);
      const paramName = config ? config.name : activeTargetParam;

      showToast(`Bound "${paramName}" to MIDI CC ${ccNumber}`, '🎛️');

      // Clear target highlight
      const targetItem = document.querySelector(`.control-item[data-param="${activeTargetParam}"]`);
      if (targetItem) targetItem.classList.remove('waiting-for-midi');

      activeTargetParam = null;
      midiController.setLearningMode(false);
      refreshCcBadges();
    }
  });

  // Refresh visible MIDI CC badges
  function refreshCcBadges() {
    paramControls.forEach(({ id }) => {
      const cc = midiController.getMappedCc(id);
      const badge = document.getElementById(`cc-badge-${id}`);
      if (badge) {
        if (cc !== null) {
          badge.textContent = `CC ${cc}`;
          badge.classList.remove('hidden');
        } else {
          badge.classList.add('hidden');
        }
      }
    });
  }

  // Initial badge update from loaded storage
  refreshCcBadges();

  // MIDI Learn & Clear Button Handlers
  const btnMidiLearn = document.getElementById('btn-midi-learn');
  const btnMidiClear = document.getElementById('btn-midi-clear');
  const controlItems = document.querySelectorAll('.control-item');

  function toggleMidiLearn(forceState = null) {
    isMidiLearnActive = forceState !== null ? forceState : !isMidiLearnActive;
    activeTargetParam = null;
    midiController.setLearningMode(false);

    if (isMidiLearnActive) {
      btnMidiLearn.classList.add('active');
      btnMidiLearn.textContent = '🔴 Learning... (Click a control)';
      showToast('MIDI Learn Active: Click any parameter, then turn a knob on your MIDI controller', '🎛️');

      controlItems.forEach(item => {
        item.classList.add('is-learnable');
      });
    } else {
      btnMidiLearn.classList.remove('active');
      btnMidiLearn.textContent = '🎛️ MIDI Learn';

      controlItems.forEach(item => {
        item.classList.remove('is-learnable', 'waiting-for-midi');
      });
    }
  }

  if (btnMidiLearn) {
    btnMidiLearn.addEventListener('click', () => toggleMidiLearn());
  }

  if (btnMidiClear) {
    btnMidiClear.addEventListener('click', () => {
      midiController.clearMappings();
      refreshCcBadges();
      if (isMidiLearnActive) toggleMidiLearn(false);
      showToast('Cleared all MIDI hardware mappings', '🧹');
    });
  }

  // Handle parameter click in MIDI Learn mode
  controlItems.forEach(item => {
    item.addEventListener('click', (e) => {
      if (!isMidiLearnActive) return;
      // Ignore click if clicking directly on a CC unbind badge
      if (e.target.classList.contains('midi-cc-badge')) return;

      const paramId = item.dataset.param;
      if (!paramId) return;

      activeTargetParam = paramId;
      midiController.setLearningMode(true);

      controlItems.forEach(i => i.classList.remove('waiting-for-midi'));
      item.classList.add('waiting-for-midi');

      const config = paramControls.find(p => p.id === paramId);
      const name = config ? config.name : paramId;
      showToast(`Selected "${name}". Turn any knob/fader on your MIDI controller now...`, '⌛');
    });
  });

  // Handle unbinding single CC badge on click
  paramControls.forEach(({ id }) => {
    const badge = document.getElementById(`cc-badge-${id}`);
    if (badge) {
      badge.addEventListener('click', (e) => {
        e.stopPropagation();
        midiController.unbindParam(id);
        refreshCcBadges();
        showToast(`Unbound MIDI hardware control from parameter`, '🗑️');
      });
    }
  });

  // 7. Optimized Audio File Loader & Drag-and-Drop System
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

  // 8. Granular Control Sliders Mapping & Input Binding
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

  // 9. Preset Manager Buttons Binding
  const presetBtns = document.querySelectorAll('.preset-btn[data-preset]');
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
