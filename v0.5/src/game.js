// 戦闘ルール本体。描画には依存しない（node でもそのまま動く）
// 各操作は「起きたこと」をイベント配列で返し、描画側がそれを順に演出する
import { RULES, CARDS, DECKS, ENEMY, ENCHANT, KIND_LABEL } from './data.js';

export const PIDS = ['p1', 'p2'];
export const LABEL = { p1: '1P', p2: '2P' };
export const NAME = { p1: 'ルスカー', p2: 'ラティシア' };

const log = (text) => ({ type: 'log', text });

function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

let uid = 0;
// 弾丸は boons（付いた加護）、アルカナは aspect（付いた属性）を持ち、捨て札に行っても引き継ぐ
const makeCard = (id) => ({ uid: ++uid, id, ...CARDS[id], boons: [], aspect: null });
const makeEnemyCard = (id) => ({ uid: ++uid, id, ...ENEMY.cards[id], maxHp: ENEMY.cards[id].hp, broken: false });

export function grade(acc) {
  if (acc >= RULES.parry.perfectAcc) return 'PERFECT';
  if (acc >= RULES.parry.successAcc) return '成功';
  return '失敗';
}

export function bulletDamage(card) {
  return card.dmg + card.boons.filter((e) => e === 'power').length * ENCHANT.power.dmg;
}

export function describeEnemyCard(card, dmg = card.dmg) {
  const target = { random: 'どちらか1人', all: '味方全員', highHp: 'HPが高い方' }[card.target];
  if (card.dmg != null) return `${target}に${dmg}ダメージ`;
  if (card.selfBlock) return `自身に防御${card.selfBlock}`;
  if (card.strength) return `以後の攻撃ダメージ+${card.strength}`;
  return '';
}

export class Game {
  constructor(rng = Math.random) {
    this.rng = rng;
    this.round = 1; // 敵が行動するたびに進む
    this.over = null; // 'win' | 'lose'
    this.winBy = null; // 'hp' | 'cards'
    this.enemy = {
      name: ENEMY.name, hp: RULES.enemyMaxHp, maxHp: RULES.enemyMaxHp, block: 0,
      strength: 0, frenzy: false, decay: 0, resist: 0,
      cards: ENEMY.lineup.map(makeEnemyCard),
    };
    this.avMax = RULES.actionValue;
    this.av = this.avMax;
    this.enemyPending = false;
    this.undoStack = []; // 行動値が0になり、敵の行動待ち
    this.players = { p1: this.makePlayer('p1'), p2: this.makePlayer('p2') };
    // 連携: 敵が次に行動するまでに出した金枠
    this.combo = { p1: [], p2: [] };
    // パリィを含む連携は、次の通常攻撃で2人ともパリィに成功するまで保留する: [[pid, card], ...]
    this.comboParry = null;
    this.undoStack = [];
  }

