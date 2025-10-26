// ===== Sine engine (single & scheduled) =====
const SineEngine = {
  ctx: null, gain: null, master: 0.25,
  start() { if (this.ctx) return; this.ctx = new (window.AudioContext || window.webkitAudioContext)(); this.gain = this.ctx.createGain(); this.gain.gain.value = this.master; this.gain.connect(this.ctx.destination); },
  async play(note, oct, dur = .5) { // single-shot
    if (!this.ctx) this.start();
    const freq = midiToFreq(noteToMidi(note, oct)); if (!freq) return;
    const now = this.ctx.currentTime; const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
    o.type = "sine"; o.frequency.value = freq; o.connect(g); g.connect(this.gain);
    g.gain.setValueAtTime(0, now); g.gain.linearRampToValueAtTime(1, now + .02); g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    o.start(now); o.stop(now + dur + .02);
  },
  playAt(note, oct, dur = .5, whenSec = null) { // scheduled start
    if (!this.ctx) this.start();
    const t = (whenSec ?? this.ctx.currentTime);
    const freq = midiToFreq(noteToMidi(note, oct)); if (!freq) return;
    const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
    o.type = "sine"; o.frequency.value = freq; o.connect(g); g.connect(this.gain);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1, t + .02); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.start(t); o.stop(t + dur + .02);
  }
};

// ===== Tone Sampler engine =====
let SamplerEngine = {
  sampler: null, loaded: false,
  async init() {
    if (this.loaded) return;
    await Tone.start();
    this.sampler = new Tone.Sampler({
      urls: {
        "A0": "A0.mp3", "C1": "C1.mp3", "D#1": "Ds1.mp3", "F#1": "Fs1.mp3", "A1": "A1.mp3",
        "C2": "C2.mp3", "D#2": "Ds2.mp3", "F#2": "Fs2.mp3", "A2": "A2.mp3",
        "C3": "C3.mp3", "D#3": "Ds3.mp3", "F#3": "Fs3.mp3", "A3": "A3.mp3",
        "C4": "C4.mp3", "D#4": "Ds4.mp3", "F#4": "Fs4.mp3", "A4": "A4.mp3",
        "C5": "C5.mp3", "D#5": "Ds5.mp3", "F#5": "Fs5.mp3", "A5": "A5.mp3",
        "C6": "C6.mp3", "D#6": "Ds6.mp3", "F#6": "Fs6.mp3", "A6": "A6.mp3",
        "C7": "C7.mp3", "D#7": "Ds7.mp3", "F#7": "Fs7.mp3", "A7": "A7.mp3", "C8": "C8.mp3"
      },
      release: 1.0,
      baseUrl: "https://tonejs.github.io/audio/salamander/"
    }).toDestination();
    await this.sampler.loaded;
    this.loaded = true;
  },
  async play(note, oct, dur = .8) {
    if (!this.loaded) await this.init();
    const key = normalizeKeyStr(note, oct);
    this.sampler.triggerAttackRelease(key, dur);
  },
  async playMany(keys, dur = .8, when = null) {
    if (!this.loaded) await this.init();
    const t = when ?? Tone.now();
    this.sampler.triggerAttackRelease(keys, dur, t);
  }
};

let mode = "sine"; // "sine" | "piano"
const sfStatus = document.getElementById('sfStatus');
const toggleBtn = document.getElementById('toggleMode');
toggleBtn.addEventListener('click', async () => {
  if (mode === "sine") {
    try {
      sfStatus.textContent = "音色: ピアノ（読み込み中...）";
      await SamplerEngine.init();
      mode = "piano";
      toggleBtn.textContent = "音色: ピアノ";
      sfStatus.textContent = "音色: ピアノ（ロード済み）";
    } catch (e) {
      console.error(e);
      sfStatus.textContent = "音色: ピアノ読み込み失敗（正弦波に戻します）";
      mode = "sine";
    }
  } else {
    mode = "sine";
    toggleBtn.textContent = "音色: 正弦波";
    sfStatus.textContent = "音色: 正弦波（デフォルト）";
  }
});

