// shots.js — LANTERNKEEP deterministic screenshot scenes (B4).
// Own code, written for this game. Imports only nights.js (plain data, no
// side effects) so each scene uses the night's REAL definition — rocks, fog,
// storm — instead of a second copy that could drift from the game.
//
// Purpose: the four house screenshots must be reproducible stills of the
// game's own code. A screenshot run loads the game with ?shot=<scene> (and
// optionally &seed=<n>), the scene state is built deterministically from a
// seeded RNG and a FIXED sim time, one frame is rendered, and then
// window.__shotReady is set to true. The R3 pipeline script
// (~/workspace/makefun/best-game-01-scratch/take-shots.py) waits for exactly
// that flag before capturing, so nothing here may change that contract:
//   - the flag is set only AFTER the scene has been drawn,
//   - the flag is never set on a timer / wall clock / animation frame count
//     that could drift between runs.
//
// Scenes (names accepted in ?shot=; "1-title" style aliases also accepted):
//   title    -> 1-title.jpg   cover: lighthouse, sweeping beam, two ships
//   play     -> 2-play.jpg    beam mid-sweep, two ships lit, third drifting
//                             toward rocks with a red warning ring, HUD up
//   results  -> 3-results.jpg night-clear screen + upgrade shop
//   defeat   -> 4-defeat.jpg  wreck on the rocks, beam dimmed, restart prompt
//   win      -> 4-defeat.jpg (win variant) same layout, victory text
//
// Geometry the scenes are laid out against (from nights.js / render.js —
// do not re-invent these numbers here): canvas 1280x720, lamp (the beam's
// origin) at (118,168), lighthouse tower base at (118,408), harbour mouth at
// (1196,596) on the RIGHT edge, sea band y 240..700. Ships sail down-right
// from the horizon (y 250) to the harbour. Rocks sit SOUTH of the sailing
// diagonal (nights.js ROCKS_n — never render.js's fallback spots, two of
// which sit on the sailing line). Beam angles are radians from the lamp,
// 0 = due east, positive = clockwise (canvas y-down). A ship only reads as
// "caught in the beam" when it is inside the drawn cone: within beam.reach
// of the lamp AND within beam.width/2 of the beam angle. The play scene's
// two lit ships are placed to satisfy exactly that (checked against
// render.js drawBeam AND beam.js isInBeam).
//
// Beam stats follow upgrades.js exactly: base width 0.16 / reach 1150 /
// slew 1.6; Wider Beam +0.05, Brighter Light +90 per level. Night-1 scenes
// use base stats; night-3+ scenes assume the keeper bought Wider Beam x1
// and Brighter Light x1 (width 0.21, reach 1240); the win scene assumes x2
// each (width 0.26, reach 1330). state.upgrades records those levels.
//
// Integration (main.js — B1/finisher, read this):
//   import { getShotName, setupShot, markShotReady } from "./shots.js";
//   const shot = getShotName();                 // null in normal play
//   if (shot) setupShot(state, shot);           // BEFORE the first render
//   ... render one frame ...
//   if (shot) markShotReady();                  // AFTER the first render
//   // While a ?shot= scene is active the sim must NOT be stepped: the scene
//   // is a frozen still (fixed state.time), not live play. Skipping the
//   // update() call while a shot is active is REQUIRED, not optional —
//   // updateBeam() recomputes beam.on from the (unheld) mouse every step,
//   // so a stepped play scene renders with the beam OFF within one frame.
//   // One-liner alternative: installShotMode(state, (s) => draw(ctx, s))
//   // does setup + one draw + ready-flag in one call; returns the shot
//   // name or null. Either way the main loop must stay frozen afterwards.
//   // NOTE: main.js currently never sets __shotReady on the success path
//   // (only in its import-catch). The auto-arm at the bottom of this file
//   // covers that: once window.__game.shot is set it waits one frame for
//   // the draw and then sets the flag. The finisher may replace it with an
//   // explicit markShotReady() in main.js; setting the flag twice is safe.
//
// This module works on any plain state object with the design-spec shape
// (see buildShotState below), so it can be verified against a stub before
// B1/B2 land. Extra fields it sets are all documented where they are set;
// render.js reads them when present and ignores them when absent.

