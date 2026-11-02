// 入力と進行。ルールは game.js、見た目は view.js
import { Game } from './game.js';
import { RULES } from './data.js';
import { View } from './view.js';

const KEYMAP = {
  KeyA: ['p1', 'left'],
  KeyD: ['p1', 'right'],
  Space: ['p1', 'use'],
  KeyW: ['p1', 'stock'],
  KeyS: ['p1', 'reroll'],
  ShiftLeft: ['p1', 'undo'],
  KeyE: ['p1', 'end'],
  ArrowLeft: ['p2', 'left'],
  ArrowRight: ['p2', 'right'],
  Enter: ['p2', 'use'],
  NumpadEnter: ['p2', 'use'],
  ArrowUp: ['p2', 'stock'],
  ArrowDown: ['p2', 'reroll'],
  Backspace: ['p2', 'undo'],
  ShiftRight: ['p2', 'end'],
  Digit1: ['item', 'item', 0],
  Digit2: ['item', 'item', 1],
  Digit3: ['item', 'item', 2],
};
// 一人モードの戦闘中。手札は 'solo'、弾丸（W）とアルカナ（E）はキャラを直接指す
const SOLO_KEYMAP = {
  KeyA: ['solo', 'left'],
  KeyD: ['solo', 'right'],
  ArrowLeft: ['solo', 'left'],
  ArrowRight: ['solo', 'right'],
  Space: ['solo', 'use'],
  Enter: ['solo', 'use'],
  NumpadEnter: ['solo', 'use'],
  KeyW: ['p1', 'stock'],
  ArrowUp: ['p1', 'stock'],
  KeyE: ['p2', 'stock'],
  KeyS: ['solo', 'reroll'],
  ArrowDown: ['solo', 'reroll'],
  ShiftLeft: ['solo', 'undo'],
  ShiftRight: ['solo', 'undo'],
  Backspace: ['solo', 'undo'],
  KeyQ: ['solo', 'end'],
  Digit1: ['solo', 'item', 0],
  Digit2: ['solo', 'item', 1],
  Digit3: ['solo', 'item', 2],
};

const view = new View(document.getElementById('app'));
await view.init();
document.getElementById('boot')?.remove();

const cursor = { p1: 0, p2: 0, solo: 0 };
const startReady = { p1: false, p2: false };
// title / intro / player / enemy / parry / ending / result
let mode = 'title';
// ?solo を付けると一人モードで始まる（タイトルで切り替えられる）
const params = new URLSearchParams(location.search);
let playMode = params.has('solo') ? 'solo' : 'duo';
// 一人モードの山札の分け方。?deck=mixed / ?deck=split で指定でき、タイトルでも W / S で切り替えられる
let soloDeck = ['mixed', 'split'].includes(params.get('deck')) ? params.get('deck') : RULES.soloDeck;
// 一人モードの進行は行動値制（v0.27 で確定）。比較用に ?progress=turn を付けるとターン制で動く
let soloProgress = ['turn', 'av'].includes(params.get('progress')) ? params.get('progress') : RULES.soloProgress;
const newGame = () => new Game(Math.random, playMode, { soloDeck, soloProgress });
let game = newGame();
// 行動値制で、最後に掛け合いを出した敵のカードの種類
let lastBanterKind = null;

view.bindGame(game, cursor);
view.setPhase('title');
view.showTitle(startReady);

window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyH' || (e.code === 'Escape' && view.helpOpen)) {
    e.preventDefault();
    view.toggleHelp();
    return;
  }
  const inBattle = mode !== 'title' && mode !== 'result';
  const k = (inBattle && game.solo ? SOLO_KEYMAP : KEYMAP)[e.code];
  if (!k) return;
  e.preventDefault();
  if (e.repeat || view.helpOpen) return;
  onAction(...k);
});