// ===== Note utils =====
const NN = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const enh = { "Db": "C#", "Eb": "D#", "Gb": "F#", "Ab": "G#", "Bb": "A#" };
function midiToNameOct(m) { const name = NN[m % 12]; const oct = Math.floor(m / 12) - 1; return { name, oct }; }
function noteToMidi(note, oct) {
  const s = note.replace("♭", "b").replace("♯", "#");
  const n = (s.length === 2 && s[1] === "b") ? (enh[s] || s) : s;
  const idx = NN.indexOf(n); if (idx < 0) return null;
  return 12 * (oct + 1) + idx; // C4=60
}
function midiToFreq(m) { return 440 * Math.pow(2, (m - 69) / 12); }
function nameToFreq(note, oct) { const m = noteToMidi(note, oct); return m == null ? null : midiToFreq(m); }
function normalizeKeyStr(note, oct) {
  const s = note.replace("♭", "b").replace("♯", "#");
  const n = (s.length === 2 && s[1] === "b") ? (enh[s] || s) : s;
  return n + oct; // e.g., C#4
}

async function playNote(note, oct, dur = 0.6) {
  if (mode === "piano") {
    try { await SamplerEngine.play(note, oct, dur); return; }
    catch (e) { console.warn("piano failed, fallback sine", e); }
  }
  await SineEngine.play(note, oct, dur);
}

// ===== 88-key Keyboard (A0..C8) =====
const keyboardDiv = document.getElementById('keyboard');
const W = 20, H = 132, HB = 84, GAP = 1;
function renderFullKeyboard(highlights = [], nowNote = null) {
  const startM = 21;  // A0
  const endM = 108;   // C8
  let x = 0;
  let whitePos = {};
  let svg = `<svg viewBox="0 0 ${((W + GAP) * 52)} ${H}" aria-label="keyboard">`; // 52 whites
  for (let m = startM; m <= endM; m++) {
    const { name, oct } = midiToNameOct(m);
    if (!name.includes("#")) {
      const keyStr = name + oct;
      whitePos[keyStr] = x;
      const isNow = nowNote && (normalizeKeyStr(nowNote.name, nowNote.oct) === keyStr);
      svg += `<rect x="${x}" y="0" width="${W}" height="${H}" fill="#fff" stroke="#111" ${isNow ? 'stroke-width="2"' : ''}/>`;
      svg += `<rect data-key="${keyStr}" x="${x}" y="0" width="${W}" height="${H}" fill="transparent"/>`;
      x += W + GAP;
    }
  }
  function baseHasSharp(n) { return ["C", "D", "F", "G", "A"].includes(n); }
  for (let m = startM; m <= endM; m++) {
    const { name, oct } = midiToNameOct(m);
    if (!name.includes("#") && baseHasSharp(name)) {
      const base = name + oct;
      const sharp = name + "#" + oct;
      const mSharp = m + 1;
      if (mSharp <= endM && NN[mSharp % 12].includes("#")) {
        const wx = whitePos[base];
        const isNow = nowNote && (normalizeKeyStr(nowNote.name, nowNote.oct) === sharp);
        const bx = wx + (W * 0.7);
        svg += `<rect x="${bx}" y="0" width="${W * 0.6}" height="${HB}" fill="#111" stroke="#111" ${isNow ? 'stroke-width="2"' : ''}/>`;
        svg += `<rect data-key="${sharp}" x="${bx}" y="0" width="${W * 0.6}" height="${HB}" fill="transparent"/>`;
      }
    }
  }
  // highlights
  function keyToX(keyStr) {
    if (whitePos[keyStr] != null) return whitePos[keyStr] + W / 2;
    const base = keyStr.replace("#", "");
    const wx = whitePos[base];
    if (wx != null) return wx + (W * 0.7) + (W * 0.6) / 2;
    return null;
  }
  for (const h of highlights) {
    const keyStr = normalizeKeyStr(h.name, h.oct);
    const cx = keyToX(keyStr);
    if (cx == null) continue;
    const color = h.hand === "B" ? "var(--B)" : (h.hand === "R" ? "var(--R)" : "var(--L)");
    const isNow = nowNote && (normalizeKeyStr(nowNote.name, nowNote.oct) === keyStr);
    const r = isNow ? 10 : 8;
    const stroke = isNow ? `stroke="var(--now)" stroke-width="2"` : "";
    svg += `<circle cx="${cx}" cy="${H - 20}" r="${r}" fill="${color}" ${stroke}/>`;
    if (h.fing) { svg += `<text x="${cx}" y="${H - 22}" text-anchor="middle" font-size="10" fill="#fff" dy=".35em">${h.fing}</text>`; }
  }

  svg += `</svg>`;
  keyboardDiv.innerHTML = svg;
  // click audition
  keyboardDiv.querySelectorAll("[data-key]").forEach(el => {
    el.addEventListener('click', async () => {
      const k = el.getAttribute('data-key'); // e.g., C4 or C#4
      const n = k.slice(0, -1), o = +k.slice(-1);
      await playNote(n, o, 0.6);
    });
  });
}

