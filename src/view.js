// three.js による描画と演出。状態は game.js が持ち、ここは「見せ方」だけを担う
// 画像素材は一切使わず、すべて Canvas 2D で描いたテクスチャを板ポリに貼っている
import * as THREE from 'three';
import { RULES, TYPE_LABEL } from './data.js';
import { PIDS, LABEL, capFor, describeEnemyCard, grade } from './game.js';

export const W = 1920;
export const H = 1080;

const FAMILY = '"M PLUS Rounded 1c", "Hiragino Maru Gothic ProN", "Yu Gothic UI", Meiryo, sans-serif';
const font = (size, weight = 800) => `${weight} ${size}px ${FAMILY}`;

// テクスチャ解像度（表示倍率×DPRに合わせる）
const RES = Math.min(2, Math.max(1, (window.devicePixelRatio || 1) * Math.min(window.innerWidth / W, window.innerHeight / H)));

const C = {
  p1: '#4a20a8', p1Dark: '#2a0f63', p1Light: '#a68aff',
  p2: '#b8541f', p2Dark: '#6b2a0a', p2Light: '#ffa468',
  teal: '#177d94', tealDark: '#0b4756', tealLight: '#55b6cc',
  cream: '#f4eacf', ink: '#211c28', gold: '#ecbd42',
  attack: '#c4473b', parry: '#3b76c6', buff: '#3d9c5c', debuff: '#7d4cc2',
  mana: '#66e4f3', block: '#86b8ff', heal: '#8cea9f',
};
const PCOL = { p1: C.p1, p2: C.p2 };
const PDARK = { p1: C.p1Dark, p2: C.p2Dark };
const PLIGHT = { p1: C.p1Light, p2: C.p2Light };
const ROLE = { p1: 'アタッカー', p2: 'バッファー' };
export const KEYS = {
  p1: { move: 'A / D', use: 'SPACE', reroll: 'W', end: 'S' },
  p2: { move: '← / →', use: 'ENTER', reroll: '↑', end: '↓' },
};

// 描画順（renderOrder）
const L = {
  bg: 0, motes: 1, header: 4, enemyCards: 6, enemy: 8, chars: 10, charUi: 12, field: 14, mini: 16, fx: 20,
  panels: 30, cards: 32, fly: 36, log: 38, reveal: 44, banner: 50, parry: 60, popup: 70,
  flash: 80, overlay: 90, help: 95,
};

// レイアウト（x は左端基準、top は上端基準）
const POS = {
  p1: { x: 430, feet: 792 },
  p2: { x: 705, feet: 806 },
  enemy: { x: 1455, top: 590 },
};
const HAND_X = { p1: [538, 704, 870], p2: [1050, 1216, 1382] };
const CARD_W = 160;
const CARD_H = 228;
const HAND_TOP = H - CARD_H / 2 - 10;
const TRACK = { x0: 250, x1: 1670, top: 228 };
const REVEAL = { x: 960, top: 500 };
// 場（このターンに出したカードを並べる。2P のキャラと竜の間）。rows は各段の中心
const FIELD = { x: 995, w: 290, top: 400, h: 320, tag: 36, rows: { p1: 470, p2: 650 } };
const MINI_W = 88;
const MINI_H = 124;

const HELP = [
  ['目的', '灯火の翼竜を倒す。2人とも倒れたら負け。'],
  ['ターンの流れ', '味方のターンは2人が同時に操作する（制限時間なし）。出したカードは場に並ぶだけで、まだ発動しない。2人とも「ターン終了」を押すと、2P→1P の順に出した順でまとめて発動し、そのあと敵のターン。'],
  ['マナ', 'ターン開始時に上限まで全回復。カードを場に出した時点で減る。上限は 1P が 3→10（毎ターン+1）、2P が 10→3（毎ターン−1）。2Pの「魔力供給」で1Pの次のターンのマナを増やせる。'],
  ['パリィ', 'パリィカードが発動すると「構え」になり、次の敵の通常攻撃でバーが出る。中央に近いところで止めるほど防御値が大きく、ピンクの範囲なら成功効果も発動。'],
  ['連携', '金枠のカード。同じターンに2人とも金枠を出すと連携が成立し、発動時に連携効果が上乗せされる（組み合わせは自由）。金枠にパリィが含まれるときは、次の敵の通常攻撃で2人ともパリィに成功すると発動（パリィカードを出していない人もバーに参加する）。'],
  ['敵', '上に伏せた5枚から毎ターン1枚を使う。何が来るかは分からない。特殊行動はパリィできない。HPが半分を切ると激昂して2回行動。'],
  ['引き直し・防御値', '引き直しはマナ1で手札3枚を入れ替える。使い切らなかった防御値は次の攻撃まで残る。'],
];

// ------------------------------------------------------------------ 汎用

const EASE = {
  linear: (t) => t,
  out: (t) => 1 - (1 - t) ** 3,
  in: (t) => t * t * t,
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  back: (t) => 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2,
};

function at(obj, x, top) {
  obj.position.set(x, H - top, 0);
  return obj;
}

function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function mix(a, b, t) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (s) => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

function wrapLines(ctx, text, maxW) {
  const lines = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const ch of para) {
      if (line && ctx.measureText(line + ch).width > maxW && !'、。）」・ーァィゥェォッャュョ'.includes(ch)) {
        lines.push(line);
        line = ch;
      } else line += ch;
    }
    lines.push(line);
  }
  return lines;
}

function canvasPlane(w, h, draw, { scale = RES, layer = 0 } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(w * scale);
  canvas.height = Math.ceil(h * scale);
  const ctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  mesh.renderOrder = layer;
  const plane = {
    mesh, w, h,
    draw(fn) {
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.save();
      fn(ctx, w, h);
      ctx.restore();
      tex.needsUpdate = true;
    },
  };
  if (draw) plane.draw(draw);
  return plane;
}

function texPlane(tex, w, h, layer, extra = {}) {
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, ...extra });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  mesh.renderOrder = layer;
  return mesh;
}

function canvasTexture(w, h, draw, scale = RES) {
  return canvasPlane(w, h, draw, { scale }).mesh.material.map;
}

