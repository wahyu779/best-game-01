// LANTERNKEEP — beam.js
// The lighthouse beam: where it points, how fast it turns, how much oil it
// burns, and whether a point on the sea is inside its light.
// The beam shines only while the keeper holds the mouse button (or steers
// with the arrow keys) — oil is precious, and a dark lamp burns nothing.
// Angles are radians, 0 = due east, positive = clockwise (canvas y-down).

import { LIGHTHOUSE, HARBOUR } from './nights.js';

export const BEAM_BASE = {
  width: 0.16, // radians of spread
  reach: 1150, // px — the beam must reach the harbour (1160 px from the lamp) so every ship can be lit, not just the near ones
  slewSpeed: 1.6, // rad/s toward the aim point
  burnRate: 1.4, // oil per second while shining
};

export const HARBOUR_LIGHT_RADIUS = 230;

// Shortest signed angular difference from a to b, in (-PI, PI].
export function angleDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

// Storm flicker: a slow, deterministic wobble so the beam stutters in a storm
// without any randomness the sim cannot reproduce. 1 = full strength.
export function flickerAt(time) {
  const w = Math.sin(time * 9.3) * 0.5 + Math.sin(time * 23.7 + 1.7) * 0.5;
  return w > 0.55 ? 0.7 : 1;
}

// Steer the beam toward the mouse aim (or arrow keys) and burn oil.
// input: { mouseX, mouseY, mouseDown, keys:Set } — keys holds 'ArrowLeft' /
// 'ArrowRight' (and 'KeyA' / 'KeyD') while held. Returns nothing; mutates state.
export function updateBeam(state, input, dt) {
  const beam = state.beam;
  const def = state.nightDef;

  // Aim: arrow keys slew the lamp directly and take precedence over the
  // mouse for this step (otherwise the mouse aim would drag the lamp straight
  // back every frame and keyboard steering could never work).
  const keys = input.keys;
  const arrowLeft = keys && (keys.has('ArrowLeft') || keys.has('KeyA'));
  const arrowRight = keys && (keys.has('ArrowRight') || keys.has('KeyD'));
  if (arrowLeft) {
    beam.angle -= beam.slewSpeed * dt;
  } else if (arrowRight) {
    beam.angle += beam.slewSpeed * dt;
  } else if (input.mouseX !== undefined && input.mouseY !== undefined) {
    const dx = input.mouseX - LIGHTHOUSE.x;
    const dy = input.mouseY - LIGHTHOUSE.y;
    if (dx * dx + dy * dy > 400) {
      const target = Math.atan2(dy, dx);
      const diff = angleDiff(beam.angle, target);
      const maxStep = beam.slewSpeed * dt;
      beam.angle += Math.abs(diff) <= maxStep ? diff : Math.sign(diff) * maxStep;
    }
  }

  // The lamp shines while held and while there is oil to burn.
  const wantOn = Boolean(input.mouseDown) || (keys && (keys.has('ArrowLeft') || keys.has('ArrowRight') || keys.has('KeyA') || keys.has('KeyD')));
  beam.on = wantOn && state.oil > 0 && state.screen === 'playing';
  if (beam.on) {
    state.oil = Math.max(0, state.oil - BEAM_BASE.burnRate * dt);
    if (state.oil <= 0) beam.on = false;
  }

  // Storm flicker throttles the effective beam.
  beam.flicker = def && def.storm ? flickerAt(state.time) : 1;
}

export function beamReach(state) {
  // The storm flicker narrows the beam but never shortens it: during a
  // flicker dip a far ship is harder to catch, never impossible to reach.
  return state.beam.reach;
}

export function beamWidth(state) {
  // flicker defaults to 1 when the beam object was staged (shots.js) or
  // built without a sim step — a missing flicker must never NaN the cone.
  return state.beam.width * (state.beam.flicker ?? 1);
}

// Is the point (x, y) lit right now? True when the beam is on and the point
// is inside its cone, or when the second harbour light covers it.
export function isInBeam(state, x, y) {
  if (state.upgrades.harbourLight > 0) {
    const hx = x - HARBOUR.x;
    const hy = y - HARBOUR.y;
    if (hx * hx + hy * hy <= HARBOUR_LIGHT_RADIUS * HARBOUR_LIGHT_RADIUS) return true;
  }
  if (!state.beam.on) return false;
  const dx = x - LIGHTHOUSE.x;
  const dy = y - LIGHTHOUSE.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist > beamReach(state)) return false;
  const ang = Math.atan2(dy, dx);
  return Math.abs(angleDiff(state.beam.angle, ang)) <= beamWidth(state) / 2;
}
