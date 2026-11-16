// LANTERNKEEP — ships.js
// The ships. Four types, one rule each: a ship holds its course home only
// while it is inside the beam; in the dark it drifts toward the rocks.
// The foghorn snaps the most endangered drifting ship back toward the beam.
// Ghost ships (night 4+) ignore the beam until it has caught them twice.
//
// FLOW (shared with render.js): ships appear on the horizon (y = 250) at
// staggered times and sail down-right toward the harbour dock (1196, 596).
// The sea band is y 240-700; the lighthouse's rocky point (x 0-300, bottom
// left) is a wreck hazard of its own.

import { LIGHTHOUSE, HARBOUR, HARBOUR_RADIUS, POINT_HAZARD } from './nights.js';
import { isInBeam, angleDiff } from './beam.js';

export const SHIP_TYPES = {
  fishing: { name: 'Fishing boat', speed: 26, radius: 13, forgiving: true },
  merchant: { name: 'Merchantman', speed: 36, radius: 16, forgiving: false },
  mail: { name: 'Mail packet', speed: 48, radius: 12, forgiving: false },
  ghost: { name: 'Ghost ship', speed: 32, radius: 15, forgiving: false, ghost: true },
};

export const SEA_TOP = 240;
export const SEA_BOTTOM = 700;
export const SEA_LEFT = 0;
export const SEA_RIGHT = 1280;
export const SPAWN_Y = 250;
export const SPAWN_GAP = 4; // seconds between ships appearing on the horizon

let nextId = 1;

function bearingTo(x, y, tx, ty) {
  return Math.atan2(ty - y, tx - x);
}

function nearestRock(state, x, y) {
  let best = null;
  let bestD = Infinity;
  const rocks = state.rocks;
  for (let i = 0; i < rocks.length; i++) {
    const dx = rocks[i].x - x;
    const dy = rocks[i].y - y;
    const d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; best = rocks[i]; }
  }
  return best;
}

// Build the night's fleet from the night definition. Ships appear one by one
// on the horizon (spawnIn seconds until each one appears, at its lane x).
// Unspawned ships wait offscreen (x = -60) so the renderer never draws a
// ship that has not entered yet.
export function spawnShips(state, nightDef) {
  const ships = [];
  const lanes = [400, 560, 720, 880, 1040, 1180, 480, 640, 800, 960];
  let i = 0;
  const types = ['fishing', 'merchant', 'mail', 'ghost'];
  for (let t = 0; t < types.length; t++) {
    const type = types[t];
    const count = (nightDef.mix && nightDef.mix[type]) || 0;
    for (let k = 0; k < count; k++) {
      const laneX = lanes[i % lanes.length];
      // The first ship starts on the horizon at its lane; later ships wait
      // offscreen (x = -60) until their spawnIn elapses, so the renderer
      // never draws a ship that has not entered yet.
      const spawnIn = i * SPAWN_GAP;
      ships.push({
        id: nextId++,
        type,
        x: spawnIn === 0 ? laneX : -60,
        y: SPAWN_Y,
        laneX,
        angle: bearingTo(laneX, SPAWN_Y, HARBOUR.x, HARBOUR.y),
        speed: SHIP_TYPES[type].speed * nightDef.speed,
        state: 'sailing',
        lit: false,
        spawnIn,
        exposures: 0, // ghost ships: how many separate times the beam caught them
        wasLit: false,
        grace: 0, // seconds of held course left after the beam moves on
        hornTimer: 0,
        rockWarn: false,
      });
      i++;
    }
  }
  return ships;
}

// Turn `angle` toward `target` by at most `maxStep` radians.
function turnToward(angle, target, maxStep) {
  const d = angleDiff(angle, target);
  if (Math.abs(d) <= maxStep) return target;
  return angle + Math.sign(d) * maxStep;
}

