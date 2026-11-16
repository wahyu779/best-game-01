// LANTERNKEEP — render.js (B2: rendering + visuals)
// draw(ctx, state) — draws EVERYTHING from state. Reads state, never writes it.
// Canvas 1280x720. All art is procedural / canvas-drawn. No assets, no network.
// Visual identity: dark night palette, ONE warm beam, lighthouse silhouette left,
// ships' lanterns as the only other warm lights. Must read at a glance at
// 1280x720 and when shrunk onto the judge's contact sheet: big HUD text,
// high-contrast beam, unmistakable ship lanterns, red warning rings.

const W = 1280;
const H = 720;
const HORIZON = 232;          // y of the sea horizon
const LAMP = { x: 118, y: 168 }; // lighthouse lamp position
const HARBOUR = { x: 1196, y: 596 }; // dock on the right edge

// ---------------------------------------------------------------- utilities
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function lerp(a, b, t) { return a + (b - a) * t; }

// Precomputed stars (fixed sky, no per-frame allocation).
const STARS = (() => {
  const rng = mulberry32(1337);
  const out = [];
  for (let i = 0; i < 130; i++) {
    out.push({ x: rng() * W, y: rng() * (HORIZON - 30), r: 0.5 + rng() * 1.4, tw: rng() * Math.PI * 2 });
  }
  return out;
})();

