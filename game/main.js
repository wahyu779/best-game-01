// LANTERNKEEP — main.js
// Game loop and state machine. Fixed 60 Hz simulation (accumulator over
// requestAnimationFrame), rendering separate from the sim, one state object
// owned by sim.js. Screens: title / playing / paused / nightClear /
// gameOver / victory.
//
// INPUT (input.js, lane B4 — main.js reads exactly what it provides):
//   input = {
//     mouseX, mouseY,       // canvas coords of the pointer
//     mouseDown,            // true while the left button is held: the beam shines
//     keys,                 // Set of KeyboardEvent.code strings currently held
//     foghornQueued,        // edge: Space or left-click, set once per press
//     pausePressed,         // edge: P   restartPressed: R   mutePressed: M
//   }
//   clearEdges(input) clears the edge flags; main.js calls it once per frame
//   after the sim has consumed them, so a press is never handled twice.
//   Click / Space is the universal CONFIRM: it starts on the title screen,
//   resumes from pause, continues from night-clear, and restarts after the
//   end. During play it is the foghorn — except a click on the pause button
//   (top-right, 1196,10,60,34), which pauses instead.
//   Sim steps read input.foghornPressed; main.js maps it from
//   input.foghornQueued each frame before stepping (the sim's name for it).
//
// MENU KEYS (main.js's own listener — input.js leaves non-game keys alone):
//   Digit1..Digit6 buy upgrades on the night-clear screen (all six are
//   drawn by render.js's SHOP list, same order as UPGRADE_IDS), Enter confirms.
//   The shop order matches render.js's SHOP list.
//
// AUDIO (audio.js, lane B3): initAudio(), startAmbient(), stopAmbient(),
// playFoghorn(), playBell(), playWreck(), playChime(), playClick(),
// setMuted(bool). Audio starts only from a user gesture, never on load.
// RENDER (render.js, lane B2): draw(ctx, state) draws everything from state.
// SHOTS (shots.js, lane B4): setupShot(state, name) builds one deterministic
// ?shot= scene; in shot mode main.js only draws, it never steps the sim.

import { createGame, update, startNight, buyUpgrade, FIXED_DT } from './sim.js';
import { draw } from './render.js';
import { createInput, attachInput, clearEdges } from './input.js';
import * as audio from './audio.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const BUY_KEYS = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6'];
const UPGRADE_IDS = ['beamWidth', 'slew', 'reach', 'foghorns', 'harbourLight', 'bank'];
const PAUSE_BTN = { x: 1196, y: 10, w: 60, h: 34 };

let state = createGame();
const input = createInput();
attachInput(canvas, input);

// Menu keys live here, not in input.js (it only tracks game keys).
const menu = { buyPressed: 0, enterPressed: false };
window.addEventListener('keydown', (event) => {
  if (event.repeat) return;
  if (BUY_KEYS.includes(event.code)) menu.buyPressed = event.code;
  else if (event.code === 'Enter') menu.enterPressed = true;
});

// Exposed for the ?shot= scenes and for debugging in the console.
window.__game = state;

let audioStarted = false;
function ensureAudio() {
  if (audioStarted) return;
  audioStarted = true;
  try {
    audio.initAudio();
    audio.startAmbient();
  } catch { /* audio is a garnish, never fatal */ }
}

// B3: create the AudioContext on the FIRST user gesture (any pointer/key),
// even before the campaign starts — e.g. M on the title screen. Ambient
// waves still only start when play begins (ensureAudio, above).
let audioInitOnGesture = false;
function initAudioOnGesture() {
  if (audioInitOnGesture) return;
  audioInitOnGesture = true;
  try { audio.initAudio(); } catch { /* ignore */ }
}
window.addEventListener('pointerdown', initAudioOnGesture);
window.addEventListener('keydown', initAudioOnGesture);

function startCampaign() {
  ensureAudio();
  try { audio.playClick(); } catch { /* ignore */ }
  state = createGame();
  window.__game = state;
  startNight(state, 1);
}

function nextNight() {
  ensureAudio();
  try { audio.playClick(); } catch { /* ignore */ }
  startNight(state, state.night + 1);
}

// Drain sim events into sounds. Called once per frame, after the sim steps.
function drainEvents() {
  const events = state.events;
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    try {
      if (e.type === 'saved') audio.playBell();
      else if (e.type === 'wreck') audio.playWreck();
      else if (e.type === 'foghorn') audio.playFoghorn();
      else if (e.type === 'nightClear') audio.playChime();
      else if (e.type === 'victory') audio.playChime();
      else if (e.type === 'gameOver') audio.playWreck();
      else if (e.type === 'buy') audio.playClick();
    } catch { /* never let a sound kill the frame */ }
  }
  events.length = 0;
}

