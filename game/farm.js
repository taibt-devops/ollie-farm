'use strict';
/* Ollie's Farm — plant, harvest, feed the chicken, fill English orders. Offline and file://-safe.
   Time is real: crops keep growing while the app is closed (state stores timestamps). */

const D = window.OLLIE_FARM;
const PLOTS = 36;
const CROPS = {
  corn: { seed: 1, grow: 20, xp: 1, level: 1 },     // chicken feed, never ordered ("two corn" is bad English)
  carrot: { seed: 2, grow: 40, xp: 2, level: 1 },
  tomato: { seed: 3, grow: 60, xp: 3, level: 2 },
};
const EGG_LAY = 30;                                 // seconds after feeding
const ITEMS = ['corn', 'carrot', 'tomato', 'egg'];
const VI = { corn: 'ngô', carrot: 'cà rốt', tomato: 'cà chua', egg: 'trứng' };
const PLURAL = { carrot: 'carrots', tomato: 'tomatoes', egg: 'eggs' };
const VALUE = { carrot: 4, tomato: 6, egg: 8 };
const ORDER_XP = { carrot: 2, tomato: 3, egg: 3 };
const LEVEL_XP = [0, 15, 40, 80, 140, 220, 320, 450, 600, 800];
const UNLOCKS = { 2: ['tomato'] };
const SAVE_KEY = 'olliefarm.v1';

// ---------------------------------------------------------------- helpers
const $ = s => document.querySelector(s);
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'hidden' || k === 'disabled') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : String(kid));
  }
  return el;
}
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const rnd = (a, b) => a + Math.random() * (b - a);
let skew = 0;                                       // debug: fast-forward time
const now = () => Date.now() + skew;
const itemImg = k => D.img[`item-${k}`];

// ---------------------------------------------------------------- state
function freshState() {
  return {
    v: 1, coins: 20, xp: 0, seq: 3, tool: 'corn', welcomed: false,
    plots: Array(PLOTS).fill(null),
    barn: { corn: 0, carrot: 0, tomato: 0, egg: 0 },
    chickens: [{ fedAt: null, egg: false }],
    // gentle first orders that the starting crops can fill
    orders: [
      { id: 1, lines: [{ item: 'carrot', qty: 1 }], coins: 8, xp: 4 },
      { id: 2, lines: [{ item: 'egg', qty: 1 }], coins: 14, xp: 5 },
      { id: 3, lines: [{ item: 'carrot', qty: 2 }], coins: 14, xp: 6 },
    ],
  };
}
const S = (() => {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (s && s.v === 1) return { ...freshState(), ...s, barn: { ...freshState().barn, ...s.barn } };
  } catch { /* corrupt or blocked storage: start fresh */ }
  return freshState();
})();
const save = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch { /* play on */ } };

const level = () => { let l = 1; while (l < LEVEL_XP.length && S.xp >= LEVEL_XP[l]) l += 1; return l; };
const xpFraction = () => {
  const l = level();
  if (l >= LEVEL_XP.length) return 1;
  return (S.xp - LEVEL_XP[l - 1]) / (LEVEL_XP[l] - LEVEL_XP[l - 1]);
};
const growth = p => Math.min(1, (now() - p.at) / (CROPS[p.crop].grow * 1000));
const stageOf = p => { if (!p) return -1; const f = growth(p); return f >= 1 ? 3 : f >= 0.6 ? 2 : f >= 0.2 ? 1 : 0; };
const stageImg = (p, st) => [D.img.seeds, D.img.sprout, D.img[`${p.crop}-growing`], D.img[`${p.crop}-ripe`]][st];
const unlocked = crop => level() >= CROPS[crop].level;