import { nightDef } from "./nights.js";

// ---------------------------------------------------------------------------
// Seeded RNG (mulberry32 — small, deterministic, no Math.random anywhere)
// ---------------------------------------------------------------------------

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Per-scene default seeds. A ?seed= value overrides the default for that run.
export const SHOT_SEEDS = {
  title: 101,
  play: 202,
  results: 303,
  defeat: 404,
  win: 505,
};

// Accepts "title" | "1-title" | "title.jpg" | "2-play" ... A typo is NOT
// silently remapped: an unknown name returns null and setupShot throws,
// so a bad shot name fails loudly instead of screenshotting the wrong scene.
const SHOT_ALIASES = {
  title: "title",
  "1-title": "title",
  "1-title.jpg": "title",
  play: "play",
  "2-play": "play",
  "2-play.jpg": "play",
  results: "results",
  "3-results": "results",
  "3-results.jpg": "results",
  defeat: "defeat",
  "4-defeat": "defeat",
  "4-defeat.jpg": "defeat",
  win: "win",
  victory: "win",
  "4-win": "win",
};

export function normalizeShotName(raw) {
  if (raw == null) return null;
  const key = String(raw).trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(SHOT_ALIASES, key)
    ? SHOT_ALIASES[key]
    : null;
}

// Read ?shot= (and ?seed=) from the current URL. Safe to call in Node (no
// window/location): returns null there.
export function getShotName(search) {
  const qs =
    typeof search === "string"
      ? search
      : typeof window !== "undefined" && window.location
        ? window.location.search
        : "";
  if (!qs) return null;
  return normalizeShotName(new URLSearchParams(qs).get("shot"));
}

export function getShotSeed(search) {
  const qs =
    typeof search === "string"
      ? search
      : typeof window !== "undefined" && window.location
        ? window.location.search
        : "";
  if (!qs) return null;
  const raw = new URLSearchParams(qs).get("seed");
  if (raw == null || raw === "") return null;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : null;
}

export function isShotMode(search) {
  return getShotName(search) !== null;
}

// The capture contract: set only after the scene frame has been drawn.
export function markShotReady() {
  if (typeof window !== "undefined") window.__shotReady = true;
}

// ---------------------------------------------------------------------------
// State construction
// ---------------------------------------------------------------------------

// Canvas geometry the scenes are laid out against (design spec: 1280x720;
// lamp / lighthouse / harbour copied from render.js / nights.js).
export const CANVAS_W = 1280;
export const CANVAS_H = 720;
export const LAMP = { x: 118, y: 168 }; // beam origin (render.js)
export const LIGHTHOUSE = { x: 118, y: 408 }; // tower base (render.js)
export const HARBOUR = { x: 1196, y: 596 }; // harbour mouth, RIGHT edge (nights.js)

// A fresh state object with the exact design-spec shape, usable when sim.js
// has not produced one yet (stub verification, tests). B1's createGame()
// produces the real one in the integrated game; setupShot() works on either.
export function buildShotState() {
  return {
    screen: "title",
    night: 1,
    nightDef: null,
    oil: 100,
    maxOil: 100,
    score: 0,
    best: 0,
    ships: [],
    beam: { angle: 0.54, width: 0.16, reach: 1150, slewSpeed: 1.6, on: true, flicker: 1 },
    foghorns: 2,
    wrecksThisNight: 0,
    savedThisNight: 0,
    upgrades: { beamWidth: 0, slew: 0, reach: 0, foghorns: 0, harbourLight: 0, bank: 0 },
    particles: [],
    events: [],
    time: 0,
    nightTime: 0,
    muted: false,
    // Shot-scene extras (render.js reads them when present):
    //   weather: "clear" | "rain" | "storm" (informational; the real driver
    //     of storm behaviour is nightDef.storm, set from nights.js below)
    //   fogDensity: 0..1 (render.js drawFog; null = its night default)
    //   rocks: [{x, y, r}] (render.js drawRocks; also ships.js wreck checks)
    //   shot / seed: which deterministic scene this state is
    weather: "clear",
    fogDensity: 0.4,
    rocks: [],
    results: null,
    shot: null,
    seed: 0,
  };
}

