// three.js による描画と演出。状態は game.js が持ち、ここは「見せ方」だけを担う
// 画像素材は一切使わず、すべて Canvas 2D で描いたテクスチャを板ポリに貼っている
import * as THREE from 'three';
import { RULES, TYPE_LABEL, KIND_LABEL, ENCHANT } from './data.js';
import { PIDS, LABEL, NAME, describeEnemyCard, grade, bulletDamage } from './game.js';

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
  attack: '#c4473b', parry: '#3b76c6', buff: '#3d9c5c', guard: '#4f7fa8', focus: '#1f8f9c',
  bullet: '#b4532f', arcana: '#5a46b8', load: '#6b7a3a', enchant: '#c08a1e',
  mana: '#66e4f3', block: '#86b8ff', heal: '#8cea9f',
};
// 敵カードの種類・運命超過の属性の色
const KIND_COL = { attack: '#9b2c34', guard: '#2c5f9b', special: '#4e2c78' };
// 星霊の加護の色
const ENCH_COL = { decay: '#8f5bd6', resist: '#3fa8c9', power: '#e0663a' };
const PCOL = { p1: C.p1, p2: C.p2 };
const PDARK = { p1: C.p1Dark, p2: C.p2Dark };
const PLIGHT = { p1: C.p1Light, p2: C.p2Light };
export const KEYS = {
  p1: { move: 'A / D', use: 'SPACE', stock: 'W', reroll: 'S', undo: '左Shift', end: 'E' },
  p2: { move: '← / →', use: 'ENTER', stock: '↑', reroll: '↓', undo: 'BackSpace', end: '右Shift' },
};
// 一人モードは1人で全部を操作する。弾丸とアルカナはキャラごとにキーを分ける
const SOLO_KEY = { move: 'A / D', use: 'SPACE', reroll: 'S', undo: 'Shift' };
const SOLO_KEYS = { solo: SOLO_KEY, p1: { ...SOLO_KEY, stock: 'W' }, p2: { ...SOLO_KEY, stock: 'E' } };
const ITEM_KEYS = ['1', '2', '3'];
const STOCK_ACT = { p1: '弾丸を撃つ', p2: 'アルカナ発動' };
const SOLO_COL = '#ffe9a8';

// 今のモード（bindGame で game.mode に合わせる）。描画関数がキー表記や配置を切り替えるのに使う
let SOLO = false;
let SPLIT = false;
let TURN = false; // 二人モードがターン制か // 一人モードで山札がキャラ別（手札 3:3）か
const keysOf = (id) => (SOLO ? SOLO_KEYS : KEYS)[id];

// 描画順（renderOrder）
const L = {
  bg: 0, header: 4, enemyCards: 6, enemy: 8, chars: 10, charUi: 12, field: 14, stock: 16, fx: 20,
  panels: 30, cards: 32, fly: 36, log: 38, reveal: 44, banner: 50, parry: 60, popup: 70,
  flash: 80, overlay: 90, help: 95,
};

// レイアウト（x は中心、top は上端からの位置。値は画面案 1470×827 を 1920×1080 に拡大したもの）
const POS = {
  p1: { x: 486, feet: 722 },
  p2: { x: 722, feet: 726 },
  enemy: { x: 1325, top: 490 },
};
const HAND_X = { p1: [335, 543, 752], p2: [1160, 1369, 1579], solo: [541, 749, 957, 1165, 1373],
  // 一人モード・山札キャラ別: 左3枚がルスカー、右3枚がラティシア
  split: [300, 500, 700, 940, 1140, 1340] };
// アイテム欄。二人モードは2人の手札の間、一人モードは手札の右
const ITEM_BOX = { w: 210, h: 290, duo: { x: 957, top: 930 }, solo: { x: 1590, top: 930 } };
const CARD_W = 190;
const CARD_H = 300;
const HAND_TOP = 772 + CARD_H / 2;
const TRACK = { x0: 250, x1: 1670, top: 228 };
const REVEAL = { x: 960, top: 470 };
// 敵カードは上の黒帯から吊るす
const ESLOT = { xs: [538, 747, 956, 1165, 1374], top: 72, w: 186, h: 140 };
// 弾倉（左上）と紋章（ルスカーの照準・ラティシアの魔法陣）
const MAG = { x: 172, top: 276, w: 200, h: 230 };
const EMBLEM = { p1: { x: 170, top: 540 }, p2: { x: 1730, top: 540 } };
const EMBLEM_SIZE = 400;
const NODE_R = 144; // 魔法陣の5つの点の半径
// 左下・右下のボタン（引き直し・山札）
const BTN = { p1: { x: 55 }, p2: { x: W - 55 }, reroll: 921, deck: 1025 };
// 地面と下の黒帯の境目
const GROUND = { top: 699, bottom: 781 };
const MINI_W = 88;
const MINI_H = 124;
const GEAR = { x: 1872, top: 48 };

function helpRows() {
  const k1 = keysOf('p1');
  const k2 = keysOf('p2');
  return [
    ['目的', '灯火の翼竜の HP を0にするか、上に並ぶ敵の攻撃カード（赤）をすべて破壊すれば勝ち。2人とも倒れたら負け。'],
    SOLO
      ? ['一人モード', `ルスカーとラティシアの2人を1人で操作する。${SPLIT ? '山札はキャラ別のままで、手札は左3枚がルスカー、右3枚がラティシア。使った枠はその持ち主の山札から引くので、いつも 3:3 になる。' : '2人のデッキは1つに混ざり、手札5枚から好きなカードを使う。'}カードの縁の色と名札が持ち主で、コストはその持ち主の紋章から払う。倒れたキャラのカードは使えない。`]
      : ['二人モード', '1台のキーボードを2人で使い、それぞれ自分の手札3枚を操作する。'],
    ...(TURN ? [
      ['ターン', `2人とも好きな順に、好きなだけカードを使える（制限時間なし）。カードは使ったその場で発動する。自分の番が済んだら「ターン終了」（1P は ${KEYS.p1.end}、2P は ${KEYS.p2.end}）。2人とも押すと敵が1回行動し（激昂後は2回）、次のターンになる。`],
      ['コスト', `左右の紋章の赤い数字。ターン開始時に ${RULES.turn.cost} に戻る（使い残しは持ち越さない）。手札の引き直しは1ターンに1回。`],
    ] : [
      ['行動値', `カードは使ったその場で発動する。カードを使うか手札を引き直すたびに敵の行動値が1減り、0になると敵が1枚使って行動値が元に戻る。再型・占星統治・アイテムは行動値を消費しない。`],
      ['コスト', `左右の紋章の赤い数字。初期値3で上限なし。${SOLO ? 'どちらかのカードを使うと、もう一方のコストが1回復する' : 'カードを使うと、相方のコストが1回復する'}（行動値を消費しないカードを除く）。手札を引き直すと2人とも+1、敵が行動すると2人とも+1。`],
    ]),
    ['取り消し', SOLO
      ? `${SOLO_KEY.undo}。敵が次に行動するまでの間、直前の行動から順に取り消せる。`
      : `1P は ${KEYS.p1.undo}、2P は ${KEYS.p2.undo}。敵が次に行動するまでの間、自分の直前の行動を取り消せる（相方がそのあとに行動していたら不可）。${TURN ? 'ターン終了も、相方が押す前なら取り消せる。' : ''}`],
    ['弾丸（ルスカー）', `再型で弾倉に1発ずつ装填（最大5）。${k1.stock} で一番上の弾を撃って敵に5ダメージ（コスト1）。ラティシアの星霊の加護で、次弾に崩壊・抵抗・特攻を付けられる。撃った弾は加護を残したまま捨て札に行き、いずれ手札に来る（手札からも撃てる）。`],
    ['アルカナ（ラティシア）', `占星統治1枚で魔法陣に2つ補填（最大5。v0.6 までは1つ）。${k2.stock} で番号順に「発動待ち」にする（コスト1）。発動待ちのアルカナは、敵が使うカードに5ダメージ。ルスカーの運命超過で付けた属性がカードの種類と合うと+5。カードの HP が0になると破壊され、その行動も止まる。敵が行動するたびに、発動待ちのアルカナが番号の若い順に1つだけ当たって捨て札に行く。`],
    ['アイテム（仮）', `${ITEM_KEYS.join('／')} キーで使う。各1戦に1回、行動値を消費しない。闘志の香＝ルスカーの次の攻撃+6、守りの護符＝2人とも防御+6、魔力の結晶＝2人ともコスト+2。${SOLO ? '' : '2人のどちらが押してもよい（取り消し不可）。'}`],
    ['パリィ', `パリィカードを使うと「構え」になり、次の敵の攻撃カードでバーが出る。中央で止めるほど防御値が大きく、ピンクの範囲なら成功効果も発動。${SOLO ? 'バーは1本で、止めた位置が構えている全員に効く。' : '「全員でパリィ」のカードを構えていると2人ともバーに参加する。'}`],
    ['敵', `HP が半分を切ると激昂し、${TURN ? `1ターンに${RULES.turn.frenzyEnemyActs}回行動する` : `行動値が${RULES.frenzyActionValue}になる`}。防御値は HP より先に削られる盾で、使い切らなかった分は溜まっていく。`],
  ];
}

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
export async function loadFonts() {
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
  const sky = ctx.createLinearGradient(0, 120, 0, GROUND.top);
  sky.addColorStop(0, '#e1e4e3');
  sky.addColorStop(1, '#d2d9d8');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  // 遠くの山（奥ほど薄い）
  const ridge = (base, amp, col, seed) => {
    const r = rng(seed);
    const ph = [r() * 6, r() * 6, r() * 6];
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(0, GROUND.top);
    for (let x = 0; x <= w; x += 12) {
      const y = base - amp * (0.55 * Math.sin(x / 260 + ph[0]) + 0.3 * Math.sin(x / 120 + ph[1]) + 0.15 * Math.sin(x / 47 + ph[2]));
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w, GROUND.top);
    ctx.closePath();
    ctx.fill();
  };
  ridge(470, 70, '#c3ced0', 3);
  ridge(560, 60, '#b1c0c3', 8);
  ridge(640, 40, '#a7b8bb', 21);
  // 地面
  ctx.fillStyle = '#c8b694';
  ctx.fillRect(0, GROUND.top, w, GROUND.bottom - GROUND.top);
  ctx.fillStyle = 'rgba(90, 70, 40, 0.12)';
  ctx.fillRect(0, GROUND.top, w, 4);
  // 下の黒帯（手札の台）
  ctx.fillStyle = '#f4f4f2';
  ctx.fillRect(0, GROUND.bottom, w, 6);
  ctx.fillStyle = '#0b0b0d';
  ctx.fillRect(0, GROUND.bottom + 6, w, h - GROUND.bottom - 6);
  // 上の黒帯（敵カードの吊り元）
  ctx.fillStyle = '#0b0b0d';
  ctx.fillRect(0, 0, w, 104);
  ctx.fillStyle = '#bfc4c4';
  ctx.fillRect(0, 104, w, 8);
  ctx.fillStyle = '#0b0b0d';
  ctx.fillRect(0, 112, w, 3);
  ctx.fillStyle = '#f4f4f2';
  ctx.fillRect(0, 115, w, 12);
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
  } else if (type === 'parry' || type === 'guard') {
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
  } else if (type.startsWith('bullet')) {
    ctx.save();
    ctx.rotate(Math.PI / 4);
    drawBulletShape(ctx, 0, 0, 1);
    ctx.restore();
  } else if (type.startsWith('arcana')) {
    drawArcanaShape(ctx, 0, 0, 0.9, color);
  } else if (type === 'enchant') {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const r = i % 2 ? 10 : 25;
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
  } else if (type === 'focus') {
    ctx.beginPath();
    ctx.moveTo(0, -26);
    ctx.quadraticCurveTo(22, 2, 16, 14);
    ctx.arc(0, 12, 16, 0.1, Math.PI - 0.1);
    ctx.quadraticCurveTo(-22, 2, 0, -26);
    ctx.fill();
  }
  // 装填カードは右下に「＋」
  if (type.endsWith('+')) {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(20, 18, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.fillRect(13, 16, 14, 4);
    ctx.fillRect(18, 11, 4, 14);
  }
  ctx.restore();
}