// ---------------------------------------------------------------- sound + voice
let actx = null;
function tone(f, start, dur, type = 'triangle', gain = 0.14) {
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const t0 = actx.currentTime + start;
    const o = actx.createOscillator();
    const g = actx.createGain();
    o.type = type;
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(actx.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  } catch { /* no audio */ }
}
const sfx = {
  tap: () => tone(700, 0, 0.06, 'sine', 0.06),
  plant: () => tone(420, 0, 0.09, 'sine', 0.1),
  pop: () => { tone(560, 0, 0.05, 'square', 0.05); tone(1120, 0.03, 0.09, 'sine', 0.09); },
  coin: () => { tone(988, 0, 0.08, 'square', 0.05); tone(1319, 0.07, 0.18, 'square', 0.05); },
  wrong: () => { tone(233, 0, 0.14, 'square', 0.05); tone(175, 0.12, 0.22, 'square', 0.05); },
  fanfare: () => [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, i * 0.12, 0.26, 'triangle', 0.13)),
};
let voice = null;
let voiceQueue = [];
let lastSay = 0;
function sayAll(keys) {
  if (voice) voice.pause();
  voiceQueue = keys.filter(k => D.audio[k]);
  const next = () => {
    const k = voiceQueue.shift();
    if (!k) { voice = null; return; }
    voice = new Audio(D.audio[k]);
    voice.onended = next;
    voice.play().catch(() => { voice = null; });
  };
  next();
}
const say = k => sayAll([k]);
/** For rapid actions (swiping a row of crops): speak at most every 700 ms. */
function sayOften(k) {
  if (Date.now() - lastSay < 700) return;
  lastSay = Date.now();
  say(k);
}
const orderVoice = o => [...o.lines.flatMap((l, i) => (i ? ['and', `${l.qty}-${l.item}`] : [`${l.qty}-${l.item}`])), 'please'];

// ---------------------------------------------------------------- effects
function centerOf(el) { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }
function fly(src, fromEl, toEl) {
  const [x0, y0] = centerOf(fromEl);
  const [x1, y1] = centerOf(toEl);
  const img = h('img', { class: 'flyer', src, alt: '', style: `left:${x0 - 22}px; top:${y0 - 22}px` });
  document.body.append(img);
  const anim = img.animate([
    { transform: 'translate(0,0) scale(1)' },
    { transform: `translate(${(x1 - x0) * 0.5}px, ${(y1 - y0) * 0.5 - 60}px) scale(1.3)` },
    { transform: `translate(${x1 - x0}px, ${y1 - y0}px) scale(.5)`, opacity: 0.4 },
  ], { duration: 650, easing: 'ease-in' });
  anim.onfinish = () => { img.remove(); toEl.animate([{ transform: 'scale(1.15)' }, { transform: 'scale(1)' }], 200); };
}
function floatText(text, el) {
  const [x, y] = centerOf(el);
  const f = h('div', { class: 'float', style: `left:${x - 20}px; top:${y - 30}px` }, text);
  document.body.append(f);
  setTimeout(() => f.remove(), 1000);
}
function nope(el) { el.classList.remove('nope'); void el.offsetWidth; el.classList.add('nope'); }

// ---------------------------------------------------------------- UI
const ui = {};

const preloaded = [];   // keep references so the decoded frames stay cached
function preload() {
  const urls = [...D.chicken.walk, ...D.chicken.peck,
    ...Object.entries(D.img).filter(([k]) => /seeds|sprout|growing|ripe|item-/.test(k)).map(([, v]) => v)];
  for (const src of urls) {
    const img = new Image();
    img.src = src;
    if (img.decode) img.decode().catch(() => {});
    preloaded.push(img);
  }
}