// ===== Data (C, G demo; override by JSON loader) =====
let data = {
  "C": {
    "name": "Cメジャー (ハ長調)", "type": "メジャー", "octaves": 2,
    "right": {
      "ascending": [{ "note": "C", "oct": 4, "fing": 1 }, { "note": "D", "oct": 4, "fing": 2 }, { "note": "E", "oct": 4, "fing": 3 }, { "note": "F", "oct": 4, "fing": 1 }, { "note": "G", "oct": 4, "fing": 2 }, { "note": "A", "oct": 4, "fing": 3 }, { "note": "B", "oct": 4, "fing": 4 }, { "note": "C", "oct": 5, "fing": 5 }, { "note": "D", "oct": 5, "fing": 1 }, { "note": "E", "oct": 5, "fing": 2 }, { "note": "F", "oct": 5, "fing": 3 }, { "note": "G", "oct": 5, "fing": 1 }, { "note": "A", "oct": 5, "fing": 2 }, { "note": "B", "oct": 5, "fing": 3 }, { "note": "C", "oct": 6, "fing": 5 }],
      "descending": [{ "note": "C", "oct": 6, "fing": 4 }, { "note": "B", "oct": 5, "fing": 3 }, { "note": "A", "oct": 5, "fing": 2 }, { "note": "G", "oct": 5, "fing": 1 }, { "note": "F", "oct": 5, "fing": 3 }, { "note": "E", "oct": 5, "fing": 2 }, { "note": "D", "oct": 5, "fing": 1 }, { "note": "C", "oct": 5, "fing": 5 }, { "note": "B", "oct": 4, "fing": 4 }, { "note": "A", "oct": 4, "fing": 3 }, { "note": "G", "oct": 4, "fing": 2 }, { "note": "F", "oct": 4, "fing": 1 }, { "note": "E", "oct": 4, "fing": 3 }, { "note": "D", "oct": 4, "fing": 2 }, { "note": "C", "oct": 4, "fing": 1 }]
    },
    "left": {
      "ascending": [{ "note": "C", "oct": 4, "fing": 5 }, { "note": "D", "oct": 4, "fing": 4 }, { "note": "E", "oct": 4, "fing": 3 }, { "note": "F", "oct": 4, "fing": 2 }, { "note": "G", "oct": 4, "fing": 1 }, { "note": "A", "oct": 4, "fing": 3 }, { "note": "B", "oct": 4, "fing": 2 }, { "note": "C", "oct": 5, "fing": 1 }, { "note": "D", "oct": 5, "fing": 4 }, { "note": "E", "oct": 5, "fing": 3 }, { "note": "F", "oct": 5, "fing": 2 }, { "note": "G", "oct": 5, "fing": 1 }, { "note": "A", "oct": 5, "fing": 3 }, { "note": "B", "oct": 5, "fing": 2 }, { "note": "C", "oct": 6, "fing": 1 }],
      "descending": [{ "note": "C", "oct": 6, "fing": 1 }, { "note": "B", "oct": 5, "fing": 2 }, { "note": "A", "oct": 5, "fing": 3 }, { "note": "G", "oct": 5, "fing": 1 }, { "note": "F", "oct": 5, "fing": 2 }, { "note": "E", "oct": 5, "fing": 3 }, { "note": "D", "oct": 5, "fing": 4 }, { "note": "C", "oct": 5, "fing": 1 }, { "note": "B", "oct": 4, "fing": 2 }, { "note": "A", "oct": 4, "fing": 3 }, { "note": "G", "oct": 4, "fing": 1 }, { "note": "F", "oct": 4, "fing": 2 }, { "note": "E", "oct": 4, "fing": 3 }, { "note": "D", "oct": 4, "fing": 4 }, { "note": "C", "oct": 4, "fing": 5 }]
    }
  },
  "G": {
    "name": "Gメジャー (ト長調)", "type": "メジャー", "octaves": 2,
    "right": {
      "ascending": [{ "note": "G", "oct": 4, "fing": 1 }, { "note": "A", "oct": 4, "fing": 2 }, { "note": "B", "oct": 4, "fing": 3 }, { "note": "C", "oct": 5, "fing": 1 }, { "note": "D", "oct": 5, "fing": 2 }, { "note": "E", "oct": 5, "fing": 3 }, { "note": "F♯", "oct": 5, "fing": 4 }, { "note": "G", "oct": 5, "fing": 5 }, { "note": "A", "oct": 5, "fing": 1 }, { "note": "B", "oct": 5, "fing": 2 }, { "note": "C", "oct": 6, "fing": 3 }, { "note": "D", "oct": 6, "fing": 1 }, { "note": "E", "oct": 6, "fing": 2 }, { "note": "F♯", "oct": 6, "fing": 3 }, { "note": "G", "oct": 6, "fing": 4 }],
      "descending": [{ "note": "G", "oct": 6, "fing": 4 }, { "note": "F♯", "oct": 6, "fing": 3 }, { "note": "E", "oct": 6, "fing": 2 }, { "note": "D", "oct": 6, "fing": 1 }, { "note": "C", "oct": 6, "fing": 3 }, { "note": "B", "oct": 5, "fing": 2 }, { "note": "A", "oct": 5, "fing": 1 }, { "note": "G", "oct": 5, "fing": 5 }, { "note": "F♯", "oct": 5, "fing": 4 }, { "note": "E", "oct": 5, "fing": 3 }, { "note": "D", "oct": 5, "fing": 2 }, { "note": "C", "oct": 5, "fing": 1 }, { "note": "B", "oct": 4, "fing": 3 }, { "note": "A", "oct": 4, "fing": 2 }, { "note": "G", "oct": 4, "fing": 1 }]
    },
    "left": {
      "ascending": [{ "note": "G", "oct": 3, "fing": 5 }, { "note": "A", "oct": 3, "fing": 4 }, { "note": "B", "oct": 3, "fing": 3 }, { "note": "C", "oct": 4, "fing": 2 }, { "note": "D", "oct": 4, "fing": 1 }, { "note": "E", "oct": 4, "fing": 3 }, { "note": "F♯", "oct": 4, "fing": 2 }, { "note": "G", "oct": 4, "fing": 1 }, { "note": "A", "oct": 4, "fing": 4 }, { "note": "B", "oct": 4, "fing": 3 }, { "note": "C", "oct": 5, "fing": 2 }, { "note": "D", "oct": 5, "fing": 1 }, { "note": "E", "oct": 5, "fing": 3 }, { "note": "F♯", "oct": 5, "fing": 2 }, { "note": "G", "oct": 5, "fing": 1 }],
      "descending": [{ "note": "G", "oct": 5, "fing": 1 }, { "note": "F♯", "oct": 5, "fing": 2 }, { "note": "E", "oct": 5, "fing": 3 }, { "note": "D", "oct": 5, "fing": 1 }, { "note": "C", "oct": 5, "fing": 2 }, { "note": "B", "oct": 4, "fing": 3 }, { "note": "A", "oct": 4, "fing": 4 }, { "note": "G", "oct": 4, "fing": 1 }, { "note": "F♯", "oct": 4, "fing": 2 }, { "note": "E", "oct": 4, "fing": 3 }, { "note": "D", "oct": 4, "fing": 4 }, { "note": "C", "oct": 4, "fing": 2 }, { "note": "B", "oct": 3, "fing": 3 }, { "note": "A", "oct": 3, "fing": 4 }, { "note": "G", "oct": 3, "fing": 5 }]
    }
  }
};