// 弾丸（先端が上）。cx, cy が中心
function drawBulletShape(ctx, cx, cy, s, boons = []) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s, s);
  const g = ctx.createLinearGradient(-9, 0, 9, 0);
  g.addColorStop(0, '#9a6a1e');
  g.addColorStop(0.45, '#f1cf72');
  g.addColorStop(1, '#8a5c16');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-9, 26);
  ctx.lineTo(-9, -6);
  ctx.quadraticCurveTo(-9, -26, 0, -30);
  ctx.quadraticCurveTo(9, -26, 9, -6);
  ctx.lineTo(9, 26);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#5b3c10';
  ctx.fillRect(-10, 18, 20, 4);
  boons.slice(0, 3).forEach((b, i) => {
    ctx.fillStyle = ENCH_COL[b];
    ctx.fillRect(-9, 8 - i * 9, 18, 6);
  });
  ctx.restore();
}

// アルカナ（目の描かれた菱形）
function drawArcanaShape(ctx, cx, cy, s, color = '#ffffff', eye = '#1d1530') {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s, s);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, -30);
  ctx.lineTo(26, 0);
  ctx.lineTo(0, 30);
  ctx.lineTo(-26, 0);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = eye;
  ctx.beginPath();
  ctx.moveTo(-16, 0);
  ctx.quadraticCurveTo(0, -13, 16, 0);
  ctx.quadraticCurveTo(0, 13, -16, 0);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(0, 0, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}


const iconOf = (card) => (card.type === 'load' ? `${card.owner === 'p1' ? 'bullet' : 'arcana'}+` : card.type);

// 弾丸・アルカナは付いた加護・属性を効果文に足す
function cardText(card) {
  if (card.type === 'bullet') {
    const boons = card.boons.map((b) => ENCHANT[b].name);
    return `敵に${bulletDamage(card)}ダメージ${boons.length ? `
加護：${boons.join('・')}` : ''}
（手札からも撃てる）`;
  }
  if (card.type === 'arcana' && card.aspect) return `${card.text}
属性：${KIND_LABEL[card.aspect]}（合えば+${RULES.arcanaAttrBonus}）`;
  return card.text;
}