function buildUI() {
  preload();
  document.body.style.setProperty('--grass-img', `url("${D.img.grass}")`);
  document.body.style.setProperty('--soil-img', `url("${D.img.soil}")`);
  ui.coins = h('span', {});
  ui.levelNum = h('span', { class: 'badge' });
  ui.xp = h('i');
  ui.barnCount = h('span', {});
  ui.barnBtn = h('button', { class: 'press barn-btn', 'aria-label': 'Mở kho', onclick: () => { sfx.tap(); openBarn(); } },
    h('img', { src: D.img.barn, alt: 'Kho' }), ui.barnCount);
  ui.coinPill = h('span', { class: 'pill', 'aria-label': 'Tiền xu' }, h('img', { src: D.img.coin, alt: '' }), ui.coins);
  const hud = h('header', { class: 'hud' },
    h('div', { class: 'title' }, "Ollie's Farm"),
    ui.coinPill,
    h('span', { class: 'pill level', 'aria-label': 'Cấp độ' }, ui.levelNum, h('span', { class: 'xp' }, ui.xp)),
    ui.barnBtn);

  ui.plots = [];
  ui.field = h('div', { class: 'field', 'aria-label': 'Ruộng' }, Array.from({ length: PLOTS }, (_, i) => {
    const img = h('img', { alt: '', hidden: true });
    const bar = h('div', { class: 'grow', hidden: true }, h('i'));
    const el = h('div', { class: 'plot', 'data-i': i, role: 'button', 'aria-label': `Ô đất ${i + 1}` }, img, bar);
    ui.plots.push({ el, img, bar, bari: bar.firstChild, stage: null });
    return el;
  }));
  wireField();

  ui.pen = h('div', { class: 'pen', 'aria-label': 'Chuồng gà' },
    h('img', { class: 'coop', src: D.img.coop, alt: '' }),
    h('span', { class: 'label' }, 'Chuồng gà'));
  ui.orders = h('div', { class: 'orders', 'aria-label': 'Đơn hàng' });

  ui.tools = h('nav', { class: 'toolbar', 'aria-label': 'Công cụ' });
  ui.tip = h('div', { class: 'tip', 'aria-live': 'polite' });
  const ollie = h('button', { class: 'ollie', 'aria-label': 'Cú Ollie', onclick: () => say('welcome') },
    h('img', { src: D.img['ollie-wave'], alt: 'Cú Ollie' }), h('img', { class: 'hat', src: D.img['straw-hat'], alt: '' }));
  ui.ollieImg = ollie.firstChild;

  $('#app').replaceChildren(hud,
    h('main', { class: 'farm' },
      h('section', { class: 'field-wrap' }, ui.field),
      h('section', { class: 'side' }, ui.pen, ui.orders)),
    ui.tools,
    h('aside', { class: 'helper' }, ui.tip, ollie));

  chickens.push(...S.chickens.map((_, k) => makeChicken(k)));
  renderTools();
  renderOrders();
  tick();
}

function renderHud() {
  ui.coins.textContent = S.coins;
  ui.levelNum.textContent = level();
  ui.xp.style.width = `${Math.round(xpFraction() * 100)}%`;
  ui.barnCount.textContent = ITEMS.reduce((n, k) => n + S.barn[k], 0);
}

function renderTools() {
  const tools = [{ id: 'hand' }, ...Object.keys(CROPS).map(id => ({ id }))];
  ui.tools.replaceChildren(...tools.map(t => {
    if (t.id === 'hand') {
      return h('button', { class: `press tool${S.tool === 'hand' ? ' on' : ''}`, 'aria-label': 'Bàn tay: thu hoạch', onclick: () => pickTool('hand') },
        h('span', { class: 'hand' }, '✋'));
    }
    const c = CROPS[t.id];
    const open = unlocked(t.id);
    return h('button', {
      class: `press tool${S.tool === t.id ? ' on' : ''}${open ? '' : ' locked'}`, 'data-tool': t.id,
      'aria-label': open ? `Hạt ${VI[t.id]}, giá ${c.seed} xu` : `Hạt ${VI[t.id]}: mở ở cấp ${c.level}`,
      onclick: () => pickTool(t.id),
    },
    h('img', { src: itemImg(t.id), alt: '' }),
    open ? h('span', { class: 'price' }, h('img', { src: D.img.coin, alt: '' }), c.seed) : h('span', { class: 'lock' }, `Cấp ${c.level}`));
  }));
}

function pickTool(id) {
  if (id !== 'hand' && !unlocked(id)) {
    sfx.wrong();
    setTip(`Hạt ${VI[id]} sẽ mở khi bạn lên cấp ${CROPS[id].level}.`, true);
    return;
  }
  sfx.tap();
  S.tool = id;
  save();
  renderTools();
  if (id !== 'hand') say(id);
}

function renderPlots() {
  S.plots.forEach((p, i) => {
    const u = ui.plots[i];
    const st = stageOf(p);
    const key = p ? `${p.crop}:${st}` : 'empty';
    if (u.stage !== key) {
      u.stage = key;
      u.el.className = `plot${st >= 0 ? ` s${st}` : ''}${st === 3 ? ' ripe' : ''}`;
      u.img.hidden = st < 0;
      if (st >= 0) u.img.src = stageImg(p, st);
      u.bar.hidden = st < 0 || st === 3;
    }
    if (st >= 0 && st < 3) u.bari.style.width = `${Math.round(growth(p) * 100)}%`;
  });
}

