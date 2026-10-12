// 入力とターン進行。ルールは game.js、見た目は view.js
import { Game } from './game.js';
import { View } from './view.js';

const KEYMAP = {
  KeyA: ['p1', 'left'],
  KeyD: ['p1', 'right'],
  Space: ['p1', 'use'],
  KeyW: ['p1', 'reroll'],
  KeyS: ['p1', 'end'],
  ArrowLeft: ['p2', 'left'],
  ArrowRight: ['p2', 'right'],
  Enter: ['p2', 'use'],
  NumpadEnter: ['p2', 'use'],
  ArrowUp: ['p2', 'reroll'],
  ArrowDown: ['p2', 'end'],
};

const view = new View(document.getElementById('app'));
await view.init();
document.getElementById('boot')?.remove();

const cursor = { p1: 0, p2: 0 };
const startReady = { p1: false, p2: false };
// title / intro / player / resolve / enemy / parry / ending / result
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
  if (act === 'end') {
    if (!game.alive(pid)) return;
    game.toggleReady(pid);
    view.refresh();
    if (game.allReady()) resolvePhase();
    return;
  }
  if (!game.canAct(pid)) return;
  if (act === 'left' || act === 'right') {
    cursor[pid] = (cursor[pid] + (act === 'left' ? 2 : 1)) % 3;
    return;
  }
  if (act === 'use') {
    const slot = cursor[pid];
    const res = game.playCard(pid, slot);
    if (!res) return;
    if (res.error) {
      view.denyCard(pid, slot);
      return;
    }
    view.cardPlayed(pid, slot, res.card);
    view.refresh();
    return;
  }
  if (act === 'reroll') {
    const res = game.reroll(pid);
    if (!res) return;
    if (res.error) {
      view.denyReroll(pid);
      return;
    }
    view.handRerolled(pid);
    view.enqueue(res.events);
    view.refresh();
  }
}

async function startBattle() {
  mode = 'intro';
  startReady.p1 = startReady.p2 = false;
  game = new Game();
  cursor.p1 = cursor.p2 = 0;
  view.bindGame(game, cursor);
  await view.hideOverlay();
  await beginPlayerTurn();
}

async function beginPlayerTurn() {
  mode = 'intro';
  game.startTurn();
  view.setPhase('intro');
  if (game.turn > 1) await view.wait(450);
  await view.turnBanner();
  mode = 'player';
  view.setPhase('player');
}

// 場に出したカードをまとめて発動する
async function resolvePhase() {
  mode = 'resolve';
  view.setPhase('resolve');
  await view.idle();
  view.enqueue(game.resolveTurn());
  await view.idle();
  if (game.over) return finish();
  await enemyPhase();
}

async function enemyPhase() {
  mode = 'enemy';
  view.setPhase('enemy');
  await view.idle();
  const actions = game.enemyActionCount();
  for (let i = 0; i < actions && !game.over; i++) {
    const slot = game.pickEnemySlot();
    const card = game.enemy.hand[slot];
    view.addLog(`敵「${card.name}」`);
    await view.revealEnemyCard(slot, card, card.dmg != null ? game.enemyDamage(card) : undefined);
    if (card.kind === 'normal' && game.parryPids().length) {
      mode = 'parry';
      view.setPhase('parry');
      const accs = await view.runParry(game.parryPids());
      mode = 'enemy';
      view.setPhase('enemy');
      view.enqueue(game.resolveParry(accs));
      await view.idle();
      if (game.over) {
        await view.dismissEnemyCard(slot);
        break;
      }
    }
    await view.enemyAct(card);
    view.enqueue(game.resolveEnemyCard(slot));
    await view.idle();
    await view.dismissEnemyCard(slot);
  }
  if (game.over) return finish();
  view.enqueue(game.endEnemyPhase());
  await view.idle();
  await beginPlayerTurn();
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