export function drawCard(ctx, w, h, card, o) {
  if (!card) {
    rr(ctx, 6, 6, w - 12, h - 12, 12);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fill();
    ctx.setLineDash([6, 6]);
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 2;
    ctx.stroke();
    return;
  }
  const typeCol = C[card.type];
  // 白いカード
  rr(ctx, 2, 2, w - 4, h - 4, 12);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  rr(ctx, 4, 4, w - 8, h - 8, 9);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  // 一人モードでは持ち主のキャラの色で縁取る
  ctx.lineWidth = o.owner ? 5 : 2;
  ctx.strokeStyle = o.owner ? PCOL[card.owner] : '#1a1a1a';
  ctx.stroke();
  const ix = 4;
  // 名前の帯（種類の色）
  ctx.save();
  rr(ctx, ix, ix, w - ix * 2, h - ix * 2, 9);
  ctx.clip();
  ctx.fillStyle = typeCol;
  ctx.fillRect(0, 0, w, 50);
  ctx.fillStyle = mix(typeCol, '#ffffff', 0.86);
  ctx.fillRect(0, 50, w, 106);
  ctx.restore();
  drawIcon(ctx, iconOf(card), w / 2, 100, 1.25, typeCol);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  let fs = 22;
  ctx.font = font(fs);
  while (ctx.measureText(card.name).width > w - 70 && fs > 13) ctx.font = font(--fs);
  ctx.fillText(card.name, w / 2 + 16, 29);
  // コスト
  ctx.beginPath();
  ctx.arc(27, 27, 20, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = o.costOk ? '#1a1a1a' : '#d23a3a';
  ctx.stroke();
  ctx.fillStyle = o.costOk ? '#1a1a1a' : '#d23a3a';
  ctx.font = font(24);
  ctx.fillText(String(card.cost), 27, 28);
  // 種別
  const label = TYPE_LABEL[card.type];
  ctx.font = font(13);
  const lw = ctx.measureText(label).width + 20;
  rr(ctx, w / 2 - lw / 2, 145, lw, 23, 11.5);
  ctx.fillStyle = typeCol;
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.fillText(label, w / 2, 157);
  if (o.owner) {
    const name = NAME[card.owner];
    ctx.font = font(13);
    const nw = ctx.measureText(name).width + 18;
    rr(ctx, w - 10 - nw, 58, nw, 22, 11);
    ctx.fillStyle = PCOL[card.owner];
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillText(name, w - 10 - nw / 2, 69);
  }
  // 効果文
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = font(15, 500);
  ctx.fillStyle = '#1a1a1a';
  let y = 194;
  for (const line of wrapLines(ctx, cardText(card), w - 30)) {
    ctx.fillText(line, 15, y);
    y += 20;
  }
  if (!o.affordable || o.inactive) {
    rr(ctx, 2, 2, w - 4, h - 4, 12);
    ctx.fillStyle = o.inactive ? 'rgba(10, 10, 14, 0.35)' : 'rgba(10, 10, 14, 0.5)';
    ctx.fill();
  }
}

// 場に並べる小さいカード。効果文は省き、名前と種別だけを読める大きさで出す
function drawMiniCard(ctx, w, h, card) {
  const typeCol = C[card.type];
  rr(ctx, 1, 1, w - 2, h - 2, 9);
  ctx.fillStyle = PCOL[card.owner];
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
  drawIcon(ctx, iconOf(card), w / 2, 60, 0.85, mix(typeCol, '#000000', 0.12));
  const label = TYPE_LABEL[card.type];
  ctx.font = font(12);
  const lw = ctx.measureText(label).width + 14;
  rr(ctx, w / 2 - lw / 2, 92, lw, 20, 10);
  ctx.fillStyle = typeCol;
  ctx.fill();
  ctx.fillStyle = '#ffffff';
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

function drawEnemyIcon(ctx, card, cx, cy, color = 'rgba(255,255,255,0.92)') {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
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
  } else if (card.id === 'wing') {
    ctx.translate(-64, -48);
    ctx.scale(0.4, 0.45);
    drawWing(ctx, 340, 220, color);
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

const KIND_TAG = { attack: '攻撃・パリィ可', guard: '防御', special: '特殊' };

export function drawEnemyCard(ctx, w, h, card, dmg) {
  const col = KIND_COL[card.kind];
  rr(ctx, 3, 3, w - 6, h - 6, 18);
  ctx.fillStyle = '#1c1a20';
  ctx.fill();
  rr(ctx, 10, 10, w - 20, h - 20, 12);
  ctx.fillStyle = card.broken ? '#4a4a50' : col;
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
  ctx.fillStyle = '#f2e6ff';
  ctx.font = font(16);
  ctx.fillText(KIND_TAG[card.kind], w / 2, 40);
  drawEnemyIcon(ctx, card, w / 2, 122);
  ctx.fillStyle = '#ffffff';
  ctx.font = font(36);
  ctx.fillText(card.name, w / 2, 196);
  const desc = describeEnemyCard(card, dmg);
  // 1行に収まるなら少し縮めてでも1行にする
  let fs = 18;
  ctx.font = font(fs, 500);
  while (ctx.measureText(desc).width > w - 32 && fs > 15) ctx.font = font(--fs, 500);
  ctx.fillStyle = '#f6eee0';
  wrapLines(ctx, desc, w - 32).slice(0, 2).forEach((line, i) => ctx.fillText(line, w / 2, 232 + i * 24));
  drawHpBar(ctx, 22, h - 46, w - 44, 28, card.hp, card.maxHp, '#e0a33a', 'カード');
  if (card.broken) drawBroken(ctx, w, h, 1.6);
}

// 上に吊るす敵カード（小）。表向きで、カードの HP も出す
function drawEnemySlot(ctx, w, h, card) {
  const col = card.broken ? '#6a6a70' : KIND_COL[card.kind];
  rr(ctx, 2, -12, w - 4, h + 10, 10);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#1a1a1a';
  ctx.stroke();
  ctx.save();
  rr(ctx, 2, -12, w - 4, h + 10, 10);
  ctx.clip();
  ctx.fillStyle = col;
  ctx.fillRect(0, 0, w, 26);
  ctx.restore();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.font = font(14);
  ctx.fillText(KIND_TAG[card.kind], w / 2, 14);
  ctx.save();
  ctx.translate(w / 2 - 44, 66);
  ctx.scale(0.42, 0.42);
  drawEnemyIcon(ctx, card, 0, 0, col);
  ctx.restore();
  ctx.fillStyle = '#1a1a1a';
  ctx.font = font(22);
  ctx.textAlign = 'left';
  ctx.fillText(card.name, w / 2 - 14, 66);
  drawHpBar(ctx, 12, h - 36, w - 24, 26, card.hp, card.maxHp, '#e0a33a');
  if (card.broken) drawBroken(ctx, w, h, 1);
}

function drawBroken(ctx, w, h, s) {
  ctx.fillStyle = 'rgba(10, 10, 14, 0.55)';
  rr(ctx, 2, 2, w - 4, h - 4, 10 * s);
  ctx.fill();
  ctx.strokeStyle = '#ff7b6b';
  ctx.lineCap = 'round';
  ctx.lineWidth = 7 * s;
  const m = 26 * s;
  ctx.beginPath();
  ctx.moveTo(m, m + 10 * s);
  ctx.lineTo(w - m, h - m - 20 * s);
  ctx.moveTo(w - m, m + 10 * s);
  ctx.lineTo(m, h - m - 20 * s);
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.font = font(20 * s);
  ctx.textAlign = 'center';
  ctx.fillText('破壊', w / 2, h / 2 - 5 * s);
}

// ------------------------------------------------------------------ 描画: UI

function drawRound(ctx, w, h, round) {
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.font = font(20);
  ctx.fillText('ROUND', 28, h / 2 + 2);
  ctx.fillStyle = '#ffffff';
  ctx.font = font(44);
  ctx.fillText(String(round), 122, h / 2 + 2);
}

// 右上の歯車（白い円に黒い歯車）
function drawGear(ctx, w, h) {
  const cx = w / 2;
  const cy = h / 2;
  ctx.beginPath();
  ctx.arc(cx, cy, 56, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.fillStyle = '#111111';
  ctx.beginPath();
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const r = i % 2 ? 26 : 36;
    ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy, 13, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
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
  const chips = [];
  // 幅に収まらない分は落ちるので、重要なものから並べる
  if (d.hp <= 0) chips.push(['戦闘不能', '#555555']);
  if (p.armed.length) chips.push([p.armed.length > 1 ? `構え×${p.armed.length}` : '構え', C.parry]);
  if (p.rapid) chips.push([p.rapid > 1 ? `速射×${p.rapid}` : '速射', C.bullet]);
  if (p.nextBonus) chips.push([`次の攻撃+${p.nextBonus}`, C.buff]);
  drawChips(ctx, chips, 34, 2, w);
  // 頭上の HP バー（キャラの色）
  drawHpBar(ctx, 34, 34, w - 38, 30, d.hp, p.maxHp, PCOL[pid]);
  drawShield(ctx, 16, 49, 0.95, d.block);
}

// 状況の一言（敵の行動中・パリィ中は赤）
function drawPhasePill(ctx, w, h, phase) {
  const text = {
    player: TURN ? '2人とも「ターン終了」で敵が行動' : 'カードを使う・引き直すたびに、敵の行動値 −1', enemy: '敵の行動', parry: 'パリィ！',
  }[phase];
  if (!text) return;
  const calm = phase === 'player';
  drawPill(ctx, w, h, text, { bg: calm ? 'rgba(20, 22, 26, 0.78)' : 'rgba(150, 26, 30, 0.9)', size: calm ? 17 : 22 });
}

// 敵の頭上: 行動値（黒いバーと赤い数字）
function drawActionBar(ctx, w, h, game) {
  if (game.turnBased) return drawTurnStatus(ctx, w, h, game);
  const bx = 40;
  const bw = w - 80;
  const by = h - 34;
  rr(ctx, bx, by, bw, 28, 6);
  ctx.fillStyle = '#111111';
  ctx.fill();
  const n = game.avMax;
  const gap = 6;
  const sw = (bw - 12 - gap * (n - 1)) / n;
  for (let i = 0; i < n; i++) {
    rr(ctx, bx + 6 + i * (sw + gap), by + 6, sw, 16, 4);
    ctx.fillStyle = i < game.av ? '#e8463c' : 'rgba(255,255,255,0.12)';
    ctx.fill();
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.font = font(64);
  ctx.lineJoin = 'round';
  ctx.lineWidth = 8;
  ctx.strokeStyle = '#ffffff';
  ctx.strokeText(String(game.av), w / 2, by + 10);
  ctx.fillStyle = '#e02a24';
  ctx.fillText(String(game.av), w / 2, by + 10);
  ctx.font = font(14);
  ctx.fillStyle = '#333333';
  ctx.textAlign = 'left';
  ctx.fillText('敵の行動まで', bx, by - 8);
}

function drawTurnStatus(ctx, w, h, game) {
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = font(14);
  ctx.fillStyle = '#333333';
  const acts = game.enemy.frenzy ? RULES.turn.frenzyEnemyActs : RULES.turn.enemyActs;
  ctx.fillText(`2人ともターン終了で敵が行動（${acts}回）`, 40, h - 46);
  PIDS.forEach((pid, i) => {
    const x = 40 + i * ((w - 80) / 2 + 4);
    const bw = (w - 80) / 2 - 4;
    const down = game.players[pid].hp <= 0;
    const done = game.ended[pid] || down;
    rr(ctx, x, h - 38, bw, 32, 16);
    ctx.fillStyle = done ? '#111111' : PCOL[pid];
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = font(16);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`${LABEL[pid]} ${down ? '戦闘不能' : done ? '終了 ✓' : '行動中'}`, x + bw / 2, h - 21);
  });
}

function drawEnemyHp(ctx, w, h, d, e) {
  drawHpBar(ctx, 40, 4, w - 44, 34, d.hp, e.maxHp, '#177d94');
  drawShield(ctx, 20, 21, 1, d.block);
}

// 敵の足もと: 名札と状態
function drawEnemyName(ctx, w, h, e) {
  ctx.font = font(20);
  const nw = ctx.measureText(e.name).width + 56;
  rr(ctx, (w - nw) / 2, 2, nw, 38, 19);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.fillStyle = '#1a1a1a';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(e.name, w / 2, 22);
  const chips = [];
  if (e.frenzy) chips.push(['激昂', '#c4473b']);
  if (e.strength) chips.push([`咆哮 攻撃+${e.strength}`, '#9b2c34']);
  if (e.decay) chips.push([`崩壊×${e.decay}`, ENCH_COL.decay]);
  if (e.resist) chips.push([`抵抗×${e.resist}`, ENCH_COL.resist]);
  ctx.font = font(14);
  const total = chips.reduce((a, [t]) => a + ctx.measureText(t).width + 22, 0);
  drawChips(ctx, chips, Math.max(0, (w - total) / 2), 48, w);
}

// 手札の上（地面の帯）: 名前と操作
function drawHint(ctx, w, h, hid) {
  const solo = hid === 'solo';
  const k = solo ? SOLO_KEY : KEYS[hid];
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = font(17);
  const name = solo ? '一人モード' : `${LABEL[hid]} ${NAME[hid]}`;
  const keys = solo
    ? `${k.move} 選択　${k.use} 使う　${SOLO_KEYS.p1.stock} 撃つ　${SOLO_KEYS.p2.stock} アルカナ　${k.reroll} 引き直し　${k.undo} 取り消し　${ITEM_KEYS[0]}〜${ITEM_KEYS.at(-1)} アイテム`
    : `${k.move} 選択　${k.use} 使う　${TURN ? `${k.end} ターン終了　` : `${k.reroll} 引き直し　`}${k.undo} 取り消し`;
  ctx.font = font(15, 500);
  const kw = ctx.measureText(keys).width;
  ctx.font = font(17);
  const nw = ctx.measureText(name).width;
  const x0 = (w - (nw + 18 + kw)) / 2;
  rr(ctx, x0 - 12, 4, nw + 24, h - 8, (h - 8) / 2);
  ctx.fillStyle = solo ? '#3a3226' : PCOL[hid];
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.fillText(name, x0, h / 2 + 1);
  ctx.font = font(15, 500);
  ctx.fillStyle = '#3a3226';
  ctx.fillText(keys, x0 + nw + 26, h / 2 + 1);
}

// 左右の下のボタン: 引き直し（回る矢印）・山札（重なったカード）
function drawButton(ctx, w, h, kind, label) {
  const cx = w / 2;
  const cy = 42;
  ctx.beginPath();
  ctx.arc(cx, cy, 34, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.strokeStyle = '#111111';
  ctx.fillStyle = '#111111';
  ctx.lineCap = 'round';
  if (kind === 'reroll') {
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(cx, cy, 17, -Math.PI * 0.35, Math.PI * 1.45);
    ctx.stroke();
    const a = -Math.PI * 0.35;
    const ax = cx + Math.cos(a) * 17;
    const ay = cy + Math.sin(a) * 17;
    ctx.beginPath();
    ctx.moveTo(ax + 9, ay - 3);
    ctx.lineTo(ax - 4, ay - 10);
    ctx.lineTo(ax - 2, ay + 6);
    ctx.closePath();
    ctx.fill();
  } else {
    for (const dy of [10, 0, -10]) {
      ctx.save();
      ctx.translate(cx, cy + dy);
      ctx.scale(1, 0.42);
      ctx.beginPath();
      ctx.arc(0, 0, 20, 0, Math.PI * 2);
      ctx.fillStyle = '#111111';
      ctx.fill();
      ctx.lineWidth = 5;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
      ctx.restore();
    }
  }
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = font(13);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, cx, h - 10);
}

// 弾倉: 上の段ほど後から装填した弾（＝次に撃つ弾）。付いた加護は帯の色で出す
function drawMagazine(ctx, w, h, p) {
  const n = RULES.stockMax;
  const rows = [...p.stock].reverse();
  for (let i = 0; i < n; i++) {
    const y = 22 + i * 42;
    const s = rows[i];
    const x = 26;
    if (!s) {
      ctx.setLineDash([5, 5]);
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(20,20,20,0.25)';
      rr(ctx, x, y - 9, 110, 18, 4);
      ctx.stroke();
      ctx.setLineDash([]);
      continue;
    }
    // 黒い弾（右向き）。左端に白い刻み
    ctx.fillStyle = '#111111';
    ctx.beginPath();
    ctx.moveTo(x, y - 11);
    ctx.lineTo(x + 96, y - 11);
    ctx.lineTo(x + 122, y);
    ctx.lineTo(x + 96, y + 11);
    ctx.lineTo(x, y + 11);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x + 6, y - 7, 4, 14);
    s.card.boons.slice(0, 4).forEach((b, j) => {
      ctx.fillStyle = ENCH_COL[b];
      ctx.fillRect(x + 20 + j * 18, y - 7, 14, 14);
    });
    if (i === 0) {
      ctx.lineWidth = 3;
      ctx.strokeStyle = C.gold;
      ctx.beginPath();
      ctx.moveTo(x - 4, y - 15);
      ctx.lineTo(x + 98, y - 15);
      ctx.lineTo(x + 128, y);
      ctx.lineTo(x + 98, y + 15);
      ctx.lineTo(x - 4, y + 15);
      ctx.closePath();
      ctx.stroke();
    }
    ctx.fillStyle = '#1a1a1a';
    ctx.font = font(18);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(bulletDamage(s.card)), x + 136, y + 1);
  }
}

// 紋章: ルスカーは照準、ラティシアは魔法陣。赤丸の数字がコスト
function drawEmblem(ctx, w, h, pid, p, active) {
  const cx = w / 2;
  const cy = h / 2 - 10;
  if (pid === 'p1') {
    // 照準
    ctx.strokeStyle = '#111111';
    ctx.lineWidth = 7;
    ctx.setLineDash([26, 14]);
    ctx.beginPath();
    ctx.arc(cx, cy, 140, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(cx, cy, 104, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.lineWidth = 14;
    ctx.stroke();
    ctx.lineWidth = 8;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      ctx.beginPath();
      ctx.moveTo(cx + dx * 64, cy + dy * 64);
      ctx.lineTo(cx + dx * 150, cy + dy * 150);
      ctx.stroke();
    }
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(cx, cy, 70, 0, Math.PI * 2);
    ctx.stroke();
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = '#111111';
    ctx.beginPath();
    ctx.moveTo(-12, 50);
    ctx.lineTo(-12, -24);
    ctx.lineTo(0, -54);
    ctx.lineTo(12, -24);
    ctx.lineTo(12, 50);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-12, 30, 24, 5);
    ctx.restore();
  } else {
    // 魔法陣: 黒い円・目の菱形・番号つきの5つの点
    ctx.beginPath();
    ctx.arc(cx, cy, 112, 0, Math.PI * 2);
    ctx.fillStyle = '#111111';
    ctx.fill();
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#111111';
    ctx.lineWidth = 6;
    for (let i = 0; i < 4; i++) {
      ctx.rotate(Math.PI / 2);
      ctx.beginPath();
      ctx.moveTo(-14, -60);
      ctx.lineTo(0, -98);
      ctx.lineTo(14, -60);
      ctx.closePath();
      ctx.fill();
    }
    ctx.beginPath();
    ctx.moveTo(0, -88);
    ctx.lineTo(96, 0);
    ctx.lineTo(0, 88);
    ctx.lineTo(-96, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -60);
    ctx.lineTo(64, 0);
    ctx.lineTo(0, 60);
    ctx.lineTo(-64, 0);
    ctx.closePath();
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.restore();
    drawArcanaShape(ctx, cx, cy, 1.15, '#111111', '#ffffff');
    for (let i = 0; i < RULES.stockMax; i++) {
      const [x, y] = circleNode(i, cx, cy);
      const st = p.stock[i];
      if (st?.lit) {
        ctx.save();
        ctx.shadowColor = '#ffc94a';
        ctx.shadowBlur = 22;
        ctx.beginPath();
        ctx.arc(x, y, 24, 0, Math.PI * 2);
        ctx.fillStyle = '#ffd86a';
        ctx.fill();
        ctx.restore();
      }
      ctx.beginPath();
      ctx.arc(x, y, st ? 20 : 15, 0, Math.PI * 2);
      ctx.fillStyle = st ? (st.card.aspect ? KIND_COL[st.card.aspect] : '#ffffff') : '#111111';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#111111';
      ctx.stroke();
      if (st) drawArcanaShape(ctx, x, y, 0.42, st.card.aspect ? '#ffffff' : '#111111', st.card.aspect ? KIND_COL[st.card.aspect] : '#ffffff');
      const [lx, ly] = circleNode(i, cx, cy, NODE_R + 34);
      ctx.fillStyle = '#c0262b';
      ctx.font = font(22);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(i + 1), lx, ly);
    }
  }
  // コスト（赤丸）と弾・アルカナの数（小丸）
  const badge = (x, y, r, text, red) => {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = red ? '#ffffff' : '#111111';
    ctx.fill();
    ctx.lineWidth = red ? 5 : 4;
    ctx.strokeStyle = red ? '#e02a24' : '#ffffff';
    ctx.stroke();
    ctx.fillStyle = red ? '#e02a24' : '#ffffff';
    ctx.font = font(r * (String(text).length > 1 ? 1.05 : 1.3));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(text), x, y + 2);
  };
  badge(cx - 72, cy - 72, 34, p.cost, true);
  const count = pid === 'p1' ? p.stock.length : p.stock.filter((st) => st.lit).length;
  badge(cx + 76, cy + 76, 24, count, false);
  // 操作のヒント（地面の帯の上）
  const hint = pid === 'p1' ? `${keysOf('p1').stock}：撃つ（コスト1）` : `${keysOf('p2').stock}：発動待ちに（コスト1）`;
  ctx.font = font(16);
  ctx.textBaseline = 'middle';
  const tw = ctx.measureText(hint).width + 28;
  rr(ctx, cx - tw / 2, h - 34, tw, 30, 15);
  ctx.fillStyle = active ? '#111111' : 'rgba(17,17,17,0.45)';
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.fillText(hint, cx, h - 18);
}