// ---------------------------------------------------------------- field actions (tap or swipe)
function wireField() {
  let active = false;
  let touched = new Set();
  let warned = false;
  let last = null;
  // Touch screens report a fast finger only every few cells: walk the segment between two
  // reports in steps of a third of a plot so no plot under the swipe is skipped.
  const trace = e => {
    const to = [e.clientX, e.clientY];
    const from = last || to;
    last = to;
    const cell = ui.plots[0].el.getBoundingClientRect().width || 40;
    const steps = Math.max(1, Math.ceil(Math.hypot(to[0] - from[0], to[1] - from[1]) / (cell / 3)));
    for (let s = 1; s <= steps; s++) {
      act({ clientX: from[0] + ((to[0] - from[0]) * s) / steps, clientY: from[1] + ((to[1] - from[1]) * s) / steps });
    }
  };
  const act = e => {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const plot = el && el.closest('.plot');
    if (!plot) return;
    const i = Number(plot.dataset.i);
    if (touched.has(i)) return;
    touched.add(i);
    const p = S.plots[i];
    const st = stageOf(p);
    if (st === 3) harvest(i);
    else if (!p && S.tool !== 'hand') plant(i, S.tool);
    else if (!p && !warned) { warned = true; nope(ui.tools); setTip('Chọn một túi hạt giống ở dưới trước, rồi chạm vào ô đất nhé!', true); }
    else if (p && touched.size === 1) {
      const left = Math.ceil(CROPS[p.crop].grow * (1 - growth(p)));
      const t = h('div', { class: 'toast-tip' }, `${VI[p.crop]}: còn ${left} giây`);
      ui.plots[i].el.append(t);
      setTimeout(() => t.remove(), 1400);
    }
  };
  ui.field.addEventListener('pointerdown', e => {
    active = true;
    touched = new Set();
    warned = false;
    last = null;
    try { ui.field.setPointerCapture(e.pointerId); } catch { /* synthetic events */ }
    trace(e);
  });
  ui.field.addEventListener('pointermove', e => { if (active) trace(e); });
  const stop = () => { active = false; last = null; };
  // a fast swipe's final position often arrives only with the lift-off event
  ui.field.addEventListener('pointerup', e => { if (active) trace(e); stop(); });
  ui.field.addEventListener('pointercancel', stop);
}

function plant(i, crop) {
  const c = CROPS[crop];
  if (S.coins < c.seed) {
    sfx.wrong();
    nope(ui.coinPill);
    setTip('Hết tiền mua hạt rồi. Giao đơn hàng để có thêm xu nhé!', true);
    return;
  }
  S.coins -= c.seed;
  S.plots[i] = { crop, at: now() };
  sfx.plant();
  save();
  renderPlots();
  renderHud();
}

function harvest(i) {
  const p = S.plots[i];
  S.plots[i] = null;
  S.barn[p.crop] += 1;
  const u = ui.plots[i];
  sfx.pop();
  fly(itemImg(p.crop), u.el, ui.barnBtn);
  floatText('+1', u.el);
  sayOften(p.crop);
  gainXp(CROPS[p.crop].xp);
  save();
  renderPlots();
  renderHud();
  renderOrders();
}

function gainXp(n) {
  const before = level();
  S.xp += n;
  const after = level();
  renderHud();
  if (after > before) setTimeout(() => levelUp(after), 700);
}

// ---------------------------------------------------------------- chickens
const chickens = [];
const PECK = [0, 1, 2, 3, 2, 1, 0];

function makeChicken(k) {
  const body = h('img', { class: 'body', src: D.chicken.peck[0], alt: '' });
  const bubble = h('div', { class: 'bubble', hidden: true }, h('img', { src: itemImg('corn'), alt: 'muốn ăn ngô' }));
  const lay = h('div', { class: 'lay', hidden: true }, h('i'));
  const el = h('button', { class: 'chicken', 'aria-label': 'Con gà' }, bubble, body, lay);
  el.addEventListener('pointerdown', e => { e.preventDefault(); feed(k); });
  ui.pen.append(el);
  return { k, el, body, bubble, lay, layi: lay.firstChild, x: rnd(20, 200), y: rnd(60, 120), tx: 0, ty: 0,
    mode: 'idle', t: 1, ft: 0, facing: 1, pecks: 0, eggEl: null };
}

function penBounds(c) {
  const W = ui.pen.clientWidth;
  const H = ui.pen.clientHeight;
  return { x0: 6, x1: Math.max(10, W - c.el.offsetWidth - 6), y0: 34, y1: Math.max(40, H - c.el.offsetHeight - 6) };
}

