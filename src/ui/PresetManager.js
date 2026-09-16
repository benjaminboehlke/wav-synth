/**
 * PresetManager.js
 * Quick sound design presets for the Granular Engine
 */

export const PRESETS = {
  ambientCloud: {
    name: 'Ambient Cloud',
    params: {
      position: 0.30,
      spray: 0.15,
      grainSize: 0.22,
      density: 30,
      pitchShift: 0,
      detune: 12,
      stereoWidth: 0.9,
      attack: 0.25,
      release: 0.8,
      cutoff: 10000,
      reverbLevel: 0.55
    }
  },
  staccatoGlitch: {
    name: 'Staccato Glitch',
    params: {
      position: 0.50,
      spray: 0.05,
      grainSize: 0.04,
      density: 45,
      pitchShift: 0,
      detune: 25,
      stereoWidth: 1.0,
      attack: 0.005,
      release: 0.1,
      cutoff: 16000,
      reverbLevel: 0.20
    }
  },
  frozenTexture: {
    name: 'Frozen Texture',
    params: {
      position: 0.20,
      spray: 0.01,
      grainSize: 0.16,
      density: 35,
      pitchShift: 0,
      detune: 5,
      stereoWidth: 0.7,
      attack: 0.1,
      release: 1.2,
      cutoff: 8000,
      reverbLevel: 0.65
    }
  },
  pulsingDrone: {
    name: 'Pulsing Drone',
    params: {
      position: 0.40,
      spray: 0.08,
      grainSize: 0.30,
      density: 12,
      pitchShift: -12,
      detune: 8,
      stereoWidth: 0.6,
      attack: 0.3,
      release: 1.5,
      cutoff: 3500,
      reverbLevel: 0.45
    }
  }
};
