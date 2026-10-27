// 戦闘ルール本体。描画には依存しない（node でもそのまま動く）
// 各操作は「起きたこと」をイベント配列で返し、描画側がそれを順に演出する
import { RULES, CARDS, DECKS, ENEMY, ENCHANT, KIND_LABEL, ITEMS } from './data.js';

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

// mode: 'duo' = 2人でそれぞれの手札を操作 / 'solo' = 1人で2人分の手札（shared）を操作
// 一人モードの山札 soloDeck: 'mixed' = 2人のデッキを1つに混ぜる / 'split' = 山札はキャラ別のまま、手札はルスカー3枚＋ラティシア3枚
// 手札の持ち主は 'p1' / 'p2'（二人モード）か 'solo'（一人モード）。カードの効果やコストはカードの owner のキャラに付く
export class Game {
  constructor(rng = Math.random, mode = 'duo', { soloDeck = RULES.soloDeck } = {}) {
    this.rng = rng;
    this.mode = mode;
    this.solo = mode === 'solo';
    this.split = this.solo && soloDeck === 'split';
    // 二人モードはターン制（RULES.duoProgress）。一人モードは行動値制のまま
    this.turnBased = !this.solo && RULES.duoProgress === 'turn';
    this.ended = { p1: false, p2: false }; // ターン制: 「ターン終了」を押したか
    this.rerolled = { p1: false, p2: false }; // ターン制: このターンに引き直したか（1ターン1回）
    this.enemyActsLeft = 0; // ターン制: このターンに敵があと何回行動するか
    this.round = 1; // 敵が行動するたびに進む
    this.over = null; // 'win' | 'lose'
    this.winBy = null; // 'hp' | 'cards'
    const enemyHp = this.turnBased ? RULES.turn.enemyHp : RULES.enemyMaxHp;
    this.enemy = {
      name: ENEMY.name, hp: enemyHp, maxHp: enemyHp, block: 0,
      strength: 0, frenzy: false, decay: 0, resist: 0,
      cards: ENEMY.lineup.map(makeEnemyCard),
    };
    this.avMax = RULES.actionValue;
    this.av = this.avMax;
    this.enemyPending = false; // 行動値が0になった（ターン制では2人ともターン終了した）ので、敵の行動待ち
    this.players = { p1: this.makePlayer('p1'), p2: this.makePlayer('p2') };
    if (this.turnBased) for (const p of Object.values(this.players)) p.cost = RULES.turn.cost;
    this.shared = null;
    if (this.split) {
      // 手札の左3枚がルスカー、右3枚がラティシア。使った枠はその持ち主の山札から引くので、いつも 3:3
      this.shared = { hand: [...this.players.p1.hand, ...this.players.p2.hand] };
      this.players.p1.hand = [];
      this.players.p2.hand = [];
    } else if (this.solo) {
      this.shared = this.makePile([...DECKS.p1, ...DECKS.p2], RULES.soloHandSize);
    }
    this.items = ITEMS.map((it) => ({ ...it, used: false }));
    this.undoStack = [];
  }

  makePlayer(pid) {
    const p = {
      id: pid, hp: RULES.playerMaxHp, maxHp: RULES.playerMaxHp, block: 0, cost: RULES.startCost,
      armed: [], nextBonus: 0, rapid: 0,
      // p1: 弾倉（末尾が一番上＝次弾） / p2: 魔法陣（先頭から順に埋まる）。中身は { card, lit }
      stock: [],
    };
    return this.solo && !this.split ? p : Object.assign(p, this.makePile(DECKS[pid], RULES.handSize));
  }

  makePile(ids, handSize) {
    const pile = { deck: shuffle(ids.map(makeCard), this.rng), discard: [], hand: [] };
    for (let i = 0; i < handSize; i++) pile.hand.push(this.draw(pile));
    return pile;
  }

  // 手札・山札・捨て札を持つもの。hid は手札の持ち主、pid はキャラ
  holder(hid) { return hid === 'solo' ? this.shared : this.players[hid]; }
  pile(pid) { return this.solo && !this.split ? this.shared : this.players[pid]; }
  handIds() { return this.solo ? ['solo'] : PIDS; }
  // 手札の slot 番目の枠を埋めるときに引く山札
  drawPile(hid, slot) {
    if (!this.split) return this.holder(hid);
    return this.players[slot < RULES.handSize ? 'p1' : 'p2'];
  }

  // 引くたびに山札からランダムに1枚選ぶ（取り消してから引き直しても、同じカードが来るとは限らない）
  draw(p) {
    if (!p.deck.length) {
      p.deck = p.discard;
      p.discard = [];
    }
    if (!p.deck.length) return null;
    return p.deck.splice(Math.floor(this.rng() * p.deck.length), 1)[0];
  }

  alive(pid) { return this.players[pid].hp > 0; }
  alivePids() { return PIDS.filter((pid) => this.alive(pid)); }
  other(pid) { return pid === 'p1' ? 'p2' : 'p1'; }
  canAct(pid) {
    if (this.over || this.enemyPending) return false;
    if (pid === 'solo') return this.alivePids().length > 0;
    return this.alive(pid) && !(this.turnBased && this.ended[pid]);
  }

