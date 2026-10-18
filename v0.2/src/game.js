// 戦闘ルール本体。描画には依存しない（node でもそのまま動く）
// 各操作は「起きたこと」をイベント配列で返し、描画側がそれを順に演出する
import { RULES, CARDS, DECKS, ENEMY } from './data.js';

export const PIDS = ['p1', 'p2'];
export const LABEL = { p1: '1P', p2: '2P' };

const log = (text) => ({ type: 'log', text });

function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

let uid = 0;
const makeCard = (id) => ({ uid: ++uid, id, ...CARDS[id] });
const makeEnemyCard = (id) => ({ uid: ++uid, id, ...ENEMY.cards[id] });

export function capFor(pid, turn) {
  const c = RULES.cap[pid];
  const v = c.start + c.step * (turn - 1);
  return c.step > 0 ? Math.min(c.bound, v) : Math.max(c.bound, v);
}

export function grade(acc) {
  if (acc >= RULES.parry.perfectAcc) return 'PERFECT';
  if (acc >= RULES.parry.successAcc) return '成功';
  return '失敗';
}

export function describeEnemyCard(card, dmg = card.dmg) {
  const target = { p1: '1P', p2: '2P', all: '味方全員', highHp: 'HPが高い方' }[card.target];
  if (card.dmg != null) return `${target}に${dmg}ダメージ`;
  if (card.selfBlock) return `自身に防御${card.selfBlock}`;
  if (card.strength) return `以後の攻撃ダメージ+${card.strength}`;
  return '';
}

export class Game {
  constructor(rng = Math.random) {
    this.rng = rng;
    this.turn = 0;
    this.over = null; // 'win' | 'lose'
    this.enemy = {
      name: ENEMY.name, hp: RULES.enemyMaxHp, maxHp: RULES.enemyMaxHp, block: 0,
      strength: 0, weak: null, vuln: null, frenzy: false,
      deck: shuffle(ENEMY.deck.map(makeEnemyCard), rng), discard: [], hand: [],
    };
    for (let i = 0; i < ENEMY.handSize; i++) this.enemy.hand.push(this.enemyDraw());
    this.players = { p1: this.makePlayer('p1'), p2: this.makePlayer('p2') };
    // パリィを含む連携は、次の通常攻撃で2人ともパリィに成功するまで保留する: [[pid, card], ...]
    this.comboParry = null;
  }

  makePlayer(pid) {
    const p = {
      id: pid, hp: RULES.playerMaxHp, maxHp: RULES.playerMaxHp, block: 0,
      mana: 0, cap: 0, manaNext: 0, ready: false, queued: [], armed: [], nextMult: 1, nextBonus: 0,
      deck: shuffle(DECKS[pid].map(makeCard), this.rng), discard: [], hand: [],
    };
    for (let i = 0; i < RULES.handSize; i++) p.hand.push(this.draw(p));
    return p;
  }

  draw(p) {
    if (!p.deck.length) {
      p.deck = shuffle(p.discard, this.rng);
      p.discard = [];
    }
    return p.deck.pop() ?? null;
  }

  enemyDraw() {
    const e = this.enemy;
    if (!e.deck.length) {
      e.deck = shuffle(e.discard, this.rng);
      e.discard = [];
    }
    return e.deck.pop() ?? null;
  }

  alive(pid) { return this.players[pid].hp > 0; }
  alivePids() { return PIDS.filter((pid) => this.alive(pid)); }
  other(pid) { return pid === 'p1' ? 'p2' : 'p1'; }
  nextCap(pid) { return capFor(pid, this.turn + 1); }
  canAct(pid) { return !this.over && this.alive(pid) && !this.players[pid].ready; }
  allReady() { return PIDS.every((pid) => this.players[pid].ready || !this.alive(pid)); }

  // ---------------- 味方ターン ----------------