function onAction(pid, act, arg) {
  if (mode === 'title' || mode === 'result') {
    if (act === 'left' || act === 'right') return switchMode();
    // 一人モードは W / S で山札の分け方を切り替える
    if (playMode === 'solo' && pid === 'p1' && (act === 'stock' || act === 'reroll')) return switchDeck();
    if (act !== 'use') return;
    if (playMode === 'solo') return startBattle();
    startReady[pid] = true;
    view.updateStartReady(startReady);
    if (startReady.p1 && startReady.p2) startBattle();
  } else if (mode === 'parry') {
    // 一人モードのバーは 1P のマーカー1本
    if (act === 'use') view.parryStop(game.solo ? 'p1' : pid);
  } else if (mode === 'player') {
    playerAction(pid, act, arg);
  }
}

// タイトル・リザルトで一人／二人を切り替える。背景の盤面もそのモードの配置で作り直す
function switchMode() {
  playMode = playMode === 'solo' ? 'duo' : 'solo';
  startReady.p1 = startReady.p2 = false;
  if (mode === 'title') {
    game = newGame();
    view.bindGame(game, cursor);
    view.showTitle(startReady);
  } else {
    view.setSolo(playMode === 'solo', soloDeck === 'split', playMode === 'solo' ? soloProgress === 'turn' : RULES.duoProgress === 'turn');
    view.updateStartReady(startReady);
  }
}

function switchDeck() {
  soloDeck = soloDeck === 'split' ? 'mixed' : 'split';
  rebuildSolo();
}

function rebuildSolo() {
  if (mode === 'title') {
    game = newGame();
    view.bindGame(game, cursor);
    view.showTitle(startReady);
  } else {
    view.setSolo(true, soloDeck === 'split', soloProgress === 'turn');
    view.updateStartReady(startReady);
  }
}

// カーソルは端で止まる（手札の扇はループしない）。ターン制では使ったカードの枠が空くので、空でない枠へ飛ばす
function moveCursor(hid, step) {
  const hand = game.holder(hid).hand;
  for (let i = cursor[hid] + step; i >= 0 && i < hand.length; i += step) {
    if (hand[i]) {
      cursor[hid] = i;
      return true;
    }
  }
  return false;
}

// 今の枠が空なら、右の空でない枠へ、なければ左へ
function fixCursors() {
  for (const hid of game.handIds()) {
    if (!game.holder(hid).hand[cursor[hid]] && !moveCursor(hid, 1)) moveCursor(hid, -1);
  }
}

function playerAction(pid, act, arg) {
  if (act === 'item') {
    const res = game.useItem(arg);
    if (!res) return;
    if (res.error) {
      view.denyItem(arg);
      return;
    }
    view.enqueue(res.events);
    view.refresh();
    return;
  }
  // 取り消しだけは、ターン終了を押したあとでも受け付ける
  if (act !== 'undo' && !game.canAct(pid)) return;
  if (act === 'left' || act === 'right') {
    moveCursor(pid, act === 'left' ? -1 : 1);
    return;
  }
  let res = null;
  if (act === 'use') {
    const slot = cursor[pid];
    res = game.playCard(pid, slot);
    if (!res) return;
    if (res.error) {
      view.denyCard(pid, slot, res.error);
      return;
    }
    view.cardPlayed(pid, slot, res.card);
  } else if (act === 'stock') {
    res = game.useStock(pid);
    if (!res) return;
    if (res.error) {
      view.denyStock(pid, res.error);
      return;
    }
  } else if (act === 'undo') {
    res = game.undo(pid);
    if (!res) return;
    if (res.error) {
      view.denyUndo(pid, res.error);
      return;
    }
    view.undone();
  } else if (act === 'end') {
    res = game.endTurn(pid);
    if (!res) return;
  } else if (act === 'reroll') {
    res = game.reroll(pid);
    if (!res) return;
    if (res.error) {
      view.denyText(pid, res.error);
      return;
    }
    view.handRerolled(pid);
  }
  if (!res) return;
  fixCursors();
  view.enqueue(res.events);
  view.refresh();
  afterPlayerAction();
}

