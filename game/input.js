// input.js — LANTERNKEEP input handling (B4).
// Own code, written for this game. No dependencies, no network.
//
// Contract (what main.js / sim.js / beam.js read):
//   const input = createInput();
//   attachInput(canvas, input);             // wires DOM listeners onto the canvas
//   // each frame main.js reads the edge flags, then clears them (its own
//   // consumeEdges(); clearEdges() below does the same for tests / stubs).
//
// Pointer:
//   input.mouseX / input.mouseY — pointer position in canvas pixels (1280x720
//     space), updated on mousemove. The beam aims from the lamp toward this
//     point. Defaults to open water up-right of the lighthouse so the beam
//     has a sane aim before the first mouse move.
//   input.mouseDown — true while the left button is held. The beam shines
//     only while held (or while steering with the arrow keys) — oil is
//     precious, and a dark lamp burns nothing (beam.js).
//
// Held keys:
//   input.keys — a Set of KeyboardEvent.code strings currently held down.
//     ArrowLeft / ArrowRight (or A / D) slew the beam; Space is the foghorn.
//
// One-shot edge flags (set on press, cleared by the consumer after handling;
// a press is never handled twice, and key auto-repeat never re-fires one):
//   input.foghornPressed — Space, F, or left-click. (foghornQueued is the
//     same flag under its original name — an alias, not a second flag — so
//     main.js clearing foghornPressed also clears foghornQueued.)
//   input.startPressed   — click, Space, or Enter. Starts the campaign from
//     the title / game-over / victory screens.
//   input.continuePressed — Space or Enter on the night-clear screen.
//   input.buyPressed     — 'Digit1'..'Digit6' on the night-clear screen
//     (0 when no buy key was pressed; matches main.js consumeEdges).
//   input.pausePressed   — P. input.restartPressed — R. input.mutePressed — M.
//
// Browser interference: preventDefault() is called ONLY for game keys whose
// default would move the page or trigger a browser action (Space, ArrowLeft,
// ArrowRight, Enter). Letters, digits and F have no scrolling default and are
// left alone. Listeners never steal focus, Tab and clicks outside the game
// are untouched, and window blur releases every held key so a stuck beam
// slew can never survive an alt-tab.

export const GAME_KEYS = new Set([
  "Space",
  "ArrowLeft",
  "ArrowRight",
  "KeyA",
  "KeyD",
  "KeyF",
  "Enter",
  "KeyP",
  "KeyR",
  "KeyM",
  "Digit0",
  "Digit1",
  "Digit2",
  "Digit3",
  "Digit4",
  "Digit5",
  "Digit6",
]);

// Keys whose browser default must be suppressed (page scroll / activation).
const PREVENT_DEFAULT_KEYS = new Set([
  "Space",
  "ArrowLeft",
  "ArrowRight",
  "Enter",
]);

const BUY_KEYS = new Set([
  "Digit1",
  "Digit2",
  "Digit3",
  "Digit4",
  "Digit5",
  "Digit6",
]);

// Default aim: open water up-right of the lamp (lamp sits at 118,168), so
// the opening beam sweeps the sea, not the rocks.
export const DEFAULT_MOUSE_X = 640;
export const DEFAULT_MOUSE_Y = 420;

export function createInput() {
  const input = {
    mouseX: DEFAULT_MOUSE_X,
    mouseY: DEFAULT_MOUSE_Y,
    mouseDown: false,
    // Set of KeyboardEvent.code strings held down right now.
    keys: new Set(),
    // One-shot edge flags. Set on press, cleared by the consumer (main.js
    // consumeEdges, or clearEdges() below) after handling.
    foghornPressed: false,
    startPressed: false,
    continuePressed: false,
    buyPressed: 0,
    pausePressed: false,
    restartPressed: false,
    mutePressed: false,
  };
  // foghornQueued is the original name for the foghorn edge flag: an alias
  // of foghornPressed, so the two names can never drift apart.
  Object.defineProperty(input, "foghornQueued", {
    enumerable: true,
    get() {
      return input.foghornPressed;
    },
    set(value) {
      input.foghornPressed = !!value;
    },
  });
  return input;
}