  startTurn() {
    this.turn++;
    for (const pid of PIDS) {
      const p = this.players[pid];
      p.cap = capFor(pid, this.turn);
      p.mana = p.cap + p.manaNext;
      p.manaNext = 0;
      p.ready = !this.alive(pid);
    }
  }

  // ターン中はカードを場に出すだけ（マナはここで払う）。効果は resolveTurn でまとめて発動する
  playCard(pid, slot) {
    if (!this.canAct(pid)) return null;
    const p = this.players[pid];
    const card = p.hand[slot];
    if (!card) return null;
    if (card.cost > p.mana) return { error: 'mana' };
    p.mana -= card.cost;
    p.queued.push(card);
    p.hand[slot] = this.draw(p);
    return { card };
  }

  hasComboQueued(pid) { return this.players[pid].queued.some((c) => c.combo); }

  // 2人とも「ターン終了」を押したら、2P → 1P の順に場のカードを出した順で発動する
  // 同じターンに2人とも金枠を出していれば連携。金枠にパリィが含まれるときは次の通常攻撃まで保留
  resolveTurn() {
    const ev = [];
    const combo = PIDS.every((pid) => this.hasComboQueued(pid));
    const comboCards = PIDS.flatMap((pid) => this.players[pid].queued.filter((c) => c.combo).map((c) => [pid, c]));
    for (const pid of ['p2', 'p1']) {
      const p = this.players[pid];
      for (const card of p.queued) {
        if (this.over) break;
        ev.push({ type: 'resolve', pid, card }, log(`${LABEL[pid]}「${card.name}」`));
        if (card.type === 'parry') {
          // パリィは「構え」として次の敵の通常攻撃まで待機する
          p.armed.push(card);
          ev.push({ type: 'armed', pid });
        } else {
          if (card.hits) this.attack(pid, card.hits, ev, true);
          this.applyFx(pid, card.fx, ev);
          p.discard.push(card);
        }
        this.checkOver(ev);
      }
      p.queued = [];
    }
    if (combo && !this.over) {
      const names = comboCards.map(([, c]) => c.name);
      if (comboCards.some(([, c]) => c.type === 'parry')) {
        this.comboParry = [...(this.comboParry ?? []), ...comboCards];
        ev.push({ type: 'comboArmed', names }, log('連携成立！ 次の通常攻撃で2人ともパリィ成功で発動'));
      } else {
        ev.push({ type: 'combo', parry: false, names }, log(`連携発動！「${names.join('」×「')}」`));
        for (const [pid, c] of comboCards) this.applyFx(pid, c.comboFx, ev);
        this.checkOver(ev);
      }
    }
    return ev;
  }

  reroll(pid) {
    if (!this.canAct(pid)) return null;
    const p = this.players[pid];
    if (p.mana < RULES.rerollCost) return { error: 'mana' };
    p.mana -= RULES.rerollCost;
    for (const c of p.hand) if (c) p.discard.push(c);
    p.hand = p.hand.map(() => null);
    for (let i = 0; i < RULES.handSize; i++) p.hand[i] = this.draw(p);
    return { events: [log(`${LABEL[pid]} 手札を引き直した`)] };
  }

  toggleReady(pid) {
    if (this.over || !this.alive(pid)) return;
    this.players[pid].ready = !this.players[pid].ready;
  }

  // ---------------- 効果 ----------------

  attack(pid, hits, ev, useBuffs) {
    const p1 = this.players.p1;
    const buffed = useBuffs && pid === 'p1';
    hits.forEach((base, i) => {
      const dmg = buffed ? Math.round(base * p1.nextMult) + (i === 0 ? p1.nextBonus : 0) : base;
      this.hitEnemy(dmg, ev);
    });
    if (buffed && (p1.nextMult !== 1 || p1.nextBonus)) {
      p1.nextMult = 1;
      p1.nextBonus = 0;
      ev.push({ type: 'status', target: 'p1' });
    }
  }