// 魔法陣の i 番目の位置（1 が真上、時計回り）
function circleNode(i, cx, cy, r = NODE_R) {
  const a = -Math.PI / 2 + (i * Math.PI * 2) / RULES.stockMax;
  return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
}

// 中央の3つの菱形（画面案の飾り）
function drawLog(ctx, w, h, lines) {
  rr(ctx, 0, 0, w, h, 12);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.fill();
  ctx.font = font(12);
  ctx.fillStyle = 'rgba(30, 30, 30, 0.55)';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText('BATTLE LOG', 14, 14);
  ctx.font = font(14, 500);
  lines.slice(-4).forEach((line, i, arr) => {
    ctx.fillStyle = `rgba(20,20,20,${0.4 + (0.6 * (i + 1)) / arr.length})`;
    ctx.fillText(line, 14, 36 + i * 19);
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
  // 一人モードはバー1本（1P のマーカーを使い、止めた位置を構えている全員に適用する）
  for (const [pid, x] of SOLO ? [['p1', 120]] : [['p1', 120], ['p2', w - 120]]) {
    ctx.globalAlpha = active.includes(pid) ? 1 : 0.25;
    ctx.beginPath();
    ctx.arc(x, cy, 54, 0, Math.PI * 2);
    ctx.fillStyle = SOLO ? '#8a6a2a' : pid === 'p1' ? '#7a45d0' : '#c86a38';
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = font(SOLO ? 24 : 30);
    ctx.fillText(SOLO ? 'パリィ' : LABEL[pid], x, cy - 9);
    ctx.font = font(15);
    ctx.fillText(keysOf(pid).use, x, cy + 20);
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

// 操作の一覧の箱。二人モードは 1P／2P の2つ、一人モードは1つ
function drawKeyBox(ctx, x, y, w, { title, col, light, rows, tagline, status, ok }) {
  const h = 124 + rows.length * 34;
  rr(ctx, x, y, w, h, 18);
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fill();
  ctx.lineWidth = ok ? 4 : 2;
  ctx.strokeStyle = ok ? '#8ef0b0' : light;
  ctx.stroke();
  rr(ctx, x, y, w, 64, [18, 18, 0, 0]);
  ctx.fillStyle = col;
  ctx.fill();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.font = font(32);
  ctx.fillText(title, x + 24, y + 33);
  rows.forEach(([key, desc], i) => {
    const yy = y + 94 + i * 34;
    rr(ctx, x + 24, yy - 14, 110, 28, 8);
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = font(17);
    ctx.textAlign = 'center';
    ctx.fillText(key, x + 79, yy + 1);
    ctx.textAlign = 'left';
    ctx.font = font(19, 500);
    ctx.fillText(desc, x + 150, yy + 1);
  });
  ctx.font = font(18);
  ctx.fillStyle = light;
  ctx.fillText(tagline, x + 24, y + h - 24);
  ctx.textAlign = 'right';
  ctx.font = font(20);
  ctx.fillStyle = ok ? '#8ef0b0' : 'rgba(255,255,255,0.65)';
  ctx.fillText(status, x + w - 24, y + 33);
  return y + h;
}

function roleBox(ctx, x, y, pid, ready) {
  const k = KEYS[pid];
  return drawKeyBox(ctx, x, y, 460, {
    title: `${LABEL[pid]}  ${NAME[pid]}`, col: PCOL[pid], light: PLIGHT[pid],
    rows: [
      [k.move, 'カード選択'], [k.use, 'カードを使う／パリィを止める'], [k.stock, pid === 'p1' ? '弾倉の弾丸を撃つ' : 'アルカナを発動待ちに'],
      [k.reroll, TURN ? '手札を引き直す（1ターン1回）' : '手札を引き直す'], [k.undo, '直前の行動を取り消す'], ...(TURN ? [[k.end, 'ターン終了']] : []),
    ],
    tagline: pid === 'p1' ? '弾丸で翼竜の HP を削る' : 'アルカナで翼竜のカードを壊す',
    status: ready ? '準備OK ✓' : `${k.use} で準備`, ok: ready,
  });
}

// 一人モードの山札の分け方（タイトル・リザルトで W / S で切り替え）
function drawDeckTabs(ctx, w, y) {
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.font = font(20, 500);
  ctx.fillStyle = '#b9d3d8';
  ctx.fillText('山札（W / S）', w / 2 - 250, y + 22);
  [['キャラ別・手札 3:3', true], ['混ぜる・手札5枚', false]].forEach(([text, split], i) => {
    const x = w / 2 - 230 + i * 250;
    const on = split === SPLIT;
    rr(ctx, x, y, 236, 44, 22);
    ctx.fillStyle = on ? SOLO_COL : 'rgba(255,255,255,0.06)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = on ? SOLO_COL : 'rgba(255,255,255,0.35)';
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.font = font(20);
    ctx.fillStyle = on ? '#1a1408' : 'rgba(255,255,255,0.7)';
    ctx.fillText(text, x + 118, y + 23);
  });
}

function soloBox(ctx, x, y) {
  const k = SOLO_KEYS;
  return drawKeyBox(ctx, x, y, 620, {
    title: `${NAME.p1}＆${NAME.p2}`, col: '#5a4a2a', light: SOLO_COL,
    rows: [
      [k.solo.move, SPLIT ? 'カード選択（ルスカー3枚＋ラティシア3枚）' : 'カード選択（2人のカードが混ざった手札5枚）'], [k.solo.use, 'カードを使う／パリィを止める'],
      [`${k.p1.stock} ／ ${k.p2.stock}`, 'ルスカーの弾丸を撃つ／ラティシアのアルカナを発動待ちに'],
      [k.solo.reroll, '手札を引き直す'], [k.solo.undo, '直前の行動を取り消す'], [`${ITEM_KEYS[0]}〜${ITEM_KEYS.at(-1)}`, 'アイテムを使う'],
    ],
    tagline: '2人の主人公を1人で操作する',
    status: 'SPACE で開始', ok: false,
  });
}

// モードの切り替え（一人／二人）
function drawModeTabs(ctx, w, y, solo) {
  [['一人で遊ぶ', true], ['二人で遊ぶ', false]].forEach(([text, s], i) => {
    const x = w / 2 + (i === 0 ? -250 : 10);
    const on = s === solo;
    rr(ctx, x, y, 240, 56, 28);
    ctx.fillStyle = on ? C.gold : 'rgba(255,255,255,0.06)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = on ? C.gold : 'rgba(255,255,255,0.35)';
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = font(26);
    ctx.fillStyle = on ? '#1a1408' : 'rgba(255,255,255,0.7)';
    ctx.fillText(text, x + 120, y + 29);
  });
}

function drawTitle(ctx, w, h, ready) {
  ctx.fillStyle = 'rgba(8, 14, 18, 0.8)';
  ctx.fillRect(0, 0, w, h);
  drawBird(ctx, w / 2 + 8, 190, 2.4, '#e6dcff');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#f4efe2';
  ctx.font = font(96);
  ctx.fillText('BATTLE MOCK', w / 2, 330);
  ctx.font = font(30, 500);
  ctx.fillStyle = '#b9d3d8';
  ctx.fillText(`${TURN ? '一人＝行動値制／二人＝ターン制' : '行動値制'}カードバトル　戦闘モック v0.11`, w / 2, 398);
  ctx.font = font(22, 500);
  ctx.fillStyle = '#93abb1';
  ctx.fillText('A / D または ← / → でモードを切り替え', w / 2, 440);
  drawModeTabs(ctx, w, 476, SOLO);
  let bottom;
  if (SOLO) {
    bottom = soloBox(ctx, w / 2 - 310, 552);
    drawDeckTabs(ctx, w, bottom + 16);
    bottom += 78;
  } else {
    bottom = roleBox(ctx, w / 2 - 490, 560, 'p1', ready.p1);
    roleBox(ctx, w / 2 + 30, 560, 'p2', ready.p2);
  }
  ctx.textAlign = 'center';
  ctx.font = font(30);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(SOLO ? 'SPACE または ENTER で開始' : '1P は SPACE、2P は ENTER で準備 ― 2人そろうと開始', w / 2, bottom + 50);
  ctx.font = font(20, 500);
  ctx.fillStyle = '#8fa7ad';
  ctx.fillText('H または右上の歯車：ルールと操作　／　画像素材は使わず、すべてコードで描画しています', w / 2, bottom + 96);
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
  const how = info.winBy === 'cards' ? '攻撃カードをすべて破壊' : '翼竜を撃破';
  ctx.fillText(win ? `ROUND ${info.round} で${how}` : `ROUND ${info.round} で全滅`, w / 2, 520);
  ctx.font = font(26, 500);
  ctx.fillStyle = '#b9d3d8';
  ctx.fillText(`${info.solo ? `一人モード（${info.split ? '山札キャラ別' : '山札まぜる'}）` : '二人モード'}　${NAME.p1} HP ${info.hp1}　／　${NAME.p2} HP ${info.hp2}`, w / 2, 580);
  drawModeTabs(ctx, w, 660, SOLO);
  ctx.font = font(30);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(SOLO ? 'SPACE または ENTER でもう一度' : `1P：SPACE ${ready.p1 ? '✓' : '　'}　　2P：ENTER ${ready.p2 ? '✓' : '　'}　　でもう一度`, w / 2, 780);
  ctx.font = font(20, 500);
  ctx.fillStyle = '#8fa7ad';
  ctx.fillText('A / D または ← / → でモードを切り替え', w / 2, 830);
}

function drawHelp(ctx, w, h) {
  ctx.fillStyle = 'rgba(8, 14, 18, 0.92)';
  ctx.fillRect(0, 0, w, h);
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff';
  ctx.font = font(44);
  ctx.fillText(`ルールと操作（${SOLO ? '一人' : '二人'}モード）`, 220, 120);
  ctx.font = font(20, 500);
  ctx.fillStyle = '#8fa7ad';
  ctx.fillText('H／ESC／クリックで閉じる', 1420, 120);
  let y = 170;
  for (const [head, body] of helpRows()) {
    ctx.font = font(22);
    ctx.fillStyle = C.gold;
    ctx.fillText(head, 220, y);
    ctx.font = font(18, 500);
    ctx.fillStyle = '#e8eef0';
    for (const line of wrapLines(ctx, body, 1180)) {
      ctx.fillText(line, 530, y);
      y += 25;
    }
    y += 10;
  }
  y += 6;
  ctx.font = font(22);
  ctx.fillStyle = C.gold;
  ctx.fillText('操作', 220, y);
  ctx.font = font(19, 500);
  ctx.fillStyle = '#e8eef0';
  if (SOLO) {
    const k = SOLO_KEYS;
    ctx.fillText(`${k.solo.move}：カード選択　${k.solo.use}：使う／パリィを止める　${k.p1.stock}：${STOCK_ACT.p1}　${k.p2.stock}：${STOCK_ACT.p2}　${k.solo.reroll}：引き直し　${k.solo.undo}：取り消し　${ITEM_KEYS.join('・')}：アイテム`, 530, y);
    return;
  }
  for (const pid of PIDS) {
    const k = KEYS[pid];
    ctx.fillText(`${LABEL[pid]} ${NAME[pid]}　${k.move}：カード選択　${k.use}：使う／パリィを止める　${k.stock}：${STOCK_ACT[pid]}　${k.reroll}：引き直し　${k.undo}：取り消し${TURN ? `　${k.end}：ターン終了` : ''}`, 530, y);
    y += 28;
  }
  ctx.fillText(`アイテム　${ITEM_KEYS.join('・')}（どちらが押してもよい）`, 530, y);
}

// アイテム欄（各1回）。使ったものは暗くする
function drawItems(ctx, w, h, items, active) {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = font(16);
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.fillText('アイテム（各1回）', w / 2, 14);
  items.forEach((it, i) => {
    const y = 34 + i * 84;
    ctx.globalAlpha = it.used ? 0.35 : active ? 1 : 0.7;
    rr(ctx, 4, y, w - 8, 76, 12);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#1a1a1a';
    ctx.stroke();
    rr(ctx, 12, y + 10, 34, 34, 8);
    ctx.fillStyle = C.buff;
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = font(22);
    ctx.textAlign = 'center';
    ctx.fillText(ITEM_KEYS[i], 29, y + 28);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#1a1a1a';
    ctx.font = font(18);
    ctx.fillText(it.name, 56, y + 27);
    ctx.font = font(13, 500);
    ctx.fillStyle = '#3a3a3a';
    ctx.fillText(it.used ? '使用済み' : it.text, 14, y + 59);
    ctx.globalAlpha = 1;
  });
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
    this.reveal = null; // 敵が使っているカード { slot, card, dmg }
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
    this.buildHeader();
    this.buildEnemy();
    this.buildCharacters();
    this.buildPanels();
    this.buildHands();
    this.buildParry();
    this.buildOverlays();
  }

  buildHeader() {
    this.roundPlane = canvasPlane(300, 80, null, { layer: L.header + 3 });
    at(this.roundPlane.mesh, 160, 52);
    this.scene.add(this.roundPlane.mesh);
    this.gear = canvasPlane(124, 124, drawGear, { layer: L.header + 3 });
    at(this.gear.mesh, GEAR.x, GEAR.top);
    this.scene.add(this.gear.mesh);
    this.phasePill = canvasPlane(560, 42, null, { layer: L.header + 2 });
    at(this.phasePill.mesh, 790, 168);
    this.scene.add(this.phasePill.mesh);
    this.logPlane = canvasPlane(360, 112, (ctx, w, h) => drawLog(ctx, w, h, []), { layer: L.log });
    at(this.logPlane.mesh, 460, 268);
    this.scene.add(this.logPlane.mesh);
  }

  buildEnemy() {
    // 敵カードは表向きで並べる（HP が変わるので1枚ずつ描く）
    this.enemySlots = [];
    for (let i = 0; i < 5; i++) {
      const plane = canvasPlane(ESLOT.w, ESLOT.h, null, { layer: L.enemyCards, scale: Math.max(RES, 1.5) * 1.5 });
      const m = plane.mesh;
      at(m, ESLOT.xs[i], ESLOT.top);
      m.userData.home = m.position.clone();
      m.userData.plane = plane;
      this.scene.add(m);
      this.enemySlots.push(m);
    }
    this.revealCard = canvasPlane(240, 330, null, { layer: L.reveal, scale: RES * 1.25 });
    this.revealCard.mesh.visible = false;
    this.scene.add(this.revealCard.mesh);

    // 灯火の翼竜（胴・翼・ランタンを別パーツにして動かす）
    this.enemyRig = at(new THREE.Group(), POS.enemy.x, POS.enemy.top);
    this.enemyBob = new THREE.Group();
    // 画面案の竜の大きさに合わせて少し縮める
    this.enemyBob.scale.set(0.85, 0.85, 1);
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
    shadow.mesh.position.set(10, -(GROUND.top - POS.enemy.top), 0);
    this.enemyMats.push(shadow.mesh.material);
    this.enemyFade = { v: 1 };
    this.enemyRig.add(shadow.mesh);
    this.scene.add(this.enemyRig);
    this.enemyHp = canvasPlane(400, 42, null, { layer: L.charUi });
    at(this.enemyHp.mesh, POS.enemy.x, 265);
    this.actionPlane = canvasPlane(320, 100, null, { layer: L.charUi });
    at(this.actionPlane.mesh, POS.enemy.x, 195);
    this.enemyName = canvasPlane(460, 80, null, { layer: L.charUi });
    at(this.enemyName.mesh, POS.enemy.x, 642);
    this.scene.add(this.enemyHp.mesh, this.actionPlane.mesh, this.enemyName.mesh);
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
      const panel = canvasPlane(250, 70, null, { layer: L.charUi });
      at(panel.mesh, x, feet - 374);
      this.scene.add(panel.mesh);
      this.chars[pid] = { root, bob, sprite, panel, home: root.position.clone() };
    }
  }

  // 弾倉・紋章・ボタン・操作のヒント
  buildPanels() {
    this.stocks = {};
    this.trash = {};
    this.hints = {};
    this.decks = {};
    this.magazine = canvasPlane(MAG.w, MAG.h, null, { layer: L.stock });
    at(this.magazine.mesh, MAG.x, MAG.top);
    this.scene.add(this.magazine.mesh);
    for (const pid of PIDS) {
      const em = canvasPlane(EMBLEM_SIZE, EMBLEM_SIZE + 40, null, { layer: L.stock });
      at(em.mesh, EMBLEM[pid].x, EMBLEM[pid].top + 20);
      this.scene.add(em.mesh);
      this.stocks[pid] = em;
      const k = KEYS[pid];
      const re = canvasPlane(100, 100, (ctx, w, h) => drawButton(ctx, w, h, 'reroll', `${k.reroll} 引き直し`), { layer: L.panels });
      at(re.mesh, BTN[pid].x, BTN.reroll);
      const dk = canvasPlane(100, 100, null, { layer: L.panels });
      at(dk.mesh, BTN[pid].x, BTN.deck);
      this.scene.add(re.mesh, dk.mesh);
      this.trash[pid] = re;
      this.decks[pid] = dk;
      const hint = canvasPlane(640, 40, null, { layer: L.panels });
      // 2P は右の魔法陣の説明と重ならないよう少し左に寄せる
      at(hint.mesh, HAND_X[pid][1] - (pid === 'p2' ? 60 : 0), 742);
      this.scene.add(hint.mesh);
      this.hints[pid] = hint;
    }
    // 一人モードの操作ヒントは手札の真上に1本
    const solo = canvasPlane(1120, 40, null, { layer: L.panels });
    at(solo.mesh, HAND_X.solo[2], 742);
    this.scene.add(solo.mesh);
    this.hints.solo = solo;
    // v0.6 までの中央の3つの菱形（意味なし）はアイテム欄に置き換えた
    this.itemPlane = canvasPlane(ITEM_BOX.w, ITEM_BOX.h, null, { layer: L.panels });
    this.scene.add(this.itemPlane.mesh);
  }

  buildHands() {
    this.hands = { p1: [], p2: [], solo: [] };
    for (const hid of Object.keys(this.hands)) {
      const n = hid === 'solo' ? Math.max(RULES.soloHandSize, RULES.handSize * 2) : RULES.handSize;
      const col = hid === 'solo' ? SOLO_COL : PLIGHT[hid];
      for (let i = 0; i < n; i++) {
        const group = at(new THREE.Group(), HAND_X[hid][i] ?? 0, HAND_TOP);
        const glow = canvasPlane(CARD_W + 50, CARD_H + 50, (ctx, w, h) => drawCardGlow(ctx, w, h, col), { layer: L.cards - 1 });
        glow.mesh.visible = false;
        const card = canvasPlane(CARD_W, CARD_H, null, { layer: L.cards, scale: Math.min(2.5, RES * 1.3) });
        group.add(glow.mesh, card.mesh);
        this.scene.add(group);
        this.hands[hid].push({ group, glow, card, home: group.position.clone(), lift: 0, slide: { y: 0 }, shake: { x: 0 }, key: null });
      }
    }
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

    for (const hid of this.game?.handIds() ?? PIDS) {
      this.hands[hid].forEach((s, i) => {
        const sel = !!this.game && this.phase === 'player' && this.cursor[hid] === i && this.game.canAct(hid);
        s.lift += ((sel ? 1 : 0) - s.lift) * Math.min(1, dt * 0.016);
        s.group.position.x = s.home.x + s.shake.x;
        s.group.position.y = s.home.y + s.lift * 70 + s.slide.y;
        const sc = 1 + s.lift * 0.08;
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
    this.reveal = null;
    this.syncDisp();
    this.applyMode();
    for (const pid of PIDS) {
      const c = this.chars[pid];
      c.sprite.mesh.material.opacity = 1;
      c.root.rotation.z = 0;
    }
    this.enemyMats.forEach((m) => {
      m.color.setRGB(1, 1, 1);
      m.opacity = 1;
    });
    this.enemyFade.v = 1;
    at(this.enemyRig, POS.enemy.x, POS.enemy.top);
    this.enemyRig.scale.set(1, 1, 1);
    this.enemySlots.forEach((m, i) => {
      m.visible = true;
      m.material.opacity = 1;
      m.scale.set(1, 1, 1);
      m.position.copy(m.userData.home);
      m.userData.busy = false;
      this.drawEnemySlot(i);
    });
    this.drawLogPlane();
    this.refresh();
  }

  // 一人／二人で、手札・ヒント・山札ボタン・アイテム欄の出し方を切り替える
  applyMode() {
    SOLO = this.game.solo;
    SPLIT = this.game.split;
    TURN = RULES.duoProgress === 'turn';
    const ids = this.game.handIds();
    for (const [hid, slots] of Object.entries(this.hands)) {
      for (const s of slots) {
        s.group.visible = ids.includes(hid);
        s.key = null;
      }
    }
    // 一人モードの手札は山札の分け方で枚数と並びが変わる
    const xs = SPLIT ? HAND_X.split : HAND_X.solo;
    this.hands.solo.forEach((s, i) => {
      s.group.visible = SOLO && i < xs.length;
      if (i < xs.length) s.home.x = xs[i];
    });
    at(this.hints.solo.mesh, SPLIT ? (HAND_X.split[2] + HAND_X.split[3]) / 2 : HAND_X.solo[2], 742);
    for (const [hid, hint] of Object.entries(this.hints)) {
      hint.mesh.visible = ids.includes(hid);
      hint.draw((ctx, w, h) => drawHint(ctx, w, h, hid));
    }
    // 一人モードの山札・引き直しは左下の1組だけ
    this.trash.p2.mesh.visible = this.decks.p2.mesh.visible = !SOLO;
    const box = SOLO ? ITEM_BOX.solo : ITEM_BOX.duo;
    at(this.itemPlane.mesh, box.x, box.top);
    this.helpPlane.draw(drawHelp);
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
    this.refresh();
  }

  refresh() {
    if (!this.game) return;
    this.refreshHands();
    for (const pid of PIDS) this.drawPanel(pid);
    for (const pid of PIDS) this.drawCharPanel(pid);
    this.drawEnemyPanel();
    this.drawStocks();
    this.drawAction();
    this.drawItemPlane();
    this.roundPlane.draw((ctx, w, h) => drawRound(ctx, w, h, this.game.round));
  }

  drawItemPlane() {
    const active = this.phase === 'player' && !this.game.over;
    this.itemPlane.draw((ctx, w, h) => drawItems(ctx, w, h, this.game.items, active));
  }

  drawAction() {
    this.phasePill.draw((ctx, w, h) => drawPhasePill(ctx, w, h, this.phase));
    this.actionPlane.draw((ctx, w, h) => drawActionBar(ctx, w, h, this.game));
  }

  drawStocks() {
    const g = this.game;
    const active = this.phase === 'player';
    this.magazine.draw((ctx, w, h) => drawMagazine(ctx, w, h, g.players.p1));
    for (const pid of PIDS) {
      this.stocks[pid].draw((ctx, w, h) => drawEmblem(ctx, w, h, pid, g.players[pid], active && g.canAct(pid)));
    }
  }

  drawEnemySlot(i) {
    const card = this.game.enemy.cards[i];
    this.enemySlots[i].userData.plane.draw((ctx, w, h) => drawEnemySlot(ctx, w, h, card));
  }

  drawReveal() {
    const { card, dmg } = this.reveal;
    this.revealCard.draw((ctx, w, h) => drawEnemyCard(ctx, w, h, card, dmg));
  }

  refreshHands() {
    const g = this.game;
    for (const hid of g.handIds()) {
      g.holder(hid).hand.forEach((card, i) => {
        const s = this.hands[hid][i];
        // コストと使えるかどうかはカードの持ち主のキャラで見る（一人モードは混ざっている）
        const pid = card?.owner ?? hid;
        const err = card ? g.checkCard(pid, card) : null;
        const o = {
          affordable: !err,
          costOk: !card || card.cost <= g.players[pid].cost,
          inactive: this.phase !== 'player' || !g.canAct(hid),
          owner: g.solo,
        };
        const key = `${card?.uid}|${card?.boons.length}|${card?.aspect}|${o.affordable}|${o.costOk}|${o.inactive}|${o.owner}`;
        if (s.key === key) return;
        s.key = key;
        s.card.draw((ctx, w, h) => drawCard(ctx, w, h, card, o));
      });
    }
  }

  // 山札の数（コストは紋章の赤丸に出す）
  drawPanel(pid) {
    const p = this.game.players[pid];
    // 一人モードは左下の1組に、2人分（混ぜたときは共通）の山札をまとめて出す
    const piles = [...new Set(SOLO ? [this.game.pile('p1'), this.game.pile('p2')] : [this.game.pile(pid)])];
    const count = (k) => piles.reduce((a, q) => a + q[k].length, 0);
    this.decks[pid].draw((ctx, w, h) => drawButton(ctx, w, h, 'deck', `山札${count('deck')}・捨て${count('discard')}`));
    this.stocks[pid].draw((ctx, w, h) => drawEmblem(ctx, w, h, pid, p, this.phase === 'player' && this.game.canAct(pid)));
  }

  drawCharPanel(pid) {
    this.chars[pid].panel.draw((ctx, w, h) => drawCharPanel(ctx, w, h, pid, this.disp[pid], this.game.players[pid], this.game));
    this.chars[pid].sprite.mesh.material.opacity = this.disp[pid].hp > 0 ? 1 : 0.4;
  }

  drawEnemyPanel() {
    this.enemyHp.draw((ctx, w, h) => drawEnemyHp(ctx, w, h, this.disp.enemy, this.game.enemy));
    this.enemyName.draw((ctx, w, h) => drawEnemyName(ctx, w, h, this.game.enemy));
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
        const col = e.dot ? '#d8b8ff' : e.amount > 0 ? '#ffffff' : '#9aa4b0';
        this.popText(p.x + (Math.random() - 0.5) * 70, p.top, String(e.amount), col, big ? 84 : e.dot ? 48 : 60);
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
      case 'cost':
        for (const pid of PIDS) this.drawPanel(pid);
        this.refreshHands();
        return;
      case 'costGain': {
        this.drawPanel(e.pid);
        this.refreshHands();
        const em = EMBLEM[e.pid];
        this.popText(em.x - 30, em.top - 130, `コスト+${e.amount}`, '#e02a24', 30);
        return;
      }
      case 'av':
        this.drawAction();
        if (e.av === 0) await this.banner('行動値 0', '翼竜が動く！', '#ff8f7a', 380);
        return;
      case 'stock': {
        this.drawStocks();
        this.refreshHands();
        const sp = stockPoint(e.pid);
        this.ring(sp.x, sp.top, e.ench ? ENCH_COL[e.ench] : e.attr ? KIND_COL[e.attr] : e.lit ? '#ffe9a8' : PLIGHT[e.pid]);
        if (e.ench) this.popText(sp.x, sp.top - 120, `次弾に${ENCHANT[e.ench].name}`, '#ffe48a', 30);
        if (e.attr) this.popText(sp.x, sp.top - 120, `${KIND_LABEL[e.attr]}属性`, '#ffe48a', 30);
        if (e.lit) this.popText(sp.x, sp.top - 120, '発動待ち', '#ffe9a8', 30);
        await this.wait(120);
        return;
      }
      case 'item': {
        this.drawItemPlane();
        const box = SOLO ? ITEM_BOX.solo : ITEM_BOX.duo;
        this.ring(box.x, box.top - ITEM_BOX.h / 2 + 72 + e.index * 84, C.buff);
        await this.wait(120);
        return;
      }
      case 'shot':
        this.drawStocks();
        await this.shotFx(e);
        return;
      case 'arcanaHit':
        await this.arcanaFx(e);
        return;
      case 'broken':
        this.drawEnemySlot(e.slot);
        if (this.reveal?.slot === e.slot) {
          this.drawReveal();
          this.flash('#ffd0c0', 0.5);
          this.shake(this.revealCard.mesh, { x: REVEAL.x }, 18);
          await this.banner('破壊！', `「${e.card.name}」は使えなくなった`, '#ff9a7a', 600);
        }
        return;
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
        this.drawAction();
        await this.banner('激昂！', this.game.turnBased ? `次のターンから1ターンに${RULES.turn.frenzyEnemyActs}回行動する` : `翼竜の行動値が${RULES.frenzyActionValue}になる`, '#ff7b6b', 650);
        return;
      case 'turnEnd':
        this.drawAction();
        this.drawStocks();
        this.refreshHands();
        if (e.all) await this.banner('ターン終了', '翼竜が動く！', '#ff8f7a', 380);
        return;
      case 'newTurn':
        this.drawAction();
        for (const pid of PIDS) this.drawPanel(pid);
        this.refreshHands();
        await this.banner(`ターン ${this.game.round}`, `コストが ${RULES.turn.cost} に戻る`, '#e8fbff', 360);
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

  // 弾丸: 弾倉（またはルスカー）から翼竜へ飛ばす
  async shotFx(e) {
    const from = e.fromStock ? { x: MAG.x + 60, top: MAG.top - MAG.h / 2 + 22 } : this.targetPoint('p1');
    const to = this.targetPoint('enemy');
    const b = canvasPlane(70, 30, (ctx) => {
      ctx.save();
      ctx.translate(35, 15);
      ctx.rotate(Math.PI / 2);
      drawBulletShape(ctx, 0, 0, 0.5, e.card.boons);
      ctx.restore();
    }, { layer: L.fx + 2 });
    at(b.mesh, from.x, from.top);
    b.mesh.rotation.z = Math.atan2(from.top - to.top, to.x - from.x);
    this.scene.add(b.mesh);
    if (!e.fromStock) this.lunge('p1', 30);
    await this.tween(b.mesh.position, { x: to.x, y: H - to.top }, 200, 'in');
    disposeMesh(b.mesh);
  }

  // アルカナ: 魔法陣の位置から、敵が使っているカードへ飛ばす（当たったアルカナは魔法陣から抜けて番号が繰り上がる）
  async arcanaFx(e) {
    const em = EMBLEM.p2;
    const [nx, ny] = circleNode(e.index, em.x, em.top);
    const a = canvasPlane(70, 70, (ctx) => drawArcanaShape(ctx, 35, 35, 1, '#fff3cf'), { layer: L.reveal + 2 });
    at(a.mesh, nx, ny);
    this.scene.add(a.mesh);
    this.drawStocks();
    await this.tween(a.mesh.position, { x: REVEAL.x, y: H - REVEAL.top }, 280, 'in');
    disposeMesh(a.mesh);
    if (this.reveal) {
      this.reveal.card.hp = e.hp;
      this.drawReveal();
      this.shake(this.revealCard.mesh, { x: REVEAL.x }, 10);
    }
    this.popText(REVEAL.x + 60, REVEAL.top - 120, `${e.amount}${e.match ? ' 属性一致！' : ''}`, e.match ? C.gold : '#ffe9a8', e.match ? 44 : 52);
    this.ring(REVEAL.x, REVEAL.top, '#ffe9a8');
    await this.wait(220);
  }

  // ---------------- 味方の操作に対する即時演出

  // 使ったカードは手札から対象へ飛んで消える
  cardPlayed(pid, slot, card) {
    const s = this.hands[pid][slot];
    const mini = canvasPlane(MINI_W, MINI_H, (ctx, w, h) => drawMiniCard(ctx, w, h, card), { layer: L.fly, scale: Math.min(2.5, RES * 1.3) });
    mini.mesh.position.copy(s.group.position);
    mini.mesh.scale.set(s.group.scale.x * (CARD_W / MINI_W), s.group.scale.y * (CARD_H / MINI_H), 1);
    this.scene.add(mini.mesh);
    const dest = this.cardDest(card.owner, card);
    (async () => {
      await Promise.all([
        this.tween(mini.mesh.position, { y: mini.mesh.position.y + 120 }, 160, 'out'),
        this.tween(mini.mesh.scale, { x: 1.2, y: 1.2 }, 160, 'out'),
      ]);
      await Promise.all([
        this.tween(mini.mesh.position, { x: dest.x, y: H - dest.top }, 260, 'in'),
        this.tween(mini.mesh.scale, { x: 0.7, y: 0.7 }, 260, 'in'),
        this.tween(mini.mesh.material, { opacity: 0 }, 120, 'in', 150),
      ]);
      disposeMesh(mini.mesh);
    })();
    this.killTweens(s.slide);
    s.slide.y = -280;
    this.tween(s.slide, { y: 0 }, 300, 'out', 140);
    this.pulse(card.owner);
  }

  cardDest(pid, card) {
    if (card.type === 'attack' || card.type === 'bullet') return this.targetPoint('enemy');
    if (card.type === 'load' || card.type === 'arcana') return stockPoint(pid);
    if (card.type === 'enchant') return stockPoint(card.ench ? 'p1' : 'p2');
    return this.targetPoint(pid);
  }

  denyCard(pid, slot, err) {
    const s = this.hands[pid][slot];
    this.killTweens(s.shake);
    (async () => {
      for (const k of [1, -1, 0.6, -0.4, 0]) await this.tween(s.shake, { x: 10 * k }, 45, 'linear');
    })();
    this.popText(s.home.x, H - s.home.y - 150, DENY[err] ?? '使えない', '#ff8a8a', 30);
  }

  denyStock(pid, err) {
    const m = (pid === 'p1' ? this.magazine : this.stocks.p2).mesh;
    const x = m.position.x;
    (async () => {
      for (const k of [1, -1, 0.6, -0.4, 0]) await this.tween(m.position, { x: x + 8 * k }, 45, 'linear');
    })();
    const sp = stockPoint(pid);
    this.popText(sp.x, sp.top - 130, DENY[err] ?? '使えない', '#d23a3a', 28);
  }

  handRerolled(pid) {
    this.hands[pid].forEach((s, i) => {
      this.killTweens(s.slide);
      s.slide.y = -280;
      this.tween(s.slide, { y: 0 }, 300, 'out', 60 + i * 70);
    });
    const t = this.trash[pid === 'solo' ? 'p1' : pid].mesh;
    this.killTweens(t.rotation);
    t.rotation.z = 0;
    this.tween(t.rotation, { z: Math.PI * 2 }, 420, 'out').then(() => { t.rotation.z = 0; });
  }

  // 取り消し: 残っている演出を捨てて、状態をそのまま描き直す
  undone() {
    this.queue.length = 0;
    this.syncDisp();
    for (const slots of Object.values(this.hands)) for (const s of slots) s.key = null;
    this.enemySlots.forEach((m, i) => this.drawEnemySlot(i));
    this.refresh();
  }

  // 理由だけを出す拒否（ターン制の2回目の引き直しなど）
  denyText(pid, err) {
    this.popText(this.hints[pid].mesh.position.x, 690, DENY[err] ?? '使えない', '#d23a3a', 26);
  }

  denyItem(i) {
    const box = SOLO ? ITEM_BOX.solo : ITEM_BOX.duo;
    this.popText(box.x, box.top - ITEM_BOX.h / 2 + 40 + i * 84, '使用済み', '#d23a3a', 26);
  }

  denyUndo(pid) {
    this.popText(this.hints[pid].mesh.position.x, 690, '取り消せない', '#d23a3a', 26);
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
    // HP はアルカナの演出に合わせて減らすので、表示用の写しを持つ
    this.reveal = { slot, card: { ...card }, dmg };
    this.drawReveal();
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
    this.reveal = null;
    this.drawEnemySlot(slot);
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

  async runParry(pids) {
    const ui = this.parryUi;
    ui.band.draw((ctx, w, h) => drawParryBand(ctx, w, h, pids));
    const ready = this.game.sharedParry() ? 'パリィ準備… 全員でパリィ！' : 'パリィ準備…';
    ui.title.draw((ctx, w, h) => drawCenterText(ctx, w, h, ready, '#ffffff', 30));
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
    ui.title.draw((ctx, w, h) => drawCenterText(ctx, w, h, `${SOLO ? keysOf('solo').use : pids.map((pid) => `${LABEL[pid]}：${KEYS[pid].use}`).join('　')}　で中央に止めろ！`, C.gold, 30));
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
    r.draw((ctx, w, h) => drawCenterText(ctx, w, h, `${SOLO ? '' : `${LABEL[pid]} `}${gr === 'PERFECT' ? 'PERFECT!' : gr}`, col, 28));
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
      info: { result: game.over, winBy: game.winBy, round: game.round, hp1: game.players.p1.hp, hp2: game.players.p2.hp, solo: game.solo, split: game.split },
    };
    this.updateStartReady(ready);
  }

  // リザルト画面でのモード切り替え（盤面は次の戦闘開始時に作り直す）
  setSolo(solo, split) {
    SOLO = solo;
    SPLIT = split;
    this.helpPlane.draw(drawHelp);
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
    if (Math.hypot(x - GEAR.x, top - GEAR.top) < 56) this.toggleHelp();
  }
}

// 弾倉・魔法陣に何かが入る（出る）ときの演出の位置
function stockPoint(pid) {
  return pid === 'p1' ? { x: MAG.x, top: MAG.top } : { x: EMBLEM.p2.x, top: EMBLEM.p2.top };
}

const DENY = {
  rerolled: '引き直しは1ターン1回', cost: 'コスト不足', full: 'もう置けない', noBullet: '弾倉が空', noArcana: '対象のアルカナがない',
};

function markerX(pos) {
  return TRACK.x0 + pos * (TRACK.x1 - TRACK.x0);
}