function ship(id, type, x, y, angle, state, lit, extra) {
  // Speeds copied from ships.js SHIP_TYPES (fishing 26, merchant 36,
  // mail 48, ghost 32). Angles are bearings: sailing ships head for the
  // harbour, drifting ships swing toward the nearest rock. The sim-only
  // fields (spawnIn, hornTimer, exposures, wasLit, rockWarn) are set to
  // their settled values so that even one accidental update() step can
  // never NaN or resurrect a staged ship.
  const speeds = { fishing: 26, merchant: 36, mail: 48, ghost: 32 };
  return Object.assign(
    {
      id,
      type,
      x,
      y,
      angle,
      speed: speeds[type] || 30,
      state, // 'sailing' | 'drifting' | 'saved' | 'wrecked'
      lit: !!lit,
      warning: false, // advisory copy of the danger beat; render.js draws
      // the red warning ring from state === 'drifting' itself
      spawnIn: 0,
      hornTimer: 0,
      exposures: 0,
      wasLit: false,
      rockWarn: false,
    },
    extra || {},
  );
}

// Bearing from (x, y) toward the harbour mouth — a sailing ship's heading.
function bearingToHarbour(x, y) {
  return Math.atan2(HARBOUR.y - y, HARBOUR.x - x);
}

// Deterministic rain streaks (+ one lightning bolt for storm scenes).
// Positions come only from the seeded RNG, so the same seed always draws
// the same sky. Every particle carries life/maxLife/vx/vy so sim.js
// update() — which ages particles — can never turn one into NaN, even if
// a frame is stepped before the finisher's shot-mode freeze lands.
// Fog itself is NOT a particle: render.js drawFog paints it from
// state.fogDensity + state.time.
function makeParticles(rng, weather) {
  const out = [];
  if (weather === "rain" || weather === "storm") {
    for (let i = 0; i < 90; i++) {
      out.push({
        kind: "rain",
        x: Math.floor(rng() * CANVAS_W),
        y: Math.floor(rng() * CANVAS_H),
        life: 3600,
        maxLife: 3600,
        vx: 0,
        vy: 0,
      });
    }
  }
  if (weather === "storm") {
    out.push({
      kind: "lightning",
      x: 900,
      y: 60,
      life: 1,
      maxLife: 1,
      vx: 0,
      vy: 0,
      pts: [
        [900, 60],
        [880, 140],
        [910, 220],
        [885, 300],
      ],
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Scene setup — deterministic, fixed sim time, no wall clock
// ---------------------------------------------------------------------------

// setupShot(state, shot, seedOverride) -> state (mutated in place, returned).
// Every number below is a literal or derived from nights.js: nothing reads
// Date.now, performance.now, Math.random, or localStorage, so the same
// (shot, seed) always produces the same state byte-for-byte. localStorage
// best is NOT read here on purpose — the scene sets its own best so a
// screenshot run is identical on any machine.
export function setupShot(state, shotName, seedOverride) {
  const shot = normalizeShotName(shotName);
  if (!shot) {
    throw new Error(
      "setupShot: unknown shot '" + shotName + "' (want title/play/results/defeat/win)",
    );
  }
  const seed =
    seedOverride != null
      ? seedOverride
      : SHOT_SEEDS[shot];
  const rng = mulberry32(seed);

  // Reset the mutable scene fields; anything a scene does not set below
  // keeps its (already deterministic) default from buildShotState/createGame.
  state.shot = shot;
  state.seed = seed;
  state.results = null;
  state.particles = [];
  state.ships = [];
  state.rocks = [];
  if (Array.isArray(state.events)) state.events.length = 0;
  state.upgrades = { beamWidth: 0, slew: 0, reach: 0, foghorns: 0, harbourLight: 0, bank: 0 };

  if (shot === "title") {
    // 1-title.jpg (cover). Night coast, beam sweeping, two ships with
    // lanterns, title + best + controls (drawn by render.js from this state).
    // Night 1, base beam (width 0.16, reach 1150). Both ships sit ON the
    // beam angle 0.54 (dist 499 and 800 from the lamp, angle diff <= 0.001
    // < half-width 0.08), so both read as caught in the light — verified
    // numerically against beam.js isInBeam, not just by eye.
    const def = nightDef(1);
    state.screen = "title";
    state.night = 1;
    state.nightDef = def;
    state.oil = 100;
    state.maxOil = 100;
    state.score = 0;
    state.best = 1250;
    state.foghorns = 2;
    state.wrecksThisNight = 0;
    state.savedThisNight = 0;
    state.time = 8.0; // fixed sim time: beam caught mid-sweep
    state.nightTime = 8.0;
    state.weather = "clear";
    state.fogDensity = 0.4; // staged heavier than night-1 def (0.15): cover look
    state.beam = { angle: 0.54, width: 0.16, reach: 1150, slewSpeed: 1.6, on: true, flicker: 1 };
    state.ships = [
      ship(1, "fishing", 546, 425, bearingToHarbour(546, 425), "sailing", true),
      ship(2, "merchant", 804, 579, bearingToHarbour(804, 579), "sailing", true),
    ];
    state.rocks = def.rocks.slice();
    state.particles = makeParticles(rng, "clear");
    return state;
  }

  if (shot === "play") {
    // 2-play.jpg. Beam mid-sweep catching two ships; a third (mail packet)
    // drifts toward the rocks with a red warning ring; fog bank + rain; HUD
    // top bar visible (render.js draws it from these exact numbers).
    // Beam stats assume Wider Beam x1 + Brighter Light x1 (width 0.21,
    // reach 1240 = 1150 + 90): both lit ships are inside the cone —
    // fishing boat dist 497 / angle 0.556, merchantman dist 602 / angle
    // 0.584, beam 0.57 ± 0.105 (diff 0.014 each). The drifting mail packet
    // sits 103 px off night-3 rock (1010,690,r48) — 55 px clear of its edge:
    // close enough to read as doomed, far enough not to touch it. Its angle
    // from the lamp (0.430) is 0.140 off the beam, so it is provably unlit.
    // HUD numbers follow the design brief's staging (5 saved · 1 lost).
    const def = nightDef(3);
    state.screen = "playing";
    state.night = 3;
    state.nightDef = def;
    state.oil = 62;
    state.maxOil = 100;
    state.score = 1840;
    state.best = 1250;
    state.foghorns = 2;
    state.wrecksThisNight = 1;
    state.savedThisNight = 5;
    state.time = 47.2; // fixed sim time: mid-night, beam mid-sweep
    state.nightTime = 47.2;
    state.weather = "rain"; // staging per the design brief (night 3 is not a storm night)
    state.fogDensity = def.fog; // 0.4
    state.beam = { angle: 0.57, width: 0.21, reach: 1240, slewSpeed: 1.6, on: true, flicker: 1 };
    state.upgrades = { beamWidth: 1, slew: 0, reach: 1, foghorns: 0, harbourLight: 0, bank: 0 };
    state.ships = [
      ship(1, "fishing", 540, 430, bearingToHarbour(540, 430), "sailing", true),
      ship(2, "merchant", 620, 500, bearingToHarbour(620, 500), "sailing", true),
      // Drifting, unlit, sliding toward the rocks: the shot's danger beat.
      // render.js draws the pulsing red ring from state === 'drifting'.
      ship(3, "mail", 1060, 600, -2.26, "drifting", false, { warning: true }),
    ];
    state.rocks = def.rocks.slice();
    state.particles = makeParticles(rng, "rain");
    return state;
  }

  if (shot === "results") {
    // 3-results.jpg. Night-clear screen + upgrade shop (render.js draws the
    // panel from state.results — the sim's own endNight shape — with a
    // fallback that recomputes the same numbers). Night 3: 6 ships, 5 home
    // + 1 lost; oilLeft 97 is the tank the keeper carries into the shop.
    // The two saved ships are moored at the harbour mouth (1196,596):
    // 78 and 31 px away, inside the 90 px harbour radius. The one lost
    // ship lies wrecked ON night-3 rock (1010,690,r48), just below-right of
    // the results panel (panel spans x 300-980, y 96-624).
    const def = nightDef(3);
    state.screen = "nightClear";
    state.night = 3;
    state.nightDef = def;
    state.oil = 97;
    state.maxOil = 100;
    state.score = 2470;
    state.best = 2470;
    state.foghorns = 2;
    state.wrecksThisNight = 1;
    state.savedThisNight = 5;
    state.time = 90.0; // fixed sim time: night over, frozen on the results
    state.nightTime = 90.0;
    state.weather = "clear";
    state.fogDensity = 0.35;
    state.beam = { angle: 0.35, width: 0.21, reach: 1240, slewSpeed: 1.6, on: true, flicker: 1 };
    state.upgrades = { beamWidth: 1, slew: 0, reach: 1, foghorns: 0, harbourLight: 0, bank: 0 };
    state.results = {
      night: 3,
      name: "Cross-Current",
      saved: 5,
      lost: 1,
      total: 6,
      oilLeft: 97,
      oilBanked: 97,
      noWreckBonus: 0,
      nightScore: 1597, // 5 x 100 x 3 + 97
      totalScore: 2470,
      campaignOver: false,
      victory: false,
    };
    state.ships = [
      ship(1, "fishing", 1120, 580, Math.PI, "saved", true),
      ship(2, "merchant", 1165, 600, Math.PI, "saved", true),
      // The one ship lost this night, beached on night-3 rock (1010,690).
      ship(3, "mail", 1010, 690, 0.5, "wrecked", false),
    ];
    state.rocks = def.rocks.slice();
    state.particles = makeParticles(rng, "clear");
    return state;
  }

  if (shot === "defeat") {
    // 4-defeat.jpg. Wreck on the rocks, beam dimmed (off), restart prompt
    // (render.js draws it from screen === 'gameOver'). Night 5
    // ('Storm Warning', 8 ships): 4 home, 3 lost, 1 still drifting — the
    // campaign ends on the third wreck. Both wrecks sit ON real night-5
    // rocks: mail packet on (950,680,r42), fishing boat on (1100,690,r36).
    // The saved ship is moored at the harbour mouth (56 px away); the
    // drifting merchant is 85 px off rock (1010,690,r48), 37 px clear of
    // its edge — still in danger, not yet wrecked.
    const def = nightDef(5);
    state.screen = "gameOver";
    state.night = 5;
    state.nightDef = def;
    state.oil = 18;
    state.maxOil = 100;
    state.score = 3120;
    state.best = 3850;
    state.foghorns = 0;
    state.wrecksThisNight = 3;
    state.savedThisNight = 4;
    state.time = 132.0; // fixed sim time: the night the light went out
    state.nightTime = 132.0;
    state.weather = "storm"; // night 5 is a storm night (def.storm)
    state.fogDensity = def.fog; // 0.55
    state.beam = { angle: 0.3, width: 0.21, reach: 1240, slewSpeed: 1.6, on: false, flicker: 1 };
    state.upgrades = { beamWidth: 1, slew: 0, reach: 1, foghorns: 0, harbourLight: 0, bank: 0 };
    state.results = {
      night: 5,
      name: "Storm Warning",
      saved: 4,
      lost: 3,
      total: 8,
      oilLeft: 18,
      oilBanked: 18,
      noWreckBonus: 0,
      nightScore: 2018, // 4 x 100 x 5 + 18
      totalScore: 3120,
      campaignOver: true,
      victory: false,
    };
    state.ships = [
      ship(1, "mail", 950, 680, 0.5, "wrecked", false),
      ship(2, "fishing", 1100, 690, 0.5, "wrecked", false),
      ship(3, "merchant", 980, 610, -2.26, "drifting", false, { warning: true }),
      ship(4, "fishing", 1140, 590, Math.PI, "saved", true),
    ];
    state.rocks = def.rocks.slice();
    state.particles = makeParticles(rng, "storm");
    return state;
  }

  // shot === "win": same layout as defeat, victory text instead.
  // Night 7 ('The Last Night', 10 ships, storm): 7 home, 0 lost, 3 saved
  // ships moored at the harbour mouth (78/36/67 px away, inside the 90 px
  // harbour radius). Beam x2 upgrades (width 0.26, reach 1330 = 1150 + 180).
  const def = nightDef(7);
  state.screen = "victory";
  state.night = 7;
  state.nightDef = def;
  state.oil = 54;
  state.maxOil = 100;
  state.score = 6840;
  state.best = 6840;
  state.foghorns = 3;
  state.wrecksThisNight = 0;
  state.savedThisNight = 7;
  state.time = 210.0; // fixed sim time: dawn after the seventh night
  state.nightTime = 210.0;
  state.weather = "storm"; // night 7 is a storm night (def.storm)
  state.fogDensity = def.fog; // 0.7
  state.beam = { angle: 0.5, width: 0.26, reach: 1330, slewSpeed: 1.6, on: true, flicker: 1 };
  state.upgrades = { beamWidth: 2, slew: 0, reach: 2, foghorns: 0, harbourLight: 0, bank: 0 };
  state.results = {
    night: 7,
    name: "The Last Night",
    saved: 7,
    lost: 0,
    total: 10,
    oilLeft: 54,
    oilBanked: 54,
    noWreckBonus: 250,
    nightScore: 5204, // 7 x 100 x 7 + 54 + 250
    totalScore: 6840,
    campaignOver: false,
    victory: true,
  };
  state.ships = [
    ship(1, "fishing", 1120, 580, Math.PI, "saved", true),
    ship(2, "merchant", 1160, 600, Math.PI, "saved", true),
    ship(3, "mail", 1140, 560, Math.PI, "saved", true),
  ];
  state.rocks = def.rocks.slice();
  state.particles = makeParticles(rng, "rain");
  return state;
}

// One-liner for main.js: if ?shot= is present, set the scene up, draw one
// frame with the game's own renderer, then signal readiness. Returns the
// shot name, or null when this is a normal (non-shot) load. The caller must
// still freeze the sim while a shot is active — installShotMode only draws
// the single frozen frame; the main loop must not step past it.
export function installShotMode(state, draw) {
  const shot = getShotName();
  if (!shot) return null;
  const seed = getShotSeed();
  setupShot(state, shot, seed == null ? undefined : seed);
  if (typeof draw === "function") draw(state);
  markShotReady();
  return shot;
}

// ---------------------------------------------------------------------------
// Auto-arm: cover main.js's missing success-path __shotReady.
//
// main.js dynamic-imports this module on ?shot= pages and calls setupShot,
// but only sets window.__shotReady in its import-catch — never on success.
// So the R3 pipeline (which waits for the flag) would time out on the real
// game. This poll fixes that from inside shots.js, where the contract
// lives: once the scene state has landed on window.__game (main.js exposes
// the live state there), wait one animation frame — the main loop draws
// before this callback runs, because it registered its frame callback
// first — then set the flag. Bounded (600 frames, ~10 s): if the scene
// never lands, the poll stops and the pipeline timeout reports the real
// failure instead of an eternal rAF loop. If the finisher adds an explicit
// markShotReady() to main.js, setting the flag twice is harmless.
// In the stub harness / Node there is no window.__game, so this never fires
// there — the harness sets the flag itself after its own draw.
if (typeof window !== "undefined" && typeof requestAnimationFrame === "function") {
  const armedShot = getShotName();
  if (armedShot) {
    let framesLeft = 600;
    const tick = () => {
      if (framesLeft-- <= 0) return;
      const game = window.__game;
      if (game && game.shot === armedShot) {
        requestAnimationFrame(() => markShotReady());
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
}