  hitEnemy(amount, ev) {
    const e = this.enemy;
    if (e.hp <= 0) return;
    let dmg = amount + (e.vuln ? e.vuln.amount : 0);
    const blocked = Math.min(e.block, dmg);
    e.block -= blocked;
    dmg -= blocked;
    e.hp = Math.max(0, e.hp - dmg);
    ev.push({ type: 'damage', target: 'enemy', amount: dmg, blocked, hp: e.hp, block: e.block });
    if (!e.frenzy && e.hp > 0 && e.hp <= e.maxHp * RULES.frenzyRatio) {
      e.frenzy = true;
      ev.push({ type: 'frenzy' }, log('翼竜が激昂した！ 1ターンに2回行動する'));
    }
  }

  hitPlayer(pid, amount, ev) {
    const p = this.players[pid];
    if (p.hp <= 0) return;
    const blocked = Math.min(p.block, amount);
    p.block -= blocked;
    const dmg = amount - blocked;
    p.hp = Math.max(0, p.hp - dmg);
    ev.push({ type: 'damage', target: pid, amount: dmg, blocked, hp: p.hp, block: p.block });
    if (p.hp === 0) {
      p.discard.push(...p.armed);
      p.armed = [];
      p.block = 0;
      p.ready = true;
      this.comboParry = null;
      ev.push({ type: 'down', pid }, log(`${LABEL[pid]} 戦闘不能`));
    }
  }

  gainBlock(target, amount, ev) {
    const o = target === 'enemy' ? this.enemy : this.players[target];
    if (amount <= 0 || o.hp <= 0) return;
    o.block += amount;
    ev.push({ type: 'block', target, amount, hp: o.hp, block: o.block });
  }

  heal(pid, amount, ev) {
    const p = this.players[pid];
    if (p.hp <= 0) return;
    const before = p.hp;
    p.hp = Math.min(p.maxHp, p.hp + amount);
    ev.push({ type: 'heal', target: pid, amount: p.hp - before, hp: p.hp, block: p.block });
  }

  applyFx(pid, fx, ev) {
    if (!fx) return;
    const p1 = this.players.p1;
    const e = this.enemy;
    if (fx.hits) this.attack(pid, fx.hits, ev, false);
    if (fx.counter) {
      ev.push(log(`${LABEL[pid]} 反撃！`));
      this.hitEnemy(fx.counter, ev);
    }
    if (fx.p1Mult && this.alive('p1')) {
      p1.nextMult *= fx.p1Mult;
      ev.push({ type: 'status', target: 'p1', text: `攻撃×${fx.p1Mult}` });
    }
    if (fx.p1Bonus && this.alive('p1')) {
      p1.nextBonus += fx.p1Bonus;
      ev.push({ type: 'status', target: 'p1', text: `次の攻撃+${fx.p1Bonus}` });
    }
    if (fx.p1NextMana && this.alive('p1')) {
      p1.manaNext += fx.p1NextMana;
      ev.push({ type: 'mana', target: 'p1', amount: fx.p1NextMana });
    }
    if (fx.weak) {
      e.weak = { amount: fx.weak[0], turns: fx.weak[1] };
      ev.push({ type: 'status', target: 'enemy', text: `与ダメージ-${fx.weak[0]}` });
    }
    if (fx.vuln) {
      e.vuln = { amount: fx.vuln[0], turns: fx.vuln[1] };
      ev.push({ type: 'status', target: 'enemy', text: `被ダメージ+${fx.vuln[0]}` });
    }
    if (fx.healAll) for (const t of this.alivePids()) this.heal(t, fx.healAll, ev);
  }

  // ---------------- 敵ターン ----------------

  enemyActionCount() { return this.enemy.frenzy ? 2 : 1; }

  pickEnemySlot() {
    const slots = this.enemy.hand.map((c, i) => (c ? i : -1)).filter((i) => i >= 0);
    return slots[Math.floor(this.rng() * slots.length)];
  }

  enemyDamage(card) {
    const e = this.enemy;
    return Math.max(0, card.dmg + e.strength - (e.weak ? e.weak.amount : 0));
  }