function glowTexture(rgb, size = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, `rgba(${rgb},1)`);
  g.addColorStop(0.35, `rgba(${rgb},0.45)`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function disposeMesh(mesh) {
  mesh.parent?.remove(mesh);
  mesh.geometry.dispose();
  mesh.material.map?.dispose();
  mesh.material.dispose();
}

function catmull(pts, seg) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let s = 0; s < seg; s++) {
      const t = s / seg;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

// 文字を含む全ソースから使用文字を集め、Web フォントの必要な分割ファイルを先読みする
async function loadFonts() {
  if (!document.fonts) return;
  let text = '';
  try {
    const urls = ['./view.js', './game.js', './data.js'].map((p) => new URL(p, import.meta.url));
    text = (await Promise.all(urls.map((u) => fetch(u).then((r) => r.text())))).join('');
  } catch {
    // 取得できなくてもフォールバックフォントで描ける
  }
  const chars = [...new Set(text)].filter((ch) => ch.charCodeAt(0) > 127).join('')
    + 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789/+-!?';
  await Promise.race([
    Promise.all([500, 800].map((wgt) => document.fonts.load(font(24, wgt), chars))),
    new Promise((r) => setTimeout(r, 5000)),
  ]).catch(() => {});
}

// ------------------------------------------------------------------ 描画: 背景・キャラ

function drawBackground(ctx, w, h) {
  const r = rng(11);
  const sky = ctx.createLinearGradient(0, 0, 0, 700);
  sky.addColorStop(0, '#b4c7c5');
  sky.addColorStop(1, '#e3eae0');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  // 遠景の幹
  for (let i = 0; i < 16; i++) {
    ctx.fillStyle = `rgba(105, 108, 104, ${0.14 + r() * 0.14})`;
    ctx.fillRect(r() * w, 0, 26 + r() * 40, 690);
  }
  // 近景の幹
  for (const base of [130, 560, 1010, 1390, 1790]) {
    const x = base + (r() - 0.5) * 70;
    const tw = 92 + r() * 46;
    const g = ctx.createLinearGradient(x, 0, x + tw, 0);
    g.addColorStop(0, '#463c3a');
    g.addColorStop(0.55, '#5d514e');
    g.addColorStop(1, '#3b3230');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + tw, 0);
    ctx.lineTo(x + tw + 16, 700);
    ctx.lineTo(x - 16, 700);
    ctx.closePath();
    ctx.fill();
  }
  // 木漏れ日
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 5; i++) {
    const x = 260 + i * 370 + r() * 120;
    const g = ctx.createLinearGradient(x, 0, x - 260, 760);
    g.addColorStop(0, 'rgba(255, 248, 220, 0.12)');
    g.addColorStop(1, 'rgba(255, 248, 220, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + 90, 0);
    ctx.lineTo(x - 170, 760);
    ctx.lineTo(x - 300, 760);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  // 林冠
  ctx.fillStyle = '#2f4936';
  for (let x = -20; x < w + 80; x += 64) {
    ctx.beginPath();
    ctx.arc(x, 40 + r() * 40, 52 + r() * 24, 0, Math.PI * 2);
    ctx.fill();
  }
  // 茂み
  ctx.fillStyle = '#26361f';
  for (let x = -40; x < w + 80; x += 66) {
    ctx.beginPath();
    ctx.arc(x, 612 + r() * 26, 56 + r() * 30, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillRect(0, 620, w, 80);
  ctx.fillStyle = '#304629';
  for (let x = -20; x < w + 80; x += 90) {
    ctx.beginPath();
    ctx.arc(x, 676 + r() * 16, 40 + r() * 18, 0, Math.PI * 2);
    ctx.fill();
  }
  // 地面
  const gg = ctx.createLinearGradient(0, 690, 0, h);
  gg.addColorStop(0, '#56694a');
  gg.addColorStop(1, '#3a4b34');
  ctx.fillStyle = gg;
  ctx.fillRect(0, 690, w, h - 690);
  ctx.strokeStyle = 'rgba(30, 45, 25, 0.35)';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  for (let i = 0; i < 90; i++) {
    const x = r() * w;
    const y = 710 + r() * 360;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 4 + r() * 6, y - 8 - r() * 10);
    ctx.stroke();
  }
}

function drawHero(ctx, w, h, pid) {
  const body = PCOL[pid];
  const dark = PDARK[pid];
  const light = PLIGHT[pid];
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (pid === 'p1') {
    // 背負った大剣
    ctx.save();
    ctx.translate(172, 214);
    ctx.rotate(-0.42);
    const blade = ctx.createLinearGradient(-10, 0, 10, 0);
    blade.addColorStop(0, '#97a3b6');
    blade.addColorStop(0.5, '#f0f4fa');
    blade.addColorStop(1, '#808ca0');
    ctx.fillStyle = blade;
    ctx.beginPath();
    ctx.moveTo(-10, -20);
    ctx.lineTo(10, -20);
    ctx.lineTo(10, -188);
    ctx.lineTo(0, -214);
    ctx.lineTo(-10, -188);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = C.gold;
    rr(ctx, -30, -25, 60, 12, 5);
    ctx.fill();
    ctx.fillStyle = '#3a2a22';
    rr(ctx, -6, -13, 12, 52, 4);
    ctx.fill();
    ctx.fillStyle = C.gold;
    ctx.beginPath();
    ctx.arc(0, 44, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  } else {
    // 杖と灯り
    ctx.strokeStyle = '#5a3a22';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(70, 335);
    ctx.lineTo(46, 74);
    ctx.stroke();
    ctx.strokeStyle = C.gold;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(44, 54, 24, 0, Math.PI * 2);
    ctx.stroke();
    ctx.save();
    ctx.shadowColor = '#ffd27a';
    ctx.shadowBlur = 30;
    ctx.fillStyle = '#ffe6a6';
    ctx.beginPath();
    ctx.arc(44, 54, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  // マント
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(130, 118);
  ctx.bezierCurveTo(196, 118, 214, 210, 224, 328);
  ctx.quadraticCurveTo(130, 342, 36, 328);
  ctx.bezierCurveTo(46, 210, 64, 118, 130, 118);
  ctx.fill();
  // フード
  ctx.beginPath();
  ctx.ellipse(130, 92, 56, 62, 0, 0, Math.PI * 2);
  ctx.fill();
  if (pid === 'p1') {
    ctx.beginPath();
    ctx.moveTo(150, 40);
    ctx.quadraticCurveTo(200, 30, 216, 54);
    ctx.quadraticCurveTo(186, 52, 168, 70);
    ctx.closePath();
    ctx.fill();
  } else {
    for (const ex of [88, 172]) {
      ctx.beginPath();
      ctx.ellipse(ex, 46, 14, 22, ex < 130 ? -0.5 : 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // 折り目
  ctx.strokeStyle = dark;
  ctx.lineWidth = 5;
  ctx.globalAlpha = 0.6;
  ctx.beginPath();
  ctx.moveTo(100, 172);
  ctx.quadraticCurveTo(92, 250, 80, 320);
  ctx.moveTo(152, 176);
  ctx.quadraticCurveTo(160, 260, 168, 322);
  ctx.stroke();
  // 縁の光
  ctx.strokeStyle = light;
  ctx.lineWidth = 4;
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  ctx.arc(130, 92, 56, -1.2, 0.5);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(196, 152);
  ctx.bezierCurveTo(210, 210, 216, 260, 222, 322);
  ctx.stroke();
  ctx.globalAlpha = 1;
  // マフラー
  ctx.fillStyle = pid === 'p1' ? '#dcd4ff' : '#ffe2b8';
  ctx.beginPath();
  ctx.moveTo(84, 138);
  ctx.quadraticCurveTo(130, 158, 178, 138);
  ctx.lineTo(176, 157);
  ctx.quadraticCurveTo(130, 177, 86, 157);
  ctx.closePath();
  ctx.fill();
  if (pid === 'p1') {
    ctx.beginPath();
    ctx.moveTo(92, 150);
    ctx.quadraticCurveTo(52, 166, 26, 146);
    ctx.lineTo(36, 170);
    ctx.quadraticCurveTo(70, 186, 100, 160);
    ctx.closePath();
    ctx.fill();
  }
}

function drawShadow(ctx, w, h) {
  const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
  g.addColorStop(0, 'rgba(10, 20, 8, 0.45)');
  g.addColorStop(1, 'rgba(10, 20, 8, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

function drawWyvern(ctx) {
  const path = catmull([[96, 148], [160, 170], [222, 205], [244, 262], [228, 322], [250, 372], [318, 388], [372, 350], [372, 292], [332, 280], [318, 312]], 14);
  const n = path.length;
  const radius = (t) => {
    if (t < 0.12) return 20 + (t / 0.12) * 10;
    if (t < 0.42) return 30 + Math.sin(((t - 0.12) / 0.3) * Math.PI) * 6;
    return Math.max(4, 30 * (1 - (t - 0.42) / 0.58) ** 1.2 + 3);
  };
  // 背のトゲ
  ctx.fillStyle = '#4a4031';
  for (let i = 8; i < n * 0.62; i += 7) {
    const [x, y] = path[i];
    const [nx, ny] = path[i + 1];
    let dx = nx - x;
    let dy = ny - y;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    const r = radius(i / (n - 1));
    const bx = x + dy * r * 0.8;
    const by = y - dx * r * 0.8;
    ctx.beginPath();
    ctx.moveTo(bx - dx * 8, by - dy * 8);
    ctx.lineTo(bx + dy * 16, by - dx * 16);
    ctx.lineTo(bx + dx * 8, by + dy * 8);
    ctx.closePath();
    ctx.fill();
  }
  for (const ly of [
    { col: '#3b3326', grow: 4, ox: 0, oy: 0, k: 1 },
    { col: '#8f7e55', grow: 0, ox: 0, oy: 0, k: 1 },
    { col: '#b8a779', grow: 0, ox: -3, oy: 5, k: 0.45 },
  ]) {
    ctx.fillStyle = ly.col;
    path.forEach(([x, y], i) => {
      ctx.beginPath();
      ctx.arc(x + ly.ox, y + ly.oy, radius(i / (n - 1)) * ly.k + ly.grow, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  // 首飾り
  ctx.strokeStyle = '#c9a54a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(212, 226);
  ctx.quadraticCurveTo(238, 300, 226, 352);
  ctx.stroke();
  ctx.fillStyle = '#e2bf55';
  ctx.beginPath();
  ctx.ellipse(226, 366, 8, 14, 0, 0, Math.PI * 2);
  ctx.fill();
  // 頭
  ctx.save();
  ctx.translate(92, 146);
  ctx.rotate(-0.12);
  ctx.strokeStyle = '#4a4033';
  ctx.lineCap = 'round';
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.moveTo(18, -22);
  ctx.quadraticCurveTo(48, -52, 80, -46);
  ctx.stroke();
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(4, -26);
  ctx.quadraticCurveTo(24, -64, 56, -72);
  ctx.stroke();
  ctx.fillStyle = '#3b3326';
  ctx.beginPath();
  ctx.ellipse(0, 0, 50, 33, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#8f7e55';
  ctx.beginPath();
  ctx.ellipse(0, 0, 46, 29, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-30, -15);
  ctx.quadraticCurveTo(-74, -6, -84, 10);
  ctx.quadraticCurveTo(-60, 23, -24, 20);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#3b3326';
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-80, 10);
  ctx.quadraticCurveTo(-48, 15, -16, 10);
  ctx.stroke();
  // 目元の仮面
  ctx.fillStyle = '#2a2622';
  rr(ctx, -42, -19, 66, 23, 11);
  ctx.fill();
  for (const ex of [-27, 5]) {
    ctx.fillStyle = '#f4f1e6';
    ctx.beginPath();
    ctx.arc(ex, -7.5, 7.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1a1714';
    ctx.beginPath();
    ctx.arc(ex - 1.5, -7.5, 3.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawWing(ctx, w, h, shade) {
  const S = [24, 196];
  const wrist = [150, 44];
  const tip = [330, 14];
  const ends = [[322, 118], [256, 168], [176, 192]];
  ctx.fillStyle = shade;
  ctx.beginPath();
  ctx.moveTo(...S);
  ctx.quadraticCurveTo(70, 80, ...wrist);
  ctx.quadraticCurveTo(240, 10, ...tip);
  ctx.quadraticCurveTo(300, 70, ...ends[0]);
  ctx.quadraticCurveTo(270, 132, ...ends[1]);
  ctx.quadraticCurveTo(204, 160, ...ends[2]);
  ctx.quadraticCurveTo(100, 172, ...S);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(150, 150, 162, 0.75)';
  ctx.lineCap = 'round';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(...S);
  ctx.quadraticCurveTo(70, 80, ...wrist);
  ctx.quadraticCurveTo(240, 10, ...tip);
  ctx.stroke();
  ctx.lineWidth = 2.5;
  for (const e of ends) {
    ctx.beginPath();
    ctx.moveTo(...wrist);
    ctx.lineTo(...e);
    ctx.stroke();
  }
  ctx.fillStyle = '#d8d0b8';
  ctx.beginPath();
  ctx.moveTo(150, 44);
  ctx.lineTo(138, 22);
  ctx.lineTo(160, 36);
  ctx.closePath();
  ctx.fill();
}

function drawLantern(ctx) {
  ctx.strokeStyle = '#2b2622';
  ctx.fillStyle = '#2b2622';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(45, 8, 5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(45, 13);
  ctx.lineTo(45, 30);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(30, 42);
  ctx.lineTo(60, 42);
  ctx.lineTo(52, 30);
  ctx.lineTo(38, 30);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(160, 225, 255, 0.28)';
  ctx.fillRect(28, 42, 34, 50);
  ctx.save();
  ctx.shadowColor = '#5ccfff';
  ctx.shadowBlur = 18;
  const g = ctx.createLinearGradient(0, 52, 0, 88);
  g.addColorStop(0, '#e8fbff');
  g.addColorStop(1, '#3aa8ff');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(45, 50);
  ctx.quadraticCurveTo(58, 72, 45, 86);
  ctx.quadraticCurveTo(32, 72, 45, 50);
  ctx.fill();
  ctx.restore();
  ctx.strokeRect(28, 42, 34, 50);
  ctx.beginPath();
  ctx.moveTo(28, 67);
  ctx.lineTo(34, 67);
  ctx.moveTo(56, 67);
  ctx.lineTo(62, 67);
  ctx.stroke();
  ctx.fillStyle = '#2b2622';
  ctx.beginPath();
  ctx.moveTo(26, 92);
  ctx.lineTo(64, 92);
  ctx.lineTo(56, 102);
  ctx.lineTo(34, 102);
  ctx.closePath();
  ctx.fill();
}

function drawBird(ctx, cx, cy, s, color) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s, s);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(0, 0, 26, 14, -0.25, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(-24, -12, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-32, -15);
  ctx.lineTo(-47, -8);
  ctx.lineTo(-31, -6);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-8, -6);
  ctx.quadraticCurveTo(6, -46, 42, -52);
  ctx.quadraticCurveTo(27, -32, 31, -18);
  ctx.quadraticCurveTo(15, -16, 10, -2);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(20, 4);
  ctx.lineTo(48, 17);
  ctx.lineTo(41, 2);
  ctx.lineTo(50, -5);
  ctx.lineTo(22, -5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// ------------------------------------------------------------------ 描画: カード

function drawIcon(ctx, type, cx, cy, s, color) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s, s);
  ctx.fillStyle = color;
  const arrow = () => {
    ctx.beginPath();
    ctx.moveTo(0, -18);
    ctx.lineTo(13, -3);
    ctx.lineTo(5, -3);
    ctx.lineTo(5, 16);
    ctx.lineTo(-5, 16);
    ctx.lineTo(-5, -3);
    ctx.lineTo(-13, -3);
    ctx.closePath();
    ctx.fill();
  };
  if (type === 'attack') {
    ctx.rotate(-Math.PI / 4);
    ctx.beginPath();
    ctx.moveTo(0, -26);
    ctx.lineTo(6, -17);
    ctx.lineTo(6, 9);
    ctx.lineTo(-6, 9);
    ctx.lineTo(-6, -17);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(-14, 9, 28, 6);
    ctx.fillRect(-3.5, 15, 7, 11);
    ctx.beginPath();
    ctx.arc(0, 28, 4.5, 0, Math.PI * 2);
    ctx.fill();
  } else if (type === 'parry') {
    ctx.beginPath();
    ctx.moveTo(0, -24);
    ctx.lineTo(20, -16);
    ctx.quadraticCurveTo(20, 13, 0, 26);
    ctx.quadraticCurveTo(-20, 13, -20, -16);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.moveTo(0, -17);
    ctx.lineTo(0, 18);
    ctx.quadraticCurveTo(-13, 10, -13, -12);
    ctx.closePath();
    ctx.fill();
  } else if (type === 'buff') {
    ctx.save();
    ctx.translate(-11, 5);
    ctx.scale(0.8, 0.8);
    arrow();
    ctx.restore();
    ctx.save();
    ctx.translate(10, -3);
    arrow();
    ctx.restore();
  } else {
    ctx.rotate(Math.PI);
    ctx.save();
    ctx.translate(-11, 5);
    ctx.scale(0.8, 0.8);
    arrow();
    ctx.restore();
    ctx.save();
    ctx.translate(10, -3);
    arrow();
    ctx.restore();
  }
  ctx.restore();
}

function drawChain(ctx, cx, cy, color) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.6);
  ctx.strokeStyle = color;
  ctx.lineWidth = 3.5;
  rr(ctx, -15, -6, 17, 12, 6);
  ctx.stroke();
  rr(ctx, -2, -6, 17, 12, 6);
  ctx.stroke();
  ctx.restore();
}

function drawCard(ctx, w, h, card, o) {
  if (!card) {
    rr(ctx, 6, 6, w - 12, h - 12, 12);
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fill();
    ctx.setLineDash([6, 6]);
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 2;
    ctx.stroke();
    return;
  }
  const typeCol = C[card.type];
  rr(ctx, 2, 2, w - 4, h - 4, 14);
  ctx.fillStyle = card.combo ? C.gold : PCOL[card.owner];
  ctx.fill();
  rr(ctx, 8, 8, w - 16, h - 16, 10);
  ctx.fillStyle = C.cream;
  ctx.fill();
  ctx.save();
  rr(ctx, 8, 8, w - 16, h - 16, 10);
  ctx.clip();
  ctx.fillStyle = typeCol;
  ctx.fillRect(8, 8, w - 16, 42);
  ctx.fillStyle = mix(typeCol, '#ffffff', 0.72);
  ctx.fillRect(8, 50, w - 16, 58);
  ctx.strokeStyle = mix(typeCol, '#ffffff', 0.6);
  ctx.lineWidth = 6;
  for (let x = -40; x < w + 40; x += 18) {
    ctx.beginPath();
    ctx.moveTo(x, 108);
    ctx.lineTo(x + 58, 50);
    ctx.stroke();
  }
  ctx.restore();
  drawIcon(ctx, card.type, w / 2, 79, 1, mix(typeCol, '#000000', 0.12));
  if (card.combo) drawChain(ctx, w - 28, 92, '#9a6f08');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  let fs = 20;
  ctx.font = font(fs);
  while (ctx.measureText(card.name).width > w - 64 && fs > 12) ctx.font = font(--fs);
  ctx.fillText(card.name, w / 2 + 13, 30);
  // コスト
  ctx.beginPath();
  ctx.arc(25, 25, 19, 0, Math.PI * 2);
  ctx.fillStyle = o.affordable ? '#13222c' : '#4a1c1c';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = o.affordable ? C.mana : '#ff8080';
  ctx.stroke();
  ctx.fillStyle = o.affordable ? C.mana : '#ffa0a0';
  ctx.font = font(22);
  ctx.fillText(String(card.cost), 25, 26);
  // 種別
  const label = TYPE_LABEL[card.type] + (card.combo ? '・連携' : '');
  ctx.font = font(12);
  const lw = ctx.measureText(label).width + 18;
  rr(ctx, w / 2 - lw / 2, 100, lw, 21, 10.5);
  ctx.fillStyle = card.combo ? C.gold : typeCol;
  ctx.fill();
  ctx.fillStyle = card.combo ? '#3a2a00' : '#ffffff';
  ctx.fillText(label, w / 2, 111);
  // 効果文
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = font(13, 500);
  ctx.fillStyle = C.ink;
  let y = 142;
  for (const line of wrapLines(ctx, card.text, w - 26)) {
    ctx.fillText(line, 13, y);
    y += 17;
  }
  if (card.comboText) {
    ctx.font = font(12);
    ctx.fillStyle = '#8a5d00';
    for (const line of wrapLines(ctx, `連携：${card.comboText}`, w - 26)) {
      ctx.fillText(line, 13, y + 3);
      y += 15;
    }
  }
  if (!o.affordable || o.inactive) {
    rr(ctx, 2, 2, w - 4, h - 4, 14);
    ctx.fillStyle = o.inactive ? 'rgba(16, 14, 24, 0.42)' : 'rgba(16, 14, 24, 0.5)';
    ctx.fill();
  }
  if (o.comboHint) {
    rr(ctx, 3, 3, w - 6, h - 6, 14);
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#ffe07a';
    ctx.stroke();
  }
}

// 場に並べる小さいカード。効果文は省き、名前と種別だけを読める大きさで出す
function drawMiniCard(ctx, w, h, card) {
  const typeCol = C[card.type];
  rr(ctx, 1, 1, w - 2, h - 2, 9);
  ctx.fillStyle = card.combo ? C.gold : PCOL[card.owner];
  ctx.fill();
  rr(ctx, 5, 5, w - 10, h - 10, 6);
  ctx.fillStyle = C.cream;
  ctx.fill();
  ctx.save();
  rr(ctx, 5, 5, w - 10, h - 10, 6);
  ctx.clip();
  ctx.fillStyle = typeCol;
  ctx.fillRect(5, 5, w - 10, 30);
  ctx.fillStyle = mix(typeCol, '#ffffff', 0.72);
  ctx.fillRect(5, 35, w - 10, 50);
  ctx.restore();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  let fs = 15;
  ctx.font = font(fs);
  while (ctx.measureText(card.name).width > w - 14 && fs > 10) ctx.font = font(--fs);
  ctx.fillText(card.name, w / 2, 21);
  drawIcon(ctx, card.type, w / 2, 60, 0.85, mix(typeCol, '#000000', 0.12));
  if (card.combo) drawChain(ctx, w - 18, 76, '#9a6f08');
  const label = TYPE_LABEL[card.type] + (card.combo ? '・連携' : '');
  ctx.font = font(12);
  const lw = ctx.measureText(label).width + 14;
  rr(ctx, w / 2 - lw / 2, 92, lw, 20, 10);
  ctx.fillStyle = card.combo ? C.gold : typeCol;
  ctx.fill();
  ctx.fillStyle = card.combo ? '#3a2a00' : '#ffffff';
  ctx.fillText(label, w / 2, 102.5);
}

function drawCardGlow(ctx, w, h, color) {
  ctx.shadowColor = color;
  ctx.shadowBlur = 26;
  ctx.fillStyle = color;
  rr(ctx, 25, 25, w - 50, h - 50, 16);
  ctx.fill();
  ctx.fill();
}

function drawCardBack(ctx, w, h) {
  rr(ctx, 2, 2, w - 4, h - 4, 10);
  ctx.fillStyle = '#5e4a2a';
  ctx.fill();
  rr(ctx, 7, 7, w - 14, h - 14, 7);
  ctx.fillStyle = '#c4ad74';
  ctx.fill();
  rr(ctx, 13, 13, w - 26, h - 26, 5);
  ctx.fillStyle = '#1f3442';
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = 'rgba(236, 189, 66, 0.16)';
  ctx.lineWidth = 1.5;
  for (let i = -h; i < w + h; i += 14) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + h, h);
    ctx.moveTo(i + h, 0);
    ctx.lineTo(i, h);
    ctx.stroke();
  }
  ctx.restore();
  drawBird(ctx, w / 2 + 3, h / 2 + 8, 1.0, '#e9d9a6');
  ctx.strokeStyle = 'rgba(236, 189, 66, 0.75)';
  ctx.lineWidth = 2;
  rr(ctx, 19, 19, w - 38, h - 38, 4);
  ctx.stroke();
}

function drawEnemyIcon(ctx, card, cx, cy) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = 'rgba(255,255,255,0.92)';
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.lineCap = 'round';
  if (card.id.startsWith('claw') || card.id === 'bite') {
    ctx.lineWidth = 9;
    for (const dx of [-26, 0, 26]) {
      ctx.beginPath();
      ctx.moveTo(dx - 16, -40);
      ctx.quadraticCurveTo(dx + 10, -4, dx - 6, 42);
      ctx.stroke();
    }
  } else if (card.id === 'tail') {
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(0, 30, 62, Math.PI * 1.1, Math.PI * 1.9);
    ctx.stroke();
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(0, 30, 44, Math.PI * 1.2, Math.PI * 1.8);
    ctx.stroke();
  } else if (card.id === 'flame') {
    ctx.fillStyle = '#9fe2ff';
    ctx.beginPath();
    ctx.moveTo(0, -48);
    ctx.quadraticCurveTo(40, 0, 18, 40);
    ctx.quadraticCurveTo(0, 52, -18, 40);
    ctx.quadraticCurveTo(-40, 0, 0, -48);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -10);
    ctx.quadraticCurveTo(16, 14, 8, 32);
    ctx.quadraticCurveTo(0, 38, -8, 32);
    ctx.quadraticCurveTo(-16, 14, 0, -10);
    ctx.fill();
  } else if (card.id === 'wing') {
    ctx.translate(-64, -48);
    ctx.scale(0.4, 0.45);
    drawWing(ctx, 340, 220, 'rgba(255,255,255,0.92)');
  } else {
    ctx.lineWidth = 7;
    for (const r of [18, 36, 54]) {
      ctx.beginPath();
      ctx.arc(-40, 0, r, -0.7, 0.7);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(-46, 0, 10, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawEnemyCard(ctx, w, h, card, dmg) {
  const normal = card.kind === 'normal';
  const col = normal ? '#9b2c34' : '#4e2c78';
  rr(ctx, 3, 3, w - 6, h - 6, 18);
  ctx.fillStyle = '#1c1a20';
  ctx.fill();
  rr(ctx, 10, 10, w - 20, h - 20, 12);
  ctx.fillStyle = col;
  ctx.fill();
  ctx.save();
  ctx.clip();
  const g = ctx.createRadialGradient(w / 2, 130, 10, w / 2, 130, 160);
  g.addColorStop(0, 'rgba(255,255,255,0.18)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
  rr(ctx, 22, 22, w - 44, 34, 17);
  ctx.fillStyle = 'rgba(0,0,0,0.32)';
  ctx.fill();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = normal ? '#ffd0d0' : '#e5d4ff';
  ctx.font = font(16);
  ctx.fillText(normal ? '通常攻撃・パリィ可' : '特殊・パリィ不可', w / 2, 40);
  drawEnemyIcon(ctx, card, w / 2, 130);
  ctx.fillStyle = '#ffffff';
  ctx.font = font(36);
  ctx.fillText(card.name, w / 2, 220);
  ctx.font = font(20, 500);
  ctx.fillStyle = '#f6eee0';
  wrapLines(ctx, describeEnemyCard(card, dmg), w - 40).forEach((line, i) => ctx.fillText(line, w / 2, 264 + i * 27));
}

// ------------------------------------------------------------------ 描画: UI

function drawHeader(ctx, w) {
  ctx.fillStyle = C.teal;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(w, 0);
  ctx.lineTo(w, 66);
  ctx.lineTo(1540, 66);
  ctx.lineTo(1500, 106);
  ctx.lineTo(420, 106);
  ctx.lineTo(380, 66);
  ctx.lineTo(0, 66);
  ctx.closePath();
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = C.tealDark;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, 56);
  ctx.lineTo(380, 56);
  ctx.moveTo(1540, 56);
  ctx.lineTo(w, 56);
  ctx.stroke();
}

function drawTurnBadge(ctx, w, h, turn) {
  ctx.beginPath();
  ctx.arc(w / 2, 0, 112, 0, Math.PI);
  ctx.closePath();
  ctx.fillStyle = C.tealDark;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(w / 2, 0, 102, 0, Math.PI);
  ctx.closePath();
  ctx.fillStyle = '#3fa3bb';
  ctx.fill();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#e8fbff';
  ctx.font = font(18);
  ctx.fillText('TURN', w / 2, 30);
  ctx.font = font(50);
  ctx.fillText(turn ? String(turn) : '-', w / 2, 74);
}

function drawGear(ctx, w, h) {
  const cx = w / 2;
  const cy = h / 2;
  ctx.beginPath();
  ctx.arc(cx, cy, 40, 0, Math.PI * 2);
  ctx.fillStyle = C.tealDark;
  ctx.fill();
  ctx.fillStyle = '#bfe9f2';
  ctx.beginPath();
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const r = i % 2 ? 22 : 29;
    ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy, 10, 0, Math.PI * 2);
  ctx.fillStyle = C.tealDark;
  ctx.fill();
}

function drawPill(ctx, w, h, text, { bg = 'rgba(10, 30, 36, 0.72)', color = '#ffffff', size = 20 } = {}) {
  if (!text) return;
  ctx.font = font(size);
  const tw = Math.min(w - 4, ctx.measureText(text).width + 40);
  rr(ctx, (w - tw) / 2, 2, tw, h - 4, (h - 4) / 2);
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, h / 2 + 1);
}

function drawShield(ctx, cx, cy, s, value) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s, s);
  ctx.beginPath();
  ctx.moveTo(0, -20);
  ctx.lineTo(17, -13);
  ctx.quadraticCurveTo(17, 11, 0, 22);
  ctx.quadraticCurveTo(-17, 11, -17, -13);
  ctx.closePath();
  ctx.fillStyle = value > 0 ? '#3b76c6' : 'rgba(20, 24, 34, 0.55)';
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = value > 0 ? '#cfe2ff' : 'rgba(255,255,255,0.25)';
  ctx.stroke();
  if (value > 0) {
    ctx.fillStyle = '#ffffff';
    ctx.font = font(value >= 10 ? 15 : 18);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(value), 0, 1);
  }
  ctx.restore();
}

function drawChips(ctx, chips, x, y, maxW) {
  ctx.font = font(14);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  let cx = x;
  for (const [text, bg] of chips) {
    const tw = ctx.measureText(text).width + 16;
    if (cx + tw > maxW) break;
    rr(ctx, cx, y, tw, 24, 12);
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.fillStyle = bg === C.gold ? '#3a2a00' : '#ffffff';
    ctx.fillText(text, cx + 8, y + 12.5);
    cx += tw + 6;
  }
}

const fmt = (v) => String(Math.round(v * 100) / 100);

function drawHpBar(ctx, x, y, w, h, hp, maxHp, color, label = '') {
  rr(ctx, x, y, w, h, h / 2);
  ctx.fillStyle = 'rgba(16, 14, 26, 0.78)';
  ctx.fill();
  const ratio = Math.max(0, hp / maxHp);
  if (ratio > 0) {
    rr(ctx, x + 3, y + 3, Math.max(h - 6, (w - 6) * ratio), h - 6, (h - 6) / 2);
    ctx.fillStyle = color;
    ctx.fill();
  }
  ctx.fillStyle = '#ffffff';
  ctx.font = font(h * 0.56);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${label ? `${label}　` : ''}${hp} / ${maxHp}`, x + w / 2, y + h / 2 + 1);
}

function drawCharPanel(ctx, w, h, pid, d, p, game) {
  drawHpBar(ctx, 36, 4, w - 40, 32, d.hp, p.maxHp, PCOL[pid], LABEL[pid]);
  drawShield(ctx, 18, 20, 0.95, d.block);
  const chips = [];
  // 幅に収まらない分は落ちるので、重要なものから並べる
  if (d.hp <= 0) chips.push(['戦闘不能', '#555555']);
  if (game.comboParry && d.hp > 0) chips.push(['連携パリィ待ち', C.gold]);
  if (p.armed.length) chips.push([p.armed.length > 1 ? `構え×${p.armed.length}` : '構え', C.parry]);
  if (pid === 'p1' && p.nextMult !== 1) chips.push([`攻撃×${fmt(p.nextMult)}`, C.buff]);
  if (pid === 'p1' && p.nextBonus) chips.push([`次の攻撃+${p.nextBonus}`, C.buff]);
  if (p.manaNext) chips.push([`次マナ+${p.manaNext}`, '#1f7f8c']);
  drawChips(ctx, chips, 2, 46, w);
}

// 場: 段ごとにそのプレイヤーの色で枠を描き、間に連携の成立状況を出す（カード本体は別メッシュ）
function drawField(ctx, w, h, st, phase) {
  const tag = FIELD.tag;
  for (const pid of PIDS) {
    const y = FIELD.rows[pid] - FIELD.top - 70;
    rr(ctx, 1, y + 1, w - 2, 138, 14);
    ctx.fillStyle = 'rgba(12, 16, 24, 0.72)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = PLIGHT[pid];
    ctx.stroke();
    rr(ctx, 1, y + 1, tag, 138, [14, 0, 0, 14]);
    ctx.fillStyle = PCOL[pid];
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = font(16);
    ctx.fillText(LABEL[pid], tag / 2 + 1, y + 58);
    ctx.font = font(13);
    ctx.fillText('場', tag / 2 + 1, y + 82);
    if (phase === 'player' && st.empty[pid]) {
      ctx.font = font(14, 500);
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillText('出したカードがここに並ぶ', tag + (w - tag) / 2, y + 70);
    }
  }
  const has = PIDS.filter((pid) => st.combo[pid]);
  if (!has.length) return;
  let text;
  if (has.length === 2) text = st.comboParry ? '連携成立（パリィ2人成功で発動）' : '連携成立！ ターン終了で発動';
  else text = `連携待ち：${LABEL[PIDS.find((pid) => !st.combo[pid])]}も金枠を出すと成立`;
  ctx.save();
  ctx.translate(0, FIELD.rows.p1 - FIELD.top + 76);
  drawPill(ctx, w, 32, text, {
    bg: has.length === 2 ? C.gold : 'rgba(40, 32, 10, 0.88)', color: has.length === 2 ? '#3a2a00' : C.gold, size: 15,
  });
  ctx.restore();
}

function fieldState(game) {
  const st = { empty: {}, combo: {}, comboParry: false };
  for (const pid of PIDS) {
    const q = game.players[pid].queued;
    st.empty[pid] = !q.length;
    st.combo[pid] = q.some((c) => c.combo);
    if (q.some((c) => c.combo && c.type === 'parry')) st.comboParry = true;
  }
  return st;
}

function drawEnemyPanel(ctx, w, h, d, e) {
  ctx.font = font(20);
  const nw = ctx.measureText(e.name).width + 44;
  rr(ctx, (w - nw) / 2, 0, nw, 34, 17);
  ctx.fillStyle = '#f6f4ef';
  ctx.fill();
  ctx.fillStyle = '#2a2a2a';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(e.name, w / 2, 18);
  drawHpBar(ctx, 40, 42, w - 44, 32, d.hp, e.maxHp, C.teal);
  drawShield(ctx, 20, 58, 0.95, d.block);
  const chips = [];
  if (e.frenzy) chips.push(['激昂', '#c4473b']);
  if (e.strength) chips.push([`咆哮 攻撃+${e.strength}`, '#9b2c34']);
  if (e.weak) chips.push([`弱体 -${e.weak.amount}（${e.weak.turns}）`, C.debuff]);
  if (e.vuln) chips.push([`脆弱 +${e.vuln.amount}（${e.vuln.turns}）`, C.debuff]);
  drawChips(ctx, chips, 40, 82, w);
}

function drawPanel(ctx, w, h, pid, p, game, phase) {
  const mirror = pid === 'p2';
  ctx.save();
  if (mirror) {
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
  }
  ctx.beginPath();
  ctx.moveTo(0, 8);
  ctx.lineTo(w - 78, 8);
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.fillStyle = PCOL[pid];
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = PDARK[pid];
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, 15);
  ctx.lineTo(w - 76, 15);
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.restore();

  const x0 = mirror ? 96 : 24;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff';
  ctx.font = font(30);
  ctx.fillText(LABEL[pid], x0, 47);
  ctx.font = font(20);
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillText(ROLE[pid], x0 + 50, 49);
  // 準備状態
  let st;
  let stCol;
  if (p.hp <= 0) [st, stCol] = ['戦闘不能', '#555555'];
  else if (phase !== 'player') [st, stCol] = ['待機中', 'rgba(0,0,0,0.3)'];
  else if (p.ready) [st, stCol] = ['✓ 準備完了', '#2f9e5a'];
  else [st, stCol] = [`${KEYS[pid].end}：ターン終了`, 'rgba(0,0,0,0.35)'];
  ctx.font = font(17);
  const sw = ctx.measureText(st).width + 26;
  const sx = x0 + 340 - sw;
  rr(ctx, sx, 31, sw, 34, 17);
  ctx.fillStyle = stCol;
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.fillText(st, sx + 13, 49);
  // マナ
  const { cap, mana } = p;
  const next = game.nextCap(pid);
  ctx.beginPath();
  ctx.arc(x0 + 34, 140, 34, 0, Math.PI * 2);
  ctx.fillStyle = '#0e0f12';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = C.mana;
  ctx.stroke();
  ctx.fillStyle = mana > cap ? C.gold : '#ffffff';
  ctx.font = font(38);
  ctx.textAlign = 'center';
  ctx.fillText(String(mana), x0 + 34, 143);
  ctx.textAlign = 'left';
  ctx.font = font(16);
  ctx.fillStyle = C.mana;
  ctx.fillText('MANA', x0 + 84, 104);
  const arrow = next > cap ? ' ▲' : next < cap ? ' ▼' : '';
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.font = font(16, 500);
  ctx.fillText(`上限 ${cap}　次ターン ${next}${arrow}${p.manaNext ? `＋${p.manaNext}` : ''}`, x0 + 148, 104);
  const slots = Math.max(10, mana);
  for (let i = 0; i < slots; i++) {
    const x = x0 + 84 + i * 26;
    const y = 122;
    rr(ctx, x, y, 22, 36, 6);
    if (i < mana) {
      ctx.fillStyle = i < cap ? C.mana : C.gold;
      ctx.fill();
    } else if (i < cap) {
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(102,228,243,0.6)';
      ctx.lineWidth = 2;
      ctx.stroke();
    } else {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fill();
    }
    if (next > cap && i === cap) {
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = '#b8ffcf';
      ctx.lineWidth = 2;
      rr(ctx, x, y, 22, 36, 6);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (next < cap && i === cap - 1) {
      ctx.fillStyle = '#ff8080';
      ctx.beginPath();
      ctx.moveTo(x + 4, y - 9);
      ctx.lineTo(x + 18, y - 9);
      ctx.lineTo(x + 11, y - 2);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.font = font(15, 500);
  ctx.fillStyle = 'rgba(255,255,255,0.82)';
  const k = KEYS[pid];
  ctx.fillText(`${k.move} 選択　${k.use} 出す　${k.reroll} 引き直し　${k.end} 終了`, x0, 214);
}

function drawTrash(ctx, w, h, pid) {
  ctx.beginPath();
  ctx.arc(55, 56, 42, 0, Math.PI * 2);
  ctx.fillStyle = '#f4f1ea';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(55, 56, 35, 0, Math.PI * 2);
  ctx.fillStyle = PCOL[pid];
  ctx.fill();
  ctx.fillStyle = '#f4f1ea';
  rr(ctx, 41, 46, 28, 29, 4);
  ctx.fill();
  ctx.fillRect(37, 38, 36, 5);
  ctx.fillRect(49, 33, 12, 5);
  ctx.fillStyle = PCOL[pid];
  for (const x of [46.5, 53.5, 60.5]) ctx.fillRect(x, 50, 3, 21);
  ctx.beginPath();
  ctx.arc(91, 20, 15, 0, Math.PI * 2);
  ctx.fillStyle = '#0e0f12';
  ctx.fill();
  ctx.strokeStyle = C.mana;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = C.mana;
  ctx.font = font(16);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(RULES.rerollCost), 91, 21);
  ctx.fillStyle = '#ffffff';
  ctx.font = font(14);
  ctx.fillText(`${KEYS[pid].reroll} 引き直し`, 55, 108);
}

function drawLog(ctx, w, h, lines) {
  rr(ctx, 0, 0, w, h, 14);
  ctx.fillStyle = 'rgba(12, 20, 24, 0.55)';
  ctx.fill();
  ctx.font = font(13);
  ctx.fillStyle = 'rgba(180, 220, 228, 0.8)';
  ctx.textBaseline = 'middle';
  ctx.fillText('BATTLE LOG', 16, 18);
  ctx.font = font(15, 500);
  lines.slice(-7).forEach((line, i, arr) => {
    ctx.fillStyle = `rgba(255,255,255,${0.45 + (0.55 * (i + 1)) / arr.length})`;
    ctx.fillText(line, 16, 44 + i * 21);
  });
}

function drawCenterText(ctx, w, h, text, color, size, sub) {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.font = font(size);
  ctx.lineWidth = Math.max(4, size / 7);
  ctx.strokeStyle = 'rgba(16, 12, 22, 0.9)';
  const y = sub ? h / 2 - size * 0.32 : h / 2;
  ctx.strokeText(text, w / 2, y);
  ctx.fillStyle = color;
  ctx.fillText(text, w / 2, y);
  if (sub) {
    ctx.font = font(size * 0.4, 800);
    ctx.lineWidth = 6;
    ctx.strokeText(sub, w / 2, y + size * 0.82);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(sub, w / 2, y + size * 0.82);
  }
}

function drawBanner(ctx, w, h, text, sub, color) {
  const g = ctx.createLinearGradient(0, 0, w, 0);
  g.addColorStop(0, 'rgba(10, 14, 20, 0)');
  g.addColorStop(0.2, 'rgba(10, 14, 20, 0.78)');
  g.addColorStop(0.8, 'rgba(10, 14, 20, 0.78)');
  g.addColorStop(1, 'rgba(10, 14, 20, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 30, w, h - 60);
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.85;
  ctx.fillRect(w * 0.15, 30, w * 0.7, 3);
  ctx.fillRect(w * 0.15, h - 33, w * 0.7, 3);
  ctx.globalAlpha = 1;
  drawCenterText(ctx, w, h, text, color, 76, sub);
}

function drawRing(ctx, w, h, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 10;
  ctx.shadowColor = color;
  ctx.shadowBlur = 16;
  ctx.beginPath();
  ctx.arc(w / 2, h / 2, w / 2 - 20, 0, Math.PI * 2);
  ctx.stroke();
}

function drawSlash(ctx, w, h) {
  ctx.strokeStyle = '#ffffff';
  ctx.lineCap = 'round';
  ctx.shadowColor = '#ffe9c2';
  ctx.shadowBlur = 12;
  for (const [o, lw] of [[-36, 7], [0, 10], [36, 7]]) {
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.moveTo(30 + o, 40);
    ctx.quadraticCurveTo(w / 2 + o + 30, h / 2, w - 50 + o, h - 30);
    ctx.stroke();
  }
}

function drawParryBand(ctx, w, h, active) {
  ctx.fillStyle = 'rgba(22, 30, 26, 0.92)';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.fillRect(0, 0, w, 4);
  ctx.fillRect(0, h - 4, w, 4);
  const cy = TRACK.top - 100;
  const { x0, x1 } = TRACK;
  const half = (x1 - x0) / 2;
  const cx = (x0 + x1) / 2;
  rr(ctx, x0 - 34, cy - 28, x1 - x0 + 68, 56, 28);
  ctx.fillStyle = '#2c2c2c';
  ctx.fill();
  rr(ctx, x0, cy - 19, x1 - x0, 38, 19);
  ctx.fillStyle = '#9a8070';
  ctx.fill();
  const sz = half * (1 - RULES.parry.successAcc);
  rr(ctx, cx - sz, cy - 14, sz * 2, 28, 14);
  ctx.fillStyle = '#d9686d';
  ctx.fill();
  const pz = half * (1 - RULES.parry.perfectAcc);
  rr(ctx, cx - pz, cy - 9, pz * 2, 18, 9);
  ctx.fillStyle = '#ffb3b6';
  ctx.fill();
  for (const [pid, x] of [['p1', 120], ['p2', w - 120]]) {
    ctx.globalAlpha = active.includes(pid) ? 1 : 0.25;
    ctx.beginPath();
    ctx.arc(x, cy, 54, 0, Math.PI * 2);
    ctx.fillStyle = pid === 'p1' ? '#7a45d0' : '#c86a38';
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = font(30);
    ctx.fillText(LABEL[pid], x, cy - 9);
    ctx.font = font(15);
    ctx.fillText(KEYS[pid].use, x, cy + 20);
    ctx.globalAlpha = 1;
  }
}

function drawMarker(ctx, w, h, color) {
  ctx.shadowColor = color;
  ctx.shadowBlur = 12;
  rr(ctx, w / 2 - 8, 6, 16, h - 12, 8);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.lineWidth = 3;
  ctx.strokeStyle = color;
  ctx.stroke();
}

function drawRoleBox(ctx, x, y, pid, ready) {
  const w = 460;
  const h = 300;
  rr(ctx, x, y, w, h, 18);
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fill();
  ctx.lineWidth = ready ? 4 : 2;
  ctx.strokeStyle = ready ? '#8ef0b0' : PLIGHT[pid];
  ctx.stroke();
  rr(ctx, x, y, w, 64, [18, 18, 0, 0]);
  ctx.fillStyle = PCOL[pid];
  ctx.fill();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.font = font(32);
  ctx.fillText(`${LABEL[pid]}  ${ROLE[pid]}`, x + 24, y + 33);
  const k = KEYS[pid];
  [[k.move, 'カード選択'], [k.use, 'カードを出す／パリィを止める'], [k.reroll, '手札を引き直す（マナ1）'], [k.end, 'ターン終了（2人そろうと発動）']]
    .forEach(([key, desc], i) => {
      const yy = y + 100 + i * 38;
      rr(ctx, x + 24, yy - 15, 100, 30, 8);
      ctx.fillStyle = 'rgba(255,255,255,0.14)';
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = font(17);
      ctx.textAlign = 'center';
      ctx.fillText(key, x + 74, yy + 1);
      ctx.textAlign = 'left';
      ctx.font = font(19, 500);
      ctx.fillText(desc, x + 140, yy + 1);
    });
  ctx.font = font(18);
  ctx.fillStyle = PLIGHT[pid];
  ctx.fillText(pid === 'p1' ? 'マナ上限 3 → 10（毎ターン+1）' : 'マナ上限 10 → 3（毎ターン−1）', x + 24, y + 266);
  ctx.textAlign = 'right';
  ctx.font = font(20);
  ctx.fillStyle = ready ? '#8ef0b0' : 'rgba(255,255,255,0.65)';
  ctx.fillText(ready ? '準備OK ✓' : `${k.use} で準備`, x + w - 24, y + 33);
}

function drawTitle(ctx, w, h, ready) {
  ctx.fillStyle = 'rgba(8, 14, 18, 0.8)';
  ctx.fillRect(0, 0, w, h);
  drawBird(ctx, w / 2 + 8, 210, 2.6, '#e6dcff');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#f4efe2';
  ctx.font = font(96);
  ctx.fillText('BATTLE MOCK', w / 2, 360);
  ctx.font = font(30, 500);
  ctx.fillStyle = '#b9d3d8';
  ctx.fillText('2人協力・ターン制カードバトル　戦闘モック v0.2', w / 2, 428);
  ctx.font = font(22, 500);
  ctx.fillStyle = '#93abb1';
  ctx.fillText('1台のキーボードを2人で使います', w / 2, 474);
  drawRoleBox(ctx, w / 2 - 490, 530, 'p1', ready.p1);
  drawRoleBox(ctx, w / 2 + 30, 530, 'p2', ready.p2);
  ctx.textAlign = 'center';
  ctx.font = font(30);
  ctx.fillStyle = '#ffffff';
  ctx.fillText('1P は SPACE、2P は ENTER で準備 ― 2人そろうと開始', w / 2, 900);
  ctx.font = font(20, 500);
  ctx.fillStyle = '#8fa7ad';
  ctx.fillText('H または右上の歯車：ルールと操作　／　画像素材は使わず、すべてコードで描画しています', w / 2, 950);
}

function drawResult(ctx, w, h, info, ready) {
  ctx.fillStyle = 'rgba(8, 12, 16, 0.74)';
  ctx.fillRect(0, 0, w, h);
  const win = info.result === 'win';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = font(150);
  ctx.fillStyle = win ? C.gold : '#ff6b6b';
  ctx.fillText(win ? 'VICTORY' : 'DEFEAT', w / 2, 390);
  ctx.font = font(38);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(win ? `TURN ${info.turn} で翼竜を撃破` : `TURN ${info.turn} で全滅`, w / 2, 520);
  ctx.font = font(26, 500);
  ctx.fillStyle = '#b9d3d8';
  ctx.fillText(`1P HP ${info.hp1}　／　2P HP ${info.hp2}`, w / 2, 580);
  ctx.font = font(30);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(`1P：SPACE ${ready.p1 ? '✓' : '　'}　　2P：ENTER ${ready.p2 ? '✓' : '　'}　　でもう一度`, w / 2, 720);
}

function drawHelp(ctx, w, h) {
  ctx.fillStyle = 'rgba(8, 14, 18, 0.9)';
  ctx.fillRect(0, 0, w, h);
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff';
  ctx.font = font(44);
  ctx.fillText('ルールと操作', 220, 140);
  ctx.font = font(20, 500);
  ctx.fillStyle = '#8fa7ad';
  ctx.fillText('H／ESC／クリックで閉じる', 1420, 140);
  let y = 210;
  for (const [head, body] of HELP) {
    ctx.font = font(24);
    ctx.fillStyle = C.gold;
    ctx.fillText(head, 220, y);
    ctx.font = font(22, 500);
    ctx.fillStyle = '#e8eef0';
    for (const line of wrapLines(ctx, body, 1180)) {
      ctx.fillText(line, 480, y);
      y += 32;
    }
    y += 22;
  }
  y += 10;
  ctx.font = font(24);
  ctx.fillStyle = C.gold;
  ctx.fillText('操作', 220, y);
  ctx.font = font(22, 500);
  ctx.fillStyle = '#e8eef0';
  for (const pid of PIDS) {
    const k = KEYS[pid];
    ctx.fillText(`${LABEL[pid]}　${k.move}：カード選択　${k.use}：出す／パリィを止める　${k.reroll}：引き直し　${k.end}：ターン終了`, 480, y);
    y += 34;
  }
}

// ------------------------------------------------------------------ View

export class View {
  constructor(root) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x0d1114, 1);
    root.appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(0, W, H, 0, -10, 10);
    this.tweens = [];
    this.queue = [];
    this.processing = false;
    this.idleWaiters = [];
    this.time = 0;
    this.game = null;
    this.cursor = { p1: 0, p2: 0 };
    this.phase = 'title';
    this.disp = null;
    this.logLines = [];
    this.parry = null;
    this.helpOpen = false;
    this.overlayState = null;
    this.zone = { p1: [], p2: [] }; // 場に出したカードのメッシュ { card, mesh }
    this.fieldSt = null;
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  resize() {
    const s = Math.min(window.innerWidth / W, window.innerHeight / H);
    this.renderer.setSize(Math.floor(W * s), Math.floor(H * s));
  }

  async init() {
    await loadFonts();
    this.build();
    this.renderer.domElement.addEventListener('pointerdown', (e) => this.onPointer(e));
    let last = performance.now();
    const loop = (now) => {
      const dt = Math.min(50, now - last);
      last = now;
      this.update(dt);
      this.renderer.render(this.scene, this.camera);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  // 確認用: requestAnimationFrame を使わずに時間を進める（タブが非表示でも動かせる）
  async step(ms, dt = 16) {
    for (let t = 0; t < ms; t += dt) {
      this.update(dt);
      for (let i = 0; i < 30; i++) await null;
    }
    this.renderer.render(this.scene, this.camera);
  }

  // 確認用: 論理座標の矩形を切り出して PNG にする
  capture(x = 0, y = 0, w = W, h = H, outW = w) {
    this.renderer.render(this.scene, this.camera);
    const src = this.renderer.domElement;
    const k = src.width / W;
    const out = document.createElement('canvas');
    out.width = outW;
    out.height = Math.round((outW * h) / w);
    out.getContext('2d').drawImage(src, x * k, y * k, w * k, h * k, 0, 0, out.width, out.height);
    return new Promise((res) => out.toBlob(res, 'image/png'));
  }

  // ---------------- tween

  tween(target, to, ms, ease = 'out', delay = 0) {
    return new Promise((res) => {
      this.tweens.push({ target, to, ms: Math.max(1, ms), ease: EASE[ease], t: -delay, from: null, res });
    });
  }

  wait(ms) {
    return this.tween({}, {}, ms, 'linear');
  }

  killTweens(target) {
    this.tweens = this.tweens.filter((tw) => {
      if (tw.target !== target) return true;
      tw.res();
      return false;
    });
  }

  updateTweens(dt) {
    const list = this.tweens;
    for (let i = list.length - 1; i >= 0; i--) {
      const tw = list[i];
      tw.t += dt;
      if (tw.t < 0) continue;
      if (!tw.from) {
        tw.from = {};
        for (const k in tw.to) tw.from[k] = tw.target[k];
      }
      const p = Math.min(1, tw.t / tw.ms);
      const e = tw.ease(p);
      for (const k in tw.to) tw.target[k] = tw.from[k] + (tw.to[k] - tw.from[k]) * e;
      if (p >= 1) {
        list.splice(i, 1);
        tw.res();
      }
    }
  }

  // ---------------- 構築

  build() {
    const bg = canvasPlane(W, H, drawBackground, { scale: 1, layer: L.bg });
    at(bg.mesh, W / 2, H / 2);
    this.scene.add(bg.mesh);
    this.buildMotes();
    this.buildHeader();
    this.buildEnemy();
    this.buildCharacters();
    this.buildPanels();
    this.buildHands();
    this.buildField();
    this.buildParry();
    this.buildOverlays();
  }

  buildMotes() {
    const n = 48;
    const r = rng(7);
    const pos = new Float32Array(n * 3);
    this.moteSeeds = [];
    for (let i = 0; i < n; i++) this.moteSeeds.push({ x: r() * W, y: 150 + r() * 750, sp: 8 + r() * 18, ph: r() * 6.28 });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      size: 10, map: glowTexture('255,248,215'), transparent: true, opacity: 0.6,
      depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: false,
    });
    this.motes = new THREE.Points(geo, mat);
    this.motes.renderOrder = L.motes;
    this.scene.add(this.motes);
  }

  buildHeader() {
    const header = canvasPlane(W, 112, (ctx, w) => drawHeader(ctx, w), { layer: L.header });
    at(header.mesh, W / 2, 56);
    this.scene.add(header.mesh);
    this.turnBadge = canvasPlane(240, 120, (ctx, w, h) => drawTurnBadge(ctx, w, h, 0), { layer: L.header + 3 });
    at(this.turnBadge.mesh, W / 2, 60);
    this.scene.add(this.turnBadge.mesh);
    this.gear = canvasPlane(92, 92, drawGear, { layer: L.header + 3 });
    at(this.gear.mesh, 1860, 56);
    this.scene.add(this.gear.mesh);
    this.phasePill = canvasPlane(640, 44, null, { layer: L.header + 2 });
    at(this.phasePill.mesh, W / 2, 302);
    this.scene.add(this.phasePill.mesh);
    this.logPlane = canvasPlane(420, 200, (ctx, w, h) => drawLog(ctx, w, h, []), { layer: L.log });
    at(this.logPlane.mesh, 230, 196);
    this.scene.add(this.logPlane.mesh);
  }

  buildEnemy() {
    const backTex = canvasTexture(112, 156, drawCardBack, Math.max(RES, 1.5) * 2);
    this.enemySlots = [];
    for (let i = 0; i < 5; i++) {
      const m = texPlane(backTex, 112, 156, L.enemyCards);
      at(m, W / 2 + (i - 2) * 148, 196);
      m.userData.home = m.position.clone();
      this.scene.add(m);
      this.enemySlots.push(m);
    }
    this.revealCard = canvasPlane(240, 330, null, { layer: L.reveal, scale: RES * 1.25 });
    this.revealCard.mesh.visible = false;
    this.scene.add(this.revealCard.mesh);

    // 灯火の翼竜（胴・翼・ランタンを別パーツにして動かす）
    this.enemyRig = at(new THREE.Group(), POS.enemy.x, POS.enemy.top);
    this.enemyBob = new THREE.Group();
    this.enemyRig.add(this.enemyBob);
    this.enemyMats = [];
    const wing = (shade, layer, mirror) => {
      const pivot = new THREE.Group();
      const plane = canvasPlane(340, 220, (ctx, w, h) => drawWing(ctx, w, h, shade), { layer });
      plane.mesh.position.set(146, 86, 0);
      pivot.add(plane.mesh);
      if (mirror) pivot.scale.x = -1;
      this.enemyMats.push(plane.mesh.material);
      return pivot;
    };
    this.wingL = wing('#2c2c31', L.enemy - 1, true);
    this.wingL.position.set(12, 18, 0);
    this.wingR = wing('#3b3b41', L.enemy + 1, false);
    this.wingR.position.set(28, 6, 0);
    const body = canvasPlane(420, 430, drawWyvern, { layer: L.enemy });
    this.enemyMats.push(body.mesh.material);
    this.lantern = new THREE.Group();
    this.lantern.position.set(-30, 16, 0);
    const lamp = canvasPlane(90, 130, drawLantern, { layer: L.enemy + 2 });
    lamp.mesh.position.set(0, -61, 0);
    this.enemyMats.push(lamp.mesh.material);
    this.glow = texPlane(glowTexture('90,200,255'), 240, 240, L.enemy + 3, { blending: THREE.AdditiveBlending });
    this.glow.position.set(0, -73, 0);
    this.lantern.add(lamp.mesh, this.glow);
    this.enemyBob.add(this.wingL, body.mesh, this.wingR, this.lantern);
    const shadow = canvasPlane(360, 70, drawShadow, { layer: L.enemy - 2 });
    shadow.mesh.position.set(10, -300, 0);
    this.enemyMats.push(shadow.mesh.material);
    this.enemyFade = { v: 1 };
    this.enemyRig.add(shadow.mesh);
    this.scene.add(this.enemyRig);
    this.enemyPanel = canvasPlane(420, 110, null, { layer: L.charUi });
    at(this.enemyPanel.mesh, POS.enemy.x, 352);
    this.scene.add(this.enemyPanel.mesh);
  }

  buildCharacters() {
    this.chars = {};
    for (const pid of PIDS) {
      const { x, feet } = POS[pid];
      const root = at(new THREE.Group(), x, feet);
      const shadow = canvasPlane(240, 56, drawShadow, { layer: L.chars - 1 });
      root.add(shadow.mesh);
      const bob = new THREE.Group();
      root.add(bob);
      const sprite = canvasPlane(260, 340, (ctx, w, h) => drawHero(ctx, w, h, pid), { layer: L.chars + (pid === 'p1' ? 1 : 0) });
      sprite.mesh.position.y = 170;
      bob.add(sprite.mesh);
      this.scene.add(root);
      const panel = canvasPlane(260, 72, null, { layer: L.charUi });
      at(panel.mesh, x, feet - 372);
      this.scene.add(panel.mesh);
      this.chars[pid] = { root, bob, sprite, panel, home: root.position.clone() };
    }
  }

  buildPanels() {
    this.panels = {};
    this.trash = {};
    for (const pid of PIDS) {
      const panel = canvasPlane(470, 250, null, { layer: L.panels });
      at(panel.mesh, pid === 'p1' ? 235 : W - 235, H - 125);
      this.scene.add(panel.mesh);
      this.panels[pid] = panel;
      const trash = canvasPlane(110, 120, (ctx, w, h) => drawTrash(ctx, w, h, pid), { layer: L.panels });
      at(trash.mesh, pid === 'p1' ? 70 : W - 70, 755);
      this.scene.add(trash.mesh);
      this.trash[pid] = trash;
    }
  }

  buildHands() {
    this.hands = { p1: [], p2: [] };
    for (const pid of PIDS) {
      for (let i = 0; i < 3; i++) {
        const group = at(new THREE.Group(), HAND_X[pid][i], HAND_TOP);
        const glow = canvasPlane(CARD_W + 50, CARD_H + 50, (ctx, w, h) => drawCardGlow(ctx, w, h, PLIGHT[pid]), { layer: L.cards - 1 });
        glow.mesh.visible = false;
        const card = canvasPlane(CARD_W, CARD_H, null, { layer: L.cards, scale: Math.min(2.5, RES * 1.3) });
        group.add(glow.mesh, card.mesh);
        this.scene.add(group);
        this.hands[pid].push({ group, glow, card, home: group.position.clone(), lift: 0, slide: { y: 0 }, shake: { x: 0 }, key: null });
      }
    }
  }

  buildField() {
    this.field = canvasPlane(FIELD.w, FIELD.h, null, { layer: L.field });
    at(this.field.mesh, FIELD.x, FIELD.top + FIELD.h / 2);
    this.field.mesh.visible = false;
    this.scene.add(this.field.mesh);
  }

  buildParry() {
    const group = new THREE.Group();
    group.visible = false;
    const band = canvasPlane(W, 230, null, { scale: 1, layer: L.parry });
    at(band.mesh, W / 2, 215);
    const title = canvasPlane(1100, 50, null, { layer: L.parry + 4 });
    at(title.mesh, W / 2, 132);
    const markers = {};
    const ratings = {};
    for (const pid of PIDS) {
      markers[pid] = canvasPlane(34, 108, (ctx, w, h) => drawMarker(ctx, w, h, PLIGHT[pid]), { layer: L.parry + 2 });
      ratings[pid] = canvasPlane(300, 64, null, { layer: L.parry + 3 });
      group.add(markers[pid].mesh, ratings[pid].mesh);
    }
    group.add(band.mesh, title.mesh);
    this.scene.add(group);
    this.parryUi = { group, band, title, markers, ratings };
  }

  buildOverlays() {
    this.flashPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(W, H),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthTest: false, depthWrite: false }),
    );
    this.flashPlane.renderOrder = L.flash;
    at(this.flashPlane, W / 2, H / 2);
    this.scene.add(this.flashPlane);
    this.bannerPlane = canvasPlane(1500, 220, null, { layer: L.banner });
    at(this.bannerPlane.mesh, W / 2, 560);
    this.bannerPlane.mesh.visible = false;
    this.scene.add(this.bannerPlane.mesh);
    this.overlay = canvasPlane(W, H, null, { scale: RES, layer: L.overlay });
    at(this.overlay.mesh, W / 2, H / 2);
    this.overlay.mesh.visible = false;
    this.scene.add(this.overlay.mesh);
    this.helpPlane = canvasPlane(W, H, drawHelp, { scale: RES, layer: L.help });
    at(this.helpPlane.mesh, W / 2, H / 2);
    this.helpPlane.mesh.visible = false;
    this.scene.add(this.helpPlane.mesh);
  }

  // ---------------- 毎フレーム

  update(dt) {
    this.time += dt;
    const t = this.time / 1000;
    this.updateTweens(dt);

    const pos = this.motes.geometry.attributes.position;
    this.moteSeeds.forEach((m, i) => {
      m.y += (m.sp * dt) / 1000;
      if (m.y > 900) m.y = 150;
      pos.setXYZ(i, m.x + Math.sin(t * 0.6 + m.ph) * 26, m.y, 0);
    });
    pos.needsUpdate = true;

    for (const pid of PIDS) {
      const c = this.chars[pid];
      const ph = pid === 'p1' ? 0 : 1.9;
      c.bob.position.y = Math.sin(t * 2.2 + ph) * 4;
      c.sprite.mesh.scale.y = 1 + Math.sin(t * 2.2 + ph + 0.8) * 0.012;
    }

    this.enemyBob.position.y = Math.sin(t * 1.5) * 12;
    const flap = Math.sin(t * 3.4);
    this.wingR.rotation.z = 0.1 + flap * 0.28;
    this.wingL.rotation.z = 0.05 + flap * 0.25;
    this.lantern.rotation.z = Math.sin(t * 1.8 + 0.5) * 0.2;
    this.glow.material.opacity = (0.5 + Math.sin(t * 5.1) * 0.08 + Math.sin(t * 12.7) * 0.04) * this.enemyFade.v;
    this.enemySlots.forEach((m, i) => {
      if (!m.userData.busy) m.rotation.z = Math.sin(t * 1.2 + i * 1.1) * 0.03;
    });

    for (const pid of PIDS) {
      this.hands[pid].forEach((s, i) => {
        const sel = !!this.game && this.phase === 'player' && this.cursor[pid] === i && this.game.canAct(pid);
        s.lift += ((sel ? 1 : 0) - s.lift) * Math.min(1, dt * 0.016);
        s.group.position.x = s.home.x + s.shake.x;
        s.group.position.y = s.home.y + s.lift * 40 + s.slide.y;
        const sc = 1 + s.lift * 0.14;
        s.group.scale.set(sc, sc, 1);
        s.glow.mesh.visible = sel;
        s.card.mesh.renderOrder = L.cards + (sel ? 3 : 0);
        s.glow.mesh.renderOrder = sel ? L.cards + 2 : L.cards - 1;
      });
    }

    if (this.parry?.active) this.updateParry(dt);
  }

  // ---------------- 状態の反映

  bindGame(game, cursor) {
    this.game = game;
    this.cursor = cursor;
    this.logLines = [];
    this.clearZone();
    this.syncDisp();
    for (const pid of PIDS) {
      const c = this.chars[pid];
      c.sprite.mesh.material.opacity = 1;
      c.root.rotation.z = 0;
      for (const s of this.hands[pid]) s.key = null;
    }
    this.enemyMats.forEach((m) => {
      m.color.setRGB(1, 1, 1);
      m.opacity = 1;
    });
    this.enemyFade.v = 1;
    at(this.enemyRig, POS.enemy.x, POS.enemy.top);
    this.enemyRig.scale.set(1, 1, 1);
    for (const m of this.enemySlots) {
      m.visible = true;
      m.material.opacity = 1;
      m.scale.set(1, 1, 1);
      m.position.copy(m.userData.home);
    }
    this.drawLogPlane();
    this.refresh();
  }

  syncDisp() {
    const g = this.game;
    this.disp = {
      p1: { hp: g.players.p1.hp, block: g.players.p1.block },
      p2: { hp: g.players.p2.hp, block: g.players.p2.block },
      enemy: { hp: g.enemy.hp, block: g.enemy.block },
    };
  }

  setPhase(phase) {
    this.phase = phase;
    if (phase !== 'player' && phase !== 'resolve') this.clearZone();
    this.refresh();
  }

  refresh() {
    if (!this.game) return;
    this.refreshHands();
    for (const pid of PIDS) this.drawPanel(pid);
    for (const pid of PIDS) this.drawCharPanel(pid);
    this.drawEnemyPanel();
    this.drawField();
    this.turnBadge.draw((ctx, w, h) => drawTurnBadge(ctx, w, h, this.game.turn));
    const text = {
      player: '味方のターン ― 2人とも［ターン終了］でカードが発動', resolve: 'カード発動', enemy: '敵のターン', parry: 'パリィ！',
    }[this.phase] || '';
    const calm = this.phase === 'player' || this.phase === 'resolve';
    this.phasePill.draw((ctx, w, h) => drawPill(ctx, w, h, text, { bg: calm ? 'rgba(10, 30, 36, 0.72)' : 'rgba(110, 24, 30, 0.82)' }));
  }

  // 発動中は場が順に空になっていくので、連携の表示はターン終了時点のものを残す
  drawField() {
    const show = this.phase === 'player' || this.phase === 'resolve';
    this.field.mesh.visible = show;
    if (!show) return;
    if (this.phase === 'player' || !this.fieldSt) this.fieldSt = fieldState(this.game);
    this.field.draw((ctx, w, h) => drawField(ctx, w, h, this.fieldSt, this.phase));
  }

  refreshHands() {
    const g = this.game;
    for (const pid of PIDS) {
      const p = g.players[pid];
      // 相方だけが金枠を出しているとき、自分の金枠を光らせる
      const partnerWaiting = g.hasComboQueued(g.other(pid)) && !g.hasComboQueued(pid);
      p.hand.forEach((card, i) => {
        const s = this.hands[pid][i];
        const o = {
          affordable: !card || card.cost <= p.mana,
          inactive: this.phase !== 'player' || !g.canAct(pid),
          comboHint: !!(partnerWaiting && card?.combo),
        };
        const key = `${card?.uid}|${o.affordable}|${o.inactive}|${o.comboHint}`;
        if (s.key === key) return;
        s.key = key;
        s.card.draw((ctx, w, h) => drawCard(ctx, w, h, card, o));
      });
    }
  }

  drawPanel(pid) {
    this.panels[pid].draw((ctx, w, h) => drawPanel(ctx, w, h, pid, this.game.players[pid], this.game, this.phase));
  }

  drawCharPanel(pid) {
    this.chars[pid].panel.draw((ctx, w, h) => drawCharPanel(ctx, w, h, pid, this.disp[pid], this.game.players[pid], this.game));
    this.chars[pid].sprite.mesh.material.opacity = this.disp[pid].hp > 0 ? 1 : 0.4;
  }

  drawEnemyPanel() {
    this.enemyPanel.draw((ctx, w, h) => drawEnemyPanel(ctx, w, h, this.disp.enemy, this.game.enemy));
  }

  addLog(text) {
    this.logLines.push(text);
    if (this.logLines.length > 30) this.logLines.shift();
    this.drawLogPlane();
  }

  drawLogPlane() {
    this.logPlane.draw((ctx, w, h) => drawLog(ctx, w, h, this.logLines));
  }

  // ---------------- イベント演出キュー

  enqueue(events) {
    if (!events?.length) return;
    this.queue.push(...events);
    if (!this.processing) this.runQueue();
  }

  async runQueue() {
    this.processing = true;
    while (this.queue.length) await this.playEvent(this.queue.shift());
    this.processing = false;
    this.syncDisp();
    this.refresh();
    const waiters = this.idleWaiters;
    this.idleWaiters = [];
    waiters.forEach((r) => r());
  }

  idle() {
    if (!this.processing && !this.queue.length) return Promise.resolve();
    return new Promise((r) => this.idleWaiters.push(r));
  }

  targetPoint(target) {
    if (target === 'enemy') return { x: POS.enemy.x - 20, top: POS.enemy.top - 30 };
    return { x: POS[target].x, top: POS[target].feet - 190 };
  }

  applySnap(target, e) {
    this.disp[target] = { hp: e.hp, block: e.block };
    if (target === 'enemy') this.drawEnemyPanel();
    else this.drawCharPanel(target);
  }

  async playEvent(e) {
    switch (e.type) {
      case 'log':
        this.addLog(e.text);
        return;
      case 'damage': {
        this.applySnap(e.target, e);
        const p = this.targetPoint(e.target);
        if (e.blocked) this.popText(p.x - 90, p.top - 50, `防御 -${e.blocked}`, C.block, 28);
        const big = e.amount >= 20;
        this.popText(p.x + (Math.random() - 0.5) * 70, p.top, String(e.amount), e.amount > 0 ? '#ffffff' : '#9aa4b0', big ? 84 : 60);
        if (e.amount > 0) this.hitFx(e.target);
        await this.wait(e.target === 'enemy' ? 170 : 280);
        return;
      }
      case 'block': {
        this.applySnap(e.target, e);
        const p = this.targetPoint(e.target);
        this.popText(p.x, p.top - 70, `+${e.amount} 防御`, C.block, 34);
        this.ring(p.x, p.top + 40, C.block);
        await this.wait(150);
        return;
      }
      case 'heal': {
        this.applySnap(e.target, e);
        if (e.amount <= 0) return;
        const p = this.targetPoint(e.target);
        this.popText(p.x, p.top - 30, `+${e.amount} HP`, C.heal, 36);
        this.ring(p.x, p.top + 40, C.heal);
        await this.wait(140);
        return;
      }
      case 'mana': {
        this.drawPanel('p1');
        this.drawCharPanel('p1');
        const p = this.targetPoint('p1');
        this.popText(p.x, p.top - 30, `次ターン マナ+${e.amount}`, C.mana, 34);
        this.ring(p.x, p.top + 40, C.mana);
        await this.wait(150);
        return;
      }
      case 'status': {
        if (e.target === 'enemy') this.drawEnemyPanel();
        else if (e.target) this.drawCharPanel(e.target);
        if (e.text) {
          const p = this.targetPoint(e.target);
          this.popText(p.x, p.top - 90, e.text, e.target === 'enemy' ? '#d9b8ff' : '#ffe48a', 32);
          await this.wait(140);
        }
        return;
      }
      case 'armed': {
        this.drawCharPanel(e.pid);
        const p = this.targetPoint(e.pid);
        this.popText(p.x, p.top - 40, '構え', C.block, 34);
        return;
      }
      case 'resolve':
        await this.resolveCard(e.pid, e.card);
        return;
      case 'combo':
        await this.comboFx(e);
        return;
      case 'comboArmed':
        for (const pid of PIDS) this.drawCharPanel(pid);
        await this.banner('連携成立', '次の敵の通常攻撃で2人ともパリィ成功 → 連携パリィ', C.gold, 900);
        return;
      case 'down':
        this.drawCharPanel(e.pid);
        await this.tween(this.chars[e.pid].root.rotation, { z: e.pid === 'p1' ? 0.12 : -0.12 }, 300, 'out');
        return;
      case 'over':
        if (e.result === 'win') {
          for (const m of this.enemyMats) this.tween(m, { opacity: 0 }, 900, 'in');
          this.tween(this.enemyFade, { v: 0 }, 900, 'in');
          this.tween(this.enemyRig.position, { y: this.enemyRig.position.y - 90 }, 900, 'in');
        }
        return;
      case 'frenzy':
        this.drawEnemyPanel();
        await this.banner('激昂！', '翼竜が1ターンに2回行動する', '#ff7b6b', 650);
        return;
      default:
    }
  }

  // ---------------- 演出部品

  popText(x, top, text, color, size) {
    const p = canvasPlane(420, size * 1.6, (ctx, w, h) => drawCenterText(ctx, w, h, text, color, size), { layer: L.popup });
    at(p.mesh, x, top);
    p.mesh.scale.set(0.5, 0.5, 1);
    this.scene.add(p.mesh);
    this.tween(p.mesh.scale, { x: 1, y: 1 }, 220, 'back');
    this.tween(p.mesh.position, { y: p.mesh.position.y + 80 }, 950, 'out');
    this.tween(p.mesh.material, { opacity: 0 }, 380, 'in', 620).then(() => disposeMesh(p.mesh));
  }

  ring(x, top, color) {
    const p = canvasPlane(220, 220, (ctx, w, h) => drawRing(ctx, w, h, color), { layer: L.fx });
    at(p.mesh, x, top);
    p.mesh.scale.set(0.3, 0.3, 1);
    this.scene.add(p.mesh);
    this.tween(p.mesh.scale, { x: 1.3, y: 1.3 }, 420, 'out');
    this.tween(p.mesh.material, { opacity: 0 }, 420, 'in').then(() => disposeMesh(p.mesh));
  }

  async shake(obj, home, amp = 14) {
    this.killTweens(obj.position);
    for (const k of [1, -1, 0.6, -0.4, 0]) await this.tween(obj.position, { x: home.x + amp * k }, 45, 'linear');
  }

  hitFx(target) {
    if (target === 'enemy') {
      for (const m of this.enemyMats) {
        m.color.setRGB(1, 0.35, 0.35);
        this.tween(m.color, { r: 1, g: 1, b: 1 }, 260, 'in');
      }
      const s = canvasPlane(260, 260, drawSlash, { layer: L.fx });
      at(s.mesh, POS.enemy.x + (Math.random() - 0.5) * 80, POS.enemy.top - 40 + (Math.random() - 0.5) * 60);
      s.mesh.rotation.z = (Math.random() - 0.5) * 1.2;
      this.scene.add(s.mesh);
      this.tween(s.mesh.scale, { x: 1.25, y: 1.25 }, 220, 'out');
      this.tween(s.mesh.material, { opacity: 0 }, 220, 'in', 60).then(() => disposeMesh(s.mesh));
      this.shake(this.enemyRig, at(new THREE.Object3D(), POS.enemy.x, POS.enemy.top).position, 12);
    } else {
      const c = this.chars[target];
      const m = c.sprite.mesh.material;
      m.color.setRGB(1, 0.35, 0.35);
      this.tween(m.color, { r: 1, g: 1, b: 1 }, 300, 'in');
      this.shake(c.root, c.home, 16);
    }
  }

  async lunge(pid, dx = 70) {
    const c = this.chars[pid];
    this.killTweens(c.root.position);
    await this.tween(c.root.position, { x: c.home.x + dx }, 110, 'out');
    await this.tween(c.root.position, { x: c.home.x }, 240, 'inOut');
  }

  async pulse(pid) {
    const b = this.chars[pid].bob;
    this.killTweens(b.scale);
    await this.tween(b.scale, { x: 1.08, y: 1.08 }, 120, 'out');
    await this.tween(b.scale, { x: 1, y: 1 }, 200, 'inOut');
  }

  flash(color, peak = 0.6) {
    const m = this.flashPlane.material;
    m.color.set(color);
    m.opacity = peak;
    this.killTweens(m);
    this.tween(m, { opacity: 0 }, 450, 'out');
  }

  async banner(text, sub, color, hold = 700) {
    const b = this.bannerPlane;
    b.draw((ctx, w, h) => drawBanner(ctx, w, h, text, sub, color));
    b.mesh.visible = true;
    b.mesh.material.opacity = 1;
    b.mesh.scale.set(0.75, 0.75, 1);
    this.killTweens(b.mesh.scale);
    this.killTweens(b.mesh.material);
    await this.tween(b.mesh.scale, { x: 1, y: 1 }, 260, 'back');
    await this.wait(hold);
    await this.tween(b.mesh.material, { opacity: 0 }, 200, 'in');
    b.mesh.visible = false;
  }

  async comboFx(e) {
    this.flash('#ffe9a8', 0.7);
    for (const pid of PIDS) {
      const p = this.targetPoint(pid);
      this.ring(p.x, p.top + 40, C.gold);
      this.pulse(pid);
    }
    await this.banner(e.parry ? '連携パリィ！' : '連携発動！', e.names.join(' × '), C.gold, 650);
  }

  async turnBanner() {
    const g = this.game;
    const parts = PIDS.map((pid) => {
      const cap = g.players[pid].cap;
      const prev = g.turn > 1 ? capFor(pid, g.turn - 1) : cap;
      const arrow = cap > prev ? ' ▲' : cap < prev ? ' ▼' : '';
      return `${LABEL[pid]} マナ上限 ${cap}${arrow}`;
    });
    await this.banner(`TURN ${g.turn}`, parts.join('　／　'), '#e8fbff', 520);
  }

  // ---------------- 味方の操作に対する即時演出

  // 出したカードは手札から場へ飛び、ターン終了まで並んだままになる
  cardPlayed(pid, slot, card) {
    const s = this.hands[pid][slot];
    const mini = canvasPlane(MINI_W, MINI_H, (ctx, w, h) => drawMiniCard(ctx, w, h, card), { layer: L.fly, scale: Math.min(2.5, RES * 1.3) });
    mini.mesh.position.copy(s.group.position);
    mini.mesh.scale.set(s.group.scale.x * (CARD_W / MINI_W), s.group.scale.y * (CARD_H / MINI_H), 1);
    this.scene.add(mini.mesh);
    this.zone[pid].push({ card, mesh: mini.mesh });
    this.layoutZone(pid);
    this.killTweens(s.slide);
    s.slide.y = -280;
    this.tween(s.slide, { y: 0 }, 300, 'out', 140);
    this.pulse(pid);
  }

  // 段に収まらない枚数になったら重ねて詰める。後に出したカードほど手前
  layoutZone(pid) {
    const list = this.zone[pid];
    const span = FIELD.w - FIELD.tag - 12 - MINI_W;
    const step = list.length > 1 ? Math.min(MINI_W + 4, span / (list.length - 1)) : 0;
    const x0 = FIELD.x - FIELD.w / 2 + FIELD.tag + 6 + MINI_W / 2;
    list.forEach((z, i) => {
      const m = z.mesh;
      this.killTweens(m.position);
      this.killTweens(m.scale);
      this.tween(m.position, { x: x0 + i * step, y: H - FIELD.rows[pid] }, 320, 'inOut');
      this.tween(m.scale, { x: 1, y: 1 }, 320, 'inOut').then(() => {
        if (m.parent) m.renderOrder = L.mini + i / 100;
      });
    });
  }

  // 発動: 場のカードを一度持ち上げてから対象へ飛ばす
  async resolveCard(pid, card) {
    const list = this.zone[pid];
    const i = list.findIndex((z) => z.card.uid === card.uid);
    const z = i >= 0 ? list.splice(i, 1)[0] : null;
    if (z) {
      const m = z.mesh;
      m.renderOrder = L.fly;
      this.killTweens(m.position);
      this.killTweens(m.scale);
      await this.tween(m.scale, { x: 1.35, y: 1.35 }, 160, 'back');
      await this.wait(120);
      const dest = this.cardDest(pid, card);
      if (card.type === 'attack' && pid === 'p1') this.lunge(pid);
      else this.pulse(pid);
      await Promise.all([
        this.tween(m.position, { x: dest.x, y: H - dest.top }, 260, 'in'),
        this.tween(m.scale, { x: 0.8, y: 0.8 }, 260, 'in'),
        this.tween(m.material, { opacity: 0 }, 120, 'in', 150),
      ]);
      disposeMesh(m);
    }
  }

  clearZone() {
    for (const pid of PIDS) {
      for (const z of this.zone[pid]) {
        this.killTweens(z.mesh.position);
        this.killTweens(z.mesh.scale);
        this.killTweens(z.mesh.material);
        disposeMesh(z.mesh);
      }
      this.zone[pid] = [];
    }
  }

  cardDest(pid, card) {
    if (card.type === 'attack' || card.type === 'debuff') return this.targetPoint('enemy');
    if (card.type === 'parry') return this.targetPoint(pid);
    return this.targetPoint('p1');
  }

  denyCard(pid, slot) {
    const s = this.hands[pid][slot];
    this.killTweens(s.shake);
    (async () => {
      for (const k of [1, -1, 0.6, -0.4, 0]) await this.tween(s.shake, { x: 10 * k }, 45, 'linear');
    })();
    this.popText(s.home.x, H - s.home.y - 150, 'マナ不足', '#ff8a8a', 30);
  }

  handRerolled(pid) {
    this.hands[pid].forEach((s, i) => {
      this.killTweens(s.slide);
      s.slide.y = -280;
      this.tween(s.slide, { y: 0 }, 300, 'out', 60 + i * 70);
    });
    const t = this.trash[pid].mesh;
    this.killTweens(t.rotation);
    t.rotation.z = 0;
    this.tween(t.rotation, { z: Math.PI * 2 }, 420, 'out').then(() => { t.rotation.z = 0; });
  }

  denyReroll(pid) {
    const t = this.trash[pid].mesh;
    const x = t.position.x;
    (async () => {
      for (const k of [1, -1, 0.6, -0.4, 0]) await this.tween(t.position, { x: x + 8 * k }, 45, 'linear');
    })();
    this.popText(x, 690, 'マナ不足', '#ff8a8a', 28);
  }

  // ---------------- 敵の行動

  async revealEnemyCard(slot, card, dmg) {
    const m = this.enemySlots[slot];
    m.userData.busy = true;
    m.rotation.z = 0;
    await this.tween(m.position, { y: m.position.y - 24 }, 120, 'out');
    const target = { x: REVEAL.x, y: H - REVEAL.top };
    await Promise.all([
      this.tween(m.position, target, 320, 'inOut'),
      this.tween(m.scale, { x: 2.14, y: 2.14 }, 320, 'inOut'),
    ]);
    await this.tween(m.scale, { x: 0 }, 110, 'in');
    m.visible = false;
    const r = this.revealCard;
    r.draw((ctx, w, h) => drawEnemyCard(ctx, w, h, card, dmg));
    r.mesh.visible = true;
    r.mesh.position.set(target.x, target.y, 0);
    r.mesh.scale.set(0, 1, 1);
    r.mesh.material.opacity = 1;
    await this.tween(r.mesh.scale, { x: 1 }, 140, 'out');
    await this.wait(650);
  }

  async enemyAct(card) {
    const home = at(new THREE.Object3D(), POS.enemy.x, POS.enemy.top).position;
    if (card.dmg != null) {
      await this.tween(this.enemyRig.position, { x: home.x - 130 }, 160, 'in');
      await this.tween(this.enemyRig.position, { x: home.x }, 260, 'out');
    } else {
      this.ring(POS.enemy.x, POS.enemy.top, card.selfBlock ? C.block : '#ff7b6b');
      await this.tween(this.enemyRig.scale, { x: 1.08, y: 1.08 }, 160, 'out');
      await this.tween(this.enemyRig.scale, { x: 1, y: 1 }, 220, 'inOut');
    }
  }

  async dismissEnemyCard(slot) {
    const r = this.revealCard;
    await Promise.all([
      this.tween(r.mesh.material, { opacity: 0 }, 220, 'in'),
      this.tween(r.mesh.scale, { x: 0.8, y: 0.8 }, 220, 'in'),
    ]);
    r.mesh.visible = false;
    const m = this.enemySlots[slot];
    const home = m.userData.home;
    m.visible = true;
    m.scale.set(1, 1, 1);
    m.position.set(home.x, home.y + 140, 0);
    m.material.opacity = 0;
    await Promise.all([
      this.tween(m.position, { y: home.y }, 300, 'back'),
      this.tween(m.material, { opacity: 1 }, 200, 'out'),
    ]);
    m.userData.busy = false;
  }

  // ---------------- パリィ

  async runParry(pids, combo = false) {
    const ui = this.parryUi;
    ui.band.draw((ctx, w, h) => drawParryBand(ctx, w, h, pids));
    const ready = combo ? 'パリィ準備… 2人とも成功で連携パリィ！' : 'パリィ準備…';
    ui.title.draw((ctx, w, h) => drawCenterText(ctx, w, h, ready, combo ? C.gold : '#ffffff', 30));
    const st = { pids, active: false, acc: {}, m: {}, finish: null };
    for (const pid of PIDS) {
      st.m[pid] = { pos: pid === 'p1' ? 0 : 1, dir: pid === 'p1' ? 1 : -1, stopped: !pids.includes(pid) };
      ui.markers[pid].mesh.visible = pids.includes(pid);
      ui.ratings[pid].mesh.visible = false;
    }
    this.parry = st;
    this.placeMarkers();
    ui.group.visible = true;
    ui.group.position.y = 40;
    await this.tween(ui.group.position, { y: 0 }, 220, 'out');
    await this.wait(600);
    ui.title.draw((ctx, w, h) => drawCenterText(ctx, w, h, `${pids.map((pid) => `${LABEL[pid]}：${KEYS[pid].use}`).join('　')}　で中央に止めろ！`, C.gold, 30));
    await new Promise((res) => {
      st.finish = res;
      st.active = true;
    });
    await this.wait(800);
    await this.tween(ui.group.position, { y: 40 }, 160, 'in');
    ui.group.visible = false;
    this.parry = null;
    return st.acc;
  }

  updateParry(dt) {
    const st = this.parry;
    for (const pid of st.pids) {
      const m = st.m[pid];
      if (m.stopped) continue;
      m.pos += (m.dir * dt) / RULES.parry.sweepMs;
      if (m.pos >= 1 || m.pos <= 0) {
        m.pos = Math.max(0, Math.min(1, m.pos));
        this.stopMarker(pid);
      }
    }
    this.placeMarkers();
  }

  placeMarkers() {
    const st = this.parry;
    for (const pid of PIDS) at(this.parryUi.markers[pid].mesh, markerX(st.m[pid].pos), TRACK.top);
  }

  parryStop(pid) {
    const st = this.parry;
    if (st?.active && st.pids.includes(pid) && !st.m[pid].stopped) this.stopMarker(pid);
  }

  stopMarker(pid) {
    const st = this.parry;
    const m = st.m[pid];
    m.stopped = true;
    const acc = Math.max(0, 1 - Math.abs(m.pos - 0.5) / 0.5);
    st.acc[pid] = acc;
    const gr = grade(acc);
    const col = gr === 'PERFECT' ? C.gold : gr === '成功' ? '#ff9aa0' : '#c0c0c0';
    const r = this.parryUi.ratings[pid];
    r.draw((ctx, w, h) => drawCenterText(ctx, w, h, `${LABEL[pid]} ${gr === 'PERFECT' ? 'PERFECT!' : gr}`, col, 28));
    // 中央より外側に、1P は少し上・2P は少し下にずらして重なりを避ける
    at(r.mesh, markerX(m.pos) + (m.pos < 0.5 ? -160 : 160), TRACK.top + (pid === 'p1' ? -20 : 20));
    r.mesh.visible = true;
    r.mesh.scale.set(0.6, 0.6, 1);
    this.tween(r.mesh.scale, { x: 1, y: 1 }, 200, 'back');
    if (st.pids.every((p) => st.m[p].stopped)) {
      st.active = false;
      st.finish();
    }
  }

  // ---------------- オーバーレイ

  showTitle(ready) {
    this.overlayState = { kind: 'title' };
    this.updateStartReady(ready);
  }

  showResult(game, ready) {
    this.overlayState = {
      kind: 'result',
      info: { result: game.over, turn: game.turn, hp1: game.players.p1.hp, hp2: game.players.p2.hp },
    };
    this.updateStartReady(ready);
  }

  updateStartReady(ready) {
    const st = this.overlayState;
    if (!st) return;
    this.overlay.draw((ctx, w, h) => (st.kind === 'title' ? drawTitle(ctx, w, h, ready) : drawResult(ctx, w, h, st.info, ready)));
    const m = this.overlay.mesh;
    if (!m.visible) {
      m.visible = true;
      m.material.opacity = 0;
      this.tween(m.material, { opacity: 1 }, 300, 'out');
    }
  }

  async hideOverlay() {
    const m = this.overlay.mesh;
    this.overlayState = null;
    await this.tween(m.material, { opacity: 0 }, 260, 'in');
    m.visible = false;
  }

  toggleHelp() {
    this.helpOpen = !this.helpOpen;
    this.helpPlane.mesh.visible = this.helpOpen;
  }

  onPointer(e) {
    if (this.helpOpen) {
      this.toggleHelp();
      return;
    }
    const rect = this.renderer.domElement.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * W;
    const top = ((e.clientY - rect.top) / rect.height) * H;
    if (Math.hypot(x - 1860, top - 56) < 46) this.toggleHelp();
  }
}

function markerX(pos) {
  return TRACK.x0 + pos * (TRACK.x1 - TRACK.x0);
}