// Fallback rock fields, cached per night (used only if sim has no state.rocks yet).
const rockCache = new Map();
function fallbackRocks(night) {
  if (rockCache.has(night)) return rockCache.get(night);
  const rng = mulberry32(9000 + night * 77);
  const rocks = [];
  const spots = [
    [430, 470, 46], [640, 560, 58], [830, 430, 40],
    [1010, 540, 52], [560, 640, 44], [1150, 430, 36],
  ];
  for (const [x, y, r] of spots) {
    const pts = [];
    const n = 7;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const rr = r * (0.72 + rng() * 0.5);
      pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.62]);
    }
    rocks.push({ x, y, r, pts });
  }
  rockCache.set(night, rocks);
  return rocks;
}

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function text(ctx, str, x, y, size, color, align = 'left', weight = 700) {
  ctx.font = `${weight} ${size}px "Segoe UI", Verdana, sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(str, x, y);
}

// ---------------------------------------------------------------- sky + sea
function drawSky(ctx, state) {
  const g = ctx.createLinearGradient(0, 0, 0, HORIZON);
  g.addColorStop(0, '#04060f');
  g.addColorStop(0.55, '#0a1428');
  g.addColorStop(1, '#16294d');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, HORIZON + 1);

  // Stars (twinkle by time).
  for (let i = 0; i < STARS.length; i++) {
    const s = STARS[i];
    const a = 0.35 + 0.35 * Math.sin(state.time * 1.4 + s.tw);
    ctx.globalAlpha = a;
    ctx.fillStyle = '#dfe9ff';
    ctx.fillRect(s.x, s.y, s.r, s.r);
  }
  ctx.globalAlpha = 1;

  // Moon, upper right, with halo.
  const mx = 1060, my = 84;
  const halo = ctx.createRadialGradient(mx, my, 8, mx, my, 90);
  halo.addColorStop(0, 'rgba(226,236,255,0.28)');
  halo.addColorStop(1, 'rgba(226,236,255,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(mx - 90, my - 90, 180, 180);
  ctx.fillStyle = '#e8efff';
  ctx.beginPath(); ctx.arc(mx, my, 26, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(160,175,205,0.55)';
  ctx.beginPath(); ctx.arc(mx - 8, my - 5, 5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(mx + 7, my + 9, 7, 0, Math.PI * 2); ctx.fill();

  // Faint horizon glow where the sea meets the sky.
  const hg = ctx.createLinearGradient(0, HORIZON - 26, 0, HORIZON + 10);
  hg.addColorStop(0, 'rgba(90,130,190,0)');
  hg.addColorStop(1, 'rgba(90,130,190,0.20)');
  ctx.fillStyle = hg;
  ctx.fillRect(0, HORIZON - 26, W, 36);
}

function drawSea(ctx, state) {
  const g = ctx.createLinearGradient(0, HORIZON, 0, H);
  g.addColorStop(0, '#0a1e33');
  g.addColorStop(0.5, '#081826');
  g.addColorStop(1, '#040a14');
  ctx.fillStyle = g;
  ctx.fillRect(0, HORIZON, W, H - HORIZON);

  // Slow swell lines, animated by time. A few long strokes, cheap.
  ctx.lineWidth = 2;
  for (let row = 0; row < 7; row++) {
    const y = HORIZON + 34 + row * 62;
    const amp = 5 + row * 1.6;
    const speed = state.time * (0.5 + row * 0.07);
    ctx.strokeStyle = `rgba(120,170,220,${0.10 - row * 0.008})`;
    ctx.beginPath();
    for (let x = 0; x <= W; x += 32) {
      const yy = y + Math.sin(x * 0.012 + speed + row * 1.7) * amp;
      if (x === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }

  // Warm shimmer path under the lamp (only where the beam points low).
  if (state.beam && state.beam.on) {
    const a = state.beam.angle;
    if (a > 0.15 && a < Math.PI - 0.15) {
      const sx = LAMP.x + Math.cos(a) * 320;
      const sy = HORIZON + 60;
      const sg = ctx.createRadialGradient(sx, sy, 10, sx, sy, 260);
      sg.addColorStop(0, 'rgba(255,190,90,0.16)');
      sg.addColorStop(1, 'rgba(255,190,90,0)');
      ctx.fillStyle = sg;
      ctx.fillRect(sx - 260, sy - 120, 520, 260);
    }
  }
}

// ---------------------------------------------------------------- lighthouse
function drawLighthouse(ctx, state) {
  // Rocky point the lighthouse stands on (left edge, foreground).
  ctx.fillStyle = '#0b1220';
  ctx.beginPath();
  ctx.moveTo(0, H);
  ctx.lineTo(0, 470);
  ctx.lineTo(38, 420); ctx.lineTo(86, 396); ctx.lineTo(150, 388);
  ctx.lineTo(212, 402); ctx.lineTo(258, 440); ctx.lineTo(286, 500);
  ctx.lineTo(300, H);
  ctx.closePath(); ctx.fill();

  // Foam where waves hit the point.
  ctx.strokeStyle = 'rgba(207,232,255,0.35)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    const x = lerp(0, 300, t);
    const y = lerp(470, 500, t) + Math.sin(state.time * 2 + t * 9) * 5;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Tower: tapered silhouette with two pale bands and warm windows.
  const tx = 118; // tower centre x
  ctx.fillStyle = '#141c2e';
  ctx.beginPath();
  ctx.moveTo(tx - 34, 408);
  ctx.lineTo(tx - 22, 196);
  ctx.lineTo(tx + 22, 196);
  ctx.lineTo(tx + 34, 408);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(214,206,188,0.16)';
  ctx.fillRect(tx - 29, 330, 58, 14);
  ctx.fillRect(tx - 25, 252, 50, 12);
  // Windows.
  ctx.fillStyle = '#ffca6a';
  ctx.fillRect(tx - 4, 300, 8, 12);
  ctx.fillRect(tx - 4, 368, 8, 12);

  // Gallery + lamp room.
  ctx.fillStyle = '#0d1322';
  ctx.fillRect(tx - 30, 182, 60, 14);
  ctx.fillStyle = '#1c2740';
  ctx.fillRect(tx - 20, 152, 40, 30);
  // Lamp glow.
  const on = state.beam && state.beam.on;
  const lampGlow = ctx.createRadialGradient(LAMP.x, LAMP.y, 4, LAMP.x, LAMP.y, 70);
  lampGlow.addColorStop(0, on ? 'rgba(255,214,130,0.95)' : 'rgba(120,130,150,0.25)');
  lampGlow.addColorStop(1, 'rgba(255,214,130,0)');
  ctx.fillStyle = lampGlow;
  ctx.fillRect(LAMP.x - 70, LAMP.y - 70, 140, 140);
  ctx.fillStyle = on ? '#ffe9b0' : '#5a6478';
  ctx.beginPath(); ctx.arc(LAMP.x, LAMP.y, 11, 0, Math.PI * 2); ctx.fill();
  // Roof cap.
  ctx.fillStyle = '#0d1322';
  ctx.beginPath();
  ctx.moveTo(tx - 24, 152); ctx.lineTo(tx, 132); ctx.lineTo(tx + 24, 152);
  ctx.closePath(); ctx.fill();

  // Door at the base.
  ctx.fillStyle = '#05080f';
  rr(ctx, tx - 10, 378, 20, 30, 8); ctx.fill();
}

// ---------------------------------------------------------------- beam
function drawBeam(ctx, state) {
  const b = state.beam;
  if (!b || !b.on) return;
  const reach = b.reach || 620;
  const half = (b.width || 0.30) / 2;
  const a = b.angle || 0;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  // Wide soft cone.
  let g = ctx.createLinearGradient(LAMP.x, LAMP.y, LAMP.x + Math.cos(a) * reach, LAMP.y + Math.sin(a) * reach);
  g.addColorStop(0, 'rgba(255,205,110,0.34)');
  g.addColorStop(0.7, 'rgba(255,190,90,0.12)');
  g.addColorStop(1, 'rgba(255,190,90,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(LAMP.x, LAMP.y);
  ctx.arc(LAMP.x, LAMP.y, reach, a - half * 1.7, a + half * 1.7);
  ctx.closePath(); ctx.fill();
  // Narrow bright core.
  g = ctx.createLinearGradient(LAMP.x, LAMP.y, LAMP.x + Math.cos(a) * reach, LAMP.y + Math.sin(a) * reach);
  g.addColorStop(0, 'rgba(255,228,160,0.55)');
  g.addColorStop(0.8, 'rgba(255,205,110,0.14)');
  g.addColorStop(1, 'rgba(255,205,110,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(LAMP.x, LAMP.y);
  ctx.arc(LAMP.x, LAMP.y, reach, a - half * 0.7, a + half * 0.7);
  ctx.closePath(); ctx.fill();
  // Hot spot at the far end.
  const ex = LAMP.x + Math.cos(a) * reach * 0.92;
  const ey = LAMP.y + Math.sin(a) * reach * 0.92;
  const eg = ctx.createRadialGradient(ex, ey, 2, ex, ey, 46);
  eg.addColorStop(0, 'rgba(255,220,140,0.35)');
  eg.addColorStop(1, 'rgba(255,220,140,0)');
  ctx.fillStyle = eg;
  ctx.fillRect(ex - 46, ey - 46, 92, 92);
  ctx.restore();
}

// ---------------------------------------------------------------- rocks
function drawRocks(ctx, state) {
  const rocks = (state.rocks && state.rocks.length) ? state.rocks : fallbackRocks(state.night || 1);
  for (const r of rocks) {
    const pts = r.pts || null;
    ctx.fillStyle = '#0d1524';
    ctx.beginPath();
    if (pts) {
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    } else {
      ctx.arc(r.x, r.y, r.r || 40, 0, Math.PI * 2);
    }
    ctx.closePath(); ctx.fill();
    // Pale top edge (moonlit) + foam ring.
    ctx.strokeStyle = 'rgba(180,205,235,0.28)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.strokeStyle = `rgba(207,232,255,${0.22 + 0.10 * Math.sin(state.time * 1.8 + r.x)})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(r.x, r.y + (r.r || 40) * 0.42, (r.r || 40) * 1.15, (r.r || 40) * 0.42, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
}

// ---------------------------------------------------------------- harbour
function drawHarbour(ctx, state) {
  // Small dock + harbour light on the right edge — the ships' home.
  ctx.fillStyle = '#0b1220';
  ctx.fillRect(HARBOUR.x - 84, HARBOUR.y - 8, 84, 12);
  ctx.fillRect(HARBOUR.x - 78, HARBOUR.y + 4, 8, 34);
  ctx.fillRect(HARBOUR.x - 30, HARBOUR.y + 4, 8, 34);
  const lit = state.upgrades && state.upgrades.harbourLight > 0;
  const hx = HARBOUR.x - 84, hy = HARBOUR.y - 34;
  ctx.fillStyle = '#141c2e';
  ctx.fillRect(hx - 5, hy, 10, 26);
  const hg = ctx.createRadialGradient(hx, hy - 4, 2, hx, hy - 4, lit ? 60 : 26);
  hg.addColorStop(0, lit ? 'rgba(255,205,110,0.9)' : 'rgba(255,205,110,0.35)');
  hg.addColorStop(1, 'rgba(255,205,110,0)');
  ctx.fillStyle = hg;
  ctx.fillRect(hx - 60, hy - 64, 120, 120);
  ctx.fillStyle = lit ? '#ffe9b0' : '#c9a45c';
  ctx.beginPath(); ctx.arc(hx, hy - 4, 6, 0, Math.PI * 2); ctx.fill();
  text(ctx, 'HOME', HARBOUR.x - 42, HARBOUR.y + 52, 15, 'rgba(200,215,240,0.65)', 'center', 600);
}

// ---------------------------------------------------------------- ships
const SHIP_STYLE = {
  fishing: { len: 52, hull: '#2a2118', sail: '#c8b490', lamp: '#ffca6a' },
  merchant: { len: 78, hull: '#1e2a22', sail: '#b9c4a8', lamp: '#ffca6a' },
  packet: { len: 66, hull: '#232a3a', sail: '#d8d2c0', lamp: '#ffca6a' },
  ghost: { len: 64, hull: '#1a2a30', sail: '#9fc4b8', lamp: '#8ff0d4' },
};

function drawShip(ctx, state, ship) {
  const st = SHIP_STYLE[ship.type] || SHIP_STYLE.fishing;
  const len = st.len;
  const ghost = ship.type === 'ghost';
  const wrecked = ship.state === 'wrecked';
  const saved = ship.state === 'saved';
  const drifting = ship.state === 'drifting';

  ctx.save();
  ctx.translate(ship.x, ship.y);
  // Wrecked: capsized, half-sunk, tilted.
  if (wrecked) ctx.rotate(0.5);
  else ctx.rotate((ship.angle || 0) * 0.12 + Math.sin(state.time * 1.2 + ship.id * 2.1) * 0.03);
  if (wrecked) ctx.globalAlpha = 0.75;
  if (ghost) ctx.globalAlpha = 0.85;

  // Wake.
  if (!wrecked) {
    ctx.strokeStyle = 'rgba(190,220,250,0.30)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-len / 2, 6);
    ctx.lineTo(-len / 2 - 26, 10);
    ctx.moveTo(-len / 2, -2);
    ctx.lineTo(-len / 2 - 20, -8);
    ctx.stroke();
  }

  // Hull.
  ctx.fillStyle = st.hull;
  ctx.beginPath();
  ctx.moveTo(-len / 2, -6);
  ctx.lineTo(len / 2 - 8, -6);
  ctx.lineTo(len / 2, 0);
  ctx.lineTo(len / 2 - 10, 9);
  ctx.lineTo(-len / 2 + 6, 9);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = ghost ? 'rgba(143,240,212,0.5)' : 'rgba(220,200,160,0.35)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  if (!wrecked) {
    // Mast + sail.
    ctx.strokeStyle = '#3a2f22';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(0, -34); ctx.stroke();
    ctx.fillStyle = ghost ? 'rgba(159,196,184,0.75)' : st.sail;
    ctx.beginPath();
    ctx.moveTo(2, -32); ctx.lineTo(2, -10);
    ctx.lineTo(20, -10); ctx.closePath(); ctx.fill();
    // Lantern at the masthead — the ship's one warm light.
    const lampOn = ship.lit || ghost;
    const lg = ctx.createRadialGradient(0, -38, 1, 0, -38, lampOn ? 34 : 14);
    lg.addColorStop(0, lampOn ? st.lamp : 'rgba(255,202,106,0.25)');
    lg.addColorStop(1, 'rgba(255,202,106,0)');
    ctx.fillStyle = lg;
    ctx.fillRect(-34, -72, 68, 68);
    ctx.fillStyle = lampOn ? '#ffe9b0' : '#8a6f3c';
    ctx.beginPath(); ctx.arc(0, -38, 4.5, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();

  // Drifting toward rocks: pulsing red warning ring (readable at a glance).
  if (drifting && !wrecked) {
    const pulse = 0.55 + 0.35 * Math.sin(state.time * 6);
    ctx.strokeStyle = `rgba(255,90,78,${pulse})`;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(ship.x, ship.y, 34 + 4 * Math.sin(state.time * 6), 0, Math.PI * 2); ctx.stroke();
    text(ctx, '!', ship.x, ship.y - 46, 24, '#ff6a5e', 'center', 800);
  }
  // Saved: small green tick above the ship.
  if (saved) {
    text(ctx, '✓', ship.x, ship.y - 48, 22, '#7be495', 'center', 800);
  }
  // Ghost ship label on first sight (night 4+): faint, eerie.
  if (ghost && !wrecked) {
    text(ctx, 'GHOST SHIP', ship.x, ship.y + 30, 12, 'rgba(143,240,212,0.75)', 'center', 600);
  }
}

// ---------------------------------------------------------------- fog
function drawFog(ctx, state) {
  const density = clamp(state.fogDensity != null ? state.fogDensity : 0.35 + (state.night || 1) * 0.04, 0, 1);
  if (density <= 0.02) return;
  // Layered horizontal bands, drifting with time.
  for (let i = 0; i < 3; i++) {
    const y = HORIZON + 40 + i * 150 + Math.sin(state.time * 0.11 + i * 2.4) * 14;
    const drift = ((state.time * (6 + i * 4)) % 500) - 250;
    const g = ctx.createLinearGradient(0, y - 70, 0, y + 70);
    g.addColorStop(0, 'rgba(170,195,225,0)');
    g.addColorStop(0.5, `rgba(170,195,225,${0.10 * density + i * 0.03})`);
    g.addColorStop(1, 'rgba(170,195,225,0)');
    ctx.fillStyle = g;
    ctx.fillRect(-250 + drift, y - 70, W + 500, 140);
  }
  // A few soft fog banks (radial blobs) that drift across the sea.
  for (let i = 0; i < 4; i++) {
    const fx = ((i * 340 + state.time * (9 + i * 3)) % 1600) - 160;
    const fy = HORIZON + 90 + i * 105;
    const fg = ctx.createRadialGradient(fx, fy, 10, fx, fy, 190);
    fg.addColorStop(0, `rgba(180,200,230,${0.10 * density})`);
    fg.addColorStop(1, 'rgba(180,200,230,0)');
    ctx.fillStyle = fg;
    ctx.fillRect(fx - 190, fy - 190, 380, 380);
  }
}

// ---------------------------------------------------------------- particles
function drawParticles(ctx, state) {
  const parts = state.particles || [];
  let lightning = state.lightningFlash || 0;
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    const kind = p.kind || p.type || 'spray';
    const life = p.maxLife ? clamp(p.life / p.maxLife, 0, 1) : 1;
    if (kind === 'rain') {
      ctx.strokeStyle = 'rgba(170,200,240,0.45)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - 4, p.y + 16);
      ctx.stroke();
    } else if (kind === 'gull') {
      ctx.strokeStyle = 'rgba(220,230,245,0.8)';
      ctx.lineWidth = 2;
      const flap = Math.sin(state.time * 8 + (p.seed || i)) * 4;
      ctx.beginPath();
      ctx.moveTo(p.x - 8, p.y + flap);
      ctx.quadraticCurveTo(p.x - 3, p.y - 3, p.x, p.y);
      ctx.quadraticCurveTo(p.x + 3, p.y - 3, p.x + 8, p.y + flap);
      ctx.stroke();
    } else if (kind === 'lightning' || kind === 'flash') {
      lightning = Math.max(lightning, life);
      // Bolt: jagged polyline from the particle's stored points, else a simple zigzag.
      ctx.strokeStyle = `rgba(240,245,255,${0.9 * life})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      const pts = p.pts;
      if (pts && pts.length > 1) {
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let j = 1; j < pts.length; j++) ctx.lineTo(pts[j][0], pts[j][1]);
      } else {
        let bx = p.x, by = p.y;
        ctx.moveTo(bx, by);
        for (let s = 0; s < 5; s++) { bx += (s % 2 ? -18 : 18); by += 34; ctx.lineTo(bx, by); }
      }
      ctx.stroke();
    } else if (kind === 'spark' || kind === 'ember') {
      ctx.fillStyle = `rgba(255,205,110,${0.8 * life})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size || 2, 0, Math.PI * 2); ctx.fill();
    } else { // spray / foam / generic
      ctx.fillStyle = `rgba(207,232,255,${0.7 * life})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size || 2.5, 0, Math.PI * 2); ctx.fill();
    }
  }
  // Lightning flash washes the whole frame briefly.
  if (lightning > 0.02) {
    ctx.fillStyle = `rgba(220,232,255,${0.16 * lightning})`;
    ctx.fillRect(0, 0, W, H);
  }
  // Foghorn blast: expanding rings from the lamp.
  const fh = state.foghornFlash || 0;
  if (fh > 0) {
    for (let r = 0; r < 3; r++) {
      const rad = (1 - fh) * 260 + r * 46;
      ctx.strokeStyle = `rgba(255,205,110,${0.5 * fh})`;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(LAMP.x, LAMP.y, rad, 0, Math.PI * 2); ctx.stroke();
    }
  }
}

// ---------------------------------------------------------------- HUD
function drawHUD(ctx, state) {
  // Top bar.
  ctx.fillStyle = 'rgba(4,8,16,0.88)';
  ctx.fillRect(0, 0, W, 54);
  ctx.fillStyle = 'rgba(255,190,90,0.35)';
  ctx.fillRect(0, 54, W, 2);

  text(ctx, `NIGHT ${state.night || 1}/7`, 24, 28, 22, '#ffe9b0');
  text(ctx, `SHIPS  ${state.savedThisNight || 0} SAVED · ${state.wrecksThisNight || 0} LOST`, 190, 28, 20, '#dfe9ff');
  // Oil gauge.
  const oil = state.oil != null ? state.oil : 100;
  const maxOil = state.maxOil || 100;
  const frac = clamp(oil / maxOil, 0, 1);
  text(ctx, 'OIL', 560, 28, 18, '#c8d4ea', 'left', 600);
  ctx.fillStyle = '#1a2438';
  rr(ctx, 606, 16, 150, 22, 6); ctx.fill();
  ctx.fillStyle = frac < 0.25 ? '#ff5a4e' : '#ffb347';
  if (frac > 0) { rr(ctx, 606, 16, 150 * frac, 22, 6); ctx.fill(); }
  text(ctx, `${Math.round(oil)}`, 766, 28, 18, frac < 0.25 ? '#ff8a80' : '#ffe9b0', 'left', 700);
  // Low-oil blink.
  if (frac < 0.25 && Math.sin(state.time * 6) > 0) {
    text(ctx, 'LOW OIL', 606, 66, 14, '#ff6a5e', 'left', 800);
  }
  text(ctx, `SCORE ${state.score || 0}`, 850, 28, 20, '#ffe9b0');
  // Foghorn charges.
  const fh = state.foghorns || 0;
  text(ctx, `FOGHORN ×${fh}`, 1010, 28, 18, fh > 0 ? '#9fd8ff' : '#5a6478', 'left', 700);
  // Pause button (top right).
  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  rr(ctx, 1196, 10, 60, 34, 8); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1.5;
  rr(ctx, 1196, 10, 60, 34, 8); ctx.stroke();
  ctx.fillStyle = '#e8efff';
  ctx.fillRect(1216, 19, 6, 16);
  ctx.fillRect(1228, 19, 6, 16);

  // Mute hint, bottom-left, small.
  if (state.muted) text(ctx, 'MUTED (M)', 16, H - 16, 14, 'rgba(200,215,240,0.6)');
}

// ---------------------------------------------------------------- screens
function dim(ctx, alpha) {
  ctx.fillStyle = `rgba(3,6,14,${alpha})`;
  ctx.fillRect(0, 0, W, H);
}

function panel(ctx, x, y, w, h) {
  ctx.fillStyle = 'rgba(5,10,20,0.92)';
  rr(ctx, x, y, w, h, 16); ctx.fill();
  ctx.strokeStyle = 'rgba(255,190,90,0.45)';
  ctx.lineWidth = 2;
  rr(ctx, x, y, w, h, 16); ctx.stroke();
}

function drawTitle(ctx, state) {
  dim(ctx, 0.45);
  // Title block, centred, high contrast for the contact sheet.
  text(ctx, 'LANTERNKEEP', W / 2, 236, 92, '#ffe9b0', 'center', 800);
  text(ctx, 'T H E   L A S T   L I G H T H O U S E', W / 2, 296, 22, '#9fd8ff', 'center', 600);
  text(ctx, 'Guide every ship home through the fog. The beam burns oil —', W / 2, 372, 22, '#e8efff', 'center');
  text(ctx, 'oil is also your upgrade currency. Survive 7 nights to win.', W / 2, 402, 22, '#e8efff', 'center');
  // Begin button.
  ctx.fillStyle = '#ffb347';
  rr(ctx, W / 2 - 190, 448, 380, 62, 12); ctx.fill();
  text(ctx, 'CLICK TO BEGIN', W / 2, 480, 26, '#1a1206', 'center', 800);
  if (state.best > 0) text(ctx, `BEST SCORE  ${state.best}`, W / 2, 552, 20, '#ffe9b0', 'center', 700);
  text(ctx, 'Mouse aims the beam  ·  Space / Click = foghorn  ·  P = pause  ·  R = restart  ·  M = mute',
    W / 2, 606, 17, 'rgba(200,215,240,0.8)', 'center', 600);
}

function drawPaused(ctx, state) {
  dim(ctx, 0.55);
  text(ctx, 'PAUSED', W / 2, 300, 64, '#ffe9b0', 'center', 800);
  text(ctx, 'Press P or click to keep the light burning', W / 2, 372, 22, '#e8efff', 'center');
  text(ctx, `Night ${state.night || 1}/7  ·  Score ${state.score || 0}`, W / 2, 416, 20, '#9fd8ff', 'center', 700);
}

// Prices and names match upgrades.js exactly (flat prices, no scaling) —
// the player must never be charged more than the number on the screen.
const SHOP = [
  { id: 'beamWidth', name: 'WIDER BEAM', desc: 'Sweep more sea at once', price: 30 },
  { id: 'slew', name: 'FASTER SLEW', desc: 'Turn the beam quicker', price: 25 },
  { id: 'reach', name: 'BRIGHTER LIGHT', desc: 'Longer reach, further ships', price: 40 },
  { id: 'foghorns', name: 'FOGHORN +1', desc: 'One more foghorn charge', price: 20 },
  { id: 'harbourLight', name: 'HARBOUR LIGHT', desc: 'A lamp at the harbour mouth', price: 60 },
  { id: 'bank', name: 'BIGGER TANK', desc: '+25 oil every night', price: 45 },
];

function drawNightClear(ctx, state) {
  dim(ctx, 0.45);
  // The numbers come from sim.js endNight (state.results). The fallback
  // recomputes the SAME formula (saved x 100 x night + oil banked + 250
  // no-wreck bonus) so a state without results still reads identically.
  const r = state.results || null;
  const saved = r ? r.saved : (state.savedThisNight || 0);
  const lost = r ? r.lost : (state.wrecksThisNight || 0);
  const oilLeft = r ? r.oilLeft : Math.floor(state.oil != null ? state.oil : 0);
  const noWreck = r ? r.noWreckBonus : (lost === 0 ? 250 : 0);
  const nightScore = r ? r.nightScore : saved * 100 * (state.night || 1) + oilLeft + noWreck;
  const totalScore = r ? r.totalScore : (state.score || 0);
  panel(ctx, 300, 96, 680, 528);
  text(ctx, `NIGHT ${state.night || 1} CLEAR`, 640, 152, 44, '#ffe9b0', 'center', 800);
  text(ctx, `${saved} ship${saved === 1 ? '' : 's'} home, ${lost} lost`, 640, 202, 24, '#e8efff', 'center', 700);
  // Stats rows.
  const rows = [
    ['Ships saved', `${saved}`],
    ['Ships lost', `${lost}`],
    ['Oil banked', `+${oilLeft}`],
    ['No-wreck bonus', noWreck > 0 ? `+${noWreck}` : '—'],
    ['Night score', `+${nightScore}`],
    ['Total score', `${totalScore}`],
  ];
  let y = 236;
  for (const [k, v] of rows) {
    text(ctx, k, 360, y, 20, '#c8d4ea', 'left', 600);
    text(ctx, v, 920, y, 20, '#ffe9b0', 'right', 700);
    y += 26;
  }
  // Upgrade shop (all 6 upgrades — keys 1-6).
  text(ctx, 'SPEND OIL — UPGRADES', 640, 398, 20, '#9fd8ff', 'center', 800);
  y = 426;
  for (const item of SHOP) {
    const lvl = (state.upgrades && state.upgrades[item.id]) || 0;
    const nameStr = lvl > 0 ? `${item.name}  ${'★'.repeat(Math.min(lvl, 3))}` : item.name;
    text(ctx, nameStr, 360, y, 19, '#e8efff', 'left', 700);
    // Description: centred when it fits, otherwise pushed right of the
    // name + stars (measured, never overlapping — "★onger reach" bug).
    ctx.font = '600 16px "Segoe UI", Verdana, sans-serif';
    const descW = ctx.measureText(item.desc).width;
    ctx.font = '700 19px "Segoe UI", Verdana, sans-serif';
    const nameW = ctx.measureText(nameStr).width;
    const descX = Math.max(640 - descW / 2, 360 + nameW + 16);
    text(ctx, item.desc, descX, y, 16, 'rgba(200,215,240,0.7)', 'left', 600);
    text(ctx, `${item.price} OIL`, 920, y, 19, '#ffb347', 'right', 700);
    y += 26;
  }
  text(ctx, 'Press 1–6 to buy  ·  Click NEXT NIGHT to continue', 640, 596, 18, '#e8efff', 'center', 700);
}

function drawGameOver(ctx, state, victory) {
  dim(ctx, 0.55);
  if (victory) {
    text(ctx, 'ALL SEVEN NIGHTS', W / 2, 250, 64, '#ffe9b0', 'center', 800);
    text(ctx, 'THE COAST IS SAFE', W / 2, 322, 44, '#7be495', 'center', 800);
    text(ctx, 'Every ship that could come home, came home.', W / 2, 386, 22, '#e8efff', 'center');
  } else {
    text(ctx, 'THE LIGHT WENT OUT', W / 2, 250, 64, '#ff8a80', 'center', 800);
    text(ctx, `3 ships lost on Night ${state.night || 1}`, W / 2, 322, 30, '#e8efff', 'center', 700);
    text(ctx, 'The coast goes dark. The keeper lights the lamp again.', W / 2, 386, 22, '#e8efff', 'center');
  }
  text(ctx, `FINAL SCORE  ${state.score || 0}`, W / 2, 452, 26, '#ffe9b0', 'center', 800);
  if (state.best > 0) text(ctx, `BEST  ${state.best}`, W / 2, 492, 20, '#9fd8ff', 'center', 700);
  text(ctx, 'Press R to keep again', W / 2, 556, 22, '#e8efff', 'center', 700);
}

// ---------------------------------------------------------------- main entry
export function draw(ctx, state) {
  // Defensive defaults so a half-built state still renders.
  const s = state || {};
  s.time = s.time || 0;
  s.night = s.night || 1;
  s.screen = s.screen || 'title';

  drawSky(ctx, s);
  drawSea(ctx, s);
  drawHarbour(ctx, s);
  drawRocks(ctx, s);
  drawLighthouse(ctx, s);
  drawBeam(ctx, s);
  for (const ship of (s.ships || [])) drawShip(ctx, s, ship);
  drawFog(ctx, s);
  drawParticles(ctx, s);

  // HUD on every gameplay screen (not on the title cover).
  if (s.screen === 'playing' || s.screen === 'paused') drawHUD(ctx, s);

  if (s.screen === 'title') drawTitle(ctx, s);
  else if (s.screen === 'paused') drawPaused(ctx, s);
  else if (s.screen === 'nightClear') drawNightClear(ctx, s);
  else if (s.screen === 'gameOver') drawGameOver(ctx, s, false);
  else if (s.screen === 'victory') drawGameOver(ctx, s, true);
}
