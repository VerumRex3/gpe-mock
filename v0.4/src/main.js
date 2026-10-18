// 入力と進行。ルールは game.js、見た目は view.js
import { Game } from './game.js';
import { View } from './view.js';

const KEYMAP = {
  KeyA: ['p1', 'left'],
  KeyD: ['p1', 'right'],
  Space: ['p1', 'use'],
  KeyW: ['p1', 'reroll'],
  KeyS: ['p1', 'stock'],
  ArrowLeft: ['p2', 'left'],
  ArrowRight: ['p2', 'right'],
  Enter: ['p2', 'use'],
  NumpadEnter: ['p2', 'use'],
  ArrowUp: ['p2', 'reroll'],
  ArrowDown: ['p2', 'stock'],
};

const view = new View(document.getElementById('app'));
await view.init();
document.getElementById('boot')?.remove();

const cursor = { p1: 0, p2: 0 };
const startReady = { p1: false, p2: false };
// title / intro / player / enemy / parry / ending / result
let mode = 'title';
let game = new Game();

view.bindGame(game, cursor);
view.setPhase('title');
view.showTitle(startReady);

window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyH' || (e.code === 'Escape' && view.helpOpen)) {
    e.preventDefault();
    view.toggleHelp();
    return;
  }
  const k = KEYMAP[e.code];
  if (!k) return;
  e.preventDefault();
  if (e.repeat || view.helpOpen) return;
  onAction(k[0], k[1]);
});

function onAction(pid, act) {
  if (mode === 'title' || mode === 'result') {
    if (act !== 'use') return;
    startReady[pid] = true;
    view.updateStartReady(startReady);
    if (startReady.p1 && startReady.p2) startBattle();
  } else if (mode === 'parry') {
    if (act === 'use') view.parryStop(pid);
  } else if (mode === 'player') {
    playerAction(pid, act);
  }
}

function playerAction(pid, act) {
  if (!game.canAct(pid)) return;
  if (act === 'left' || act === 'right') {
    cursor[pid] = (cursor[pid] + (act === 'left' ? 2 : 1)) % 3;
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
  } else if (act === 'reroll') {
    res = game.reroll(pid);
    if (!res) return;
    view.handRerolled(pid);
  }
  if (!res) return;
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
  startReady.p1 = startReady.p2 = false;
  game = new Game();
  cursor.p1 = cursor.p2 = 0;
  view.bindGame(game, cursor);
  view.setPhase('intro');
  await view.hideOverlay();
  await view.banner('BATTLE START', '2人で自由に行動 ― カードを使うたびに敵の行動値が減る', '#e8fbff', 700);
  mode = 'player';
  view.setPhase('player');
}

// 敵の行動: カードを1枚選ぶ → 発動待ちのアルカナが当たる → 壊れなければパリィ → 効果
async function enemyPhase() {
  mode = 'enemy';
  view.setPhase('enemy');
  const slot = game.pickEnemySlot();
  const card = game.enemy.cards[slot];
  view.addLog(`敵「${card.name}」`);
  await view.revealEnemyCard(slot, card, card.dmg != null ? game.enemyDamage(card) : undefined);
  view.enqueue(game.arcanaStrike(slot));
  await view.idle();
  if (!card.broken && !game.over) {
    if (card.kind === 'attack' && game.parryPids().length) {
      mode = 'parry';
      view.setPhase('parry');
      const accs = await view.runParry(game.parryPids());
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
  if (game.over) return finish();
  mode = 'player';
  view.setPhase('player');
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
