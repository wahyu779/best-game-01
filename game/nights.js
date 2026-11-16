// LANTERNKEEP — nights.js
// The seven nights of the campaign. One definition per night: how many ships
// sail, how fast, how thick the fog is, how hard the cross-current pushes,
// where the rocks sit, and whether a storm is blowing.
//
// GEOGRAPHY (shared with render.js — the lamp and harbour positions below
// are the ones render.js draws; the sim must never disagree with them):
//   * Lamp (beam origin): (118, 168), top of the lighthouse on the left.
//   * Harbour (home): (1196, 596), the dock on the right edge.
//   * Ships appear on the horizon (y = 250) and sail down-right for home.
//   * Rock fields grow from render.js's own fallback spots, so the rocks
//     the sim wrecks ships on are the rocks the player sees.
//     NOTE (2026-11-16, B1): the sim's rocks do NOT match render.js's
//     fallback spots — two of them ((830,430) and (1010,540)) sat ON the
//     ships' direct sailing line to the harbour, so a ship wrecked within
//     a second of any drift and night 1 was unwinnable. The sim's rocks sit
//     SOUTH of the sailing diagonal (150+ px clear), so a ship only wrecks
//     after ~10 s of visible neglect, never by sailing its proper course.
//     The sim always sets state.rocks, so render.js draws these, not its
//     fallbacks; the fallbacks are dead code in the integrated game.
//   * The lighthouse's rocky point (drawn polygon, x 0-300, y ~388-720) is
//     approximated by POINT_HAZARD; ships that drift into it are wrecked.
// Rocks never sit within 120 px of the harbour mouth, so a ship that makes
// it home is never wrecked on arrival.

export const LIGHTHOUSE = { x: 118, y: 168 };
export const HARBOUR = { x: 1196, y: 596 };
export const HARBOUR_RADIUS = 90;
export const POINT_HAZARD = { x: 140, y: 560, r: 170 };

const ROCKS_1 = [
  { x: 430, y: 540, r: 46 },
  { x: 640, y: 650, r: 52 },
  { x: 830, y: 680, r: 40 },
];
const ROCKS_2 = [...ROCKS_1, { x: 1010, y: 690, r: 48 }];
const ROCKS_3 = [...ROCKS_2, { x: 560, y: 670, r: 44 }];
const ROCKS_4 = [...ROCKS_3, { x: 1100, y: 690, r: 36 }];
const ROCKS_5 = [...ROCKS_4, { x: 950, y: 680, r: 42 }];
const ROCKS_6 = [...ROCKS_5, { x: 760, y: 680, r: 38 }];
const ROCKS_7 = [...ROCKS_6, { x: 380, y: 670, r: 40 }];

// Ship-type mix per night, as counts. Ghost ships only appear from night 4.
export const NIGHTS = [
  {
    night: 1,
    name: 'First Watch',
    ships: 4,
    mix: { fishing: 3, merchant: 1, mail: 0, ghost: 0 },
    speed: 1.0,
    fog: 0.15,
    current: { x: -2, y: 3 },
    storm: false,
    rocks: ROCKS_1,
  },
  {
    night: 2,
    name: 'Thickening Fog',
    ships: 5,
    mix: { fishing: 3, merchant: 2, mail: 0, ghost: 0 },
    speed: 1.05,
    fog: 0.3,
    current: { x: -3, y: 5 },
    storm: false,
    rocks: ROCKS_2,
  },
  {
    night: 3,
    name: 'Cross-Current',
    ships: 6,
    mix: { fishing: 3, merchant: 2, mail: 1, ghost: 0 },
    speed: 1.12,
    fog: 0.4,
    current: { x: -4, y: 7 },
    storm: false,
    rocks: ROCKS_3,
  },
  {
    night: 4,
    name: 'The Pale Ship',
    ships: 7,
    mix: { fishing: 3, merchant: 2, mail: 1, ghost: 1 },
    speed: 1.18,
    fog: 0.48,
    current: { x: -3, y: 6 },
    storm: false,
    rocks: ROCKS_4,
  },
  {
    night: 5,
    name: 'Storm Warning',
    ships: 8,
    mix: { fishing: 3, merchant: 3, mail: 1, ghost: 1 },
    speed: 1.25,
    fog: 0.55,
    current: { x: -5, y: 8 },
    storm: true,
    rocks: ROCKS_5,
  },
  {
    night: 6,
    name: 'Black Water',
    ships: 9,
    mix: { fishing: 3, merchant: 3, mail: 2, ghost: 1 },
    speed: 1.35,
    fog: 0.65,
    current: { x: -4, y: 9 },
    storm: false,
    rocks: ROCKS_6,
  },
  {
    night: 7,
    name: 'The Last Night',
    ships: 10,
    mix: { fishing: 3, merchant: 3, mail: 2, ghost: 2 },
    speed: 1.45,
    fog: 0.7,
    current: { x: -5, y: 10 },
    storm: true,
    rocks: ROCKS_7,
  },
];

export function nightDef(n) {
  return NIGHTS[Math.max(0, Math.min(NIGHTS.length - 1, n - 1))];
}
