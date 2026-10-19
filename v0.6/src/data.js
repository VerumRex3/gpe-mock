// カードと数値の定義（モック用の仮データ。調整はここだけで完結させる）

export const RULES = {
  playerMaxHp: 70,
  enemyMaxHp: 80,
  handSize: 3,
  startCost: 3, // コストの初期値。上限なし
  // 行動値: 味方がカードを使う・手札を引き直すたびに1減り、0で敵が行動して元に戻る
  actionValue: 4,
  frenzyActionValue: 3, // 激昂後の行動値
  frenzyRatio: 0.5, // 敵HPがこの割合以下で激昂
  stockMax: 5, // 弾倉・魔法陣に置ける数
  arcanaAttrBonus: 5, // アルカナの属性が敵カードの種類と合ったときの追加ダメージ
  parry: {
    successAcc: 0.65, // 中央からの近さ(0..1)がこれ以上で「成功」
    perfectAcc: 0.92,
    sweepMs: 1300, // マーカーがバーの端から端まで動く時間
  },
};

export const TYPE_LABEL = {
  attack: '攻撃', parry: 'パリィ', buff: 'バフ', guard: '防御', focus: '集中',
  bullet: '弾丸', arcana: 'アルカナ', load: '装填', enchant: '強化',
};

// 敵カードの種類（運命超過の属性もこの3つ）
export const KIND_LABEL = { attack: '攻撃', guard: '防御', special: '特殊' };

// 弾丸に付く星霊の加護
export const ENCHANT = {
  decay: { name: '崩壊', dmg: 3 }, // 命中後、次の敵の行動が終わるまで、行動ごとに敵へ dmg
  resist: { name: '抵抗' }, // 命中で、敵の次の攻撃カードのダメージを半減（重ねると次の次も）
  power: { name: '特攻', dmg: 3 }, // 弾丸の攻撃力 +dmg
};

