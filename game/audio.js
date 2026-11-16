// audio.js — LANTERNKEEP sound module (B3)
// WebAudio synth ONLY: no audio files, no network, no copied music.
// Every sound is synthesized from oscillators / filtered noise at call time.
//
// Contract (from the design spec):
//   initAudio()   — create/resume the AudioContext; call from a user gesture.
//   playFoghorn() — deep horn, fired by the player (Space / click).
//   playBell()    — bright bell, when a ship is saved.
//   playWreck()   — noise-burst crash, when a ship wrecks.
//   playChime()   — night-clear chime, when a night is cleared.
//   playClick()   — short UI click.
//   setMuted(bool) — mute / unmute everything (master gain).
//   startAmbient() / stopAmbient() — looping wave wash, runs while playing.
// All play functions are safe to call before initAudio(): they no-op
// (browser autoplay rules — no context exists until the user interacts)
// and never throw, headless included.

// ---------------------------------------------------------------------------
// State (module-private; nothing here touches the DOM or the network)
// ---------------------------------------------------------------------------
let ctx = null;          // AudioContext, created once by initAudio()
let master = null;       // master GainNode (muting lives here)
let muted = false;       // muted flag — remembered before init too
let ambientNodes = null; // { source, filter, gain, lfo, lfoGain } while running

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// True only when we can actually make sound right now.
function ready() {
  return ctx !== null && ctx.state === 'running' && !muted;
}

// One envelope: ramp gain up fast, then decay exponentially to silence.
// Returns the gain node so callers can connect sources into it.
function envelope(peak, attack, decay) {
  const t = ctx.currentTime;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  g.connect(master);
  return g;
}

// A white-noise buffer, shared by wreck + ambient (built once, reused).
let noiseBuffer = null;
function getNoiseBuffer() {
  if (noiseBuffer) return noiseBuffer;
  const len = ctx.sampleRate * 2; // 2 seconds of noise
  noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return noiseBuffer;
}

// Stop an oscillator a little after its envelope ends, so nothing leaks.
function stopAt(osc, secondsFromNow) {
  try { osc.stop(ctx.currentTime + secondsFromNow); } catch (e) { /* already stopped */ }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

// Create (or resume) the AudioContext. Must be called from a user gesture;
// browsers keep the context "suspended" otherwise. Safe to call repeatedly.
export function initAudio() {
  try {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return; // no WebAudio in this environment — stay silent
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.9;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => { /* resume needs a gesture; retry on next call */ });
    }
  } catch (e) {
    // Headless / restricted environments: audio is optional, never fatal.
    ctx = null;
    master = null;
  }
}

// Deep foghorn: two detuned saws through a low-pass, ~2.6 s long.
export function playFoghorn() {
  if (!ready()) return;
  try {
    const dur = 2.6;
    const g = envelope(0.5, 0.08, dur);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(420, ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(120, ctx.currentTime + dur);
    filter.connect(g);
    // 55 Hz + 58.3 Hz: the slow beat between them is the horn's growl.
    [55, 58.27].forEach((freq) => {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = freq;
      osc.connect(filter);
      osc.start();
      stopAt(osc, dur + 0.2);
    });
  } catch (e) { /* sound must never break the game */ }
}

// Bright bell: a struck partial series (fundamental + inharmonic overtones),
// ~2.2 s of ringing decay.
export function playBell() {
  if (!ready()) return;
  try {
    const dur = 2.2;
    // Bell partials: 1.0, 2.76, 5.4 (inharmonic, like a real bell).
    const partials = [
      [880, 0.35],
      [2428, 0.16],
      [4752, 0.07],
    ];
    partials.forEach(([freq, peak]) => {
      const g = envelope(peak, 0.004, dur);
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      osc.connect(g);
      osc.start();
      stopAt(osc, dur + 0.2);
    });
  } catch (e) { /* sound must never break the game */ }
}

// Wreck crash: a burst of filtered noise (wood + surf) plus a low thump
// that drops in pitch, ~1.1 s total.
export function playWreck() {
  if (!ready()) return;
  try {
    const dur = 1.1;
    // Noise burst through a low-pass sweeping down.
    const noise = ctx.createBufferSource();
    noise.buffer = getNoiseBuffer();
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(3000, ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(180, ctx.currentTime + dur);
    const ng = envelope(0.6, 0.005, dur);
    noise.connect(filter);
    filter.connect(ng);
    noise.start();
    noise.stop(ctx.currentTime + dur + 0.1);
    // Low thump: sine falling 120 Hz -> 40 Hz.
    const thump = ctx.createOscillator();
    thump.type = 'sine';
    thump.frequency.setValueAtTime(120, ctx.currentTime);
    thump.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.4);
    const tg = envelope(0.55, 0.005, 0.5);
    thump.connect(tg);
    thump.start();
    stopAt(thump, 0.6);
  } catch (e) { /* sound must never break the game */ }
}

// Night-clear chime: a rising four-note arpeggio (C5 E5 G5 C6), ~1.8 s.
export function playChime() {
  if (!ready()) return;
  try {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, i) => {
      const startAt = ctx.currentTime + i * 0.16;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, startAt);
      g.gain.exponentialRampToValueAtTime(0.28, startAt + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, startAt + 1.1);
      g.connect(master);
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      osc.connect(g);
      osc.start(startAt);
      osc.stop(startAt + 1.2);
    });
  } catch (e) { /* sound must never break the game */ }
}

// UI click: a 45 ms blip at 1250 Hz. Quiet on purpose.
export function playClick() {
  if (!ready()) return;
  try {
    const g = envelope(0.18, 0.003, 0.045);
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = 1250;
    osc.connect(g);
    osc.start();
    stopAt(osc, 0.08);
  } catch (e) { /* sound must never break the game */ }
}

// Mute / unmute. Remembers the flag even before initAudio() so a mute
// pressed on the title screen still applies once audio starts.
export function setMuted(value) {
  muted = !!value;
  try {
    if (master && ctx) {
      master.gain.setTargetAtTime(muted ? 0 : 0.9, ctx.currentTime, 0.02);
    }
  } catch (e) { /* sound must never break the game */ }
}

// Ambient wave loop: looped noise through a low-pass, with an LFO slowly
// swelling the gain — surf rolling in and out. Idempotent; no-op before init.
export function startAmbient() {
  if (ctx === null || ambientNodes !== null) return;
  try {
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const source = ctx.createBufferSource();
    source.buffer = getNoiseBuffer();
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 380;
    filter.Q.value = 0.6;
    const gain = ctx.createGain();
    gain.gain.value = 0.05;
    // LFO: ~0.09 Hz swell (one wave every ~11 s) between 0.02 and 0.09.
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.09;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.035;
    lfo.connect(lfoGain);
    lfoGain.connect(gain.gain);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start();
    lfo.start();
    ambientNodes = { source, filter, gain, lfo, lfoGain };
  } catch (e) {
    ambientNodes = null; // never fatal; game plays on silently
  }
}

// Stop the ambient loop and free its nodes. No-op if it was never started.
export function stopAmbient() {
  if (ambientNodes === null) return;
  try {
    const { source, lfo } = ambientNodes;
    try { source.stop(); } catch (e) { /* already stopped */ }
    try { lfo.stop(); } catch (e) { /* already stopped */ }
  } catch (e) { /* sound must never break the game */ }
  ambientNodes = null;
}
