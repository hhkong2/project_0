// Joy Playground - single-file, zero-build, Vercel-friendly.
// Focus: tactile delight via pointer play + (optional) sound + (optional) haptics.

const canvas = document.getElementById("joy-canvas");
const ctx = canvas.getContext("2d", { alpha: true });

const statusLabel = document.getElementById("status");
const modeToggle = document.getElementById("mode-toggle");
const soundToggle = document.getElementById("sound-toggle");
const hapticToggle = document.getElementById("haptic-toggle");
const intensitySlider = document.getElementById("intensity");

const STORAGE_KEY = "joy_playground_settings_v1";

const MODES = [
  { id: "fireworks", label: "FIREWORKS" },
  { id: "bubbles", label: "BUBBLES" },
  { id: "ribbons", label: "RIBBONS" },
];

const BASE_PALETTE = ["#57f6ff", "#ffe166", "#ff6ea3", "#7fffd4", "#ffd9f7", "#65ff88"];

const STATUS_LINES = [
  "Nice. Again.",
  "That felt good.",
  "More sparkles!",
  "Tiny chaos, perfect.",
  "Make a big loop.",
  "Two fingers feels great.",
];

// Keeps tones pleasant without losing playfulness.
const PENTATONIC = [0, 3, 5, 7, 10];

const pointers = new Map(); // pointerId -> state
const particles = [];
const rings = [];
const ribbons = [];
const bubbles = [];

const limits = {
  particles: 1400,
  rings: 120,
  ribbons: 14,
  bubbles: 90,
};

const ui = {
  dpr: Math.min(window.devicePixelRatio || 1, 2),
  joy: 0,
  combo: 0,
  lastActionAt: 0,
  lastStatusAt: 0,
  lastPartyAt: 0,
  nextPartyJoy: 160,
  modeIndex: 0,
  settings: {
    modeId: "fireworks",
    intensity: 1,
    soundEnabled: true,
    hapticEnabled: true,
  },
};

const audio = {
  ctx: null,
  master: null,
  compressor: null,
  delay: null,
  delayGain: null,
  delayFeedback: null,
  delayFilter: null,
  noiseBuffer: null,
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function randomFrom(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function midiToHz(midi) {
  return 440 * 2 ** ((midi - 69) / 12);
}

function quantizeYToHz(y) {
  const h = height();
  const t = clamp(1 - y / Math.max(1, h), 0, 0.999);
  const steps = PENTATONIC.length * 3;
  const idx = Math.floor(t * steps);
  const octave = Math.floor(idx / PENTATONIC.length);
  const step = PENTATONIC[idx % PENTATONIC.length];
  const rootMidi = 57; // A3
  return midiToHz(rootMidi + octave * 12 + step);
}

function setStatus(text) {
  statusLabel.textContent = text;
}

function saveSettings() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ui.settings));
  } catch {
    // ignore
  }
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return;
    ui.settings.modeId = typeof parsed.modeId === "string" ? parsed.modeId : ui.settings.modeId;
    ui.settings.intensity =
      typeof parsed.intensity === "number" ? clamp(parsed.intensity, 0.3, 1.6) : ui.settings.intensity;
    ui.settings.soundEnabled =
      typeof parsed.soundEnabled === "boolean" ? parsed.soundEnabled : ui.settings.soundEnabled;
    ui.settings.hapticEnabled =
      typeof parsed.hapticEnabled === "boolean" ? parsed.hapticEnabled : ui.settings.hapticEnabled;
  } catch {
    // ignore
  }
}

function updateControls() {
  const modeIdx = MODES.findIndex((m) => m.id === ui.settings.modeId);
  ui.modeIndex = modeIdx >= 0 ? modeIdx : 0;
  modeToggle.textContent = `MODE: ${MODES[ui.modeIndex].label}`;

  soundToggle.setAttribute("aria-pressed", String(ui.settings.soundEnabled));
  soundToggle.textContent = ui.settings.soundEnabled ? "SOUND ON" : "SOUND OFF";

  hapticToggle.setAttribute("aria-pressed", String(ui.settings.hapticEnabled));
  hapticToggle.textContent = ui.settings.hapticEnabled ? "VIBE ON" : "VIBE OFF";

  intensitySlider.value = String(ui.settings.intensity);
}

function resizeCanvas() {
  ui.dpr = Math.min(window.devicePixelRatio || 1, 2);
  const { width, height } = canvas.getBoundingClientRect();
  canvas.width = Math.max(1, Math.round(width * ui.dpr));
  canvas.height = Math.max(1, Math.round(height * ui.dpr));
  ctx.setTransform(ui.dpr, 0, 0, ui.dpr, 0, 0);
}

