/**
 * GranularVoice.js
 * Represents a single polyphonic voice spawning granular bursts for a held note
 */

export class GranularVoice {
  constructor(ctx, buffer, midiNote, velocity, params, outputNode, onGrainSpawn) {
    this.ctx = ctx;
    this.buffer = buffer;
    this.midiNote = midiNote;
    this.velocity = velocity;
    this.params = params;
    this.outputNode = outputNode;
    this.onGrainSpawn = onGrainSpawn;

    this.isPlaying = false;
    this.voiceGain = this.ctx.createGain();
    this.voiceGain.connect(this.outputNode);

    this.timerId = null;
  }

  start() {
    this.isPlaying = true;
    const now = this.ctx.currentTime;

    // Envelope Attack
    const attack = Math.max(0.005, this.params.attack);
    this.voiceGain.gain.setValueAtTime(0, now);
    this.voiceGain.gain.linearRampToValueAtTime(this.velocity, now + attack);

    // Start grain scheduler
    this.scheduleNextGrain();
  }

  scheduleNextGrain() {
    if (!this.isPlaying) return;

    this.spawnGrain();

    // Calculate delay based on density (grains per second)
    const density = Math.max(5, Math.min(60, this.params.density));
    const delayMs = (1000 / density);

    this.timerId = setTimeout(() => {
      this.scheduleNextGrain();
    }, delayMs);
  }

  spawnGrain() {
    if (!this.buffer || this.buffer.duration <= 0) return;

    const bufferDuration = this.buffer.duration;
    const grainSize = Math.max(0.01, Math.min(0.5, this.params.grainSize));
    
    // 1. Calculate Target Position with Spray (Randomness)
    const basePosSec = this.params.position * bufferDuration;
    const spraySec = (Math.random() - 0.5) * this.params.spray * bufferDuration;
    let startPosSec = basePosSec + spraySec;
    
    // Clamp to valid buffer boundary
    startPosSec = Math.max(0, Math.min(bufferDuration - grainSize, startPosSec));

    // 2. Calculate Pitch Ratio based on MIDI Note (60 = C4 reference)
    const semitoneDiff = (this.midiNote - 60) + this.params.pitchShift;
    const basePitchRatio = Math.pow(2, semitoneDiff / 12);
    
    // Detune variation in cents (1200 cents = 1 octave)
    const detuneCents = (Math.random() - 0.5) * (this.params.detune || 0);
    const finalPlaybackRate = basePitchRatio * Math.pow(2, detuneCents / 1200);

    // 3. Web Audio Nodes for Grain
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffer;
    src.playbackRate.setValueAtTime(Math.max(0.1, finalPlaybackRate), now);

    // Grain envelope gain node (fade in/out to avoid clicks)
    const grainGain = this.ctx.createGain();
    const fadeTime = grainSize * 0.4;
    grainGain.gain.setValueAtTime(0, now);
    grainGain.gain.linearRampToValueAtTime(1, now + fadeTime);
    grainGain.gain.linearRampToValueAtTime(0, now + grainSize);

    // Stereo Panner (with fallback for browsers lacking StereoPannerNode)
    let pannerNode = null;
    if (this.ctx.createStereoPanner) {
      pannerNode = this.ctx.createStereoPanner();
      const panVal = (Math.random() * 2 - 1) * (this.params.stereoWidth || 0.5);
      pannerNode.pan.setValueAtTime(Math.max(-1, Math.min(1, panVal)), now);
    }

    // Connect node chain
    if (pannerNode) {
      src.connect(grainGain);
      grainGain.connect(pannerNode);
      pannerNode.connect(this.voiceGain);
    } else {
      src.connect(grainGain);
      grainGain.connect(this.voiceGain);
    }

    // Play grain
    src.start(now, startPosSec, grainSize);
    src.stop(now + grainSize + 0.05);

    // Garbage collection cleanup
    setTimeout(() => {
      try {
        src.disconnect();
        grainGain.disconnect();
        if (pannerNode) pannerNode.disconnect();
      } catch (e) {
        // ignore
      }
    }, (grainSize + 0.1) * 1000);

    // Notify visualizer
    if (this.onGrainSpawn) {
      this.onGrainSpawn({
        normPos: startPosSec / bufferDuration,
        normDuration: grainSize / bufferDuration,
        durationMs: grainSize * 1000,
        velocity: this.velocity
      });
    }
  }

  stop() {
    if (!this.isPlaying) return;
    this.isPlaying = false;

    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }

    const now = this.ctx.currentTime;
    const release = Math.max(0.02, this.params.release);

    this.voiceGain.gain.cancelScheduledValues(now);
    this.voiceGain.gain.setValueAtTime(this.voiceGain.gain.value, now);
    this.voiceGain.gain.linearRampToValueAtTime(0, now + release);

    setTimeout(() => {
      try {
        this.voiceGain.disconnect();
      } catch (e) {
        // ignore
      }
    }, release * 1000 + 50);
  }
}