// ===== UI state =====
let currentKey = "C";
let playing = false;
let playTimer = null;
let highlightEnabled = false;
const tempo = document.getElementById('tempo');
const tempoValEl = document.getElementById('tempoVal');
tempo.addEventListener('input', () => tempoValEl.textContent = tempo.value);
tempoValEl.textContent = tempo.value;

const keyButtons = document.getElementById('keyButtons');
const modeButtons = Array.from(document.querySelectorAll('.btn.mode-select'));
const stopButton = document.getElementById('btnStop');
const playMainButton = document.getElementById('btnPlayMain');

let currentPlayMode = modeButtons.find(btn => btn.dataset.mode === 'R-asc')?.dataset.mode
  || modeButtons[0]?.dataset.mode
  || null;

function renderModeButtons() {
  modeButtons.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === currentPlayMode);
  });
}

function renderKeyButtons() {
  keyButtons.innerHTML = "";
  Object.keys(data).forEach(k => {
    const btn = document.createElement('button');
    const isActive = highlightEnabled && (k === currentKey);
    btn.className = 'key' + (isActive ? ' active' : '');
    btn.textContent = k;
    btn.onclick = () => {
      currentKey = k;
      highlightEnabled = true;
      stop();
    };
    keyButtons.appendChild(btn);
  });
}