function ensureAudio() {
  if (!ui.settings.soundEnabled) return null;
  if (!audio.ctx) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) {
      ui.settings.soundEnabled = false;
      updateControls();
      saveSettings();
      setStatus("Audio not supported in this browser.");
      return null;
    }
    audio.ctx = new AudioCtx();
    audio.master = audio.ctx.createGain();
    audio.master.gain.value = 0.85;

    audio.compressor = audio.ctx.createDynamicsCompressor();
    audio.compressor.threshold.value = -22;
    audio.compressor.knee.value = 28;
    audio.compressor.ratio.value = 10;
    audio.compressor.attack.value = 0.003;
    audio.compressor.release.value = 0.18;

    // A tiny echo makes everything feel "alive".
    audio.delay = audio.ctx.createDelay(0.5);
    audio.delay.delayTime.value = 0.18;
    audio.delayGain = audio.ctx.createGain();
    audio.delayGain.gain.value = 0.18;
    audio.delayFeedback = audio.ctx.createGain();
    audio.delayFeedback.gain.value = 0.22;
    audio.delayFilter = audio.ctx.createBiquadFilter();
    audio.delayFilter.type = "lowpass";
    audio.delayFilter.frequency.value = 2200;

    audio.master.connect(audio.compressor);
    audio.compressor.connect(audio.ctx.destination);

    audio.master.connect(audio.delayGain);
    audio.delayGain.connect(audio.delay);
    audio.delay.connect(audio.delayFilter);
    audio.delayFilter.connect(audio.delayFeedback);
    audio.delayFeedback.connect(audio.delay);
    audio.delayFilter.connect(audio.compressor);

    // Cached noise for pops/sizzles.
    audio.noiseBuffer = audio.ctx.createBuffer(1, audio.ctx.sampleRate, audio.ctx.sampleRate);
    const noise = audio.noiseBuffer.getChannelData(0);
    for (let i = 0; i < noise.length; i += 1) {
      noise[i] = Math.random() * 2 - 1;
    }
  }
  if (audio.ctx.state === "suspended") {
    audio.ctx.resume();
  }
  return audio.ctx;
}

function playTone({
  freq,
  duration = 0.11,
  type = "triangle",
  volume = 0.05,
  glide = 0,
  cutoff = 3200,
} = {}) {
  const context = ensureAudio();
  if (!context) return;

  const now = context.currentTime;
  const osc = context.createOscillator();
  const gain = context.createGain();
  const filter = context.createBiquadFilter();

  filter.type = "lowpass";
  filter.frequency.setValueAtTime(cutoff, now);

  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  if (glide !== 0) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + glide), now + duration);
  }

  const scaledVolume = volume * clamp(ui.settings.intensity, 0.3, 1.6);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(scaledVolume, now + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(audio.master);

  osc.start(now);
  osc.stop(now + duration + 0.05);
}

function playChord(rootHz) {
  playTone({ freq: rootHz, duration: 0.14, type: "triangle", volume: 0.055, glide: 16, cutoff: 2800 });
  playTone({ freq: rootHz * 1.25, duration: 0.18, type: "sine", volume: 0.04, glide: -10, cutoff: 2400 });
  playTone({ freq: rootHz * 1.5, duration: 0.2, type: "square", volume: 0.028, glide: -18, cutoff: 1900 });
}