// 決着か行動値0なら、演出が終わるのを待って次へ進む
async function afterPlayerAction() {
  if (mode !== 'player') return;
  if (game.over) {
    mode = 'ending';
    await view.idle();
    return finish();
  }
  if (game.enemyPending) {
    mode = 'enemy';
    await view.idle();
    await enemyPhase();
  }
}

async function startBattle() {
  mode = 'intro';
  lastBanterKind = null;
  startReady.p1 = startReady.p2 = false;
  game = newGame();
  cursor.p1 = cursor.p2 = cursor.solo = 0;
  view.bindGame(game, cursor);
  view.setPhase('intro');
  await view.hideOverlay();
  const sub = !game.turnBased ? '2人のカードを1人で使う ― カードを使うたびに敵の行動値が減る'
    : game.solo ? '2人のカードを1人で使う ― 「ターン終了」で敵が行動' : '2人で自由に行動 ― 2人とも「ターン終了」で敵が行動';
  await view.banner('BATTLE START', sub, '#e8fbff', 700);
  mode = 'player';
  view.setPhase('player');
}

// 敵の行動: カードを1枚選ぶ → 発動待ちのアルカナが当たる → 壊れなければパリィ → 効果
async function enemyPhase() {
  do {
    await enemyAction();
  } while (!game.over && game.enemyPending);
  if (game.over) return finish();
  fixCursors();
  mode = 'player';
  view.setPhase('player');
}

async function enemyAction() {
  mode = 'enemy';
  view.setPhase('enemy');
  const slot = game.pickEnemySlot();
  const card = game.enemy.cards[slot];
  view.addLog(`敵「${card.name}」`);
  await view.revealEnemyCard(slot, card, card.dmg != null ? game.enemyDamage(card) : undefined);
  // 敵のカードの種類に合わせて2人が掛け合う。行動値制は敵がよく動くので、前回と違う種類のカードのときだけ
  if (game.turnBased || card.kind !== lastBanterKind) {
    lastBanterKind = card.kind;
    await view.banter(card.kind);
  }
  view.enqueue(game.arcanaStrike(slot));
  await view.idle();
  if (!card.broken && !game.over) {
    if (card.kind === 'attack' && game.parryPids().length) {
      mode = 'parry';
      view.setPhase('parry');
      const pids = game.parryPids();
      // 一人モードはバー1本で止め、その位置を構えている全員に使う
      let accs = await view.runParry(game.solo ? ['p1'] : pids);
      if (game.solo) accs = Object.fromEntries(pids.map((pid) => [pid, accs.p1 ?? 0]));
      mode = 'enemy';
      view.setPhase('enemy');
      view.enqueue(game.resolveParry(accs));
      await view.idle();
    }
    if (!game.over) {
      await view.enemyAct(card);
      view.enqueue(game.resolveEnemyCard(slot));
      await view.idle();
    }
  }
  await view.dismissEnemyCard(slot);
  if (!game.over) {
    view.enqueue(game.endEnemyAction());
    await view.idle();
  }
}

// ?debug を付けたときだけ、確認用の操作をコンソールに出す
if (new URLSearchParams(location.search).has('debug')) {
  window.__debug = {
    view,
    act: onAction,
    get game() { return game; },
    get mode() { return mode; },
    step: (ms) => view.step(ms),
    async shot(name, x, y, w, h, outW) {
      const blob = await view.capture(x, y, w, h, outW);
      await fetch(`/__shot?name=${encodeURIComponent(name)}`, { method: 'POST', body: blob });
      return name;
    },
  };
}

async function finish() {
  mode = 'ending';
  view.setPhase('result');
  await view.banner(game.over === 'win' ? '撃破！' : '全滅…', '', game.over === 'win' ? '#ecbd42' : '#ff6b6b', 500);
  mode = 'result';
  view.showResult(game, startReady);
}