export function isDown(input, code) {
  return input.keys.has(code);
}

// Clear all one-shot edge flags. Call once per frame AFTER the sim has
// consumed them, so a single press is never handled twice and never lost.
// (main.js has its own consumeEdges() that does the same job in the game;
// this one is for tests, stubs, and any future caller.)
export function clearEdges(input) {
  input.foghornPressed = false;
  input.startPressed = false;
  input.continuePressed = false;
  input.buyPressed = 0;
  input.pausePressed = false;
  input.restartPressed = false;
  input.mutePressed = false;
}

// Convert a client-space pointer event into canvas-space pixels, honouring
// CSS scaling (canvas is 1280x720 internally but may be displayed smaller).
function toCanvasCoords(canvas, clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / Math.max(1, rect.width);
  const scaleY = canvas.height / Math.max(1, rect.height);
  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY,
  };
}

export function attachInput(canvas, input) {
  if (!canvas || !input) {
    throw new Error("attachInput(canvas, input): both arguments are required");
  }

  function onMouseMove(event) {
    const p = toCanvasCoords(canvas, event.clientX, event.clientY);
    input.mouseX = p.x;
    input.mouseY = p.y;
  }

  function onMouseDown(event) {
    // Left button only; right/middle clicks are not game input.
    if (event.button !== 0) return;
    const p = toCanvasCoords(canvas, event.clientX, event.clientY);
    input.mouseX = p.x;
    input.mouseY = p.y;
    input.mouseDown = true;
    // A click IS a foghorn blast (same as Space) and also the "begin"
    // gesture on the title screen. One blast per press, even if held.
    input.foghornPressed = true;
    input.startPressed = true;
  }

  function onMouseUp(event) {
    if (event.button !== 0) return;
    input.mouseDown = false;
  }

  function onKeyDown(event) {
    if (!GAME_KEYS.has(event.code)) return; // not a game key: leave alone
    if (PREVENT_DEFAULT_KEYS.has(event.code)) event.preventDefault();
    // Ignore auto-repeat: a held Space must not machine-gun foghorns, and a
    // held P must not strobe pause on/off.
    if (event.repeat) return;
    input.keys.add(event.code);
    if (event.code === "Space" || event.code === "KeyF") {
      input.foghornPressed = true;
    }
    if (event.code === "Space" || event.code === "Enter") {
      input.startPressed = true;
      input.continuePressed = true;
    }
    if (BUY_KEYS.has(event.code)) input.buyPressed = event.code;
    if (event.code === "KeyP") input.pausePressed = true;
    if (event.code === "KeyR") input.restartPressed = true;
    if (event.code === "KeyM") input.mutePressed = true;
  }

  function onKeyUp(event) {
    if (!GAME_KEYS.has(event.code)) return;
    if (PREVENT_DEFAULT_KEYS.has(event.code)) event.preventDefault();
    input.keys.delete(event.code);
  }

  function onBlur() {
    // Alt-tab / focus loss releases everything: no phantom slew, no phantom
    // foghorn, and no key stuck down when the player comes back.
    input.keys.clear();
    input.mouseDown = false;
  }

  canvas.addEventListener("mousemove", onMouseMove);
  canvas.addEventListener("mousedown", onMouseDown);
  window.addEventListener("mouseup", onMouseUp);
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlur);

  // Returns a detach function so the game (or a test) can remove listeners.
  return function detachInput() {
    canvas.removeEventListener("mousemove", onMouseMove);
    canvas.removeEventListener("mousedown", onMouseDown);
    window.removeEventListener("mouseup", onMouseUp);
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("blur", onBlur);
  };
}