  armedPids() { return this.alivePids().filter((pid) => this.players[pid].armed.length); }

  // 全員向けの盾（blockAll）が構えられているか
  sharedParry() { return this.armedPids().some((pid) => this.players[pid].armed.some((c) => c.blockAll)); }

  // バーに参加する人。連携パリィの保留中か全員向けの盾があるときは、パリィカードを出していない人も参加する
  parryPids() {
    if (this.comboParry && this.alivePids().length === PIDS.length) return [...PIDS];
    if (this.sharedParry()) return this.alivePids();
    return this.armedPids();
  }

  // accs: { p1?: 0..1, p2?: 0..1 } バー中央への近さ。止めなかった場合は 0
  // 防御値は止めた本人の精度で決まり、中央で最大・端で最小。全員向けの盾は参加者それぞれの精度で配る
  resolveParry(accs) {
    const ev = [];
    const pids = this.parryPids();
    const acc = {};
    const success = {};
    for (const pid of pids) {
      acc[pid] = Math.max(0, Math.min(1, accs[pid] ?? 0));
      success[pid] = acc[pid] >= RULES.parry.successAcc;
      ev.push(log(`${LABEL[pid]} パリィ ${grade(acc[pid])}`));
    }
    const blockFor = (card, pid) => Math.round(card.block[0] + (card.block[1] - card.block[0]) * acc[pid]);
    for (const pid of pids) {
      for (const card of this.players[pid].armed) {
        for (const t of card.blockAll ? pids : [pid]) this.gainBlock(t, blockFor(card, t), ev);
        if (success[pid]) this.applyFx(pid, card.success, ev);
      }
    }
    if (this.comboParry) {
      const comboCards = this.comboParry;
      this.comboParry = null;
      if (PIDS.every((pid) => success[pid])) {
        ev.push({ type: 'combo', parry: true, names: comboCards.map(([, c]) => c.name) }, log('連携パリィ成功！'));
        for (const [pid, c] of comboCards) this.applyFx(pid, c.comboFx, ev);
      } else {
        ev.push(log('連携パリィ失敗…'));
      }
    }
    for (const pid of pids) {
      const p = this.players[pid];
      p.discard.push(...p.armed);
      p.armed = [];
    }
    this.checkOver(ev);
    return ev;
  }

  resolveEnemyCard(slot) {
    const e = this.enemy;
    const card = e.hand[slot];
    const ev = [];
    e.hand[slot] = null;
    if (card.dmg != null) {
      const dmg = this.enemyDamage(card);
      for (const t of this.targetsOf(card.target)) this.hitPlayer(t, dmg, ev);
    }
    if (card.selfBlock) this.gainBlock('enemy', card.selfBlock, ev);
    if (card.strength) {
      e.strength += card.strength;
      ev.push({ type: 'status', target: 'enemy', text: `攻撃+${card.strength}` });
    }
    e.discard.push(card);
    e.hand[slot] = this.enemyDraw();
    this.checkOver(ev);
    return ev;
  }

  targetsOf(target) {
    const alive = this.alivePids();
    if (target === 'all') return alive;
    if (target === 'highHp') {
      if (alive.length < 2) return alive;
      const { p1, p2 } = this.players;
      return [p1.hp >= p2.hp ? 'p1' : 'p2'];
    }
    return this.alive(target) ? [target] : alive;
  }

  endEnemyPhase() {
    const e = this.enemy;
    for (const k of ['weak', 'vuln']) {
      if (e[k] && --e[k].turns <= 0) e[k] = null;
    }
    return [{ type: 'status', target: 'enemy' }];
  }

  checkOver(ev) {
    if (this.over) return;
    if (this.enemy.hp <= 0) this.over = 'win';
    else if (!this.alivePids().length) this.over = 'lose';
    if (this.over) ev.push({ type: 'over', result: this.over });
  }
}