function stepChicken(c, dt) {
  const b = penBounds(c);
  c.ft += dt;
  if (c.mode === 'walk') {
    const dx = c.tx - c.x;
    const dy = c.ty - c.y;
    const dist = Math.hypot(dx, dy);
    const step = 70 * dt;
    if (dist <= step) { c.mode = 'idle'; c.t = rnd(0.8, 2.2); }
    else { c.x += (dx / dist) * step; c.y += (dy / dist) * step; c.facing = dx < 0 ? -1 : 1; }
    setFrame(c, D.chicken.walk[Math.floor(c.ft * 8) % 4]);
  } else if (c.mode === 'peck') {
    const f = Math.floor(c.ft * 7);
    if (f >= PECK.length) {
      c.pecks -= 1;
      c.ft = 0;
      if (c.pecks <= 0) { c.mode = 'idle'; c.t = rnd(0.5, 1.5); }
    } else setFrame(c, D.chicken.peck[PECK[f]]);
  } else {
    setFrame(c, D.chicken.peck[0]);
    c.t -= dt;
    if (c.t <= 0) {
      if (Math.random() < 0.45) peck(c, 1);
      else { c.mode = 'walk'; c.tx = rnd(b.x0, b.x1); c.ty = rnd(b.y0, b.y1); c.ft = 0; }
    }
  }
  c.x = Math.min(Math.max(c.x, b.x0), b.x1);
  c.y = Math.min(Math.max(c.y, b.y0), b.y1);
  c.el.style.transform = `translate(${c.x}px, ${c.y}px)`;
  c.el.style.zIndex = 5 + Math.round(c.y);
  c.body.style.transform = c.facing < 0 ? 'scaleX(-1)' : '';
}
function setFrame(c, src) { if (c.body.dataset.src !== src) { c.body.dataset.src = src; c.body.src = src; } }
function peck(c, times) { c.mode = 'peck'; c.pecks = times; c.ft = 0; }

function renderChicken(c) {
  const st = S.chickens[c.k];
  const hungry = !st.fedAt && !st.egg;
  c.bubble.hidden = !hungry;
  c.lay.hidden = !st.fedAt;
  if (st.fedAt) c.layi.style.width = `${Math.min(100, ((now() - st.fedAt) / (EGG_LAY * 1000)) * 100)}%`;
  if (st.egg && !c.eggEl) {
    // laid behind the hen (by her tail), not on top of her
    const w = c.el.offsetWidth;
    const ex = c.facing > 0 ? c.x - w * 0.25 : c.x + w * 0.85;
    const egg = h('button', { class: 'egg', 'aria-label': 'Quả trứng',
      style: `left:${Math.max(4, Math.min(ex, ui.pen.clientWidth - 60))}px; top:${c.y + c.el.offsetHeight * 0.6}px` },
      h('img', { src: itemImg('egg'), alt: '' }));
    egg.addEventListener('pointerdown', e => { e.preventDefault(); collectEgg(c); });
    ui.pen.append(egg);
    c.eggEl = egg;
  }
  if (!st.egg && c.eggEl) { c.eggEl.remove(); c.eggEl = null; }
}

function feed(k) {
  const st = S.chickens[k];
  const c = chickens[k];
  if (st.egg) { say('cluck'); setTip('Gà đẻ trứng rồi, chạm vào quả trứng để nhặt nhé!', true); return; }
  if (st.fedAt) { say('cluck'); peck(c, 1); return; }
  if (S.barn.corn < 1) {
    sfx.wrong();
    say('hungry');
    setTip('Gà đói nhưng kho hết ngô. Trồng ngô rồi thu hoạch nhé!', true);
    return;
  }
  S.barn.corn -= 1;
  st.fedAt = now();
  fly(itemImg('corn'), ui.barnBtn, c.el);
  peck(c, 3);
  say('yum');
  save();
  renderHud();
  renderChicken(c);
}

function collectEgg(c) {
  const st = S.chickens[c.k];
  if (!st.egg) return;
  st.egg = false;
  S.barn.egg += 1;
  sfx.pop();
  fly(itemImg('egg'), c.eggEl, ui.barnBtn);
  say('egg');
  gainXp(1);
  save();
  renderChicken(c);
  renderHud();
  renderOrders();
}

function chickenClock() {
  S.chickens.forEach((st, k) => {
    if (st.fedAt && now() - st.fedAt >= EGG_LAY * 1000) {
      st.fedAt = null;
      st.egg = true;
      save();
      if (!document.hidden) { sfx.pop(); say('new-egg'); }
    }
    if (chickens[k]) renderChicken(chickens[k]);
  });
}