function chips(elId, seq) {
  const el = document.getElementById(elId);
  el.innerHTML = "";
  (seq || []).forEach(n => {
    const d = document.createElement('div'); d.className = 'chip';
    d.textContent = `${n.note} ${n.oct} / 指${n.fing}`; el.appendChild(d);
  });
}

function sequenceHighlights(seq, hand) {
  return (seq || []).map(n => ({ name: n.note, oct: n.oct, hand, fing: n.fing }));
}

function buildHighlight(keyData, mode) {
  if (!keyData || !mode) return [];
  switch (mode) {
    case "R-asc": return sequenceHighlights(keyData.right?.ascending, "R");
    case "R-desc": return sequenceHighlights(keyData.right?.descending, "R");
    case "L-asc": return sequenceHighlights(keyData.left?.ascending, "L");
    case "L-desc": return sequenceHighlights(keyData.left?.descending, "L");
    case "both-asc":
      return [
        ...sequenceHighlights(keyData.right?.ascending, "R"),
        ...sequenceHighlights(keyData.left?.ascending, "L")
      ];
    default:
      return [];
  }
}

function renderAll() {
  renderKeyButtons();
  const k = data[currentKey];
  // info
  const info = document.getElementById('info');
  info.innerHTML = `<h3>情報</h3><div class="chips">
    <div class="chip">調名: ${k.name || currentKey}</div>
    <div class="chip">タイプ: ${k.type || "メジャー"}</div>
    <div class="chip">オクターブ: ${k.octaves || 2}</div>
  </div>`;
  chips('rhAsc', k.right?.ascending); chips('rhDesc', k.right?.descending);
  chips('lhAsc', k.left?.ascending); chips('lhDesc', k.left?.descending);

  const hi = highlightEnabled ? buildHighlight(k, currentPlayMode) : [];
  renderFullKeyboard(hi, null);
  renderModeButtons();
}