  // 弾倉の次弾 / 魔法陣でまだ発動していない最初のアルカナ / 属性を付けられる最初のアルカナ
  topBullet() { return this.players.p1.stock.at(-1) ?? null; }
  nextUnlit() { return this.players.p2.stock.find((s) => !s.lit) ?? null; }
  attrTarget() { return this.players.p2.stock.find((s) => !s.card.aspect) ?? null; }

  // ---------------- 味方の行動

  // カードが今使えるか。使えないときは理由を返す
  checkCard(pid, card) {
    const p = this.players[pid];
    if (!this.alive(pid)) return 'down';
    if (card.cost > p.cost) return 'cost';
    if (card.load && p.stock.length >= RULES.stockMax) return 'full';
    if (card.type === 'arcana' && p.stock.length >= RULES.stockMax) return 'full';
    if (card.ench && (!this.alive('p1') || !this.topBullet())) return 'noBullet';
    if (card.attr && (!this.alive('p2') || !this.attrTarget())) return 'noArcana';
    return null;
  }

  // カードは使った時点で発動する
  playCard(hid, slot) {
    if (!this.canAct(hid)) return null;
    const h = this.holder(hid);
    const card = h.hand[slot];
    if (!card) return null;
    const pid = this.solo ? card.owner : hid;
    const p = this.players[pid];
    const err = this.checkCard(pid, card);
    if (err) return { error: err };
    this.saveUndo(hid);
    p.cost -= card.cost;
    h.hand[slot] = this.draw(this.drawPile(hid, slot));
    const ev = [log(`${NAME[pid]}「${card.name}」`)];
    this.resolveCard(pid, card, ev);
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
        const n = Math.min(card.load, RULES.stockMax - p.stock.length);
        for (let i = 0; i < n; i++) p.stock.push({ card: makeCard(pid === 'p1' ? 'bullet' : 'arcana'), lit: false });
        ev.push({ type: 'stock', pid, add: n });
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
    this.pile(pid).discard.push(card);
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
    this.pile('p1').discard.push(card);
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

  reroll(hid) {
    if (!this.canAct(hid)) return null;
    if (this.turnBased && this.rerolled[hid]) return { error: 'rerolled' };
    this.saveUndo(hid);
    if (this.turnBased) this.rerolled[hid] = true;
    const h = this.holder(hid);
    for (const c of h.hand) if (c) this.pile(c.owner).discard.push(c);
    h.hand = h.hand.map(() => null);
    for (let i = 0; i < h.hand.length; i++) h.hand[i] = this.draw(this.drawPile(hid, i));
    const ev = [log(`${this.solo ? '' : `${NAME[hid]} `}手札を引き直した`)];
    // ターン制では引き直しは1ターン1回で、コストは増えない
    if (!this.turnBased) for (const q of this.alivePids()) this.gainCost(q, 1, ev);
    this.afterAction(hid, ev, false);
    this.checkOver(ev);
    ev.push({ type: 'cost' });
    return { events: ev };
  }

  // ---------------- 取り消し

  // 敵が次に行動するまでの間、行動の直前の状態を積んでおく。取り消せるのは一番新しい行動だけで、それが自分の行動のとき
  // 一人モードでは操作する人が1人なので、誰の行動でも 'solo' として積む。二人モードのアイテムは 'item' で、どちらも取り消せない
  saveUndo(who) {
    const { round, avMax, av, enemy, players, shared, items, ended, rerolled } = this;
    this.undoStack.push({ who: this.solo ? 'solo' : who, state: structuredClone({ round, avMax, av, enemy, players, shared, items, ended, rerolled }) });
  }

  // ---------------- ターン制（二人モード）

  // 「ターン終了」。2人とも（倒れた人は除く）押したら敵が行動する。押したあとも、相方が押す前なら取り消しで戻せる
  endTurn(pid) {
    if (!this.turnBased || !this.canAct(pid)) return null;
    this.saveUndo(pid);
    this.ended[pid] = true;
    const all = this.alivePids().every((q) => this.ended[q]);
    const ev = [log(`${NAME[pid]} ターン終了`), { type: 'turnEnd', pid, all }];
    if (all) {
      this.enemyActsLeft = this.enemy.frenzy ? RULES.turn.frenzyEnemyActs : RULES.turn.enemyActs;
      this.enemyPending = true;
    }
    return { events: ev };
  }

  // ターン終了を押した人も、相方が押す前なら取り消せる（canAct は終了後 false になるので別に見る）
  canRewind(who) {
    if (this.over || this.enemyPending) return false;
    return who === 'solo' ? this.alivePids().length > 0 : this.alive(who);
  }

  canUndo(who) {
    return this.canRewind(who) && this.undoStack.at(-1)?.who === who;
  }

  undo(who) {
    if (!this.canRewind(who)) return null;
    if (!this.undoStack.length) return { error: 'noUndo' };
    if (this.undoStack.at(-1).who !== who) return { error: 'notYours' };
    Object.assign(this, this.undoStack.pop().state);
    return { events: [log(`${who === 'solo' ? '' : `${NAME[who]} `}取り消し`)] };
  }

  // ---------------- アイテム

  // 1戦に各1回。行動値を消費せず、相方のコストも回復しない
  useItem(i) {
    if (this.over || this.enemyPending || !this.alivePids().length) return null;
    const it = this.items[i];
    if (!it) return null;
    if (it.used) return { error: 'used' };
    this.saveUndo('item');
    it.used = true;
    const ev = [log(`アイテム「${it.name}」`), { type: 'item', index: i }];
    this.applyFx(null, it.fx, ev);
    this.checkOver(ev);
    ev.push({ type: 'cost' });
    return { item: it, events: ev };
  }

  // 行動のあと: 相方のコスト+1、敵の行動値-1、崩壊のダメージ
  // ターン制では行動値もコストの回復も無く、崩壊のダメージだけ入る
  afterAction(pid, ev, partnerGain = true) {
    if (this.turnBased) {
      this.tickDecay(ev);
      return;
    }
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
      if (this.turnBased) {
        ev.push({ type: 'frenzy' }, log(`翼竜が激昂した！ 次のターンから1ターンに${RULES.turn.frenzyEnemyActs}回行動する`));
      } else {
        this.avMax = RULES.frenzyActionValue;
        this.av = Math.min(this.av, this.avMax);
        ev.push({ type: 'frenzy' }, { type: 'av', av: this.av }, log(`翼竜が激昂した！ 行動値が${this.avMax}になる`));
      }
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
      this.pile(pid).discard.push(...p.armed);
      p.armed = [];
      p.block = 0;
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
    if (fx.guardAll) for (const t of this.alivePids()) this.gainBlock(t, fx.guardAll, ev);
    if (fx.costAll) for (const t of this.alivePids()) this.gainCost(t, fx.costAll, ev);
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
    const base = Math.max(0, card.dmg + this.enemy.strength + (this.turnBased ? RULES.turn.dmgBonus : 0));
    return this.enemy.resist ? Math.floor(base / 2) : base;
  }

  // 敵の行動ごとに、発動待ちのアルカナが番号の若い順に1つだけ、敵の使ったカードに当たって捨て札に行く
  // 残りのアルカナは魔法陣に残り、番号が1つずつ繰り上がる。HPが0になったカードは破壊され、その行動も止まる
  arcanaStrike(slot) {
    const ev = [];
    const card = this.enemy.cards[slot];
    const p2 = this.players.p2;
    const index = p2.stock.findIndex((s) => s.lit);
    if (index < 0) return ev;
    const [s] = p2.stock.splice(index, 1);
    this.pile('p2').discard.push(s.card);
    const match = s.card.aspect === card.kind;
    const dmg = s.card.dmg + (match ? RULES.arcanaAttrBonus : 0);
    card.hp = Math.max(0, card.hp - dmg);
    ev.push({ type: 'arcanaHit', slot, amount: dmg, match, hp: card.hp, index });
    if (card.hp === 0) {
      card.broken = true;
      ev.push({ type: 'broken', slot, card }, log(`「${card.name}」を破壊！`));
    }
    this.checkOver(ev);
    return ev;
  }

  armedPids() { return this.alivePids().filter((pid) => this.players[pid].armed.length); }

  // 全員向けの盾（blockAll）が構えられているか
  sharedParry() { return this.armedPids().some((pid) => this.players[pid].armed.some((c) => c.blockAll)); }

  // バーに参加する人。全員向けの盾があるときは、パリィカードを出していない人も参加する
  parryPids() {
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
    for (const pid of pids) {
      const p = this.players[pid];
      this.pile(pid).discard.push(...p.armed);
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

  // 敵の行動の締め: 崩壊のダメージ（ここで切れる）、両者のコスト+1、行動値を戻す
  // ターン制では、このターンの敵の行動が残っていれば enemyPending のまま返す。終わったら次のターンでコストが戻る
  endEnemyAction() {
    const ev = [];
    const e = this.enemy;
    this.tickDecay(ev);
    if (e.decay) {
      e.decay = 0;
      ev.push({ type: 'status', target: 'enemy' });
    }
    this.checkOver(ev);
    if (this.over) return ev;
    if (this.turnBased) {
      this.enemyActsLeft--;
      if (this.enemyActsLeft > 0) return ev;
      for (const pid of this.alivePids()) this.players[pid].cost = RULES.turn.cost;
      this.ended = { p1: false, p2: false };
      this.rerolled = { p1: false, p2: false };
      ev.push({ type: 'newTurn' });
    } else {
      for (const pid of this.alivePids()) this.gainCost(pid, 1, ev);
    }
    // 取り消せるのは敵が次に行動するまで（v0.6 まではここで消しておらず、敵の行動をまたいで戻せていた）
    this.undoStack = [];
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