function confirmPressed() {
  // B4's input flags (startPressed: click/Space/Enter; continuePressed:
  // Space/Enter) plus the foghorn edge (click/Space) and main.js's own
  // Enter listener — any of them is a confirm on a menu screen.
  return input.foghornQueued || input.startPressed || input.continuePressed || menu.enterPressed;
}

function consumeConfirm() {
  input.foghornQueued = false;
  input.startPressed = false;
  input.continuePressed = false;
  menu.enterPressed = false;
}

function inPauseButton() {
  return input.mouseX >= PAUSE_BTN.x && input.mouseX <= PAUSE_BTN.x + PAUSE_BTN.w &&
    input.mouseY >= PAUSE_BTN.y && input.mouseY <= PAUSE_BTN.y + PAUSE_BTN.h;
}

// One frame's worth of screen transitions, from the edge flags input.js set.
function handleScreens() {
  if (input.mutePressed) {
    state.muted = !state.muted;
    try { audio.setMuted(state.muted); } catch { /* ignore */ }
  }

  if (state.screen === 'title') {
    if (confirmPressed()) { consumeConfirm(); startCampaign(); }
    else if (input.restartPressed) { startCampaign(); }
    return;
  }

  if (state.screen === 'playing') {
    if (input.pausePressed) {
      state.screen = 'paused';
      try { audio.playClick(); } catch { /* ignore */ }
    } else if (input.restartPressed) {
      startCampaign();
    } else if (input.foghornQueued && input.mouseDown && inPauseButton()) {
      // Clicking the drawn pause button pauses; it is not a foghorn blast.
      // (Space also queues a foghorn, so the button only answers the mouse.)
      consumeConfirm();
      state.screen = 'paused';
    }
    return;
  }

  if (state.screen === 'paused') {
    if (input.pausePressed || confirmPressed()) {
      consumeConfirm();
      state.screen = 'playing';
    } else if (input.restartPressed) {
      startCampaign();
    }
    return;
  }

  if (state.screen === 'nightClear') {
    if (input.restartPressed) { startCampaign(); return; }
    // Buy keys: main.js's own Digit1-6 listener, or B4's input.buyPressed.
    const buyKey = menu.buyPressed || input.buyPressed;
    if (buyKey) {
      const idx = BUY_KEYS.indexOf(buyKey);
      if (idx >= 0) buyUpgrade(state, UPGRADE_IDS[idx]);
    }
    if (confirmPressed()) { consumeConfirm(); nextNight(); }
    return;
  }

  if (state.screen === 'gameOver' || state.screen === 'victory') {
    if (input.restartPressed || confirmPressed()) {
      consumeConfirm();
      startCampaign();
    }
  }
}

// Clear every edge flag so each press is handled exactly once.
function consumeEdges() {
  clearEdges(input);
  menu.buyPressed = 0;
  menu.enterPressed = false;
}

let last = performance.now();
let acc = 0;
let prevScreen = state.screen;

// Deterministic screenshot scenes (?shot=1-title etc.) are built by shots.js
// (lane B4). In shot mode the scene is static: draw it, never step the sim.
const shot = new URLSearchParams(location.search).get('shot');
let shotMode = false;
if (shot) {
  shotMode = true;
  import('./shots.js')
    .then((mod) => {
      if (typeof mod.setupShot === 'function') mod.setupShot(state, shot);
    })
    .catch(() => { window.__shotReady = true; });
}

function frame(now) {
  requestAnimationFrame(frame);
  let elapsed = (now - last) / 1000;
  last = now;
  if (elapsed > 0.25) elapsed = 0.25; // tab was in the background: don't spiral

  if (!shotMode) {
    handleScreens();

    // Map B4's foghorn edge onto the name the sim reads, then step.
    input.foghornPressed = input.foghornQueued;
    if (state.screen === 'playing') {
      acc += elapsed;
      let steps = 0;
      while (acc >= FIXED_DT && steps < 5) {
        update(state, input, FIXED_DT);
        acc -= FIXED_DT;
        steps++;
        if (state.screen !== 'playing') { acc = 0; break; }
      }
      if (steps >= 5) acc = 0;
    } else {
      acc = 0;
    }

    // Ambient waves run while playing, stop at the end of the campaign.
    if (prevScreen !== state.screen) {
      try {
        if (state.screen === 'gameOver' || state.screen === 'victory') audio.stopAmbient();
        else if (state.screen === 'playing' && audioStarted) audio.startAmbient();
      } catch { /* ignore */ }
      prevScreen = state.screen;
    }

    drainEvents();
  }

  draw(ctx, state);
  consumeEdges();
}

requestAnimationFrame(frame);
