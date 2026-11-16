// LANTERNKEEP — sim.js
// Owns the world state and steps it at a fixed 60 Hz. Rendering reads this
// state and never writes it; audio and input only ever see events and input.
// Score = ships saved x 100 x night multiplier + oil banked + no-wreck bonus.

import { BEAM_BASE } from './beam.js';
import { updateBeam } from './beam.js';
import { spawnShips, updateShips, blowFoghorn } from './ships.js';
import { NIGHTS, nightDef } from './nights.js';
import { buyUpgrade as buyUpgradeImpl } from './upgrades.js';

export const FIXED_DT = 1 / 60;
export const TOTAL_NIGHTS = 7;
export const WRECKS_TO_LOSE = 3;
export const START_OIL = 100;
export const SAVE_SCORE = 100;
export const NO_WRECK_BONUS = 250;
export const BEST_KEY = 'lanternkeep-best';

export function loadBest() {
  try {
    if (typeof localStorage === 'undefined') return 0;
    return Number(localStorage.getItem(BEST_KEY) || 0) || 0;
  } catch {
    return 0;
  }
}

export function saveBest(score) {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(BEST_KEY, String(score));
  } catch {
    // Offline storage unavailable; best score simply does not persist.
  }
}

export function createGame() {
  return {
    screen: 'title',
    night: 1,
    nightDef: nightDef(1),
    oil: START_OIL,
    maxOil: START_OIL,
    score: 0,
    best: loadBest(),
    ships: [],
    rocks: [],
    fogDensity: 0.15,
    foghornFlash: 0,
    beam: {
      angle: 0.5,
      width: BEAM_BASE.width,
      reach: BEAM_BASE.reach,
      slewSpeed: BEAM_BASE.slewSpeed,
      on: false,
      flicker: 1,
    },
    foghorns: 2,
    wrecksThisNight: 0,
    savedThisNight: 0,
    savedTotal: 0,
    upgrades: { beamWidth: 0, slew: 0, reach: 0, foghorns: 0, harbourLight: 0, bank: 0 },
    particles: [],
    events: [],
    results: null,
    time: 0,
    nightTime: 0,
    muted: false,
  };
}

// Open a night: fresh oil delivery, fresh foghorns, a new fleet.
// Night 1 starts a new campaign (score reset); later nights continue it.
export function startNight(state, n) {
  const def = nightDef(n);
  state.night = n;
  state.nightDef = def;
  state.rocks = def.rocks;
  state.fogDensity = def.fog;
  state.oil = state.maxOil;
  state.foghorns = 2 + state.upgrades.foghorns;
  state.wrecksThisNight = 0;
  state.savedThisNight = 0;
  state.nightTime = 0;
  state.ships = spawnShips(state, def);
  state.results = null;
  state.events.length = 0;
  state.screen = 'playing';
  return state;
}

// Close the night the fleet has finished. Returns the results object and
// moves the state machine: nightClear, victory, or gameOver.
export function endNight(state) {
  const def = state.nightDef;
  const saved = state.savedThisNight;
  const lost = state.wrecksThisNight;
  const oilLeft = Math.floor(state.oil);
  const noWreck = lost === 0 ? NO_WRECK_BONUS : 0;
  const nightScore = saved * SAVE_SCORE * state.night + oilLeft + noWreck;
  state.score += nightScore;

  const results = {
    night: state.night,
    name: def.name,
    saved,
    lost,
    total: state.ships.length,
    oilLeft,
    oilBanked: oilLeft,
    noWreckBonus: noWreck,
    nightScore,
    totalScore: state.score,
    campaignOver: false,
    victory: false,
  };

  if (lost >= WRECKS_TO_LOSE) {
    // Three wrecks in one night: the campaign ends here.
    results.campaignOver = true;
    state.results = results;
    state.screen = 'gameOver';
    state.events.push({ type: 'gameOver', results });
  } else if (state.night >= TOTAL_NIGHTS) {
    results.victory = true;
    state.results = results;
    state.screen = 'victory';
    state.events.push({ type: 'victory', results });
  } else {
    state.results = results;
    state.screen = 'nightClear';
    state.events.push({ type: 'nightClear', results });
  }

  if (state.score > state.best) {
    state.best = state.score;
    saveBest(state.score);
  }
  return results;
}

export function buyUpgrade(state, id) {
  return buyUpgradeImpl(state, id);
}

// One fixed 60 Hz step. input: { mouseX, mouseY, mouseDown, keys:Set,
// foghornPressed } — edge flags are consumed (cleared) by the caller, main.js.
// Only 'playing' advances the world; other screens are frozen.
export function update(state, input, dt) {
  if (state.screen !== 'playing') return;

  state.time += dt;
  state.nightTime += dt;

  updateBeam(state, input, dt);

  if (input.foghornPressed) {
    blowFoghorn(state);
  }

  updateShips(state, dt);

  // Age particles (spawned by render/audio hooks via events) and drop the dead.
  for (let i = state.particles.length - 1; i >= 0; i--) {
    const p = state.particles[i];
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.life <= 0) state.particles.splice(i, 1);
  }

  // Foghorn flash (render.js draws expanding rings while this is > 0).
  if (state.foghornFlash > 0) {
    state.foghornFlash = Math.max(0, state.foghornFlash - dt * 1.2);
  }

  // The night ends when every ship has come home or gone down — but the
  // campaign already ends the moment the third wreck happens.
  if (state.wrecksThisNight >= WRECKS_TO_LOSE) {
    endNight(state);
    return;
  }
  let resolved = 0;
  for (let i = 0; i < state.ships.length; i++) {
    const s = state.ships[i];
    if (s.state === 'saved' || s.state === 'wrecked') resolved++;
  }
  if (resolved >= state.ships.length && state.ships.length > 0) {
    endNight(state);
  }
}

export { NIGHTS };
