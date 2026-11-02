// カードと数値の定義（モック用の仮データ。調整はここだけで完結させる）

export const RULES = {
  playerMaxHp: 70,
  enemyMaxHp: 60, // 行動値制（一人モード）の敵 HP。v0.29 で 90 から
  handSize: 3, // 二人モードの1人あたりの手札
  soloHandSize: 5, // 一人モード（山札を混ぜる場合）の手札
  // 一人モードの山札: 'split' = キャラ別のまま手札は 3:3（handSize ずつ） / 'mixed' = 2人のデッキを1つに混ぜる
  soloDeck: 'split',
  // 行動値制のコスト: 初期値 startCost、回復（costGain）しても costMax を超えない（v0.27 から上限あり。v0.29 で回復は +1 に戻した）
  startCost: 6,
  costMax: 6,
  // 行動値制のコスト回復: 相方がカードを使ったとき・手札を引き直したとき（2人とも）・敵が行動したとき（2人とも）
  costGain: { partner: 1, reroll: 1, enemy: 1 },
  // 行動値制の敵カードの補正（ダメージと HP に足す）。v0.29 で回復を +1 に戻したぶん弱くした
  av: { dmgBonus: -7, cardHpBonus: -1 },
  // 行動値: 味方がカードを使う・手札を引き直すたびに1減り、0で敵が行動して元に戻る
  actionValue: 4,
  frenzyActionValue: 3, // 激昂後の行動値
  frenzyRatio: 0.5, // 敵HPがこの割合以下で激昂
  // 進行: 'turn' = ターン制（ターン終了で敵が行動） / 'av' = 行動値制（v0.3〜v0.10）
  duoProgress: 'turn',
  soloProgress: 'av', // 一人モードは行動値制（v0.27 で確定。比較用に ?progress=turn でターン制も動く）
  // ターン制（v0.12 から資料「戦闘システム改」に合わせる）: ターン開始時に手札を全部捨てて引き直す。
  // refill なら使ったカードの枠はすぐ引いて埋める（v0.27 から二人モード）。コストは毎ターン戻り、1ターン目 cost、以後 costStep ずつ増える
  turn: {
    refill: true,
    cost: 6, // 1ターン目のコスト（使い残しは持ち越さない）
    costStep: 2, // 毎ターン増える量
    costMax: 12, // コストの上限（0 = 上限なし）
    handSize: 5, // 二人モードの1人あたりの手札
    soloHandSize: 6, // 一人モードの手札（山札キャラ別なら 3:3）
    enemyActs: 1, // 1ターンの敵の行動回数
    frenzyEnemyActs: 2, // 激昂後
    // 行動値制とは1ターンの手数が違うので、敵の HP と攻撃はターン制用に別に持つ
    // v0.12: 手札5枚・コストが毎ターン増える分、v0.11（HP140・+2）より敵を硬く強くした
    // v0.27: 使うたびに引くようにして手が増えたので、さらに硬く強く（HP190・+6・+6 から）。敵カードは柔らかめにして全破壊も残す
    enemyHp: 320,
    dmgBonus: 10, // 敵の攻撃カードのダメージに足す
    cardHpBonus: 4, // 敵カードの HP に足す
    // 一人モードのターン制だけ違う値にするもの（手札の配分が違うので、二人モードと同じ値では難しさがそろわない）
    // cardHpBonus は 2→3 でアルカナが1発余分に要るようになり、勝率が段差で下がる
    solo: { enemyHp: 110, dmgBonus: 3, cardHpBonus: 3 },
  },
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

// free: 行動値を消費しない（相方のコストも回復しない） / load: 弾倉・魔法陣に入れる数
// hits: 敵へのダメージ列 / block: パリィの防御値 [バーの端, 中央] / success: パリィ成功時効果
// blockAll: 構えていると味方全員がバーに参加し、それぞれ自分の止めた位置で決まる防御値を得る
// fx: 発動時効果
// v0.27: ソロ（行動値制）でコストが縛りになるよう、0 コスト以外のコストを倍にした（1→2・2→4。集中・魔力の結晶も +2→+4）
export const CARDS = {
  // ---- 1P ルスカー ----
  bullet: { name: '弾丸', owner: 'p1', type: 'bullet', cost: 2, dmg: 5, text: '敵に5ダメージ\n（手札からも撃てる）' },
  reload: {
    name: '再型', owner: 'p1', type: 'load', cost: 0, free: true, load: 1,
    text: '弾丸を1発装填\n行動値を消費しない',
  },
  guardA: { name: '防御', owner: 'p1', type: 'guard', cost: 2, gain: 5, text: '防御値+5' },
  rapid: { name: '速射', owner: 'p1', type: 'buff', cost: 2, fx: { rapid: 1 }, text: '次に弾丸を撃つとき\n次弾も続けて撃つ' },
  fateAttack: {
    name: '運命超過：攻撃', owner: 'p1', type: 'enchant', cost: 2, attr: 'attack',
    text: 'アルカナに攻撃属性\n敵の攻撃カードに\nダメージ+5',
  },
  fateGuard: {
    name: '運命超過：防御', owner: 'p1', type: 'enchant', cost: 2, attr: 'guard',
    text: 'アルカナに防御属性\n敵の防御カードに\nダメージ+5',
  },
  fateSpecial: {
    name: '運命超過：特殊', owner: 'p1', type: 'enchant', cost: 2, attr: 'special',
    text: 'アルカナに特殊属性\n敵の特殊カードに\nダメージ+5',
  },
  focusA: { name: '集中', owner: 'p1', type: 'focus', cost: 0, fx: { selfCost: 4 }, text: '自分のコスト+4' },
  riposte: {
    name: '受け流し', owner: 'p1', type: 'parry', cost: 2, block: [0, 4], success: { counter: 8 },
    text: '防御0〜4\n成功：反撃8ダメージ',
  },
  crowClaw: {
    name: '渡鴉の爪', owner: 'p1', type: 'attack', cost: 4, hits: [8],
    text: '敵に8ダメージ',
  },

  // ---- 2P ラティシア ----
  arcana: { name: 'アルカナ', owner: 'p2', type: 'arcana', cost: 2, dmg: 5, text: '魔法陣に置いて発動\n次に敵が使うカードに\n5ダメージ' },
  astro: {
    name: '占星統治', owner: 'p2', type: 'load', cost: 2, free: true, load: 2,
    text: 'アルカナを2つ補填\n行動値を消費しない',
  },
  guardB: { name: '防御', owner: 'p2', type: 'guard', cost: 2, gain: 5, text: '防御値+5' },
  blessDecay: {
    name: '星霊の加護：崩壊', owner: 'p2', type: 'enchant', cost: 2, ench: 'decay',
    text: '弾倉の次弾に崩壊\n命中後、次の敵の行動まで\n行動ごとに敵に3ダメージ',
  },
  blessResist: {
    name: '星霊の加護：抵抗', owner: 'p2', type: 'enchant', cost: 2, ench: 'resist',
    text: '弾倉の次弾に抵抗\n命中で敵の次の攻撃\nダメージ半減',
  },
  blessPower: {
    name: '星霊の加護：特攻', owner: 'p2', type: 'enchant', cost: 2, ench: 'power',
    text: '弾倉の次弾に特攻\n弾丸の攻撃力+3',
  },
  focusB: { name: '集中', owner: 'p2', type: 'focus', cost: 0, fx: { selfCost: 4 }, text: '自分のコスト+4' },
  aegis: {
    name: '守護の盾', owner: 'p2', type: 'parry', cost: 2, block: [0, 4], blockAll: true, success: { p1Bonus: 5 },
    text: '全員でパリィ\n各自に防御0〜4\n自分成功でルスカーの\n次の攻撃+5',
  },
  resonance: {
    name: '共鳴', owner: 'p2', type: 'buff', cost: 4, fx: { healAll: 6 },
    text: '味方全員のHP+6',
  },
  echoShield: {
    name: '共鳴の盾', owner: 'p2', type: 'parry', cost: 4, block: [0, 5], blockAll: true,
    success: { healAll: 4 },
    text: '全員でパリィ\n各自に防御0〜5\n自分成功で全員HP+4',
  },
};

// バフアイテム（仮）。どちらのモードでも1戦に各1回、行動値を消費しない
// fx は CARDS と同じ書き方（guardAll: 味方全員に防御 / costAll: 味方全員のコスト）
export const ITEMS = [
  { id: 'incense', name: '闘志の香', fx: { p1Bonus: 6 }, text: 'ルスカーの次の攻撃+6' },
  { id: 'charm', name: '守りの護符', fx: { guardAll: 6 }, text: '2人とも防御+6' },
  { id: 'crystal', name: '魔力の結晶', fx: { costAll: 4 }, text: '2人ともコスト+4' },
];

// 弾丸とアルカナは初期デッキに入らない（再型・占星統治で生まれ、使うと捨て札を経てデッキに混ざる）
const times = (id, n) => Array(n).fill(id);
export const DECKS = {
  p1: [...times('reload', 5), ...times('guardA', 5), 'rapid', 'fateAttack', 'fateGuard', 'fateSpecial', 'focusA', 'riposte', 'crowClaw'],
  p2: [...times('astro', 5), ...times('guardB', 5), 'blessDecay', 'blessResist', 'blessPower', 'focusB', 'aegis', 'resonance', 'echoShield'],
};

// ターン制で敵のターンが始まるときの2人の掛け合い（仮）。敵が選んだカードの種類で変わり、候補から1つ選ぶ
// 1行目がその種類で最初に話す人。片方が倒れているときは、生きている方の台詞だけを出す
export const BANTER = {
  attack: [
    [['p1', '来るぞ、構えろ！'], ['p2', '見えてる。合わせて！']],
    [['p2', '爪が光った……！'], ['p1', '下がってろ、受け止める']],
    [['p1', 'チッ、本気で来やがった'], ['p2', '大丈夫、読めてるから']],
  ],
  guard: [
    [['p2', '翼で守りに入ったね'], ['p1', '殻ごと撃ち抜いてやる']],
    [['p1', '固まりやがったか'], ['p2', '今のうちに準備しよう']],
  ],
  special: [
    [['p2', '空気が変わった……'], ['p1', '吼える前に黙らせる']],
    [['p1', '何か仕掛けてくるぞ'], ['p2', '星が騒いでる。気をつけて']],
  ],
};

// 敵のカード。上に5枚とも表向きで並び、敵は使えるものから1枚を選ぶ
// kind: attack = 攻撃（パリィ可） / guard = 防御 / special = 特殊。hp が0になったカードは使えなくなる
export const ENEMY = {
  name: '灯火の翼竜',
  cards: {
    claw: { name: '爪撃', kind: 'attack', target: 'random', dmg: 20, hp: 13 },
    tail: { name: '尾薙ぎ', kind: 'attack', target: 'all', dmg: 13, hp: 13 },
    bite: { name: '噛みつき', kind: 'attack', target: 'highHp', dmg: 24, hp: 15 },
    wing: { name: '羽ばたき', kind: 'guard', selfBlock: 12, hp: 12 },
    roar: { name: '咆哮', kind: 'special', strength: 2, hp: 12 },
  },
  lineup: ['claw', 'tail', 'bite', 'wing', 'roar'],
};