function stop() {
  playing = false;
  if (playTimer) {
    clearTimeout(playTimer);
    playTimer = null;
  }
  renderAll();
}
stopButton?.addEventListener('click', () => stop());

// ---- Single-hand playback (no duplicate last note)
async function playSeq(seq, hand) {
  if (!seq || !seq.length) return;
  playing = true; let i = 0; const ms = 60000 / (+tempo.value);
  const step = async () => {
    if (!playing) { stop(); return; }
    if (i >= seq.length) { stop(); return; }
    const n = seq[i++];
    await playNote(n.note, n.oct, 0.7);
    const hi = [{ name: n.note, oct: n.oct, hand: hand, fing: n.fing }];
    renderFullKeyboard(hi, { name: n.note, oct: n.oct });
    playTimer = setTimeout(step, ms);
  }; step();
}

// ---- True unison playback (simultaneous scheduling)
async function playBothAsc(k) {
  const R = k.right?.ascending || [];
  const L = k.left?.ascending || [];
  const len = Math.max(R.length, L.length);
  const beatMs = 60000 / (+tempo.value);

  playing = true; let i = 0;
  const tick = async () => {
    if (!playing) { stop(); return; }
    if (i >= len) { stop(); return; }

    const r = R[i] || null;
    const l = L[i] || null;

    // choose time axis & schedule same timestamp
    if (mode === "piano" && window.Tone) {
      await SamplerEngine.init();
      const t = Tone.now() + 0.02; // lookahead
      const keys = [];
      if (r) keys.push(normalizeKeyStr(r.note, r.oct));
      if (l) keys.push(normalizeKeyStr(l.note, l.oct));
      if (keys.length) SamplerEngine.playMany(keys, 0.8, t);
    } else {
      if (!SineEngine.ctx) SineEngine.start();
      const t = SineEngine.ctx.currentTime + 0.02;
      if (r) SineEngine.playAt(r.note, r.oct, 0.6, t);
      if (l) SineEngine.playAt(l.note, l.oct, 0.6, t);
    }

    const hi = [];
    if (r) hi.push({ name: r.note, oct: r.oct, hand: "R", fing: r.fing });
    if (l) hi.push({ name: l.note, oct: l.oct, hand: "L", fing: l.fing });
    renderFullKeyboard(hi, hi[0] || hi[1] || null);

    i++; playTimer = setTimeout(tick, beatMs);
  };
  tick();
}

modeButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const modeAttr = btn.getAttribute('data-mode');
    if (!modeAttr) return;
    if (currentPlayMode !== modeAttr) currentPlayMode = modeAttr;
    stop();
  });
});

async function playCurrentMode() {
  if (!currentPlayMode) return;
  const k = data[currentKey];
  if (!k) return;
  highlightEnabled = true;
  stop();
  if (currentPlayMode === "R-asc") await playSeq(k.right?.ascending, "R");
  if (currentPlayMode === "R-desc") await playSeq(k.right?.descending, "R");
  if (currentPlayMode === "L-asc") await playSeq(k.left?.ascending, "L");
  if (currentPlayMode === "L-desc") await playSeq(k.left?.descending, "L");
  if (currentPlayMode === "both-asc") await playBothAsc(k);
}

playMainButton?.addEventListener('click', () => { playCurrentMode(); });
document.getElementById('playBtn')?.addEventListener('click', () => { playCurrentMode(); });
document.getElementById('stopBtn')?.addEventListener('click', () => { stop(); });

document.getElementById('btnLoad').addEventListener('click', async () => {
  const f = document.getElementById('jsonFile').files?.[0];
  if (!f) { alert("JSONファイルを選択してください"); return; }
  try {
    const t = await f.text(); const obj = JSON.parse(t);
    data = obj;
    currentKey = Object.keys(data)[0] || "C";
    highlightEnabled = false;
    stop();
  } catch (e) { alert("JSON読み込みエラー: " + e.message); }
});

// Init
renderAll();
