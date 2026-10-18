// カード一覧ページ。ゲームと同じ描画関数で data.js のカードを並べる
import { CARDS, DECKS, ENEMY, KIND_LABEL } from './data.js';
import { NAME } from './game.js';
import { drawCard, drawEnemyCard, loadFonts } from './view.js';

const SCALE = 2;

function canvasFor(w, h, cssW, draw) {
  const c = document.createElement('canvas');
  c.width = w * SCALE;
  c.height = h * SCALE;
  c.style.width = `${cssW}px`;
  const ctx = c.getContext('2d');
  ctx.scale(SCALE, SCALE);
  draw(ctx, w, h);
  return c;
}

function tile(canvas, count, note) {
  const el = document.createElement('figure');
  el.className = 'tile';
  el.append(canvas);
  if (count) {
    const b = document.createElement('span');
    b.className = 'count';
    b.textContent = `×${count}`;
    el.append(b);
  }
  if (note) {
    const cap = document.createElement('figcaption');
    cap.textContent = note;
    el.append(cap);
  }
  return el;
}

function section(title, lead, tiles) {
  const sec = document.createElement('section');
  const h = document.createElement('h2');
  h.textContent = title;
  sec.append(h);
  if (lead) {
    const p = document.createElement('p');
    p.className = 'lead';
    p.textContent = lead;
    sec.append(p);
  }
  const grid = document.createElement('div');
  grid.className = 'grid';
  grid.append(...tiles);
  sec.append(grid);
  return sec;
}

const playerCard = (id) => ({ id, ...CARDS[id], boons: [], aspect: null });
const cardOpts = { affordable: true, costOk: true, inactive: false, comboHint: false };

function deckTiles(pid) {
  const counts = new Map();
  for (const id of DECKS[pid]) counts.set(id, (counts.get(id) ?? 0) + 1);
  return [...counts].map(([id, n]) => {
    const card = playerCard(id);
    const notes = [];
    if (card.combo) notes.push('連携（金枠）');
    return tile(canvasFor(190, 300, 200, (ctx, w, h) => drawCard(ctx, w, h, card, cardOpts)), n, notes.join('・'));
  });
}

function enemyTiles() {
  return ENEMY.lineup.map((id) => {
    const card = { id, ...ENEMY.cards[id], maxHp: ENEMY.cards[id].hp, broken: false };
    const note = `${KIND_LABEL[card.kind]}・HP ${card.hp}`;
    return tile(canvasFor(240, 330, 220, (ctx, w, h) => drawEnemyCard(ctx, w, h, card, card.dmg)), 0, note);
  });
}

await loadFonts();
const root = document.getElementById('list');
root.append(
  section(`1P ${NAME.p1}の初期デッキ（${DECKS.p1.length}枚）`, '', deckTiles('p1')),
  section(`2P ${NAME.p2}の初期デッキ（${DECKS.p2.length}枚）`, '', deckTiles('p2')),
  section('戦闘中に生まれるカード', '再型・占星統治で生まれ、使うと捨て札を経てデッキに混ざる。弾丸は付いた加護、アルカナは付いた属性を引き継ぐ。', [
    tile(canvasFor(190, 300, 200, (ctx, w, h) => drawCard(ctx, w, h, playerCard('bullet'), cardOpts)), 0, '再型で弾倉に装填'),
    tile(canvasFor(190, 300, 200, (ctx, w, h) => drawCard(ctx, w, h, playerCard('arcana'), cardOpts)), 0, '占星統治で魔法陣に補填'),
  ]),
  section(`敵：${ENEMY.name}のカード`, `${ENEMY.lineup.length}枚とも表向きに並び、壊れていないものからランダムに1枚使う。攻撃カードをすべて壊すと勝ち。`, enemyTiles()),
);
document.getElementById('boot')?.remove();
