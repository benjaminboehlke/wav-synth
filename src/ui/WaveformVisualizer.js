/**
 * WaveformVisualizer.js
 * Interactive canvas component displaying audio waveform, position selector,
 * spray region, and real-time animated grain particles
 */

export class WaveformVisualizer {
  constructor(canvasElement, audioEngine, onPositionChange) {
    this.canvas = canvasElement;
    this.ctx = this.canvas.getContext('2d');
    this.audioEngine = audioEngine;
    this.onPositionChange = onPositionChange;

    this.isDragging = false;
    this.animId = null;

    this.initCanvas();
    this.initEvents();
    this.startAnimation();
  }

  initCanvas() {
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.ctx.scale(dpr, dpr);
    this.width = rect.width;
    this.height = rect.height;
  }

  initEvents() {
    const getPosFromEvent = (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const x = clientX - rect.left;
      return Math.max(0, Math.min(1, x / rect.width));
    };

    this.canvas.addEventListener('mousedown', (e) => {
      this.isDragging = true;
      const pos = getPosFromEvent(e);
      if (this.onPositionChange) this.onPositionChange(pos);
    });

    window.addEventListener('mousemove', (e) => {
      if (this.isDragging) {
        const pos = getPosFromEvent(e);
        if (this.onPositionChange) this.onPositionChange(pos);
      }
    });

    window.addEventListener('mouseup', () => {
      this.isDragging = false;
    });

    this.canvas.addEventListener('touchstart', (e) => {
      this.isDragging = true;
      const pos = getPosFromEvent(e);
      if (this.onPositionChange) this.onPositionChange(pos);
    }, { passive: true });

    window.addEventListener('touchmove', (e) => {
      if (this.isDragging) {
        const pos = getPosFromEvent(e);
        if (this.onPositionChange) this.onPositionChange(pos);
      }
    }, { passive: true });

    window.addEventListener('touchend', () => {
      this.isDragging = false;
    });
  }

  startAnimation() {
    const render = () => {
      this.draw();
      this.animId = requestAnimationFrame(render);
    };
    render();
  }

  draw() {
    const { width, height, ctx } = this;
    if (!width || !height) return;

    ctx.clearRect(0, 0, width, height);

    // 1. Draw Background Grid
    ctx.fillStyle = '#0f1423';
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.lineWidth = 1;
    const gridCols = 16;
    for (let i = 1; i < gridCols; i++) {
      const x = (i / gridCols) * width;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    const gridRows = 4;
    for (let i = 1; i < gridRows; i++) {
      const y = (i / gridRows) * height;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    const buffer = this.audioEngine.audioBuffer;
    const params = this.audioEngine.params;

    // 2. Draw Waveform
    if (buffer) {
      const data = buffer.getChannelData(0);
      const step = Math.ceil(data.length / width);
      const amp = height / 2;

      ctx.beginPath();
      ctx.moveTo(0, amp);

      // Draw top envelope
      for (let i = 0; i < width; i++) {
        let min = 1.0;
        let max = -1.0;
        const start = i * step;
        for (let j = 0; j < step; j++) {
          const datum = data[start + j];
          if (datum < min) min = datum;
          if (datum > max) max = datum;
        }
        ctx.lineTo(i, (1 + min) * amp);
      }

      // Draw bottom envelope
      for (let i = width - 1; i >= 0; i--) {
        let min = 1.0;
        let max = -1.0;
        const start = i * step;
        for (let j = 0; j < step; j++) {
          const datum = data[start + j];
          if (datum < min) min = datum;
          if (datum > max) max = datum;
        }
        ctx.lineTo(i, (1 + max) * amp);
      }

      ctx.closePath();

      // Waveform Gradient Fill
      const grad = ctx.createLinearGradient(0, 0, 0, height);
      grad.addColorStop(0, 'rgba(0, 229, 255, 0.45)');
      grad.addColorStop(0.5, 'rgba(0, 150, 255, 0.2)');
      grad.addColorStop(1, 'rgba(0, 229, 255, 0.45)');
      ctx.fillStyle = grad;
      ctx.fill();

      // Waveform Outline
      ctx.strokeStyle = '#00e5ff';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }

    // 3. Draw Granular Spray Region (Position +/- Spray)
    const basePosNorm = params.position;
    const sprayNorm = params.spray;
    const sprayLeftX = Math.max(0, (basePosNorm - sprayNorm / 2) * width);
    const sprayRightX = Math.min(width, (basePosNorm + sprayNorm / 2) * width);
    const sprayWidth = sprayRightX - sprayLeftX;

    const sprayGrad = ctx.createLinearGradient(sprayLeftX, 0, sprayRightX, 0);
    sprayGrad.addColorStop(0, 'rgba(179, 136, 255, 0.05)');
    sprayGrad.addColorStop(0.5, 'rgba(179, 136, 255, 0.28)');
    sprayGrad.addColorStop(1, 'rgba(179, 136, 255, 0.05)');

    ctx.fillStyle = sprayGrad;
    ctx.fillRect(sprayLeftX, 0, sprayWidth, height);

    ctx.strokeStyle = 'rgba(179, 136, 255, 0.6)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(sprayLeftX, 0, sprayWidth, height);
    ctx.setLineDash([]);

    // 4. Draw Primary Target Position Scrubber
    const posX = basePosNorm * width;
    ctx.beginPath();
    ctx.moveTo(posX, 0);
    ctx.lineTo(posX, height);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.shadowColor = '#00e5ff';
    ctx.shadowBlur = 12;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Handle Pin on top
    ctx.fillStyle = '#00e5ff';
    ctx.beginPath();
    ctx.arc(posX, 6, 6, 0, Math.PI * 2);
    ctx.fill();

    // 5. Render Active Granular Particle Bursts
    const grains = this.audioEngine.getActiveGrains();
    const now = performance.now();

    grains.forEach(g => {
      const elapsed = now - g.spawnTime;
      const progress = Math.min(1, elapsed / g.durationMs);
      const gx = g.normPos * width;

      // Particle beam
      const alpha = Math.sin(Math.PI * progress) * (0.6 + g.velocity * 0.4);
      const beamWidth = Math.max(2, g.normDuration * width);

      ctx.fillStyle = `rgba(255, 0, 128, ${alpha})`;
      ctx.fillRect(gx - beamWidth / 2, 0, beamWidth, height);

      // Glowing dot head
      const dotY = height / 2 + (Math.sin(g.normPos * 100 + progress * 10) * (height * 0.35));
      ctx.fillStyle = `rgba(255, 235, 59, ${alpha})`;
      ctx.beginPath();
      ctx.arc(gx, dotY, 3 + (1 - progress) * 4, 0, Math.PI * 2);
      ctx.fill();
    });
  }
}
