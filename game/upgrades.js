// LANTERNKEEP — upgrades.js
// The upgrade shop, open between nights. Oil is the currency: whatever oil
// is left when a night ends stays in the lamp-room and can be spent here
// before the next night's oil delivery refills the tank to maxOil.
// Prices are FLAT (no per-level scaling) and match the prices render.js
// paints in the shop — the player must never be charged more than the
// number on the screen. All six upgrades are drawn by the shop (keys 1-6).

export const UPGRADES = [
  {
    id: 'beamWidth',
    name: 'Wider Beam',
    desc: 'A broader lens: the beam covers more sea at once.',
    baseCost: 30,
    max: 3,
    apply: (state) => { state.beam.width += 0.05; },
  },
  {
    id: 'slew',
    name: 'Faster Slew',
    desc: 'Oiled gears: the lamp turns to your aim much faster.',
    baseCost: 25,
    max: 3,
    apply: (state) => { state.beam.slewSpeed += 0.5; },
  },
  {
    id: 'reach',
    name: 'Brighter Light',
    desc: 'A fiercer flame: the beam reaches further into the dark.',
    baseCost: 40,
    max: 3,
    apply: (state) => { state.beam.reach += 90; },
  },
  {
    id: 'foghorns',
    name: 'Foghorn +1',
    desc: 'One more foghorn charge every night.',
    baseCost: 20,
    max: 3,
    apply: (state) => { state.upgrades.foghorns += 1; },
  },
  {
    id: 'harbourLight',
    name: 'Second Harbour Light',
    desc: 'A small lamp at the harbour mouth guides ships home on its own.',
    baseCost: 60,
    max: 1,
    apply: (state) => { state.upgrades.harbourLight += 1; },
  },
  {
    id: 'bank',
    name: 'Bank Oil',
    desc: 'A bigger tank: each night starts with 25 more oil.',
    baseCost: 45,
    max: 3,
    apply: (state) => { state.maxOil += 25; state.oil += 25; },
  },
];

// Flat price: what render.js paints is what the keeper pays.
export function upgradeCost(def) {
  return def.baseCost;
}

export function findUpgrade(id) {
  for (let i = 0; i < UPGRADES.length; i++) {
    if (UPGRADES[i].id === id) return UPGRADES[i];
  }
  return null;
}

// Spend leftover oil on an upgrade. Returns true on success, false when the
// upgrade is maxed out, unknown, or the keeper cannot afford it.
export function buyUpgrade(state, id) {
  const def = findUpgrade(id);
  if (!def) return false;
  const level = state.upgrades[id] || 0;
  if (level >= def.max) return false;
  const cost = upgradeCost(def);
  if (state.oil < cost) return false;
  state.oil -= cost;
  def.apply(state);
  state.upgrades[id] = level + 1;
  state.events.push({ type: 'buy', id });
  return true;
}
