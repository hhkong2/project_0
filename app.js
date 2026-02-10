const canvas = document.getElementById("joy-canvas");
const ctx = canvas.getContext("2d");
const statusLabel = document.getElementById("status");
const soundToggle = document.getElementById("sound-toggle");
const hapticToggle = document.getElementById("haptic-toggle");

const palette = ["#57f6ff", "#ffe166", "#ff6ea3", "#7fffd4", "#ffd9f7", "#65ff88"];

const messages = [
  "작은 반짝임 생성!",
  "좋아요, 계속 흔들어보세요!",
  "완벽한 터치!",
  "오늘의 기분 점수 상승!",
  "반짝반짝 에너지가 퍼졌어요!",
  "아주 좋은 리듬이에요!",
];

const particles = [];
const rings = [];
let dpr = Math.min(window.devicePixelRatio || 1, 2);
let soundEnabled = true;
let hapticEnabled = true;
let audioCtx;
let activePointerId = null;
let pointerDown = false;
let downX = 0;
let downY = 0;
let dragDistance = 0;
let lastTrailStamp = 0;
let lastSoundStamp = 0;
let lastHapticStamp = 0;
let lastMessageStamp = 0;
let hueShift = 0;

const uiState = {
  joyScore: 0,
};

function resizeCanvas() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  const { width, height } = canvas.getBoundingClientRect();
  canvas.width = Math.max(1, Math.round(width * dpr));
  canvas.height = Math.max(1, Math.round(height * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function randomFrom(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function setStatus(text) {
  statusLabel.textContent = text;
}

function updateToggles() {
  soundToggle.setAttribute("aria-pressed", String(soundEnabled));
  soundToggle.textContent = soundEnabled ? "SOUND ON" : "SOUND OFF";
  hapticToggle.setAttribute("aria-pressed", String(hapticEnabled));
  hapticToggle.textContent = hapticEnabled ? "VIBE ON" : "VIBE OFF";
}

function ensureAudio() {
  if (!soundEnabled) {
    return null;
  }
  if (!audioCtx) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) {
      soundEnabled = false;
      updateToggles();
      setStatus("이 브라우저는 오디오 생성이 제한됩니다.");
      return null;
    }
    audioCtx = new AudioCtx();
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }
  return audioCtx;
}

function playTone(freq, duration = 0.11, type = "triangle", volume = 0.055, glide = 0) {
  const context = ensureAudio();
  if (!context) {
    return;
  }

  const now = context.currentTime;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const filter = context.createBiquadFilter();

  filter.type = "lowpass";
  filter.frequency.setValueAtTime(2600, now);

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(freq, now);
  if (glide !== 0) {
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(30, freq + glide), now + duration);
  }

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(volume, now + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  oscillator.connect(filter);
  filter.connect(gain);
  gain.connect(context.destination);

  oscillator.start(now);
  oscillator.stop(now + duration + 0.04);
}

function playChord(root) {
  playTone(root, 0.13, "triangle", 0.06, 12);
  playTone(root * 1.25, 0.16, "sine", 0.045, -8);
  playTone(root * 1.5, 0.19, "square", 0.028, -15);
}

function vibrate(pattern) {
  if (!hapticEnabled || !navigator.vibrate) {
    return;
  }
  navigator.vibrate(pattern);
}

function boostScore(points) {
  uiState.joyScore += points;
}

function maybeShowMessage() {
  const now = performance.now();
  if (now - lastMessageStamp < 900) {
    return;
  }
  lastMessageStamp = now;
  setStatus(`${randomFrom(messages)} (JOY ${uiState.joyScore})`);
}

function spawnParticle(x, y, options = {}) {
  const speed = options.speed ?? Math.random() * 1.8 + 0.45;
  const angle = options.angle ?? Math.random() * Math.PI * 2;
  particles.push({
    x,
    y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    life: options.life ?? Math.random() * 38 + 35,
    maxLife: options.maxLife ?? Math.random() * 38 + 35,
    radius: options.radius ?? Math.random() * 2.8 + 1.5,
    color: options.color ?? randomFrom(palette),
    drag: options.drag ?? 0.985,
    gravity: options.gravity ?? 0.012,
  });
}

function spawnRing(x, y, radius = 10, width = 3, color = randomFrom(palette)) {
  rings.push({
    x,
    y,
    radius,
    width,
    color,
    life: 30,
    maxLife: 30,
  });
}

function spawnBurst(x, y, count = 26, power = 2.8) {
  for (let i = 0; i < count; i += 1) {
    spawnParticle(x, y, {
      speed: Math.random() * power + 0.35,
      angle: (Math.PI * 2 * i) / count + Math.random() * 0.45,
      radius: Math.random() * 3.7 + 1.3,
      life: Math.random() * 30 + 38,
      maxLife: 68,
      gravity: 0.02,
    });
  }
  spawnRing(x, y, Math.random() * 12 + 6, Math.random() * 2 + 2);
}

function spawnTrail(x, y, vx, vy) {
  const toneColor = randomFrom(palette);
  for (let i = 0; i < 4; i += 1) {
    spawnParticle(x, y, {
      speed: Math.random() * 1.2 + 0.15,
      angle: Math.random() * Math.PI * 2,
      radius: Math.random() * 2 + 1,
      life: Math.random() * 18 + 16,
      maxLife: 36,
      color: toneColor,
      gravity: 0.003,
      drag: 0.974,
    });
  }
  spawnParticle(x, y, {
    speed: Math.random() * 0.8 + 0.2,
    angle: Math.atan2(vy, vx),
    radius: 2.6,
    life: 16,
    maxLife: 24,
    color: "#ffffff",
    gravity: 0.001,
    drag: 0.97,
  });
}

function renderBackground(width, height, time) {
  hueShift = (hueShift + 0.09) % 360;
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, `hsla(${hueShift}, 88%, 15%, 0.21)`);
  gradient.addColorStop(0.5, "rgba(4, 7, 18, 0.19)");
  gradient.addColorStop(1, `hsla(${(hueShift + 64) % 360}, 74%, 17%, 0.24)`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  const orbCount = 4;
  for (let i = 0; i < orbCount; i += 1) {
    const cycle = time * 0.00028 + i * 1.19;
    const x = width * (0.16 + (i / orbCount) * 0.78) + Math.sin(cycle) * 28;
    const y = height * (0.24 + 0.11 * i) + Math.cos(cycle * 0.9) * 22;
    const radius = 34 + i * 8 + Math.sin(cycle * 1.4) * 7;
    const glow = ctx.createRadialGradient(x, y, 0, x, y, radius);
    glow.addColorStop(0, "rgba(255, 255, 255, 0.17)");
    glow.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

function renderParticles(width, height) {
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

    if (p.x < -30 || p.x > width + 30 || p.y < -30 || p.y > height + 30) {
      particles.splice(i, 1);
      continue;
    }

    const alpha = clamp(p.life / p.maxLife, 0, 1);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius * (0.35 + alpha), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function renderRings() {
  for (let i = rings.length - 1; i >= 0; i -= 1) {
    const ring = rings[i];
    ring.life -= 1;
    if (ring.life <= 0) {
      rings.splice(i, 1);
      continue;
    }
    ring.radius += 1.9;
    const alpha = clamp(ring.life / ring.maxLife, 0, 1);
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = ring.color;
    ctx.lineWidth = ring.width * alpha;
    ctx.beginPath();
    ctx.arc(ring.x, ring.y, ring.radius, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function animate(time) {
  const width = canvas.width / dpr;
  const height = canvas.height / dpr;

  ctx.globalCompositeOperation = "source-over";
  renderBackground(width, height, time);

  ctx.globalCompositeOperation = "lighter";
  renderRings();
  renderParticles(width, height);
  ctx.globalCompositeOperation = "source-over";

  requestAnimationFrame(animate);
}

function positionFromPointer(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}

function handlePointerDown(event) {
  activePointerId = event.pointerId;
  pointerDown = true;
  dragDistance = 0;
  canvas.setPointerCapture(activePointerId);

  const { x, y } = positionFromPointer(event);
  downX = x;
  downY = y;

  spawnBurst(x, y, 26, 3.4);
  playTone(250 + Math.random() * 130, 0.12, "triangle", 0.06, 18);
  vibrate(12);
  boostScore(1);
  maybeShowMessage();
}

function handlePointerMove(event) {
  if (!pointerDown || event.pointerId !== activePointerId) {
    return;
  }
  const now = performance.now();
  const { x, y } = positionFromPointer(event);
  const dx = x - downX;
  const dy = y - downY;
  const stepDistance = Math.hypot(dx, dy);
  dragDistance += stepDistance;
  downX = x;
  downY = y;

  if (now - lastTrailStamp > 14) {
    lastTrailStamp = now;
    spawnTrail(x, y, dx, dy);
  }

  if (now - lastSoundStamp > 58) {
    lastSoundStamp = now;
    const note = 330 + (dragDistance % 200);
    playTone(note, 0.08, "sine", 0.03, 30);
  }

  if (now - lastHapticStamp > 120) {
    lastHapticStamp = now;
    vibrate(4);
  }

  boostScore(1);
}

function handlePointerUp(event) {
  if (event.pointerId !== activePointerId) {
    return;
  }
  pointerDown = false;
  canvas.releasePointerCapture(activePointerId);
  activePointerId = null;

  const { x, y } = positionFromPointer(event);
  const burstCount = clamp(Math.round(18 + dragDistance * 0.1), 20, 64);
  const burstPower = clamp(2 + dragDistance * 0.008, 2.6, 5.4);
  spawnBurst(x, y, burstCount, burstPower);

  const root = clamp(240 + dragDistance * 0.95, 220, 620);
  playChord(root);

  if (dragDistance < 18) {
    vibrate([14, 18, 12]);
    setStatus(`톡! 미니 폭죽 성공 (JOY ${uiState.joyScore})`);
    boostScore(3);
  } else {
    vibrate([24, 12, 30]);
    setStatus(`드래그 파동 ${Math.round(dragDistance)}px (JOY ${uiState.joyScore})`);
    boostScore(Math.round(clamp(dragDistance / 12, 5, 24)));
  }
}

function onResize() {
  resizeCanvas();
  setStatus("화면 크기에 맞게 조정됨");
}

function bindEvents() {
  canvas.addEventListener("pointerdown", handlePointerDown);
  canvas.addEventListener("pointermove", handlePointerMove);
  canvas.addEventListener("pointerup", handlePointerUp);
  canvas.addEventListener("pointercancel", handlePointerUp);

  window.addEventListener("resize", onResize);

  soundToggle.addEventListener("click", () => {
    soundEnabled = !soundEnabled;
    if (soundEnabled) {
      ensureAudio();
      playTone(420, 0.08, "triangle", 0.05, 20);
    }
    updateToggles();
    setStatus(soundEnabled ? "사운드 켜짐" : "사운드 꺼짐");
  });

  hapticToggle.addEventListener("click", () => {
    hapticEnabled = !hapticEnabled;
    updateToggles();
    if (hapticEnabled) {
      vibrate([10, 10, 10]);
    }
    setStatus(hapticEnabled ? "진동 켜짐" : "진동 꺼짐");
  });
}

function seedAmbientParticles() {
  const width = canvas.width / dpr;
  const height = canvas.height / dpr;
  for (let i = 0; i < 90; i += 1) {
    spawnParticle(Math.random() * width, Math.random() * height, {
      speed: Math.random() * 0.25 + 0.04,
      angle: Math.random() * Math.PI * 2,
      radius: Math.random() * 1.2 + 0.35,
      life: Math.random() * 240 + 120,
      maxLife: 360,
      color: "rgba(255,255,255,0.7)",
      gravity: 0,
      drag: 0.9992,
    });
  }
}

function boot() {
  resizeCanvas();
  bindEvents();
  updateToggles();
  seedAmbientParticles();
  animate(performance.now());
  setStatus("준비 완료: 화면을 클릭하고 드래그하세요.");
}

boot();
