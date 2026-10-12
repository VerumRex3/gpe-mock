// カードと数値の定義（モック用の仮データ。調整はここだけで完結させる）

export const RULES = {
  playerMaxHp: 80,
  enemyMaxHp: 380,
  handSize: 3,
  rerollCost: 1,
  // マナ上限: ターン開始時に全回復。上限はターンごとに step ずつ変化し bound で止まる
  cap: {
    p1: { start: 3, step: 1, bound: 10 },
    p2: { start: 10, step: -1, bound: 3 },
  },
  frenzyRatio: 0.5, // 敵HPがこの割合以下で激昂（1ターン2回行動）
  parry: {
    successAcc: 0.65, // 中央からの近さ(0..1)がこれ以上で「成功」
    perfectAcc: 0.92,
    sweepMs: 1300, // マーカーがバーの端から端まで動く時間
  },
};

export const TYPE_LABEL = { attack: '攻撃', parry: 'パリィ', buff: 'バフ', debuff: 'デバフ' };

// hits: 敵へのダメージ列 / block: パリィの防御値 [バーの端, 中央] / success: パリィ成功時効果
// blockAll: 構えていると味方全員がバーに参加し、それぞれ自分の止めた位置で決まる防御値を得る
// fx: 発動時効果 / comboFx: 連携時効果（combo: true の金枠カード）
export const CARDS = {
  // ---- 1P アタッカー ----
  slash: { name: '斬撃', owner: 'p1', type: 'attack', cost: 1, hits: [6], text: '敵に6ダメージ' },
  flurry: { name: '連撃', owner: 'p1', type: 'attack', cost: 2, hits: [3, 3, 3], text: '敵に3ダメージ×3' },
  riposte: {
    name: '受け流し', owner: 'p1', type: 'parry', cost: 1, block: [0, 4], success: { counter: 8 },
    text: '防御0〜4\n成功：反撃8ダメージ',
  },
  cleave: { name: '大振り', owner: 'p1', type: 'attack', cost: 5, hits: [22], text: '敵に22ダメージ' },
  crowClaw: {
    name: '渡鴉の爪', owner: 'p1', type: 'attack', combo: true, cost: 3, hits: [10], comboFx: { hits: [15] },
    text: '敵に10ダメージ', comboText: '追加15ダメージ',
  },
  finale: { name: '終焉の一撃', owner: 'p1', type: 'attack', cost: 8, hits: [40], text: '敵に40ダメージ' },
  featherGuard: {
    name: '鴉羽の構え', owner: 'p1', type: 'parry', combo: true, cost: 2, block: [0, 5],
    success: { counter: 6 }, comboFx: { counter: 20 },
    text: '防御0〜5\n成功：反撃6ダメージ', comboText: '2人とも成功で反撃20',
  },

  // ---- 2P バッファー ----
  inspire: { name: '鼓舞', owner: 'p2', type: 'buff', cost: 3, fx: { p1Mult: 1.5 }, text: '1Pの次の攻撃\nダメージ×1.5' },
  aegis: {
    name: '守護の盾', owner: 'p2', type: 'parry', cost: 2, block: [0, 4], blockAll: true, success: { p1Bonus: 5 },
    text: '全員でパリィ\n各自に防御0〜4\n自分成功で1Pの次の攻撃+5',
  },
  manaGift: {
    name: '魔力供給', owner: 'p2', type: 'buff', cost: 3, fx: { p1NextMana: 2 },
    text: '次のターンの\n1Pのマナ+2\n（上限を超えてよい）',
  },
  bind: { name: '呪縛', owner: 'p2', type: 'debuff', cost: 4, fx: { weak: [4, 2] }, text: '敵の与ダメージ-4\n（2ターン）' },
  mark: { name: '脆弱の印', owner: 'p2', type: 'debuff', cost: 3, fx: { vuln: [3, 2] }, text: '敵の被ダメージ\n1ヒットごと+3\n（2ターン）' },
  lamp: { name: '癒しの灯', owner: 'p2', type: 'buff', cost: 4, fx: { healAll: 8 }, text: '味方全員のHP+8' },
  resonance: {
    name: '共鳴', owner: 'p2', type: 'buff', combo: true, cost: 5, fx: { healAll: 6 }, comboFx: { hits: [20] },
    text: '味方全員のHP+6', comboText: '敵に20ダメージ',
  },
  echoShield: {
    name: '共鳴の盾', owner: 'p2', type: 'parry', combo: true, cost: 3, block: [0, 5], blockAll: true,
    success: { healAll: 4 }, comboFx: { counter: 15, healAll: 6 },
    text: '全員でパリィ\n各自に防御0〜5\n自分成功で全員HP+4', comboText: '2人とも成功で反撃15・HP+6',
  },
};

export const DECKS = {
  p1: ['slash', 'slash', 'slash', 'flurry', 'riposte', 'riposte', 'cleave', 'crowClaw', 'finale', 'featherGuard'],
  p2: ['inspire', 'aegis', 'aegis', 'manaGift', 'manaGift', 'bind', 'mark', 'lamp', 'resonance', 'echoShield'],
};

// kind: normal = 通常攻撃（パリィ対象） / special = 特殊行動（パリィ不可）
export const ENEMY = {
  name: '灯火の翼竜',
  handSize: 5,
  cards: {
    clawA: { name: '爪撃', kind: 'normal', target: 'p1', dmg: 16 },
    clawB: { name: '爪撃', kind: 'normal', target: 'p2', dmg: 16 },
    tail: { name: '尾薙ぎ', kind: 'normal', target: 'all', dmg: 11 },
    bite: { name: '噛みつき', kind: 'normal', target: 'highHp', dmg: 20 },
    flame: { name: '灯火の炎', kind: 'special', target: 'all', dmg: 8 },
    wing: { name: '羽ばたき', kind: 'special', selfBlock: 15 },
    roar: { name: '咆哮', kind: 'special', strength: 3 },
  },
  deck: ['clawA', 'clawB', 'tail', 'tail', 'bite', 'flame', 'wing', 'roar'],
};