// ---------------------------------------------------------------- orders
function makeOrder() {
  const lv = level();
  const pool = ['carrot', 'egg', ...(lv >= 2 ? ['tomato'] : [])];
  const kinds = shuffle(pool).slice(0, Math.random() < Math.min(0.7, 0.15 + lv * 0.15) ? 2 : 1);
  const maxQ = Math.min(5, 2 + Math.floor(lv / 2));
  const lines = kinds.map(item => ({ item, qty: 1 + Math.floor(Math.random() * maxQ) }));
  const value = lines.reduce((s, l) => s + l.qty * VALUE[l.item], 0);
  S.seq += 1;
  return { id: S.seq, lines, coins: Math.round(value * 1.5) + 2, xp: lines.reduce((s, l) => s + l.qty * ORDER_XP[l.item], 0) + 2 };
}
const canDeliver = o => o.lines.every(l => S.barn[l.item] >= l.qty);

function renderOrders() {
  ui.orders.replaceChildren(...S.orders.map((o, i) => {
    const ready = canDeliver(o);
    return h('article', { class: `order${o.fresh ? ' fresh' : ''}`, 'data-id': o.id },
      o.lines.map(l => h('div', { class: 'order-line', lang: 'en' },
        h('img', { src: itemImg(l.item), alt: '' }),
        h('span', {}, `${l.qty} ${l.qty === 1 ? l.item : PLURAL[l.item]}`),
        h('span', { class: `have${S.barn[l.item] >= l.qty ? ' ok' : ''}`, title: 'Trong kho' }, `${Math.min(S.barn[l.item], l.qty)}/${l.qty}`))),
      h('div', { class: 'reward' },
        h('span', {}, h('img', { src: D.img.coin, alt: 'xu', style: 'display:inline;vertical-align:middle' }), ` ${o.coins}`),
        h('span', {}, `⭐ ${o.xp}`)),
      h('div', { class: 'row' },
        h('button', { class: 'press speak', 'aria-label': 'Nghe đơn hàng', onclick: () => sayAll(orderVoice(o)) }, '🔊'),
        h('button', { class: 'press deliver', disabled: !ready, onclick: e => deliver(i, e.currentTarget.closest('.order')) }, 'Giao'),
        h('button', { class: 'press toss', 'aria-label': 'Đổi đơn khác', onclick: () => toss(i) }, '↻')));
  }));
  S.orders.forEach(o => { delete o.fresh; });
}

function deliver(i, card) {
  const o = S.orders[i];
  if (!canDeliver(o)) { sfx.wrong(); nope(card); return; }
  o.lines.forEach(l => { S.barn[l.item] -= l.qty; });
  S.coins += o.coins;
  sfx.coin();
  say('thanks');
  fly(D.img.coin, card, ui.coinPill);
  floatText(`+${o.coins}`, ui.coinPill);
  S.orders[i] = { ...makeOrder(), fresh: true };
  gainXp(o.xp);
  save();
  card.classList.add('leaving');
  setTimeout(() => { renderOrders(); renderHud(); }, 600);
}

function toss(i) {
  sfx.tap();
  S.orders[i] = { ...makeOrder(), fresh: true };
  save();
  renderOrders();
}

// ---------------------------------------------------------------- panels
let panel = null;
function openPanel(...kids) {
  closePanel();
  panel = h('div', { class: 'shade', onclick: e => { if (e.target === panel) closePanel(); } }, h('div', { class: 'panel' }, kids));
  document.body.append(panel);
}
function closePanel() { if (panel) { panel.remove(); panel = null; } }

function openBarn() {
  openPanel(
    h('h2', {}, 'Kho của bạn'),
    h('div', { class: 'barn-grid' }, ITEMS.map(k => h('button', { class: 'press barn-item', lang: 'en', onclick: () => say(k) },
      h('img', { src: itemImg(k), alt: '' }), h('b', {}, S.barn[k]), h('span', {}, `${k} (${VI[k]})`)))),
    h('p', {}, 'Bấm vào món đồ để nghe tên tiếng Anh.'),
    h('button', { class: 'press close', onclick: closePanel }, 'Đóng'));
}