// free: 行動値を消費しない（相方のコストも回復しない）
// hits: 敵へのダメージ列 / block: パリィの防御値 [バーの端, 中央] / success: パリィ成功時効果
// blockAll: 構えていると味方全員がバーに参加し、それぞれ自分の止めた位置で決まる防御値を得る
// fx: 発動時効果
export const CARDS = {
  // ---- 1P ルスカー ----
  bullet: { name: '弾丸', owner: 'p1', type: 'bullet', cost: 1, dmg: 5, text: '敵に5ダメージ\n（手札からも撃てる）' },
  reload: {
    name: '再型', owner: 'p1', type: 'load', cost: 0, free: true, load: true,
    text: '弾丸を1発装填\n行動値を消費しない',
  },
  guardA: { name: '防御', owner: 'p1', type: 'guard', cost: 1, gain: 5, text: '防御値+5' },
  rapid: { name: '速射', owner: 'p1', type: 'buff', cost: 1, fx: { rapid: 1 }, text: '次に弾丸を撃つとき\n次弾も続けて撃つ' },
  fateAttack: {
    name: '運命超過：攻撃', owner: 'p1', type: 'enchant', cost: 1, attr: 'attack',
    text: 'アルカナに攻撃属性\n敵の攻撃カードに\nダメージ+5',
  },
  fateGuard: {
    name: '運命超過：防御', owner: 'p1', type: 'enchant', cost: 1, attr: 'guard',
    text: 'アルカナに防御属性\n敵の防御カードに\nダメージ+5',
  },
  fateSpecial: {
    name: '運命超過：特殊', owner: 'p1', type: 'enchant', cost: 1, attr: 'special',
    text: 'アルカナに特殊属性\n敵の特殊カードに\nダメージ+5',
  },
  focusA: { name: '集中', owner: 'p1', type: 'focus', cost: 0, fx: { selfCost: 2 }, text: '自分のコスト+2' },
  riposte: {
    name: '受け流し', owner: 'p1', type: 'parry', cost: 1, block: [0, 4], success: { counter: 8 },
    text: '防御0〜4\n成功：反撃8ダメージ',
  },
  crowClaw: {
    name: '渡鴉の爪', owner: 'p1', type: 'attack', cost: 2, hits: [8],
    text: '敵に8ダメージ',
  },

  // ---- 2P ラティシア ----
  arcana: { name: 'アルカナ', owner: 'p2', type: 'arcana', cost: 1, dmg: 5, text: '魔法陣に置いて発動\n次に敵が使うカードに\n5ダメージ' },
  astro: {
    name: '占星統治', owner: 'p2', type: 'load', cost: 1, free: true, load: true,
    text: 'アルカナを1つ補填\n行動値を消費しない',
  },
  guardB: { name: '防御', owner: 'p2', type: 'guard', cost: 1, gain: 5, text: '防御値+5' },
  blessDecay: {
    name: '星霊の加護：崩壊', owner: 'p2', type: 'enchant', cost: 1, ench: 'decay',
    text: '弾倉の次弾に崩壊\n命中後、次の敵の行動まで\n行動ごとに敵に3ダメージ',
  },
  blessResist: {
    name: '星霊の加護：抵抗', owner: 'p2', type: 'enchant', cost: 1, ench: 'resist',
    text: '弾倉の次弾に抵抗\n命中で敵の次の攻撃\nダメージ半減',
  },
  blessPower: {
    name: '星霊の加護：特攻', owner: 'p2', type: 'enchant', cost: 1, ench: 'power',
    text: '弾倉の次弾に特攻\n弾丸の攻撃力+3',
  },
  focusB: { name: '集中', owner: 'p2', type: 'focus', cost: 0, fx: { selfCost: 2 }, text: '自分のコスト+2' },
  aegis: {
    name: '守護の盾', owner: 'p2', type: 'parry', cost: 1, block: [0, 4], blockAll: true, success: { p1Bonus: 5 },
    text: '全員でパリィ\n各自に防御0〜4\n自分成功でルスカーの\n次の攻撃+5',
  },
  resonance: {
    name: '共鳴', owner: 'p2', type: 'buff', cost: 2, fx: { healAll: 6 },
    text: '味方全員のHP+6',
  },
  echoShield: {
    name: '共鳴の盾', owner: 'p2', type: 'parry', cost: 2, block: [0, 5], blockAll: true,
    success: { healAll: 4 },
    text: '全員でパリィ\n各自に防御0〜5\n自分成功で全員HP+4',
  },
};

// 弾丸とアルカナは初期デッキに入らない（再型・占星統治で生まれ、使うと捨て札を経てデッキに混ざる）
const times = (id, n) => Array(n).fill(id);
export const DECKS = {
  p1: [...times('reload', 5), ...times('guardA', 5), 'rapid', 'fateAttack', 'fateGuard', 'fateSpecial', 'focusA', 'riposte', 'crowClaw'],
  p2: [...times('astro', 5), ...times('guardB', 5), 'blessDecay', 'blessResist', 'blessPower', 'focusB', 'aegis', 'resonance', 'echoShield'],
};

// 敵のカード。上に5枚とも表向きで並び、敵は使えるものから1枚を選ぶ
// kind: attack = 攻撃（パリィ可） / guard = 防御 / special = 特殊。hp が0になったカードは使えなくなる
export const ENEMY = {
  name: '灯火の翼竜',
  cards: {
    claw: { name: '爪撃', kind: 'attack', target: 'random', dmg: 19, hp: 13 },
    tail: { name: '尾薙ぎ', kind: 'attack', target: 'all', dmg: 12, hp: 13 },
    bite: { name: '噛みつき', kind: 'attack', target: 'highHp', dmg: 23, hp: 15 },
    wing: { name: '羽ばたき', kind: 'guard', selfBlock: 12, hp: 12 },
    roar: { name: '咆哮', kind: 'special', strength: 2, hp: 12 },
  },
  lineup: ['claw', 'tail', 'bite', 'wing', 'roar'],
};