function playPopNoise({ duration = 0.055, volume = 0.045, highpass = 800, lowpass = 5200, rate = 1 } = {}) {
  const context = ensureAudio();
  if (!context || !audio.noiseBuffer) return;

  const now = context.currentTime;
  const src = context.createBufferSource();
  src.buffer = audio.noiseBuffer;
  src.playbackRate.setValueAtTime(rate, now);

  const hp = context.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.setValueAtTime(highpass, now);

  const lp = context.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(lowpass, now);

  const gain = context.createGain();
  const scaled = volume * clamp(ui.settings.intensity, 0.3, 1.6);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(scaled, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  src.connect(hp);
  hp.connect(lp);
  lp.connect(gain);
  gain.connect(audio.master);

  const maxOffset = Math.max(0, audio.noiseBuffer.duration - duration * 1.5);
  const offset = maxOffset > 0 ? Math.random() * maxOffset : 0;
  src.start(now, offset);
  src.stop(now + duration + 0.02);
}

function vibrate(pattern) {
  if (!ui.settings.hapticEnabled || !navigator.vibrate) return;
  navigator.vibrate(pattern);
}

function bumpJoy(points) {
  const now = performance.now();
  if (now - ui.lastActionAt < 1250) {
    ui.combo = clamp(ui.combo + 1, 1, 9);
  } else {
    ui.combo = 1;
  }
  ui.lastActionAt = now;

  const scored = points * ui.combo;
  ui.joy += scored;

  if (ui.joy >= ui.nextPartyJoy && now - ui.lastPartyAt > 2200) {
    ui.lastPartyAt = now;
    ui.nextPartyJoy += 160;
    spawnConfettiBurst(rand(0.25, 0.75) * width(), rand(0.25, 0.75) * height());
    playChord(260 + rand(-30, 60));
    vibrate([18, 18, 24]);
    setStatus(`JOY ${ui.joy}  |  PARTY x${ui.combo}`);
    ui.lastStatusAt = now;
  }
}

function maybeStatus() {
  const now = performance.now();
  if (now - ui.lastStatusAt < 900) return;
  ui.lastStatusAt = now;
  setStatus(`${randomFrom(STATUS_LINES)}  |  JOY ${ui.joy}  |  x${Math.max(ui.combo, 1)}`);
}

function enforceLimit(arr, limit) {
  const extra = arr.length - limit;
  if (extra > 0) arr.splice(0, extra);
}

function spawnParticle(x, y, options = {}) {
  const speed = options.speed ?? rand(0.4, 2.4);
  const angle = options.angle ?? rand(0, Math.PI * 2);
  particles.push({
    x,
    y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    life: options.life ?? rand(34, 78),
    maxLife: options.maxLife ?? options.life ?? rand(34, 78),
    radius: options.radius ?? rand(1.2, 3.8),
    color: options.color ?? randomFrom(BASE_PALETTE),
    drag: options.drag ?? 0.985,
    gravity: options.gravity ?? 0.012,
    shape: options.shape ?? "dot", // dot | streak
  });
  enforceLimit(particles, limits.particles);
}

function spawnRing(x, y, options = {}) {
  rings.push({
    x,
    y,
    radius: options.radius ?? rand(6, 16),
    width: options.width ?? rand(2, 4),
    color: options.color ?? randomFrom(BASE_PALETTE),
    life: options.life ?? 30,
    maxLife: options.maxLife ?? options.life ?? 30,
  });
  enforceLimit(rings, limits.rings);
}

function spawnBurst(x, y, options = {}) {
  const intensity = clamp(ui.settings.intensity, 0.3, 1.6);
  const count = Math.round((options.count ?? 26) * intensity);
  const power = (options.power ?? 3) * lerp(0.85, 1.25, intensity / 1.6);
  for (let i = 0; i < count; i += 1) {
    spawnParticle(x, y, {
      speed: rand(0.35, power),
      angle: (Math.PI * 2 * i) / count + rand(-0.22, 0.22),
      radius: rand(1.2, 4),
      life: rand(40, 78),
      maxLife: 78,
      gravity: 0.02,
      drag: 0.986,
      shape: Math.random() < 0.16 ? "streak" : "dot",
    });
  }
  spawnRing(x, y);
}

function spawnConfettiBurst(x, y) {
  for (let i = 0; i < 120; i += 1) {
    spawnParticle(x, y, {
      speed: rand(0.6, 5.4),
      angle: rand(0, Math.PI * 2),
      radius: rand(1.2, 3.2),
      life: rand(50, 110),
      maxLife: 110,
      color: randomFrom(BASE_PALETTE),
      gravity: 0.03,
      drag: 0.982,
      shape: "streak",
    });
  }
  spawnRing(x, y, { radius: 10, width: 3.5, life: 36, maxLife: 36, color: "#ffffff" });
}

function spawnBubble(x, y, options = {}) {
  const intensity = clamp(ui.settings.intensity, 0.3, 1.6);
  bubbles.push({
    x,
    y,
    vx: options.vx ?? rand(-0.55, 0.55),
    vy: options.vy ?? rand(-0.55, 0.55),
    r: options.r ?? rand(12, 30) * lerp(0.9, 1.25, intensity / 1.6),
    color: options.color ?? `hsla(${rand(0, 360)}, 95%, 62%, 0.35)`,
    life: options.life ?? Math.round(rand(40 * 60, 95 * 60)),
    maxLife: options.maxLife ?? options.life ?? Math.round(rand(40 * 60, 95 * 60)),
    seed: options.seed ?? rand(0, 1000),
  });
  enforceLimit(bubbles, limits.bubbles);
}

function spawnBubbleCluster(x, y) {
  const intensity = clamp(ui.settings.intensity, 0.3, 1.6);
  const count = Math.round(6 * intensity);
  for (let i = 0; i < count; i += 1) {
    const a = rand(0, Math.PI * 2);
    const d = rand(0, 18) * intensity;
    spawnBubble(x + Math.cos(a) * d, y + Math.sin(a) * d, {
      vx: rand(-0.8, 0.8),
      vy: rand(-0.8, 0.8),
      r: rand(12, 28) * intensity,
      color: `hsla(${(hueShift + rand(-50, 110) + i * 18) % 360}, 95%, 62%, 0.32)`,
    });
  }
}

function spawnPopSparkle(x, y, color) {
  const intensity = clamp(ui.settings.intensity, 0.3, 1.6);
  const count = Math.round(16 * intensity);
  for (let i = 0; i < count; i += 1) {
    spawnParticle(x, y, {
      speed: rand(0.3, 2.8) * intensity,
      angle: rand(0, Math.PI * 2),
      radius: rand(0.8, 2.6),
      life: rand(16, 46),
      maxLife: 46,
      color,
      gravity: 0.01,
      drag: 0.982,
      shape: Math.random() < 0.25 ? "streak" : "dot",
    });
  }
  spawnRing(x, y, { radius: rand(4, 10) * intensity, width: rand(2, 3), life: 26, maxLife: 26, color: "#ffffff" });
}

function popBubblesAt(x, y, radius, maxPops) {
  let popped = 0;
  for (let i = bubbles.length - 1; i >= 0; i -= 1) {
    const b = bubbles[i];
    const d = Math.hypot(b.x - x, b.y - y);
    if (d > radius + b.r) continue;

    bubbles.splice(i, 1);
    popped += 1;
    spawnPopSparkle(b.x, b.y, b.color);
    playPopNoise({ volume: 0.04, highpass: 900, lowpass: 6200, rate: rand(0.9, 1.25) });
    if (popped >= maxPops) break;
  }
  return popped;
}

function width() {
  return canvas.width / ui.dpr;
}

function height() {
  return canvas.height / ui.dpr;
}

let hueShift = 0;
function renderBackground(w, h, time) {
  hueShift = (hueShift + 0.08) % 360;
  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, `hsla(${hueShift}, 88%, 15%, 0.21)`);
  grad.addColorStop(0.5, "rgba(4, 7, 18, 0.19)");
  grad.addColorStop(1, `hsla(${(hueShift + 64) % 360}, 74%, 17%, 0.24)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  for (let i = 0; i < 4; i += 1) {
    const cycle = time * 0.00028 + i * 1.19;
    const x = w * (0.16 + (i / 4) * 0.78) + Math.sin(cycle) * 28;
    const y = h * (0.24 + 0.11 * i) + Math.cos(cycle * 0.9) * 22;
    const r = 34 + i * 8 + Math.sin(cycle * 1.4) * 7;
    const glow = ctx.createRadialGradient(x, y, 0, x, y, r);
    glow.addColorStop(0, "rgba(255, 255, 255, 0.17)");
    glow.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function renderPointerGlows(time) {
  for (const p of pointers.values()) {
    const pulse = 0.65 + Math.sin(time * 0.012 + p.seed) * 0.25;
    const r = 18 + p.speed * 6;
    const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
    g.addColorStop(0, `hsla(${p.hue}, 100%, 70%, ${0.34 * pulse})`);
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function renderParticles(w, h) {
  for (let i = particles.length - 1; i >= 0; i -= 1) {
    const p = particles[i];
    p.life -= 1;
    if (p.life <= 0) {
      particles.splice(i, 1);
      continue;
    }

    p.vx *= p.drag;
    p.vy = p.vy * p.drag + p.gravity;
    p.x += p.vx;
    p.y += p.vy;

    if (p.x < -60 || p.x > w + 60 || p.y < -60 || p.y > h + 60) {
      particles.splice(i, 1);
      continue;
    }

    const alpha = clamp(p.life / p.maxLife, 0, 1);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;

    if (p.shape === "streak") {
      const len = clamp(Math.hypot(p.vx, p.vy) * 6, 6, 26);
      const ang = Math.atan2(p.vy, p.vx);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(ang);
      ctx.fillRect(-len * 0.35, -p.radius * 0.5, len, p.radius);
      ctx.restore();
    } else {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius * (0.35 + alpha), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

function renderRings() {
  for (let i = rings.length - 1; i >= 0; i -= 1) {
    const r = rings[i];
    r.life -= 1;
    if (r.life <= 0) {
      rings.splice(i, 1);
      continue;
    }
    r.radius += 1.95;
    const alpha = clamp(r.life / r.maxLife, 0, 1);
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = r.color;
    ctx.lineWidth = r.width * alpha;
    ctx.beginPath();
    ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function renderBubbles(w, h) {
  for (let i = bubbles.length - 1; i >= 0; i -= 1) {
    const b = bubbles[i];
    b.life -= 1;
    if (b.life <= 0 || b.r <= 2) {
      bubbles.splice(i, 1);
      continue;
    }

    // Physics
    b.vx *= 0.992;
    b.vy = b.vy * 0.992 + Math.sin((performance.now() + b.seed) * 0.001) * 0.004;
    b.x += b.vx;
    b.y += b.vy;

    if (b.x < b.r) {
      b.x = b.r;
      b.vx *= -0.85;
    } else if (b.x > w - b.r) {
      b.x = w - b.r;
      b.vx *= -0.85;
    }
    if (b.y < b.r) {
      b.y = b.r;
      b.vy *= -0.85;
    } else if (b.y > h - b.r) {
      b.y = h - b.r;
      b.vy *= -0.85;
    }

    // Render
    const alpha = clamp(b.life / b.maxLife, 0, 1) * 0.92;
    ctx.globalAlpha = alpha;

    const gx = b.x - b.r * 0.35;
    const gy = b.y - b.r * 0.35;
    const grad = ctx.createRadialGradient(gx, gy, b.r * 0.12, b.x, b.y, b.r);
    grad.addColorStop(0, "rgba(255,255,255,0.85)");
    grad.addColorStop(0.25, "rgba(255,255,255,0.22)");
    grad.addColorStop(1, `${b.color}`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = alpha * 0.7;
    ctx.strokeStyle = "rgba(255,255,255,0.45)";
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r - 0.8, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function renderRibbons(w, h) {
  for (let i = ribbons.length - 1; i >= 0; i -= 1) {
    const r = ribbons[i];
    r.life -= 1;
    if (r.life <= 0) {
      ribbons.splice(i, 1);
      continue;
    }

    const alpha = clamp(r.life / r.maxLife, 0, 1);
    ctx.globalAlpha = alpha;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = r.width * (0.55 + alpha * 0.45);
    ctx.strokeStyle = r.color;

    const pts = r.points;
    if (pts.length < 3) continue;

    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let p = 1; p < pts.length - 2; p += 1) {
      const cx = pts[p].x;
      const cy = pts[p].y;
      const nx = (pts[p].x + pts[p + 1].x) * 0.5;
      const ny = (pts[p].y + pts[p + 1].y) * 0.5;
      ctx.quadraticCurveTo(cx, cy, nx, ny);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function renderLiveRibbons() {
  const intensity = clamp(ui.settings.intensity, 0.3, 1.6);
  for (const ptr of pointers.values()) {
    if (ptr.modeId !== "ribbons") continue;
    const pts = ptr.path;
    if (!pts || pts.length < 3) continue;

    ctx.globalAlpha = 0.95;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 8.4 * intensity;
    ctx.strokeStyle = `hsla(${ptr.hue}, 98%, 70%, 0.85)`;

    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let p = 1; p < pts.length - 2; p += 1) {
      const cx = pts[p].x;
      const cy = pts[p].y;
      const nx = (pts[p].x + pts[p + 1].x) * 0.5;
      const ny = (pts[p].y + pts[p + 1].y) * 0.5;
      ctx.quadraticCurveTo(cx, cy, nx, ny);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function animate(time) {
  const w = width();
  const h = height();

  ctx.globalCompositeOperation = "source-over";
  renderBackground(w, h, time);

  // Mode-specific visuals can be present even when not selected.
  ctx.globalCompositeOperation = "source-over";
  renderBubbles(w, h);
  renderRibbons(w, h);
  renderLiveRibbons();

  ctx.globalCompositeOperation = "lighter";
  renderPointerGlows(time);
  renderRings();
  renderParticles(w, h);

  ctx.globalCompositeOperation = "source-over";
  requestAnimationFrame(animate);
}

function posFromEvent(ev) {
  const rect = canvas.getBoundingClientRect();
  return { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
}

function addRibbonPoint(ptr, x, y, now) {
  if (!ptr.path) ptr.path = [];
  const last = ptr.path[ptr.path.length - 1];
  if (last && Math.hypot(x - last.x, y - last.y) < 3) return;
  ptr.path.push({ x, y, t: now });
  if (ptr.path.length > 220) ptr.path.shift();
}

function analyzeGesture(points) {
  if (!points || points.length < 12) return { kind: "none" };

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  const w = maxX - minX;
  const h = maxY - minY;
  const size = Math.max(w, h);
  const aspect = w > 0.0001 ? h / w : 999;

  let length = 0;
  let sharpTurns = 0;
  for (let i = 1; i < points.length; i += 1) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    length += Math.hypot(dx, dy);
  }

  for (let i = 2; i < points.length; i += 1) {
    const ax = points[i - 1].x - points[i - 2].x;
    const ay = points[i - 1].y - points[i - 2].y;
    const bx = points[i].x - points[i - 1].x;
    const by = points[i].y - points[i - 1].y;
    const al = Math.hypot(ax, ay);
    const bl = Math.hypot(bx, by);
    if (al < 2 || bl < 2) continue;
    const dot = ax * bx + ay * by;
    const cos = clamp(dot / (al * bl), -1, 1);
    const ang = Math.acos(cos);
    if (ang > 1.05) sharpTurns += 1;
  }

  const start = points[0];
  const end = points[points.length - 1];
  const endDist = Math.hypot(end.x - start.x, end.y - start.y);

  const looksLikeLoop =
    points.length > 22 &&
    size > 70 &&
    endDist < size * 0.35 &&
    aspect > 0.55 &&
    aspect < 1.8 &&
    length > size * 2.6;

  if (looksLikeLoop) {
    return { kind: "loop", box: { minX, maxX, minY, maxY }, size, length, sharpTurns };
  }

  const looksLikeZigzag = size > 120 && sharpTurns > 14 && length > size * 1.8;
  if (looksLikeZigzag) {
    return { kind: "zigzag", box: { minX, maxX, minY, maxY }, size, length, sharpTurns };
  }

  return { kind: "none", box: { minX, maxX, minY, maxY }, size, length, sharpTurns };
}

function fireworksDown(ptr) {
  spawnBurst(ptr.x, ptr.y, { count: 26, power: 3.4 });
  playTone({ freq: 250 + rand(0, 140), duration: 0.12, type: "triangle", volume: 0.06, glide: 18 });
  vibrate(12);
  bumpJoy(1);
  maybeStatus();
}

function fireworksMove(ptr, now) {
  if (now - ptr.lastTrailAt > 14) {
    ptr.lastTrailAt = now;
    const toneColor = randomFrom(BASE_PALETTE);
    for (let i = 0; i < 5; i += 1) {
      spawnParticle(ptr.x, ptr.y, {
        speed: rand(0.2, 1.3),
        angle: rand(0, Math.PI * 2),
        radius: rand(0.9, 2.2),
        life: rand(14, 32),
        maxLife: 34,
        color: toneColor,
        gravity: 0.003,
        drag: 0.973,
      });
    }
  }

  if (now - ptr.lastSoundAt > 58) {
    ptr.lastSoundAt = now;
    const note = 320 + ((ptr.dragDistance * 0.7) % 260);
    playTone({ freq: note, duration: 0.08, type: "sine", volume: 0.03, glide: 30, cutoff: 3400 });
  }

  if (now - ptr.lastHapticAt > 120) {
    ptr.lastHapticAt = now;
    vibrate(4);
  }

  bumpJoy(1);
}

function fireworksUp(ptr) {
  const burstCount = clamp(Math.round(18 + ptr.dragDistance * 0.1), 20, 70);
  const burstPower = clamp(2 + ptr.dragDistance * 0.008, 2.6, 5.8);
  spawnBurst(ptr.x, ptr.y, { count: burstCount, power: burstPower });

  const root = clamp(240 + ptr.dragDistance * 0.95, 220, 640);
  playChord(root);

  if (ptr.dragDistance < 18) {
    vibrate([14, 18, 12]);
    setStatus(`Tap pop.  JOY ${ui.joy}`);
    bumpJoy(3);
  } else {
    vibrate([24, 12, 30]);
    setStatus(`Drag wave ${Math.round(ptr.dragDistance)}px.  JOY ${ui.joy}`);
    bumpJoy(Math.round(clamp(ptr.dragDistance / 14, 5, 26)));
  }
}

function ribbonsDown(ptr) {
  spawnRing(ptr.x, ptr.y, { radius: 10, width: 3.1, life: 30, maxLife: 30, color: "#ffffff" });
  playTone({ freq: quantizeYToHz(ptr.y), duration: 0.08, type: "triangle", volume: 0.05, glide: 10, cutoff: 2600 });
  vibrate(8);
  bumpJoy(2);
  maybeStatus();
}

function ribbonsMove(ptr, dx, dy, now) {
  const intensity = clamp(ui.settings.intensity, 0.3, 1.6);
  if (now - ptr.lastTrailAt > 16) {
    ptr.lastTrailAt = now;
    const c = `hsla(${ptr.hue}, 98%, 72%, 0.85)`;
    spawnParticle(ptr.x, ptr.y, {
      speed: rand(0.1, 1.2) * intensity,
      angle: rand(0, Math.PI * 2),
      radius: rand(0.8, 2.2),
      life: rand(12, 36),
      maxLife: 36,
      color: c,
      gravity: 0.002,
      drag: 0.975,
    });
    if (Math.random() < 0.2) spawnParticle(ptr.x, ptr.y, { speed: rand(0.5, 2.2), angle: Math.atan2(dy, dx), radius: 1.4, life: 18, maxLife: 26, color: "#ffffff", gravity: 0.001, drag: 0.972, shape: "streak" });
  }

  if (now - ptr.lastSoundAt > 80) {
    ptr.lastSoundAt = now;
    const f = quantizeYToHz(ptr.y);
    playTone({ freq: f, duration: 0.07, type: "sine", volume: 0.028, glide: 18, cutoff: 3200 });
  }

  if (now - ptr.lastHapticAt > 140) {
    ptr.lastHapticAt = now;
    vibrate(4);
  }

  bumpJoy(1);
}

function ribbonsUp(ptr) {
  const intensity = clamp(ui.settings.intensity, 0.3, 1.6);
  if (ptr.path.length > 6) {
    const gesture = analyzeGesture(ptr.path);
    const color = `hsla(${ptr.hue}, 98%, 70%, 0.9)`;

    ribbons.push({
      points: ptr.path.slice(),
      life: 88,
      maxLife: 88,
      width: 7.8 * intensity,
      color,
    });
    enforceLimit(ribbons, limits.ribbons);

    // Sparkle along the ribbon.
    for (let i = 0; i < ptr.path.length; i += Math.round(10 / intensity)) {
      const p = ptr.path[i];
      spawnParticle(p.x, p.y, {
        speed: rand(0.3, 2.2) * intensity,
        angle: rand(0, Math.PI * 2),
        radius: rand(0.8, 2.4),
        life: rand(18, 52),
        maxLife: 52,
        color,
        gravity: 0.008,
        drag: 0.983,
        shape: Math.random() < 0.2 ? "streak" : "dot",
      });
    }

    if (gesture.kind === "loop") {
      const cx = (gesture.box.minX + gesture.box.maxX) * 0.5;
      const cy = (gesture.box.minY + gesture.box.maxY) * 0.5;
      const r = gesture.size * 0.32;
      // Spiral burst (manual, without relying on vx/vy overrides).
      const steps = Math.round(140 * intensity);
      const turns = 5 + Math.round(intensity * 3);
      for (let i = 0; i < steps; i += 1) {
        const t = i / Math.max(1, steps - 1);
        const a = t * Math.PI * 2 * turns;
        const rr = r * (0.18 + t * 0.82);
        spawnParticle(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, {
          speed: rand(0.9, 3.6) * intensity,
          angle: a + Math.PI * 0.5,
          radius: rand(0.8, 2.8),
          life: rand(24, 78),
          maxLife: 78,
          color: `hsla(${(ptr.hue + t * 90) % 360}, 98%, 70%, 0.9)`,
          gravity: 0.006,
          drag: 0.986,
          shape: Math.random() < 0.3 ? "streak" : "dot",
        });
      }
      spawnRing(cx, cy, { radius: 10, width: 3.4, life: 42, maxLife: 42, color: "#ffffff" });
      playChord(quantizeYToHz(cy));
      vibrate([18, 18, 24]);
      bumpJoy(18);
      setStatus(`Loop bonus!  JOY ${ui.joy}`);
      return;
    }

    if (gesture.kind === "zigzag") {
      for (let i = 2; i < ptr.path.length; i += Math.round(6 / intensity)) {
        const a = ptr.path[i - 2];
        const b = ptr.path[i];
        const ang = Math.atan2(b.y - a.y, b.x - a.x);
        spawnParticle(b.x, b.y, {
          speed: rand(2.2, 5.2) * intensity,
          angle: ang,
          radius: rand(1.2, 2.8),
          life: rand(18, 58),
          maxLife: 58,
          color: "#ffffff",
          gravity: 0.01,
          drag: 0.984,
          shape: "streak",
        });
      }
      playTone({ freq: 520 + rand(-40, 60), duration: 0.06, type: "square", volume: 0.04, glide: -40, cutoff: 2400 });
      playPopNoise({ volume: 0.035, highpass: 1200, lowpass: 7500, rate: rand(0.95, 1.2) });
      vibrate([12, 12, 12, 12]);
      bumpJoy(14);
      setStatus(`Zigzag bonus!  JOY ${ui.joy}`);
      return;
    }

    playChord(quantizeYToHz(ptr.y));
    vibrate([10, 12, 10]);
    bumpJoy(6);
    setStatus(`Ribbon released.  JOY ${ui.joy}`);
  } else {
    playTone({ freq: quantizeYToHz(ptr.y), duration: 0.08, type: "triangle", volume: 0.04, glide: 12, cutoff: 2800 });
    vibrate(10);
    bumpJoy(3);
    setStatus(`Tiny ribbon tap.  JOY ${ui.joy}`);
  }
}

function bubblesDown(ptr) {
  spawnBubbleCluster(ptr.x, ptr.y);
  spawnRing(ptr.x, ptr.y, { radius: 12, width: 3.2, life: 34, maxLife: 34, color: "#ffffff" });

  playPopNoise({ volume: 0.04, highpass: 650, lowpass: 4800, rate: rand(0.85, 1.2) });
  playTone({ freq: 260 + rand(-30, 90), duration: 0.09, type: "sine", volume: 0.04, glide: 22, cutoff: 2600 });
  vibrate(10);

  bumpJoy(2);
  maybeStatus();
}

function bubblesMove(ptr, dx, dy, now) {
  const intensity = clamp(ui.settings.intensity, 0.3, 1.6);
  const wandRadius = 170 * intensity;
  const movement = Math.hypot(dx, dy);
  const m = clamp(movement / 18, 0, 1);
  const inv = movement > 0.0001 ? 1 / movement : 0;
  const swx = -dy * inv;
  const swy = dx * inv;

  for (let i = 0; i < bubbles.length; i += 1) {
    const b = bubbles[i];
    const rx = b.x - ptr.x;
    const ry = b.y - ptr.y;
    const dist = Math.hypot(rx, ry);
    if (dist > wandRadius) continue;

    const t = (1 - dist / wandRadius) * (0.45 + 0.55 * m);
    const invD = dist > 0.0001 ? 1 / dist : 0;

    // Pull slightly toward pointer + swirl from movement.
    b.vx += (-rx * invD) * t * 0.42 * intensity;
    b.vy += (-ry * invD) * t * 0.42 * intensity;
    b.vx += swx * t * 1.1 * intensity;
    b.vy += swy * t * 1.1 * intensity;

    // Fast swipe can "slice-pop" small bubbles.
    if (ptr.speed > 0.75 && dist < b.r * 0.95 && b.r < 30 * intensity) {
      b.r *= 0.6;
      if (b.r < 9) {
        bubbles.splice(i, 1);
        spawnPopSparkle(ptr.x, ptr.y, b.color);
        playPopNoise({ volume: 0.04, highpass: 900, lowpass: 6800, rate: rand(1.0, 1.35) });
        vibrate(6);
        bumpJoy(4);
      }
    }
  }

  if (now - ptr.lastTrailAt > 22) {
    ptr.lastTrailAt = now;
    spawnParticle(ptr.x, ptr.y, {
      speed: rand(0.2, 1.3) * intensity,
      angle: rand(0, Math.PI * 2),
      radius: rand(0.8, 2.0),
      life: rand(10, 28),
      maxLife: 30,
      color: `hsla(${(ptr.hue + 30) % 360}, 95%, 70%, 0.85)`,
      gravity: 0.002,
      drag: 0.975,
    });
  }

  if (now - ptr.lastSoundAt > 120) {
    ptr.lastSoundAt = now;
    const f = 300 + clamp(ptr.speed * 900, 0, 380) + rand(-15, 15);
    playTone({ freq: f, duration: 0.06, type: "triangle", volume: 0.02, glide: 40, cutoff: 3000 });
  }

  bumpJoy(1);
}

function bubblesUp(ptr) {
  const intensity = clamp(ui.settings.intensity, 0.3, 1.6);
  const radius = clamp(120 + ptr.dragDistance * 0.12, 120, 240) * intensity;
  const popped = popBubblesAt(ptr.x, ptr.y, radius, Math.round(10 * intensity));

  if (popped > 0) {
    spawnRing(ptr.x, ptr.y, { radius: 10, width: 3.2, life: 36, maxLife: 36, color: "#ffffff" });
    vibrate([10, 12, 14]);
    bumpJoy(5 + popped);
    setStatus(`Bubble pop x${popped}.  JOY ${ui.joy}`);
  } else {
    // Gentle "thump" even if you miss.
    spawnRing(ptr.x, ptr.y, { radius: 8, width: 2.6, life: 26, maxLife: 26, color: "#ffffff" });
    playPopNoise({ volume: 0.028, highpass: 600, lowpass: 4200, rate: rand(0.8, 1.05) });
    vibrate(8);
    bumpJoy(2);
    setStatus(`No pop. Try a bigger swipe.  JOY ${ui.joy}`);
  }
}

function onPointerDown(ev) {
  const now = performance.now();
  const { x, y } = posFromEvent(ev);
  canvas.setPointerCapture(ev.pointerId);

  const ptr = {
    id: ev.pointerId,
    x,
    y,
    lastX: x,
    lastY: y,
    lastT: now,
    dragDistance: 0,
    speed: 0,
    hue: Math.floor(rand(0, 360)),
    seed: rand(0, 1000),
    lastTrailAt: 0,
    lastSoundAt: 0,
    lastHapticAt: 0,
    path: [],
    modeId: ui.settings.modeId,
  };
  pointers.set(ev.pointerId, ptr);

  ensureAudio(); // resume on first gesture if enabled

  if (ptr.modeId === "ribbons") addRibbonPoint(ptr, x, y, now);

  if (ptr.modeId === "fireworks") fireworksDown(ptr);
  else if (ptr.modeId === "bubbles") bubblesDown(ptr);
  else if (ptr.modeId === "ribbons") ribbonsDown(ptr);
  else fireworksDown(ptr);
}

function onPointerMove(ev) {
  const ptr = pointers.get(ev.pointerId);
  if (!ptr) return;

  const now = performance.now();
  const { x, y } = posFromEvent(ev);
  const dx = x - ptr.x;
  const dy = y - ptr.y;
  const dist = Math.hypot(dx, dy);
  const dt = Math.max(8, now - ptr.lastT);

  ptr.lastX = ptr.x;
  ptr.lastY = ptr.y;
  ptr.x = x;
  ptr.y = y;
  ptr.dragDistance += dist;
  ptr.speed = lerp(ptr.speed, dist / dt, 0.35);
  ptr.lastT = now;

  if (ptr.modeId === "ribbons") addRibbonPoint(ptr, x, y, now);

  if (ptr.modeId === "fireworks") fireworksMove(ptr, now);
  else if (ptr.modeId === "bubbles") bubblesMove(ptr, dx, dy, now);
  else if (ptr.modeId === "ribbons") ribbonsMove(ptr, dx, dy, now);
  else fireworksMove(ptr, now);
}

function onPointerUp(ev) {
  const ptr = pointers.get(ev.pointerId);
  if (!ptr) return;
  pointers.delete(ev.pointerId);
  try {
    canvas.releasePointerCapture(ev.pointerId);
  } catch {
    // ignore
  }

  if (ptr.modeId === "fireworks") fireworksUp(ptr);
  else if (ptr.modeId === "bubbles") bubblesUp(ptr);
  else if (ptr.modeId === "ribbons") ribbonsUp(ptr);
  else fireworksUp(ptr);
  maybeStatus();
}

function onResize() {
  resizeCanvas();
  setStatus("Resized.");
}

function cycleMode() {
  ui.modeIndex = (ui.modeIndex + 1) % MODES.length;
  ui.settings.modeId = MODES[ui.modeIndex].id;
  updateControls();
  saveSettings();

  if (ui.settings.modeId === "fireworks") setStatus("Mode: Fireworks");
  if (ui.settings.modeId === "bubbles") setStatus("Mode: Bubbles. Drag to swirl, release to pop.");
  if (ui.settings.modeId === "ribbons") setStatus("Mode: Ribbons. Draw loops/zigzags for bonuses.");

  vibrate(8);
  playTone({ freq: 420 + ui.modeIndex * 90, duration: 0.08, type: "triangle", volume: 0.05, glide: 20 });
}

function seedAmbient() {
  const w = width();
  const h = height();
  for (let i = 0; i < 90; i += 1) {
    spawnParticle(rand(0, w), rand(0, h), {
      speed: rand(0.04, 0.28),
      angle: rand(0, Math.PI * 2),
      radius: rand(0.35, 1.25),
      life: rand(120, 360),
      maxLife: 360,
      color: "rgba(255,255,255,0.7)",
      gravity: 0,
      drag: 0.9992,
    });
  }
}

function bindUI() {
  modeToggle.addEventListener("click", cycleMode);

  soundToggle.addEventListener("click", () => {
    ui.settings.soundEnabled = !ui.settings.soundEnabled;
    updateControls();
    saveSettings();
    if (ui.settings.soundEnabled) {
      ensureAudio();
      playTone({ freq: 440, duration: 0.08, type: "triangle", volume: 0.05, glide: 20 });
      setStatus("Sound on.");
    } else {
      setStatus("Sound off.");
    }
  });

  hapticToggle.addEventListener("click", () => {
    ui.settings.hapticEnabled = !ui.settings.hapticEnabled;
    updateControls();
    saveSettings();
    if (ui.settings.hapticEnabled) {
      vibrate([10, 10, 10]);
      setStatus("Vibration on.");
    } else {
      setStatus("Vibration off.");
    }
  });

  intensitySlider.addEventListener("input", () => {
    ui.settings.intensity = clamp(Number(intensitySlider.value), 0.3, 1.6);
    saveSettings();
    setStatus(`Intensity ${ui.settings.intensity.toFixed(1)}x`);
  });

  window.addEventListener("keydown", (ev) => {
    if (ev.code === "KeyM") cycleMode();
    if (ev.code === "KeyS") soundToggle.click();
    if (ev.code === "KeyV") hapticToggle.click();
    if (ev.code === "Space") {
      const x = rand(0.2, 0.8) * width();
      const y = rand(0.2, 0.8) * height();
      spawnConfettiBurst(x, y);
      playChord(280 + rand(-40, 90));
      bumpJoy(6);
      maybeStatus();
    }
    if (ev.code === "ArrowUp") {
      ui.settings.intensity = clamp(ui.settings.intensity + 0.1, 0.3, 1.6);
      updateControls();
      saveSettings();
      setStatus(`Intensity ${ui.settings.intensity.toFixed(1)}x`);
    }
    if (ev.code === "ArrowDown") {
      ui.settings.intensity = clamp(ui.settings.intensity - 0.1, 0.3, 1.6);
      updateControls();
      saveSettings();
      setStatus(`Intensity ${ui.settings.intensity.toFixed(1)}x`);
    }
  });
}

function boot() {
  loadSettings();
  updateControls();
  resizeCanvas();
  bindUI();

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);

  window.addEventListener("resize", onResize);

  seedAmbient();
  requestAnimationFrame(animate);
  setStatus("Ready. Click or drag.");
}

boot();
