/**
 * AudioEngine.js
 * Core Web Audio API manager for Granular Audio Sampler
 */

import { GranularVoice } from './GranularVoice.js';

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.audioBuffer = null;
    this.sampleName = 'Demo Harmonic Pad';
    this.activeVoices = new Map(); // keyId -> GranularVoice
    
    // Master Params
    this.params = {
      position: 0.25,       // 0 to 1 ratio of sample length
      spray: 0.08,          // 0 to 0.3 random position offset
      grainSize: 0.12,      // duration in seconds (0.02 to 0.5)
      density: 25,          // grains per second per voice (5 to 60)
      pitchShift: 0,        // semitones (-12 to 12)
      detune: 10,           // cents detune variation (0 to 50)
      stereoWidth: 0.8,     // 0 to 1 random pan width
      attack: 0.05,         // voice attack time in sec
      release: 0.5,         // voice release time in sec
      cutoff: 12000,        // lowpass filter freq in Hz
      reverbLevel: 0.35,    // 0 to 1 wet level
      volume: 0.8           // master volume
    };

    // Active grain particles for visualizer
    this.activeGrains = [];
    
    // Audio Nodes
    this.masterGain = null;
    this.filterNode = null;
    this.reverbNode = null;
    this.reverbGain = null;
    this.dryGain = null;
  }

  init() {
    if (this.ctx) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AudioCtx();

    // Master Chain setup
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(this.params.volume, this.ctx.currentTime);

    this.filterNode = this.ctx.createBiquadFilter();
    this.filterNode.type = 'lowpass';
    this.filterNode.frequency.setValueAtTime(this.params.cutoff, this.ctx.currentTime);

    // Reverb Setup (Convolution or Algorithmic Multi-tap fallback)
    this.reverbGain = this.ctx.createGain();
    this.reverbGain.gain.setValueAtTime(this.params.reverbLevel, this.ctx.currentTime);

    this.dryGain = this.ctx.createGain();
    this.dryGain.gain.setValueAtTime(1 - this.params.reverbLevel * 0.5, this.ctx.currentTime);

    this.reverbNode = this.createSyntheticReverb();

    // Routing
    this.filterNode.connect(this.dryGain);
    this.filterNode.connect(this.reverbNode);
    this.reverbNode.connect(this.reverbGain);

    this.dryGain.connect(this.masterGain);
    this.reverbGain.connect(this.masterGain);
    this.masterGain.connect(this.ctx.destination);

    // Generate fallback demo audio buffer
    this.audioBuffer = this.generateDemoBuffer();
  }

  ensureContextRunning() {
    if (!this.ctx) {
      this.init();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  // Generate pleasant ambient demo sound buffer if user hasn't loaded a file yet
  generateDemoBuffer() {
    const sampleRate = this.ctx.sampleRate;
    const duration = 4.0; // 4 seconds
    const length = sampleRate * duration;
    const buffer = this.ctx.createBuffer(2, length, sampleRate);
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);

    // Fundamental frequencies for a warm chord swell (C3, G3, C4, E4, B4)
    const freqs = [130.81, 196.00, 261.63, 329.63, 493.88, 659.25];

    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;
      let sampleL = 0;
      let sampleR = 0;

      freqs.forEach((freq, idx) => {
        // Subtle frequency modulation for rich organic movement
        const lfo = Math.sin(2 * Math.PI * 0.25 * t + idx);
        const f = freq + lfo * 1.5;
        const env = Math.sin(Math.PI * (t / duration)); // Smooth bell envelope
        
        // Harmonics
        const waveL = Math.sin(2 * Math.PI * f * t) * 0.5 + Math.sin(2 * Math.PI * (f * 2) * t) * 0.2;
        const waveR = Math.sin(2 * Math.PI * (f * 1.002) * t + 0.5) * 0.5 + Math.cos(2 * Math.PI * (f * 2.001) * t) * 0.2;

        sampleL += waveL * env * (0.3 / freqs.length);
        sampleR += waveR * env * (0.3 / freqs.length);
      });

      // Add soft warm texture noise
      const noise = (Math.random() * 2 - 1) * 0.015 * Math.sin(Math.PI * (t / duration));
      left[i] = sampleL + noise;
      right[i] = sampleR + noise;
    }

    return buffer;
  }

  // Create Impulse Response for Reverb
  createSyntheticReverb() {
    const convolver = this.ctx.createConvolver();
    const rate = this.ctx.sampleRate;
    const length = rate * 2.5;
    const impulse = this.ctx.createBuffer(2, length, rate);
    const left = impulse.getChannelData(0);
    const right = impulse.getChannelData(1);

    for (let i = 0; i < length; i++) {
      const decay = Math.exp(-i / (rate * 0.5));
      left[i] = (Math.random() * 2 - 1) * decay;
      right[i] = (Math.random() * 2 - 1) * decay;
    }

    convolver.buffer = impulse;
    return convolver;
  }

  decodeAudioDataPolyfill(arrayBuffer) {
    return new Promise((resolve, reject) => {
      try {
        const promise = this.ctx.decodeAudioData(
          arrayBuffer,
          (decoded) => resolve(decoded),
          (err) => reject(err || new Error('Failed to decode audio file format'))
        );
        if (promise && typeof promise.then === 'function') {
          promise.then(resolve).catch(reject);
        }
      } catch (err) {
        reject(err);
      }
    });
  }

  async loadAudioFile(file, onProgress) {
    this.ensureContextRunning();
    
    // Stop all active voices to prevent buffer access during swap
    this.stopAllNotes();

    if (onProgress) onProgress(15, 'Reading file bytes...');
    const arrayBuffer = await file.arrayBuffer();

    if (onProgress) onProgress(45, 'Decoding audio buffer...');
    // Pass buffer slice copy so ArrayBuffer is not detached
    const bufferCopy = arrayBuffer.slice(0);
    const decodedBuffer = await this.decodeAudioDataPolyfill(bufferCopy);

    if (onProgress) onProgress(90, 'Optimizing sample...');
    this.audioBuffer = decodedBuffer;
    this.sampleName = file.name;

    if (onProgress) onProgress(100, 'Ready');

    return {
      name: file.name,
      duration: decodedBuffer.duration,
      sampleRate: decodedBuffer.sampleRate,
      numberOfChannels: decodedBuffer.numberOfChannels,
      length: decodedBuffer.length
    };
  }

  noteOn(keyId, midiNote, velocity = 0.8) {
    this.ensureContextRunning();

    // If key already active, retrigger or ignore
    if (this.activeVoices.has(keyId)) {
      this.noteOff(keyId);
    }

    if (!this.audioBuffer) return;

    const voice = new GranularVoice(
      this.ctx,
      this.audioBuffer,
      midiNote,
      velocity,
      this.params,
      this.filterNode,
      (grainInfo) => this.registerGrainParticle(grainInfo)
    );

    voice.start();
    this.activeVoices.set(keyId, voice);
  }

  noteOff(keyId) {
    const voice = this.activeVoices.get(keyId);
    if (voice) {
      voice.stop();
      this.activeVoices.delete(keyId);
    }
  }

  stopAllNotes() {
    this.activeVoices.forEach((voice) => voice.stop());
    this.activeVoices.clear();
  }

  registerGrainParticle(grainInfo) {
    this.activeGrains.push({
      normPos: grainInfo.normPos,
      normDuration: grainInfo.normDuration,
      spawnTime: performance.now(),
      durationMs: grainInfo.durationMs,
      velocity: grainInfo.velocity
    });
  }

  getActiveGrains() {
    const now = performance.now();
    // Filter out expired grains
    this.activeGrains = this.activeGrains.filter(g => (now - g.spawnTime) < g.durationMs);
    return this.activeGrains;
  }

  updateParam(paramName, value) {
    this.params[paramName] = value;

    // Update active nodes directly if applicable
    if (this.ctx) {
      if (paramName === 'cutoff' && this.filterNode) {
        this.filterNode.frequency.setTargetAtTime(value, this.ctx.currentTime, 0.02);
      } else if (paramName === 'reverbLevel' && this.reverbGain && this.dryGain) {
        this.reverbGain.gain.setTargetAtTime(value, this.ctx.currentTime, 0.02);
        this.dryGain.gain.setTargetAtTime(1 - value * 0.5, this.ctx.currentTime, 0.02);
      } else if (paramName === 'volume' && this.masterGain) {
        this.masterGain.gain.setTargetAtTime(value, this.ctx.currentTime, 0.02);
      }
    }
  }
}