function levelUp(l) {
  sfx.fanfare();
  const news = UNLOCKS[l] || [];
  renderTools();
  renderOrders();
  openPanel(
    h('div', { class: 'big-ollie ollie' }, h('img', { src: D.img['ollie-happy'], alt: '' }), h('img', { class: 'hat', src: D.img['straw-hat'], alt: '' })),
    h('h2', {}, `Lên cấp ${l}!`),
    news.length ? news.map(k => h('div', { class: 'unlock', lang: 'en' }, h('img', { src: itemImg(k), alt: '' }), `Mở khoá hạt ${VI[k]} (${k})`))
      : h('p', {}, 'Đơn hàng sẽ lớn hơn và thưởng nhiều hơn.'),
    h('button', { class: 'press close', onclick: closePanel }, 'Tuyệt quá!'));
  sayAll(['level-up', ...(news.includes('tomato') ? ['unlock-tomato'] : [])]);
}

// ---------------------------------------------------------------- Ollie's tips
let tipHoldUntil = 0;
function setTip(text, hold) {
  if (ui.tip.textContent !== text) ui.tip.textContent = text;
  if (hold) tipHoldUntil = Date.now() + 4000;
}
function autoTip() {
  if (Date.now() < tipHoldUntil) return;
  const ripe = S.plots.some(p => stageOf(p) === 3);
  const egg = S.chickens.some(c => c.egg);
  const deliverable = S.orders.some(canDeliver);
  const hungry = S.chickens.some(c => !c.fedAt && !c.egg);
  const planted = S.plots.some(Boolean);
  const cornComing = S.plots.some(p => p && p.crop === 'corn');
  const empty = S.plots.some(p => !p);
  let text;
  if (ripe) text = 'Cây chín rồi! Vuốt tay qua các ô để thu hoạch.';
  else if (egg) text = 'Gà đẻ trứng rồi! Chạm vào quả trứng để nhặt.';
  else if (deliverable) text = 'Đủ hàng rồi! Bấm "Giao" trên đơn hàng để nhận xu.';
  else if (hungry && S.barn.corn > 0) text = 'Gà đói! Chạm vào con gà để cho ăn ngô.';
  else if (!planted) text = 'Chọn túi hạt ở dưới, rồi chạm hoặc vuốt qua ô đất để gieo hạt!';
  else if (hungry && !cornComing) text = 'Gà cần ngô để đẻ trứng. Gieo vài hạt ngô nhé!';
  else if (empty && S.coins > 0) text = 'Cây đang lớn. Gieo thêm hạt vào ô trống nhé!';
  else text = 'Cây đang lớn, chờ một chút nhé! Bấm 🔊 trên đơn hàng để nghe tiếng Anh.';
  setTip(text);
}

/** Never leave a child stuck: no coins, nothing growing, nothing to sell → Ollie tops up. */
function rescue() {
  const stuck = S.coins < 1 && !S.plots.some(Boolean) && ITEMS.every(k => !S.barn[k]) && S.chickens.every(c => !c.fedAt && !c.egg);
  if (!stuck) return;
  S.coins += 6;
  save();
  renderHud();
  setTip('Ollie tặng bạn 6 xu để mua hạt. Cố lên nhé!', true);
}

// ---------------------------------------------------------------- loops
function tick() {
  renderPlots();
  chickenClock();
  renderHud();
  rescue();
  autoTip();
  if (ui.ordersReady !== S.orders.map(canDeliver).join()) {   // refresh "Giao" buttons when stock changes over time
    ui.ordersReady = S.orders.map(canDeliver).join();
    renderOrders();
  }
}

function chickenLoop() {
  let last = performance.now();
  const step = t => {
    const dt = Math.min(0.05, (t - last) / 1000);
    last = t;
    chickens.forEach(c => stepChicken(c, dt));
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// ---------------------------------------------------------------- Android wrapper + debug hooks
window.wordIslandBack = () => { if (panel) { closePanel(); return true; } return false; };
window.wordIslandPause = () => { if (voice) voice.pause(); };
document.addEventListener('visibilitychange', () => { if (document.hidden) window.wordIslandPause(); else tick(); });
window.ollieFarmDebug = { state: () => S, advance: sec => { skew += sec * 1000; tick(); }, chickens };

document.addEventListener('DOMContentLoaded', () => {
  if (!D) { $('#app').textContent = 'Thiếu data.js — chạy tools/farm_assets.py export.'; return; }
  buildUI();
  chickenLoop();
  setInterval(tick, 400);
  document.addEventListener('pointerdown', () => {
    if (!S.welcomed) { S.welcomed = true; save(); say('welcome'); }
  }, { once: true });
});