export function updateShips(state, dt) {
  const def = state.nightDef;
  const ships = state.ships;
  for (let i = 0; i < ships.length; i++) {
    const s = ships[i];
    if (s.state === 'saved' || s.state === 'wrecked') continue;
    if (s.spawnIn > 0) {
      s.spawnIn -= dt;
      if (s.spawnIn <= 0) {
        // The ship appears on the horizon, already headed for home.
        s.x = s.laneX;
        s.y = SPAWN_Y;
        s.angle = bearingTo(s.x, s.y, HARBOUR.x, HARBOUR.y);
      }
      continue;
    }

    const lit = isInBeam(state, s.x, s.y);

    // Ghost ships only answer the beam after it has caught them twice.
    if (s.type === 'ghost') {
      if (lit && !s.wasLit) s.exposures += 1;
      s.wasLit = lit;
    }
    const canObey = s.type === 'ghost' ? s.exposures >= 2 : true;
    // A ship holds its course for a few seconds after the light leaves it —
    // it steers by the light it just saw. Without this the beam could never
    // shepherd a ship across the whole sea, because the lamp cannot watch
    // every ship at once.
    if (lit && canObey) s.grace = 5;
    else if (s.grace > 0) s.grace -= dt;
    const obeys = canObey && (lit || s.grace > 0);
    s.lit = lit;

    if (s.hornTimer > 0) {
      // Foghorn: hold course for home regardless of the beam.
      s.hornTimer -= dt;
      s.angle = turnToward(s.angle, bearingTo(s.x, s.y, HARBOUR.x, HARBOUR.y), 3.2 * dt);
      s.state = 'sailing';
    } else if (obeys) {
      s.state = 'sailing';
      s.angle = turnToward(s.angle, bearingTo(s.x, s.y, HARBOUR.x, HARBOUR.y), 1.9 * dt);
    } else {
      // In the dark the helm goes slack: the ship sags south with the sea,
      // toward the rock field, and the cross-current drags it sideways.
      // (Earlier this steered straight at the nearest rock — a trap: a ship
      // that sailed past a rock would turn back west into it. Sagging is
      // readable, fair, and still lethal after ~10 s of neglect.)
      s.state = 'drifting';
      s.angle = turnToward(s.angle, Math.PI / 2, 0.25 * dt);
    }

    // A ship under way holds its line: the current pushes a sailing ship
    // half as hard as a drifting one (which is wholly at the sea's mercy).
    const speedMul = s.state === 'drifting' ? 0.45 : 1;
    const curMul = s.state === 'drifting' ? 1 : 0.5;
    s.x += Math.cos(s.angle) * s.speed * speedMul * dt + def.current.x * curMul * dt;
    s.y += Math.sin(s.angle) * s.speed * speedMul * dt + def.current.y * curMul * dt;
    if (s.y < SEA_TOP) s.y = SEA_TOP;
    if (s.y > SEA_BOTTOM) s.y = SEA_BOTTOM;
    if (s.x < SEA_LEFT) s.x = SEA_LEFT;
    if (s.x > SEA_RIGHT) s.x = SEA_RIGHT;

    // Warning flag for the renderer: a drifting ship near rocks.
    const rock = nearestRock(state, s.x, s.y);
    s.rockWarn = s.state === 'drifting' && rock !== null &&
      Math.hypot(rock.x - s.x, rock.y - s.y) < rock.r + 130;

    // Home: inside the harbour mouth.
    if (Math.hypot(s.x - HARBOUR.x, s.y - HARBOUR.y) < HARBOUR_RADIUS) {
      s.state = 'saved';
      state.savedThisNight += 1;
      state.savedTotal += 1;
      state.events.push({ type: 'saved', id: s.id, shipType: s.type });
      continue;
    }

    // Wreck: touching any rock.
    let wrecked = false;
    for (let r = 0; r < state.rocks.length; r++) {
      const rk = state.rocks[r];
      const d = Math.hypot(s.x - rk.x, s.y - rk.y);
      if (d < rk.r + SHIP_TYPES[s.type].radius) { wrecked = true; break; }
    }
    // The lighthouse's rocky point is a hazard too (drawn polygon, x 0-300).
    if (!wrecked &&
      Math.hypot(s.x - POINT_HAZARD.x, s.y - POINT_HAZARD.y) < POINT_HAZARD.r) {
      wrecked = true;
    }
    // So is the lamp rock itself, up close.
    if (!wrecked && Math.hypot(s.x - LIGHTHOUSE.x, s.y - LIGHTHOUSE.y) < 40) {
      wrecked = true;
    }
    if (wrecked) {
      s.state = 'wrecked';
      state.wrecksThisNight += 1;
      state.events.push({ type: 'wreck', id: s.id, shipType: s.type, x: s.x, y: s.y });
    }
  }
}

// The foghorn: the most endangered drifting ship (closest to a rock) snaps
// back onto a course for home for 2 seconds. Returns the ship, or null.
export function blowFoghorn(state) {
  if (state.foghorns <= 0) return null;
  let worst = null;
  let worstD = Infinity;
  for (let i = 0; i < state.ships.length; i++) {
    const s = state.ships[i];
    if (s.state !== 'drifting' || s.spawnIn > 0) continue;
    const rock = nearestRock(state, s.x, s.y);
    if (!rock) continue;
    const d = Math.hypot(rock.x - s.x, rock.y - s.y) - rock.r;
    if (d < worstD) { worstD = d; worst = s; }
  }
  if (!worst) return null;
  state.foghorns -= 1;
  worst.hornTimer = 2;
  worst.angle = bearingTo(worst.x, worst.y, HARBOUR.x, HARBOUR.y);
  state.foghornFlash = 1;
  state.events.push({ type: 'foghorn', id: worst.id });
  return worst;
}