  makePlayer(pid) {
    const p = {
      id: pid, hp: RULES.playerMaxHp, maxHp: RULES.playerMaxHp, block: 0, cost: RULES.startCost,
      armed: [], nextBonus: 0, rapid: 0,
      // p1: 弾倉（末尾が一番上＝次弾） / p2: 魔法陣（先頭から順に埋まる）。中身は { card, lit }
      stock: [],
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

  alive(pid) { return this.players[pid].hp > 0; }
  alivePids() { return PIDS.filter((pid) => this.alive(pid)); }
  other(pid) { return pid === 'p1' ? 'p2' : 'p1'; }
  canAct(pid) { return !this.over && !this.enemyPending && this.alive(pid); }
  hasComboPlayed(pid) { return this.combo[pid].length > 0; }

  // 弾倉の次弾 / 魔法陣でまだ発動していない最初のアルカナ / 属性を付けられる最初のアルカナ
  topBullet() { return this.players.p1.stock.at(-1) ?? null; }
  nextUnlit() { return this.players.p2.stock.find((s) => !s.lit) ?? null; }
  attrTarget() { return this.players.p2.stock.find((s) => !s.card.aspect) ?? null; }

  // ---------------- 味方の行動

  // カードが今使えるか。使えないときは理由を返す
  checkCard(pid, card) {
    const p = this.players[pid];
    if (card.cost > p.cost) return 'cost';
    if (card.load && p.stock.length >= RULES.stockMax) return 'full';
    if (card.type === 'arcana' && p.stock.length >= RULES.stockMax) return 'full';
    if (card.ench && (!this.alive('p1') || !this.topBullet())) return 'noBullet';
    if (card.attr && (!this.alive('p2') || !this.attrTarget())) return 'noArcana';
    return null;
  }

  // カードは使った時点で発動する
  playCard(pid, slot) {
    if (!this.canAct(pid)) return null;
    const p = this.players[pid];
    const card = p.hand[slot];
    if (!card) return null;
    const err = this.checkCard(pid, card);
    if (err) return { error: err };
    this.saveUndo(pid);
    p.cost -= card.cost;
    p.hand[slot] = this.draw(p);
    const ev = [log(`${NAME[pid]}「${card.name}」`)];
    this.resolveCard(pid, card, ev);
    if (card.combo) this.addCombo(pid, card, ev);
    if (!card.free) this.afterAction(pid, ev);
    this.checkOver(ev);
    ev.push({ type: 'cost' });
    return { card, events: ev };
  }

  resolveCard(pid, card, ev) {
    const p = this.players[pid];
    switch (card.type) {
      case 'bullet':
        this.fireBullet(card, ev);
        this.fireRapid(ev);
        return;
      case 'arcana':
        p.stock.push({ card, lit: true });
        ev.push({ type: 'stock', pid, lit: true }, log('アルカナ発動待ち'));
        return;
      case 'load': {
        const made = makeCard(pid === 'p1' ? 'bullet' : 'arcana');
        p.stock.push({ card: made, lit: false });
        ev.push({ type: 'stock', pid, add: true });
        break;
      }
      case 'enchant':
        if (card.ench) {
          this.topBullet().card.boons.push(card.ench);
          ev.push({ type: 'stock', pid: 'p1', ench: card.ench }, log(`弾丸に${ENCHANT[card.ench].name}を付与`));
        } else {
          this.attrTarget().card.aspect = card.attr;
          ev.push({ type: 'stock', pid: 'p2', attr: card.attr }, log(`アルカナに${KIND_LABEL[card.attr]}属性`));
        }
        break;
      case 'guard':
        this.gainBlock(pid, card.gain, ev);
        break;
      case 'parry':
        // パリィは「構え」として次の敵の攻撃まで待機する
        p.armed.push(card);
        ev.push({ type: 'armed', pid });
        return;
      default:
        if (card.hits) this.attack(card.hits, ev);
        this.applyFx(pid, card.fx, ev);
    }
    p.discard.push(card);
  }

  // 敵が次に行動するまでに2人とも金枠を出すと連携。金枠にパリィが含まれるときは次の攻撃まで保留
  addCombo(pid, card, ev) {
    this.combo[pid].push(card);
    if (!PIDS.every((q) => this.hasComboPlayed(q))) {
      ev.push({ type: 'comboWait', pid });
      return;
    }
    const cards = PIDS.flatMap((q) => this.combo[q].map((c) => [q, c]));
    this.combo = { p1: [], p2: [] };
    const names = cards.map(([, c]) => c.name);
    if (cards.some(([, c]) => c.type === 'parry')) {
      this.comboParry = [...(this.comboParry ?? []), ...cards];
      ev.push({ type: 'comboArmed', names }, log('連携成立！ 次の攻撃で2人ともパリィ成功で発動'));
      return;
    }
    ev.push({ type: 'combo', parry: false, names }, log(`連携発動！「${names.join('」×「')}」`));
    for (const [q, c] of cards) this.applyFx(q, c.comboFx, ev);
  }

  // 弾倉・魔法陣を使う。ルスカーは次弾を撃ち、ラティシアは次のアルカナを発動待ちにする
  useStock(pid) {
    if (!this.canAct(pid)) return null;
    const p = this.players[pid];
    const cost = CARDS[pid === 'p1' ? 'bullet' : 'arcana'].cost;
    if (pid === 'p1' ? !p.stock.length : !this.nextUnlit()) return { error: pid === 'p1' ? 'noBullet' : 'noArcana' };
    if (p.cost < cost) return { error: 'cost' };
    this.saveUndo(pid);
    p.cost -= cost;
    const ev = [];
    if (pid === 'p1') {
      const { card } = p.stock.pop();
      ev.push(log(`ルスカー 弾丸を撃った`));
      this.fireBullet(card, ev, true);
      this.fireRapid(ev);
    } else {
      this.nextUnlit().lit = true;
      ev.push({ type: 'stock', pid, lit: true }, log('アルカナ発動待ち'));
    }
    this.afterAction(pid, ev);
    this.checkOver(ev);
    ev.push({ type: 'cost' });
    return { events: ev };
  }

  fireBullet(card, ev, fromStock = false) {
    const p1 = this.players.p1;
    const e = this.enemy;
    ev.push({ type: 'shot', card, fromStock });
    this.hitEnemy(bulletDamage(card) + p1.nextBonus, ev);
    if (p1.nextBonus) {
      p1.nextBonus = 0;
      ev.push({ type: 'status', target: 'p1' });
    }
    const decay = card.boons.filter((x) => x === 'decay').length;
    const resist = card.boons.filter((x) => x === 'resist').length;
    if (decay && e.hp > 0) {
      e.decay += decay;
      ev.push({ type: 'status', target: 'enemy', text: `崩壊×${e.decay}` });
    }
    if (resist && e.hp > 0) {
      e.resist += resist;
      ev.push({ type: 'status', target: 'enemy', text: `抵抗×${e.resist}` });
    }
    p1.discard.push(card);
  }

  // 速射: 弾丸を撃ったとき、弾倉に次弾があれば続けて撃つ
  fireRapid(ev) {
    const p1 = this.players.p1;
    if (!p1.rapid) return;
    p1.rapid--;
    ev.push({ type: 'status', target: 'p1' });
    if (!p1.stock.length || this.enemy.hp <= 0) return;
    ev.push(log('速射！'));
    this.fireBullet(p1.stock.pop().card, ev, true);
  }

  reroll(pid) {
    if (!this.canAct(pid)) return null;
    this.saveUndo(pid);
    const p = this.players[pid];
    for (const c of p.hand) if (c) p.discard.push(c);
    p.hand = p.hand.map(() => null);
    for (let i = 0; i < RULES.handSize; i++) p.hand[i] = this.draw(p);
    const ev = [log(`${NAME[pid]} 手札を引き直した`)];
    for (const q of this.alivePids()) this.gainCost(q, 1, ev);
    this.afterAction(pid, ev, false);
    this.checkOver(ev);
    ev.push({ type: 'cost' });
    return { events: ev };
  }

  // ---------------- 取り消し

  // 敵が次に行動するまでの間、行動の直前の状態を積んでおく。取り消せるのは一番新しい行動だけで、それが自分の行動のとき
  saveUndo(pid) {
    const { round, avMax, av, enemy, players, combo, comboParry } = this;
    this.undoStack.push({ pid, state: structuredClone({ round, avMax, av, enemy, players, combo, comboParry }) });
  }

  canUndo(pid) {
    return this.canAct(pid) && this.undoStack.at(-1)?.pid === pid;
  }

  undo(pid) {
    if (!this.canAct(pid)) return null;
    if (!this.undoStack.length) return { error: 'noUndo' };
    if (this.undoStack.at(-1).pid !== pid) return { error: 'notYours' };
    Object.assign(this, this.undoStack.pop().state);
    return { events: [log(`${NAME[pid]} 取り消し`)] };
  }

  // 行動のあと: 相方のコスト+1、敵の行動値-1、崩壊のダメージ
  afterAction(pid, ev, partnerGain = true) {
    if (partnerGain && this.alive(this.other(pid))) this.gainCost(this.other(pid), 1, ev);
    this.av = Math.max(0, this.av - 1);
    ev.push({ type: 'av', av: this.av });
    this.tickDecay(ev);
    if (this.av === 0 && !this.over) this.enemyPending = true;
  }

  gainCost(pid, amount, ev) {
    this.players[pid].cost += amount;
    ev.push({ type: 'costGain', pid, amount });
  }

  tickDecay(ev) {
    const e = this.enemy;
    if (!e.decay || e.hp <= 0) return;
    ev.push(log(`崩壊 ${e.decay * ENCHANT.decay.dmg}ダメージ`));
    this.hitEnemy(e.decay * ENCHANT.decay.dmg, ev, true);
  }

  // ---------------- 効果

  attack(hits, ev) {
    const p1 = this.players.p1;
    hits.forEach((base, i) => this.hitEnemy(base + (i === 0 ? p1.nextBonus : 0), ev));
    if (p1.nextBonus) {
      p1.nextBonus = 0;
      ev.push({ type: 'status', target: 'p1' });
    }
  }

  hitEnemy(amount, ev, dot = false) {
    const e = this.enemy;
    if (e.hp <= 0) return;
    let dmg = amount;
    const blocked = Math.min(e.block, dmg);
    e.block -= blocked;
    dmg -= blocked;
    e.hp = Math.max(0, e.hp - dmg);
    ev.push({ type: 'damage', target: 'enemy', amount: dmg, blocked, hp: e.hp, block: e.block, dot });
    if (!e.frenzy && e.hp > 0 && e.hp <= e.maxHp * RULES.frenzyRatio) {
      e.frenzy = true;
      this.avMax = RULES.frenzyActionValue;
      this.av = Math.min(this.av, this.avMax);
      ev.push({ type: 'frenzy' }, { type: 'av', av: this.av }, log(`翼竜が激昂した！ 行動値が${this.avMax}になる`));
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
      this.comboParry = null;
      ev.push({ type: 'down', pid }, log(`${NAME[pid]} 戦闘不能`));
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
    if (fx.hits) this.attack(fx.hits, ev);
    if (fx.counter) {
      ev.push(log(`${NAME[pid]} 反撃！`));
      this.hitEnemy(fx.counter, ev);
    }
    if (fx.p1Bonus && this.alive('p1')) {
      p1.nextBonus += fx.p1Bonus;
      ev.push({ type: 'status', target: 'p1', text: `次の攻撃+${fx.p1Bonus}` });
    }
    if (fx.rapid) {
      p1.rapid += fx.rapid;
      ev.push({ type: 'status', target: 'p1', text: '速射' });
    }
    if (fx.selfCost) this.gainCost(pid, fx.selfCost, ev);
    if (fx.healAll) for (const t of this.alivePids()) this.heal(t, fx.healAll, ev);
  }

  // ---------------- 敵の行動

  usableEnemySlots() {
    return this.enemy.cards.map((c, i) => (c.broken ? -1 : i)).filter((i) => i >= 0);
  }

  pickEnemySlot() {
    const slots = this.usableEnemySlots();
    return slots[Math.floor(this.rng() * slots.length)];
  }

  enemyDamage(card) {
    const base = Math.max(0, card.dmg + this.enemy.strength);
    return this.enemy.resist ? Math.floor(base / 2) : base;
  }

  // 発動待ちのアルカナが、敵の使ったカードに当たる。HPが0になったカードは破壊され、その行動も止まる
  arcanaStrike(slot) {
    const ev = [];
    const card = this.enemy.cards[slot];
    const p2 = this.players.p2;
    for (const s of p2.stock) {
      if (!s.lit || card.broken) continue;
      const match = s.card.aspect === card.kind;
      const dmg = s.card.dmg + (match ? RULES.arcanaAttrBonus : 0);
      card.hp = Math.max(0, card.hp - dmg);
      ev.push({ type: 'arcanaHit', slot, amount: dmg, match, hp: card.hp, index: p2.stock.indexOf(s) });
      if (card.hp === 0) {
        card.broken = true;
        ev.push({ type: 'broken', slot, card }, log(`「${card.name}」を破壊！`));
      }
    }
    this.checkOver(ev);
    return ev;
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
      ev.push(log(`${NAME[pid]} パリィ ${grade(acc[pid])}`));
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
    const card = e.cards[slot];
    const ev = [];
    if (card.dmg != null) {
      const dmg = this.enemyDamage(card);
      if (e.resist) {
        e.resist--;
        ev.push({ type: 'status', target: 'enemy', text: '抵抗でダメージ半減' });
      }
      for (const t of this.targetsOf(card.target)) this.hitPlayer(t, dmg, ev);
    }
    if (card.selfBlock) this.gainBlock('enemy', card.selfBlock, ev);
    if (card.strength) {
      e.strength += card.strength;
      ev.push({ type: 'status', target: 'enemy', text: `攻撃+${card.strength}` });
    }
    this.checkOver(ev);
    return ev;
  }

  targetsOf(target) {
    const alive = this.alivePids();
    if (target === 'all') return alive;
    if (target === 'random') return [alive[Math.floor(this.rng() * alive.length)]];
    if (alive.length < 2) return alive;
    const { p1, p2 } = this.players;
    return [p1.hp >= p2.hp ? 'p1' : 'p2'];
  }

  // 敵の行動の締め: 崩壊のダメージ（ここで切れる）、魔法陣のアルカナはすべて捨て札、両者のコスト+1、行動値を戻す
  endEnemyAction() {
    const ev = [];
    const e = this.enemy;
    this.tickDecay(ev);
    if (e.decay) {
      e.decay = 0;
      ev.push({ type: 'status', target: 'enemy' });
    }
    const p2 = this.players.p2;
    if (p2.stock.length) {
      p2.discard.push(...p2.stock.map((s) => s.card));
      p2.stock = [];
      ev.push({ type: 'stock', pid: 'p2', clear: true });
    }
    this.checkOver(ev);
    if (this.over) return ev;
    for (const pid of this.alivePids()) this.gainCost(pid, 1, ev);
    this.combo = { p1: [], p2: [] };
    this.round++;
    this.av = this.avMax;
    this.enemyPending = false;
    ev.push({ type: 'av', av: this.av }, { type: 'cost' }, { type: 'status', target: 'p1' }, { type: 'status', target: 'p2' });
    return ev;
  }

  checkOver(ev) {
    if (this.over) return;
    const attacksLeft = this.enemy.cards.some((c) => c.kind === 'attack' && !c.broken);
    if (this.enemy.hp <= 0) [this.over, this.winBy] = ['win', 'hp'];
    else if (!attacksLeft) [this.over, this.winBy] = ['win', 'cards'];
    else if (!this.alivePids().length) this.over = 'lose';
    if (this.over) ev.push({ type: 'over', result: this.over, winBy: this.winBy });
  }
}
