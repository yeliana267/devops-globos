const stage = document.getElementById("stage");
const overlay = document.getElementById("overlay");
const btnPlayOverlay = document.getElementById("btnPlayOverlay");
const btnStart = document.getElementById("btnStart");
const btnRestart = document.getElementById("btnRestart");

const btnSound = document.getElementById("btnSound");
const btnMusic = document.getElementById("btnMusic");

const scoreEl = document.getElementById("score");
const timeEl = document.getElementById("time");
const bestEl = document.getElementById("best");
const msgEl = document.getElementById("msg");

let score = 0;
let timeLeft = 30;
let timerId = null;
let spawnId = null;
let running = false;

let soundOn = true;
let musicOn = true;

// --- "Música" y SFX sin archivos (WebAudio): súper portable ---
let audioCtx = null;
let musicNode = null;
let musicGain = null;

function ensureAudio(){
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
}

function beep(type = "pop"){
  if (!soundOn) return;
  ensureAudio();
  const now = audioCtx.currentTime;

  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  // Sonidos diferentes
  if (type === "pop") {
    osc.type = "triangle";
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(260, now + 0.08);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.18, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.10);
  } else if (type === "bad") {
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.exponentialRampToValueAtTime(90, now + 0.12);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.16, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);
  } else if (type === "bonus") {
    osc.type = "square";
    osc.frequency.setValueAtTime(660, now);
    osc.frequency.setValueAtTime(880, now + 0.06);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.14, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
  }

  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start(now);
  osc.stop(now + 0.2);
}

function startMusic(){
  if (!musicOn) return;
  ensureAudio();
  if (musicNode) return;

  // Música simple: un LFO + oscilador base (loop suave)
  musicGain = audioCtx.createGain();
  musicGain.gain.value = 0.03; // bajito
  musicGain.connect(audioCtx.destination);

  const osc = audioCtx.createOscillator();
  osc.type = "sine";
  osc.frequency.value = 220;

  const lfo = audioCtx.createOscillator();
  lfo.type = "sine";
  lfo.frequency.value = 1.2;

  const lfoGain = audioCtx.createGain();
  lfoGain.gain.value = 30;

  lfo.connect(lfoGain);
  lfoGain.connect(osc.frequency);

  osc.connect(musicGain);
  osc.start();
  lfo.start();

  musicNode = { osc, lfo, lfoGain };
}

function stopMusic(){
  if (!musicNode) return;
  try {
    musicNode.osc.stop();
    musicNode.lfo.stop();
  } catch {}
  musicNode = null;
}

// --- Récord ---
const BEST_KEY = "balloon_best_v1";
function loadBest(){
  const best = Number(localStorage.getItem(BEST_KEY) || "0");
  bestEl.textContent = String(best);
}
function saveBestIfNeeded(){
  const best = Number(localStorage.getItem(BEST_KEY) || "0");
  if (score > best) {
    localStorage.setItem(BEST_KEY, String(score));
    bestEl.textContent = String(score);
    flashMsg("🏆 ¡Nuevo récord!");
  }
}

// --- UI helpers ---
function setHUD(){
  scoreEl.textContent = String(score);
  timeEl.textContent = String(timeLeft);
}
function flashMsg(text){
  msgEl.textContent = text;
  setTimeout(() => {
    if (msgEl.textContent === text) msgEl.textContent = "";
  }, 1200);
}
function popText(x, y, text){
  const el = document.createElement("div");
  el.className = "pop";
  el.textContent = text;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  stage.appendChild(el);
  setTimeout(() => el.remove(), 600);
}

// --- Juego ---
const COLORS = [
  { name:"red",  bg:"#fb7185", points: 1, sfx:"pop",  weight: 52 },
  { name:"blue", bg:"#60a5fa", points: 2, sfx:"pop",  weight: 32 },
  { name:"gold", bg:"#fbbf24", points: 5, sfx:"bonus", weight: 10 },
  { name:"black",bg:"#0f172a", points:-3, sfx:"bad",  weight: 6  },
];

function pickBalloonType(){
  // selección por peso
  const total = COLORS.reduce((a,c)=>a+c.weight,0);
  let r = Math.random() * total;
  for (const c of COLORS){
    r -= c.weight;
    if (r <= 0) return c;
  }
  return COLORS[0];
}

