// 数値調整用のボット。skill: 'good'（上手い人）/ 'novice'（初心者想定）
// 使い方: node tools/bot.mjs [data.js を上書きする JSON]   例: node tools/bot.mjs '{"enemyHp":70}'
// 試行回数は環境変数 N（既定 3000）
const base = new URL('../src', import.meta.url).href;
const data = await import(`${base}/data.js`);
const { Game } = await import(`${base}/game.js`);
const over = JSON.parse(process.argv[2] ?? '{}');
// 上書き: { enemyHp, cardHp: {claw:..}, cardDmg: {claw:..}, arcanaDmg, attrBonus, astroLoad, av, soloHand, soloDeck, noItems }
if (over.enemyHp) data.RULES.enemyMaxHp = over.enemyHp;
if (over.cardHp) for (const [k, v] of Object.entries(over.cardHp)) data.ENEMY.cards[k].hp = v;
if (over.cardDmg) for (const [k, v] of Object.entries(over.cardDmg)) data.ENEMY.cards[k].dmg = v;
if (over.arcanaDmg) data.CARDS.arcana.dmg = over.arcanaDmg;
if (over.attrBonus != null) data.RULES.arcanaAttrBonus = over.attrBonus;
if (over.astroLoad) data.CARDS.astro.load = over.astroLoad;
if (over.av) data.RULES.actionValue = over.av;
if (over.noItems) data.ITEMS.forEach((it) => { it.fx = {}; });
if (over.soloHand) data.RULES.soloHandSize = over.soloHand;
if (over.soloDeck) data.RULES.soloDeck = over.soloDeck;

const SKILL = {
  good: { noise: 0.05, parry: () => 0.6 + Math.random() * 0.4, items: true },
  novice: { noise: 0.35, parry: () => 0.15 + Math.random() * 0.8, items: false },
};

// 今とれる行動を並べて点数を付ける
function candidates(g) {
  const out = [];
  const { p1, p2 } = g.players;
  const lit = p2.stock.filter((s) => s.lit).length;
  const missing = (pid) => g.players[pid].maxHp - g.players[pid].hp;
  const attacksLeft = g.enemy.cards.filter((c) => c.kind === 'attack' && !c.broken).length;
  if (g.canAct('p1') && p1.stock.length && p1.cost >= 1) out.push({ s: 6 + g.topBullet().card.boons.length, f: () => g.useStock('p1') });
  if (g.canAct('p2') && g.nextUnlit() && p2.cost >= 1) out.push({ s: lit === 0 ? 6.5 : lit === 1 ? 3 : 0.8, f: () => g.useStock('p2') });
  for (const hid of g.handIds()) {
    if (!g.canAct(hid)) continue;
    g.holder(hid).hand.forEach((c, slot) => {
      if (!c) return;
      const pid = g.solo ? c.owner : hid;
      if (g.checkCard(pid, c)) return;
      const p = g.players[pid];
      let s = 0;
      switch (c.type) {
        case 'load': s = 10; break;
        case 'bullet': s = 6; break;
        case 'arcana': s = lit === 0 ? 6 : 2; break;
        case 'attack': s = 7.5; break;
        case 'guard': s = 2.5 + (p.hp < 30 ? 2 : 0); break;
        case 'parry': s = p.armed.length ? 1 : 4.5; break;
        case 'enchant': s = c.attr ? 3 + (attacksLeft <= 2 ? 1 : 0) : 3.5; break;
        case 'focus': s = p.cost <= 1 ? 4.5 : 1.5; break;
        case 'buff':
          if (c.fx?.rapid) s = p1.stock.length >= 2 ? 4 : 1;
          if (c.fx?.healAll) s = missing('p1') + missing('p2') >= 20 ? 5.5 : 0.5;
          break;
        default: s = 1;
      }
      out.push({ s, f: () => g.playCard(hid, slot) });
    });
    out.push({ s: 1.2, f: () => g.reroll(hid) });
  }
  return out;
}

function playerTurn(g, sk) {
  for (let guard = 0; guard < 80 && !g.over && !g.enemyPending; guard++) {
    if (sk.items) {
      const { p1, p2 } = g.players;
      if (!g.items[1].used && Math.min(p1.hp, p2.hp) < 30) g.useItem(1);
      if (!g.items[2].used && p1.cost + p2.cost <= 2) g.useItem(2);
      if (!g.items[0].used && p1.stock.length >= 1) g.useItem(0);
    }
    const cs = candidates(g).filter((c) => c.s > 0);
    if (!cs.length) break;
    const pick = Math.random() < sk.noise ? cs[Math.floor(Math.random() * cs.length)] : cs.reduce((a, b) => (b.s > a.s ? b : a));
    const r = pick.f();
    if (!r || r.error) break;
  }
}

function run(mode, sk) {
  const g = new Game(Math.random, mode);
  let enemyActs = 0;
  while (!g.over && enemyActs < 100) {
    playerTurn(g, sk);
    if (g.over) break;
    if (!g.enemyPending) { g.av = 0; g.enemyPending = true; }
    enemyActs++;
    const slot = g.pickEnemySlot();
    const card = g.enemy.cards[slot];
    g.arcanaStrike(slot);
    if (!card.broken && !g.over) {
      if (card.kind === 'attack' && g.parryPids().length) {
        const pids = g.parryPids();
        const a = sk.parry();
        g.resolveParry(Object.fromEntries(pids.map((p) => [p, g.solo ? a : sk.parry()])));
      }
      if (!g.over) g.resolveEnemyCard(slot);
    }
    if (!g.over) g.endEnemyAction();
  }
  return { g, enemyActs };
}

const N = Number(process.env.N ?? 3000);
const rows = [];
for (const mode of ['duo', 'solo']) {
  for (const skill of ['good', 'novice']) {
    let win = 0, cards = 0, acts = 0, winActs = 0;
    for (let i = 0; i < N; i++) {
      const { g, enemyActs } = run(mode, SKILL[skill]);
      acts += enemyActs;
      if (g.over === 'win') { win++; winActs += enemyActs; if (g.winBy === 'cards') cards++; }
    }
    rows.push(`${mode.padEnd(4)} ${skill.padEnd(6)} win ${(win / N * 100).toFixed(0).padStart(3)}%  byCards ${(cards / Math.max(1, win) * 100).toFixed(0).padStart(3)}%  winActs ${(winActs / Math.max(1, win)).toFixed(1)}`);
  }
}
console.log(JSON.stringify(over), '\n' + rows.join('\n'));