function spawnBalloon(){
  if (!running) return;

  const t = pickBalloonType();
  const b = document.createElement("div");
  b.className = "balloon";
  b.style.background = t.bg;

  // tamaño y velocidad (sube más rápido al final)
  const w = 62 + Math.random() * 30;
  const h = w * 1.25;
  b.style.width = `${w}px`;
  b.style.height = `${h}px`;

  const stageRect = stage.getBoundingClientRect();
  const x = 20 + Math.random() * (stageRect.width - 40);
  const startY = stageRect.height + 120;

  b.dataset.points = String(t.points);
  b.dataset.sfx = t.sfx;

  // animación manual (requestAnimationFrame)
  let y = startY;
  const baseSpeed = 1.0 + Math.random() * 0.9;
  const difficultyBoost = 1 + (30 - timeLeft) * 0.035; // sube con el tiempo
  const speed = baseSpeed * difficultyBoost;

  b.style.left = `${x}px`;
  b.style.top = `${y}px`;

  const onPop = (ev) => {
    ev.preventDefault();
    if (!running) return;
    const pts = Number(b.dataset.points || "0");
    score += pts;
    setHUD();

    const rect = stage.getBoundingClientRect();
    const px = (ev.clientX || (ev.touches && ev.touches[0].clientX) || rect.left + x) - rect.left;
    const py = (ev.clientY || (ev.touches && ev.touches[0].clientY) || rect.top + y) - rect.top;

    if (pts > 0) popText(px, py, `+${pts}`);
    else popText(px, py, `${pts}`);

    beep(b.dataset.sfx || "pop");

    if (pts >= 5) flashMsg("⭐ ¡BONUS!");
    if (pts < 0) flashMsg("💥 ¡AUCH! Globo malo");

    b.remove();
  };

  b.addEventListener("click", onPop, { passive:false });
  b.addEventListener("touchstart", onPop, { passive:false });

  stage.appendChild(b);

  let alive = true;
  const tick = () => {
    if (!alive) return;
    if (!running) { alive = false; b.remove(); return; }

    y -= speed * 2.2; // sube
    b.style.top = `${y}px`;

    if (y < -140) {
      alive = false;
      b.remove();
      return;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function clearBalloons(){
  stage.querySelectorAll(".balloon, .pop").forEach(el => el.remove());
}

function startGame(){
  if (running) return;

  // audio resume (políticas del navegador)
  ensureAudio();
  if (audioCtx.state === "suspended") audioCtx.resume();

  running = true;
  score = 0;
  timeLeft = 30;
  setHUD();

  overlay.style.display = "none";
  btnStart.disabled = true;
  btnRestart.disabled = false;

  if (musicOn) startMusic();

  flashMsg("🎈 ¡Vamos!");
  clearBalloons();

  timerId = setInterval(() => {
    timeLeft -= 1;
    setHUD();
    if (timeLeft <= 0) endGame();
  }, 1000);

  // spawn variable (aumenta densidad con el tiempo)
  const spawnLoop = () => {
    if (!running) return;
    spawnBalloon();
    const base = 520; // ms
    const extra = Math.max(120, 420 - (30 - timeLeft) * 12);
    spawnId = setTimeout(spawnLoop, base + Math.random() * extra);
  };
  spawnLoop();
}

function endGame(){
  if (!running) return;
  running = false;

  clearInterval(timerId);
  timerId = null;

  clearTimeout(spawnId);
  spawnId = null;

  stopMusic();
  saveBestIfNeeded();

  flashMsg(`⏱️ Fin: ${score} puntos`);
  overlay.style.display = "flex";
  overlay.querySelector("h1").textContent = "🎉 ¡Juego terminado!";
  overlay.querySelector("p").innerHTML =
    `Tu puntaje: <b>${score}</b><br/>¿Otra ronda?`;

  btnStart.disabled = false;
  btnRestart.disabled = true;

  // limpia globos en 1s para que se vea el final
  setTimeout(clearBalloons, 900);
}

function resetOverlayText(){
  overlay.querySelector("h1").textContent = "🎈 Revienta los Globos";
  overlay.querySelector("p").innerHTML =
    `Tienes <b>30 segundos</b>. Explota globos para sumar puntos.<br/>
     <b>Negro</b> resta puntos, <b>dorado</b> da bonus.`;
}

// --- Eventos UI ---
btnPlayOverlay.addEventListener("click", () => {
  resetOverlayText();
  startGame();
});

btnStart.addEventListener("click", () => startGame());
btnRestart.addEventListener("click", () => {
  endGame();
  resetOverlayText();
  startGame();
});

btnSound.addEventListener("click", () => {
  soundOn = !soundOn;
  btnSound.setAttribute("aria-pressed", String(soundOn));
  btnSound.textContent = soundOn ? "🔊 Sonido" : "🔇 Sonido";
  flashMsg(soundOn ? "✅ Sonido ON" : "🚫 Sonido OFF");
});

btnMusic.addEventListener("click", () => {
  musicOn = !musicOn;
  btnMusic.setAttribute("aria-pressed", String(musicOn));
  btnMusic.textContent = musicOn ? "🎵 Música" : "🚫 Música";
  if (!musicOn) stopMusic();
  else if (running) startMusic();
  flashMsg(musicOn ? "✅ Música ON" : "🚫 Música OFF");
});

// --- Init ---
loadBest();
setHUD();
