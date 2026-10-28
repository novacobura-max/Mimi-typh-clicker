/* ============================================================
   Mimi Clicker — game logic
   Two characters, two independent saves, one shared economy.
   Vanilla JS, no dependencies. Progress lives in localStorage.
   ============================================================ */

(() => {
  'use strict';

  /* ---------------- helpers ---------------- */

  const $ = (sel, root = document) => root.querySelector(sel);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];

  const nf = new Intl.NumberFormat('ru-RU');
  const nfCompact = new Intl.NumberFormat('ru-RU', { notation: 'compact', maximumFractionDigits: 1 });

  function fmt(n) {
    if (!Number.isFinite(n)) return '∞';
    n = Math.max(0, Math.floor(n));
    if (n < 1e6) return nf.format(n);
    return nfCompact.format(n);
  }

  function fmtRate(n) {
    if (n <= 0) return '0';
    if (n < 10) return n.toFixed(1).replace('.', ',');
    return fmt(n);
  }

  function fmtTime(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    if (h) return `${h} ч ${m} мин`;
    if (m) return `${m} мин ${s % 60} с`;
    return `${s} с`;
  }

  function boneWord(n) {
    const a = Math.abs(n) % 100;
    const b = a % 10;
    if (a > 10 && a < 20) return 'косточек';
    if (b === 1) return 'косточку';
    if (b >= 2 && b <= 4) return 'косточки';
    return 'косточек';
  }

  function setText(el, text) {
    if (el && el.__t !== text) {
      el.__t = text;
      el.textContent = text;
    }
  }

  /* ---------------- economy ---------------- */

  const ECONOMY = {
    baseCrit: 0.05,
    baseCritMult: 8,
    critCap: 0.75,
    achBonus: 0.02,
    frenzyMult: 7,
    frenzyMs: 15000,
    offlineRate: 0.7,
    offlineCap: 8 * 3600,
    comboWindow: 1600,
    comboStep: 0.035,
    comboMax: 60,
  };

  // Balanced over hours, not minutes: see README for the progression curve.
  const UPGRADES = [
    { id: 'paw',     kind: 'clickAdd',   value: 1,    base: 15,     growth: 1.16, icon: '🐾', name: 'Мягкая лапка',     desc: '+1 к силе клика',           tint: '#e9a285' },
    { id: 'tail',    kind: 'cpsAdd',     value: 0.6,  base: 120,    growth: 1.17, icon: '🐕', name: 'Хвостик-помощник', desc: '+0,6 косточки в секунду',   tint: '#d9a26c' },
    { id: 'treat',   kind: 'clickAdd',   value: 6,    base: 700,    growth: 1.19, icon: '🦴', name: 'Любимая косточка', desc: '+6 к силе клика',           tint: '#f0dfc0' },
    { id: 'collar',  kind: 'critAdd',    value: 0.025, base: 1500,  growth: 1.40, icon: '🎀', name: 'Ошейник с костью', desc: '+2,5% к шансу крита',       tint: '#aacbe0', max: 12 },
    { id: 'pack',    kind: 'cpsAdd',     value: 12,   base: 6000,   growth: 1.20, icon: '🐶', name: 'Стайка Мими',      desc: '+12 косточек в секунду',    tint: '#e0b07a' },
    { id: 'socks',   kind: 'globMul',    value: 1.10, base: 20000,  growth: 1.55, icon: '🧦', name: 'Тёплые носочки',   desc: '×1,10 ко всему доходу',     tint: '#c78f75' },
    { id: 'fang',    kind: 'critMul',    value: 3,    base: 30000,  growth: 1.50, icon: '🦷', name: 'Критический укус', desc: '+3 к множителю крита',      tint: '#e7e2d6' },
    { id: 'vault',   kind: 'cpsAdd',     value: 150,  base: 120000, growth: 1.21, icon: '🏦', name: 'Костехранилище',   desc: '+150 косточек в секунду',   tint: '#d8b98c' },
    { id: 'moon',    kind: 'clickBonus', value: 0.35, base: 200000, growth: 1.45, icon: '🌙', name: 'Лунная косточка',   desc: '+35% к силе клика',         tint: '#b9c9e6' },
    { id: 'factory', kind: 'cpsAdd',     value: 1500, base: 900000, growth: 1.22, icon: '🏭', name: 'Фабрика костей',   desc: '+1 500 косточек в секунду', tint: '#c9a07f' },
    { id: 'love',    kind: 'globMul',    value: 1.15, base: 2.5e6,  growth: 1.60, icon: '💖', name: 'Генератор любви',  desc: '×1,15 ко всему доходу',     tint: '#ef9a8a' },
    { id: 'star',    kind: 'cpsAdd',     value: 25000, base: 2e7,   growth: 1.23, icon: '🌟', name: 'Звезда Мими',      desc: '+25 000 косточек в секунду', tint: '#f5cd7a' },
  ];

  const ACHIEVEMENTS = [
    { id: 'first',     icon: '🦴', name: 'Первая косточка',     desc: 'Собери первую косточку',       test: () => S.totalBones >= 1 },
    { id: 'k1000',     icon: '💰', name: 'Тысяча',              desc: 'Собери 1 000 косточек',        test: () => S.totalBones >= 1e3 },
    { id: 'k100k',     icon: '💎', name: 'Богатая Мими',        desc: 'Собери 100 000 косточек',      test: () => S.totalBones >= 1e5 },
    { id: 'km',        icon: '👑', name: 'Косточковый магнат',  desc: 'Собери 1 000 000 косточек',    test: () => S.totalBones >= 1e6 },
    { id: 'clicks100', icon: '👆', name: 'Сотня',               desc: 'Погладь 100 раз',              test: () => S.clicks >= 100 },
    { id: 'clicks1k',  icon: '✋', name: 'Тысяча поглаживаний', desc: 'Погладь 1 000 раз',            test: () => S.clicks >= 1000 },
    { id: 'combo25',   icon: '🔥', name: 'В ритме',             desc: 'Серия из 25 кликов подряд',    test: () => S.bestCombo >= 25 },
    { id: 'combo60',   icon: '⚡', name: 'Не остановить',       desc: 'Серия из 60 кликов подряд',    test: () => S.bestCombo >= 60 },
    { id: 'crit1',     icon: '💥', name: 'Критический укус',    desc: 'Нанеси первый крит',           test: () => S.crits >= 1 },
    { id: 'crit100',   icon: '🦷', name: 'Зубастая',            desc: 'Нанеси 100 критов',            test: () => S.crits >= 100 },
    { id: 'buy1',      icon: '🛍️', name: 'Первая покупка',     desc: 'Купи любое улучшение',         test: () => totalLevels() >= 1 },
    { id: 'buy25',     icon: '🎁', name: 'Коллекционер',        desc: 'Купи 25 улучшений',            test: () => totalLevels() >= 25 },
    { id: 'cps10',     icon: '🤖', name: 'Автопомощь',          desc: '10 косточек в секунду',        test: () => D.cps >= 10 },
    { id: 'cps100',    icon: '🏭', name: 'Ферма костей',        desc: '100 косточек в секунду',       test: () => D.cps >= 100 },
    { id: 'golden1',   icon: '✨', name: 'Золотая удача',       desc: 'Поймай золотую косточку',      test: () => S.goldens >= 1 },
  ];

  /* ---------------- characters ---------------- */

  const CHARACTERS = [
    {
      id: 'mimi',
      name: 'Мими',
      dative: 'Мими',
      brand: 'Mimi Clicker',
      tagline: 'косточковая ферма',
      diary: 'Дневник Мими',
      pet: 'Погладить Мими и получить косточку',
      alt: 'Мими — милая собачка-девочка с шоколадными волосами в белой футболке',
      hero: 'assets/mimi-hero.webp',
      face: 'assets/mimi-face.webp',
      chibi: 'assets/mimi-chibi.webp',
      favicon: 'assets/favicon.png',
      badgeIcon: '🐾',
      themeColor: '#1a100d',
      tip: 'Совет: держи серию кликов — комбо даёт до <b>×3</b> косточек.',
      welcome: 'Привет! Погладь меня 🐾',
      welcomeBack: 'С возвращением! 🐾',
      goldenWin: 'Целое сокровище! 💛',
      frenzySay: 'Безумие! ×7 на 15 секунд! ⚡',
      comboLine: (m) => `Комбо ×${m}! 🔥`,
      speech: [
        'Мими рада!', 'Ещё косточку?', 'Хвостик виляет сам собой!', 'Ты лучший!',
        'Гав-гав!', 'Погладь ещё!', 'У меня лапки, но я стараюсь', 'Косточки — это любовь',
        'Ням-ням!', 'Ты меня засмущал…', 'Смотри, какой хвостик!', 'Ещё чуть-чуть — и покупка!',
        'Мими тебя любит', 'Не останавливайся!', 'Тёплые носочки — это уют',
      ],
      buy: ['Новая штука!', 'Теперь я ещё сильнее!', 'Спасибо!', 'Это мне?', 'Мими довольна!'],
      crit: ['Крит! 💥', 'Кусь!', 'Вот это удар!'],
      flavor: null,
    },
    {
      id: 'lapa',
      name: 'Лапа',
      dative: 'Лапе',
      brand: 'Lapa Clicker',
      tagline: 'дворовая банда',
      diary: 'Дневник Лапы',
      pet: 'Погладить Лапу и получить косточку',
      alt: 'Лапа — чёрно-белая собака-девушка в чёрном худи',
      hero: 'assets/lapa-hero.webp',
      face: 'assets/lapa-face.webp',
      chibi: 'assets/lapa-chibi.webp',
      favicon: 'assets/lapa-favicon.png',
      badgeIcon: '🐺',
      themeColor: '#0a0a0c',
      tip: 'Совет: не отпускай серию. Комбо — до <b>×3</b>. Как и всё хорошее.',
      welcome: 'Чего уставился? Кликай.',
      welcomeBack: 'Явился. Продолжай.',
      goldenWin: 'О. Косточка.',
      frenzySay: 'Семь. Пятнадцать секунд. Погнали.',
      comboLine: (m) => `×${m}. Неплохо.`,
      speech: [
        'bruh', 'Ну?', 'Опять кликаешь?', 'Ладно. Ещё раз.', 'Не трогай уши.',
        'Хвост не трогать.', 'Я не милая.', 'Пятна не отстирываются.', 'Кофе не будет.',
        'Ты серьёзно?', 'Гав. Доволен?', 'Ещё одну — и спать.', 'Тише.', 'Убери руку.',
        'Нормально.', 'Медленно. Но идёт.',
      ],
      buy: ['Ладно, сойдёт.', 'Полезно.', 'Уже лучше.', 'Хм.', 'Неплохо.', 'Держи.'],
      crit: ['Кусь.', 'Больнее.', 'Вот так.', 'Укус.'],
      flavor: {
        paw:     { name: 'Лапа с когтями',   desc: '+1 к силе клика',           icon: '🐾', tint: '#e6e6ec' },
        tail:    { name: 'Хвост-метроном',   desc: '+0,6 косточки в секунду',   icon: '🐕', tint: '#b9b9c4' },
        treat:   { name: 'Сушёная косточка', desc: '+6 к силе клика',           icon: '🦴', tint: '#dcdce4' },
        collar:  { name: 'Шипастый ошейник', desc: '+2,5% к шансу крита',       icon: '⛓️', tint: '#d98c9c' },
        pack:    { name: 'Свора',            desc: '+12 косточек в секунду',    icon: '🐺', tint: '#a9a9b6' },
        socks:   { name: 'Чёрные гольфы',    desc: '×1,10 ко всему доходу',     icon: '🧦', tint: '#9a9aa6' },
        fang:    { name: 'Клык',             desc: '+3 к множителю крита',      icon: '🦷', tint: '#f0f0f4' },
        vault:   { name: 'Схрон',            desc: '+150 косточек в секунду',   icon: '🏚️', tint: '#8f8f9c' },
        moon:    { name: 'Ночная прогулка',  desc: '+35% к силе клика',         icon: '🌙', tint: '#b6b6c4' },
        factory: { name: 'Костезавод',       desc: '+1 500 косточек в секунду', icon: '🏭', tint: '#7f7f8c' },
        love:    { name: 'Доверие',          desc: '×1,15 ко всему доходу',     icon: '🖤', tint: '#c9c9d2' },
        star:    { name: 'Легенда двора',    desc: '+25 000 косточек в секунду', icon: '⭐', tint: '#f2f2f6' },
      },
    },
  ];

  const characterById = (id) => CHARACTERS.find((c) => c.id === id) || CHARACTERS[0];

  /* ---------------- state ---------------- */

  const SAVE_KEY = 'mimi-clicker.save.v2';
  const LEGACY_KEY = 'mimi-clicker.save.v1';

  function defaultState() {
    return {
      bones: 0,
      totalBones: 0,
      clicks: 0,
      crits: 0,
      goldens: 0,
      bestCombo: 0,
      levels: {},
      ach: [],
      playMs: 0,
      lastSeen: Date.now(),
      frenzyUntil: 0,
    };
  }

  const STORE = { v: 2, active: CHARACTERS[0].id, sound: true, profiles: {} };
  let S = null;
  let CH = CHARACTERS[0];
  let D = { click: 1, cps: 0, crit: ECONOMY.baseCrit, critMult: ECONOMY.baseCritMult, glob: 1 };

  let combo = 0;
  let comboMult = 1;
  let lastClickAt = -1e9;
  let displayBones = 0;
  let lastFrame = 0;
  let lastSpeechAt = -1e9;
  let goldenActive = false;
  let nextGoldenAt = 0;
  let goldenHideTimer = 0;
  let nextUISync = 0;
  let nextAchCheck = 0;
  let saveDirty = false;
  let hiddenAt = 0;
  let switching = false;

  /* ---------------- dom ---------------- */

  const el = {
    stage: $('#stage'),
    heroBtn: $('#hero-btn'),
    heroImg: $('#hero-img'),
    fx: $('#fx'),
    speech: $('#speech'),
    golden: $('#golden'),
    score: $('#score'),
    rate: $('#rate'),
    perClick: $('#per-click'),
    critChance: $('#crit-chance'),
    critMult: $('#crit-mult'),
    multiplier: $('#multiplier'),
    comboBox: $('#combo-box'),
    comboFill: $('#combo-fill'),
    comboMult: $('#combo-mult'),
    frenzy: $('#frenzy'),
    frenzyTime: $('#frenzy-time'),
    achCount: $('#ach-count'),
    achBonus: $('#ach-bonus'),
    goal: $('#goal'),
    goalIcon: $('#goal-icon'),
    goalName: $('#goal-name'),
    goalProgress: $('#goal-progress'),
    goalFill: $('#goal-fill'),
    bonusNote: $('#bonus-note'),
    bonusState: $('#bonus-state'),
    resetBtn: $('#reset-btn'),
    shopList: $('#shop-list'),
    shopBadge: $('#shop-badge'),
    shopTipImg: $('#shop-tip-img'),
    shopTipText: $('#shop-tip-text'),
    modal: $('#modal'),
    modalBody: $('#modal-body'),
    toasts: $('#toasts'),
    soundBtn: $('#btn-sound'),
    soundIcon: $('#icon-sound use'),
    statsBtn: $('#btn-stats'),
    profiles: $('#profiles'),
    brandName: $('#brand-name'),
    brandTagline: $('#brand-tagline'),
    brandFace: $('#brand-face'),
    heroHint: $('#hint-name'),
    diaryTitle: $('#modal-title'),
    favicon: $('#favicon'),
  };

  const cards = new Map();
  let squishAnim = null;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const coarsePointer = window.matchMedia('(pointer: coarse)').matches;

  /* ---------------- audio ---------------- */

  const Sfx = {
    ctx: null,
    master: null,
    on: true,

    ensure() {
      if (this.ctx) {
        if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
        return true;
      }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      try {
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.on ? 0.22 : 0;
        this.master.connect(this.ctx.destination);
        return true;
      } catch {
        return false;
      }
    },

    blip(freq, { type = 'triangle', dur = 0.1, gain = 0.2, slide = 0, when = 0 } = {}) {
      if (!this.on || !this.ensure()) return;
      const t = this.ctx.currentTime + when;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t);
      if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(gain, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(g).connect(this.master);
      osc.start(t);
      osc.stop(t + dur + 0.03);
    },

    click() {
      const base = rand(540, 660);
      this.blip(base, { type: 'triangle', dur: 0.07, gain: 0.13, slide: -230 });
      this.blip(base * 1.6, { type: 'sine', dur: 0.05, gain: 0.045, slide: -120 });
    },

    crit() {
      this.blip(880, { type: 'square', dur: 0.08, gain: 0.09 });
      this.blip(1320, { type: 'sine', dur: 0.2, gain: 0.08, when: 0.05 });
    },

    buy() {
      [523.25, 659.25, 783.99].forEach((f, i) => this.blip(f, { type: 'triangle', dur: 0.16, gain: 0.09, when: i * 0.055 }));
    },

    nope() {
      this.blip(180, { type: 'sine', dur: 0.12, gain: 0.1, slide: -50 });
    },

    ach() {
      [659.25, 880, 1046.5, 1318.5].forEach((f, i) => this.blip(f, { type: 'sine', dur: 0.22, gain: 0.075, when: i * 0.07 }));
    },

    gold() {
      [784, 1046.5, 1318.5].forEach((f, i) => this.blip(f, { type: 'triangle', dur: 0.18, gain: 0.09, when: i * 0.06 }));
    },

    setEnabled(v) {
      this.on = v;
      if (this.master && this.ctx) {
        this.master.gain.setTargetAtTime(v ? 0.22 : 0, this.ctx.currentTime, 0.02);
      }
      if (v) this.ensure();
    },
  };

  function vibrate(pattern) {
    if (!coarsePointer || !navigator.vibrate) return;
    try { navigator.vibrate(pattern); } catch { /* ignore */ }
  }

  /* ---------------- derived stats ---------------- */

  function levelOf(id) {
    return S.levels[id] | 0;
  }

  function totalLevels() {
    let n = 0;
    for (const u of UPGRADES) n += levelOf(u.id);
    return n;
  }

  function costOf(u, lvl = levelOf(u.id)) {
    return Math.floor(u.base * Math.pow(u.growth, lvl));
  }

  function itemOf(u) {
    const f = CH.flavor && CH.flavor[u.id];
    return f ? Object.assign({}, u, f) : u;
  }

  function recalc() {
    let clickAdd = 0;
    let cpsAdd = 0;
    let crit = ECONOMY.baseCrit;
    let critMult = ECONOMY.baseCritMult;
    let clickBonus = 0;
    let glob = 1;

    for (const u of UPGRADES) {
      const l = levelOf(u.id);
      if (!l) continue;
      switch (u.kind) {
        case 'clickAdd': clickAdd += u.value * l; break;
        case 'cpsAdd': cpsAdd += u.value * l; break;
        case 'critAdd': crit += u.value * l; break;
        case 'critMul': critMult += u.value * l; break;
        case 'clickBonus': clickBonus += u.value * l; break;
        case 'globMul': glob *= Math.pow(u.value, l); break;
      }
    }

    glob *= 1 + ECONOMY.achBonus * S.ach.length;
    D.glob = glob;
    D.click = (1 + clickAdd) * (1 + clickBonus) * glob;
    D.cps = cpsAdd * glob;
    D.crit = Math.min(ECONOMY.critCap, crit);
    D.critMult = critMult;
  }

  function comboMultiplier() {
    return 1 + Math.min(Math.max(combo - 1, 0), ECONOMY.comboMax) * ECONOMY.comboStep;
  }

  /* ---------------- persistence ---------------- */

  function normalize(raw) {
    const s = Object.assign(defaultState(), raw && typeof raw === 'object' ? raw : {});
    s.bones = Math.max(0, Number(s.bones) || 0);
    s.totalBones = Math.max(s.bones, Number(s.totalBones) || 0);
    s.clicks = Math.max(0, Number(s.clicks) || 0);
    s.crits = Math.max(0, Number(s.crits) || 0);
    s.goldens = Math.max(0, Number(s.goldens) || 0);
    s.bestCombo = Math.max(0, Number(s.bestCombo) || 0);
    s.playMs = Math.max(0, Number(s.playMs) || 0);
    s.frenzyUntil = 0;
    s.lastSeen = Number(s.lastSeen) || Date.now();

    const clean = {};
    const src = raw && raw.levels && typeof raw.levels === 'object' ? raw.levels : {};
    for (const u of UPGRADES) {
      const l = Number(src[u.id]);
      if (l > 0) clean[u.id] = clamp(Math.floor(l), 0, u.max || 9999);
    }
    s.levels = clean;
    s.ach = Array.isArray(raw && raw.ach) ? raw.ach.filter((id) => ACHIEVEMENTS.some((a) => a.id === id)) : [];
    return s;
  }

  function save() {
    if (S) S.lastSeen = Date.now();
    STORE.v = 2;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(STORE));
      saveDirty = false;
    } catch { /* storage may be unavailable */ }
  }

  function load() {
    let data = null;
    try { data = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch { data = null; }

    let loaded = false;
    if (data && data.profiles && typeof data.profiles === 'object') {
      STORE.sound = data.sound !== false;
      STORE.active = characterById(data.active).id;
      for (const c of CHARACTERS) STORE.profiles[c.id] = normalize(data.profiles[c.id]);
      loaded = true;
    } else {
      let legacy = null;
      try { legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) || 'null'); } catch { legacy = null; }
      if (legacy && typeof legacy === 'object') {
        STORE.sound = legacy.sound !== false;
        STORE.profiles[CHARACTERS[0].id] = normalize(legacy);
        loaded = true;
      }
    }

    for (const c of CHARACTERS) {
      if (!STORE.profiles[c.id]) STORE.profiles[c.id] = defaultState();
    }
    if (!STORE.profiles[STORE.active]) STORE.active = CHARACTERS[0].id;
    return loaded;
  }

  function applyOffline(profile) {
    const now = Date.now();
    const elapsed = (now - (Number(profile.lastSeen) || now)) / 1000;
    let gained = 0;

    if (elapsed > 90 && D.cps > 0) {
      const capped = Math.min(elapsed, ECONOMY.offlineCap);
      gained = Math.floor(D.cps * capped * ECONOMY.offlineRate);
      if (gained > 0) {
        addBones(gained);
        setTimeout(() => {
          toast(`Пока тебя не было, <b>${CH.name}</b> накопила <b>${fmt(gained)}</b> ${boneWord(gained)}`, '🌙');
        }, 900);
      }
    }

    profile.lastSeen = now;
    return gained;
  }

  /* ---------------- money ---------------- */

  function addBones(n) {
    if (!(n > 0)) return;
    S.bones += n;
    S.totalBones += n;
    saveDirty = true;
  }

  /* ---------------- fx ---------------- */

  function relPoint(clientX, clientY) {
    const r = el.fx.getBoundingClientRect();
    return {
      x: clamp(clientX - r.left, 24, Math.max(24, r.width - 24)),
      y: clamp(clientY - r.top, 24, Math.max(24, r.height - 24)),
    };
  }

  function centerPoint() {
    const r = el.heroBtn.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height * 0.45 };
  }

  function spawnFloat(x, y, text, crit) {
    const node = document.createElement('div');
    node.className = 'float' + (crit ? ' float--crit' : '');
    node.style.left = x + 'px';
    node.style.top = y + 'px';
    node.innerHTML = crit ? `<span class="float__tag">крит</span>+${text}` : `+${text}`;
    el.fx.append(node);
    node.addEventListener('animationend', () => node.remove(), { once: true });
  }

  function spawnBurst(x, y, crit) {
    if (reduceMotion) return;
    const shapes = crit
      ? ['spark', 'spark', 'bone', 'heart', 'spark']
      : ['heart', 'bone', 'paw', 'heart'];
    const count = crit ? 9 : 5;

    for (let i = 0; i < count; i++) {
      const kind = shapes[(Math.random() * shapes.length) | 0];
      const node = document.createElement('span');
      node.className = `part part--${kind}`;
      const size = rand(crit ? 16 : 12, crit ? 30 : 24);
      node.style.width = size + 'px';
      node.style.height = size + 'px';
      node.style.left = (x + rand(-10, 10)) + 'px';
      node.style.top = (y + rand(-10, 10)) + 'px';
      node.style.setProperty('--dx', rand(-90, 90).toFixed(0) + 'px');
      node.style.setProperty('--dy', rand(-120, -30).toFixed(0) + 'px');
      node.style.setProperty('--sc', rand(0.5, 1.1).toFixed(2));
      node.style.setProperty('--rot', rand(-160, 160).toFixed(0) + 'deg');
      node.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><use href="#i-${kind}"/></svg>`;
      el.fx.append(node);
      node.addEventListener('animationend', () => node.remove(), { once: true });
    }
  }

  function spawnRing(x, y, crit) {
    const node = document.createElement('span');
    node.className = 'ring' + (crit ? ' ring--crit' : '');
    node.style.left = x + 'px';
    node.style.top = y + 'px';
    el.fx.append(node);
    node.addEventListener('animationend', () => node.remove(), { once: true });
  }

  function flash(x, y) {
    if (reduceMotion) return;
    const node = document.createElement('div');
    node.className = 'flash';
    node.style.setProperty('--fx', x + 'px');
    node.style.setProperty('--fy', y + 'px');
    document.body.append(node);
    node.addEventListener('animationend', () => node.remove(), { once: true });
  }

  function shakeStage() {
    if (reduceMotion) return;
    el.stage.classList.remove('is-shaking');
    void el.stage.offsetWidth;
    el.stage.classList.add('is-shaking');
    el.stage.addEventListener('animationend', () => el.stage.classList.remove('is-shaking'), { once: true });
  }

  function squish() {
    if (reduceMotion) return;
    if (squishAnim) squishAnim.cancel();
    squishAnim = el.heroImg.animate(
      [
        { transform: 'scale(1, 1) translateY(0)' },
        { transform: 'scale(1.07, 0.92) translateY(7px)', offset: 0.28 },
        { transform: 'scale(0.98, 1.04) translateY(-2px)', offset: 0.6 },
        { transform: 'scale(1, 1) translateY(0)' },
      ],
      { duration: 360, easing: 'cubic-bezier(.2, .9, .3, 1)' }
    );
  }

  function say(text, force = false) {
    const now = performance.now();
    if (!force && now - lastSpeechAt < 2400) return;
    lastSpeechAt = now;
    el.speech.textContent = text;
    el.speech.classList.add('is-on');
    clearTimeout(say._t);
    say._t = setTimeout(() => el.speech.classList.remove('is-on'), 1700);
  }

  function toast(html, icon = '✨') {
    const node = document.createElement('div');
    node.className = 'toast';
    const ic = document.createElement('span');
    ic.className = 'toast__icon';
    ic.textContent = icon;
    const body = document.createElement('span');
    body.innerHTML = html;
    node.append(ic, body);
    el.toasts.append(node);
    const maxToasts = window.innerWidth <= 900 ? 1 : 3;
    while (el.toasts.children.length > maxToasts) el.toasts.firstElementChild.remove();
    setTimeout(() => {
      node.classList.add('is-out');
      setTimeout(() => node.remove(), 320);
    }, 3800);
  }

  /* ---------------- clicks ---------------- */

  function doClick(point) {
    if (!el.modal.hidden || switching) return;

    const now = performance.now();
    if (now - lastClickAt > ECONOMY.comboWindow) combo = 0;
    combo = Math.min(combo + 1, 200);
    lastClickAt = now;
    if (combo > S.bestCombo) S.bestCombo = combo;
    comboMult = comboMultiplier();

    const frenzy = now < S.frenzyUntil ? ECONOMY.frenzyMult : 1;
    const crit = Math.random() < D.crit;
    const gain = Math.max(1, Math.round(D.click * comboMult * frenzy * (crit ? D.critMult : 1)));

    addBones(gain);
    S.clicks++;
    if (crit) S.crits++;

    const p = relPoint(point.x, point.y);
    spawnFloat(p.x, p.y, fmt(gain), crit);
    spawnBurst(p.x, p.y, crit);
    spawnRing(p.x, p.y, crit);
    squish();

    if (crit) {
      Sfx.crit();
      flash(point.x, point.y);
      shakeStage();
      vibrate(18);
      if (Math.random() < 0.22) say(pick(CH.crit), true);
    } else {
      Sfx.click();
      vibrate(6);
      if (Math.random() < 0.09) say(pick(CH.speech));
    }

    if (combo > 0 && combo % 25 === 0) say(CH.comboLine(comboMult.toFixed(1).replace('.', ',')), true);

    checkAchievements();
    updateShop();
  }

  /* ---------------- golden bone / frenzy ---------------- */

  function scheduleGolden(delay = rand(40, 80) * 1000) {
    nextGoldenAt = performance.now() + delay;
  }

  function spawnGolden() {
    if (goldenActive) return;
    goldenActive = true;
    el.golden.hidden = false;
    el.golden.style.left = (Math.random() < 0.5 ? rand(13, 29) : rand(71, 87)).toFixed(1) + '%';
    el.golden.style.top = rand(26, 62).toFixed(1) + '%';
    el.golden.style.animation = 'none';
    void el.golden.offsetWidth;
    el.golden.style.animation = '';
    Sfx.gold();

    clearTimeout(goldenHideTimer);
    goldenHideTimer = setTimeout(() => {
      if (!goldenActive) return;
      goldenActive = false;
      el.golden.hidden = true;
      scheduleGolden();
    }, 9000);
  }

  function collectGolden() {
    if (!goldenActive) return;
    const gx = el.golden.offsetLeft;
    const gy = el.golden.offsetTop;
    goldenActive = false;
    clearTimeout(goldenHideTimer);
    el.golden.hidden = true;
    S.goldens++;

    const frenzy = Math.random() < 0.5;
    if (frenzy) {
      S.frenzyUntil = performance.now() + ECONOMY.frenzyMs;
      say(CH.frenzySay, true);
      toast('Золотая косточка: <b>×7 к клику</b> на 15 секунд!', '⚡');
      Sfx.ach();
    } else {
      const reward = Math.max(60, Math.round(Math.max(D.cps * 45, D.click * 35, 50)));
      addBones(reward);
      spawnFloat(gx + 37, gy + 37, fmt(reward), true);
      say(CH.goldenWin, true);
      toast(`Золотая косточка: <b>+${fmt(reward)}</b> ${boneWord(reward)}!`, '🦴');
      Sfx.gold();
    }

    flash(window.innerWidth / 2, window.innerHeight / 2);
    checkAchievements();
    scheduleGolden(rand(50, 95) * 1000);
    saveDirty = true;
  }

  /* ---------------- achievements ---------------- */

  function checkAchievements() {
    for (const a of ACHIEVEMENTS) {
      if (S.ach.includes(a.id)) continue;
      let ok = false;
      try { ok = a.test(); } catch { ok = false; }
      if (!ok) continue;
      S.ach.push(a.id);
      Sfx.ach();
      toast(`Достижение: <b>${a.name}</b><br><span style="color:var(--dim);font-weight:600">${a.desc}</span> · +${Math.round(ECONOMY.achBonus * 100)}% к доходу`, a.icon);
      say('Новое достижение! 🏆', true);
      recalc();
      saveDirty = true;
    }
  }

  /* ---------------- shop ---------------- */

  function buildShop() {
    el.shopList.innerHTML = '';
    cards.clear();
    for (const u of UPGRADES) {
      const it = itemOf(u);
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'card';
      card.dataset.id = u.id;
      card.innerHTML = `
        <span class="card__icon" style="--tint:${it.tint}" aria-hidden="true">${it.icon}</span>
        <span class="card__body">
          <span class="card__name">${it.name}<span class="card__lvl">новое</span></span>
          <span class="card__desc">${it.desc}</span>
        </span>
        <span class="card__cost"><svg class="icon" aria-hidden="true"><use href="#i-bone"/></svg><span class="card__cost-num">0</span></span>
      `;
      el.shopList.append(card);
      cards.set(u.id, {
        root: card,
        lvl: $('.card__lvl', card),
        cost: $('.card__cost-num', card),
        desc: $('.card__desc', card),
      });
    }
  }

  function updateCard(u) {
    const refs = cards.get(u.id);
    if (!refs) return;
    const it = itemOf(u);
    const lvl = levelOf(u.id);
    const maxed = !!u.max && lvl >= u.max;
    const cost = costOf(u, lvl);
    const afford = !maxed && S.bones >= cost;

    setText(refs.lvl, lvl > 0 ? `ур. ${lvl}` : 'новое');
    setText(refs.cost, maxed ? 'макс' : fmt(cost));
    refs.root.classList.toggle('is-affordable', afford);
    refs.root.classList.toggle('is-locked', !afford && !maxed);
    refs.root.classList.toggle('is-maxed', maxed);
    refs.root.setAttribute('aria-label', maxed
      ? `${it.name}: максимальный уровень`
      : `${it.name}. ${it.desc}. Уровень ${lvl}. Стоимость ${fmt(cost)} косточек`);
  }

  function updateShop() {
    let available = 0;
    for (const u of UPGRADES) {
      const lvl = levelOf(u.id);
      const maxed = !!u.max && lvl >= u.max;
      if (!maxed && S.bones >= costOf(u, lvl)) available++;
      updateCard(u);
    }
    setText(el.shopBadge, String(available));
    el.shopBadge.classList.toggle('is-empty', available === 0);
  }

  function buy(id) {
    const u = UPGRADES.find((x) => x.id === id);
    if (!u || switching) return;
    const lvl = levelOf(u.id);
    if (u.max && lvl >= u.max) return;

    const cost = costOf(u, lvl);
    if (S.bones + 1e-9 < cost) {
      const refs = cards.get(id);
      if (refs) {
        refs.root.classList.remove('is-denied');
        void refs.root.offsetWidth;
        refs.root.classList.add('is-denied');
      }
      Sfx.nope();
      vibrate(12);
      return;
    }

    S.bones -= cost;
    S.levels[u.id] = lvl + 1;
    recalc();

    const refs = cards.get(id);
    if (refs) {
      refs.root.classList.remove('is-bought');
      void refs.root.offsetWidth;
      refs.root.classList.add('is-bought');
    }

    Sfx.buy();
    updateShop();
    updateStatsUI(true);
    if (Math.random() < 0.32) say(pick(CH.buy), true);
    checkAchievements();
    saveDirty = true;
    save();
  }

  /* ---------------- ui sync ---------------- */

  function updateGoal() {
    let target = null;
    for (const u of UPGRADES) {
      const lvl = levelOf(u.id);
      if (u.max && lvl >= u.max) continue;
      const cost = costOf(u, lvl);
      if (!target || cost < target.cost) target = { u, cost };
    }
    if (!target) {
      setText(el.goalName, 'Всё прокачано!');
      setText(el.goalProgress, 'максимум');
      el.goalFill.style.width = '100%';
      el.goal.classList.add('is-ready');
      return;
    }

    const { u, cost } = target;
    const it = itemOf(u);
    const ready = S.bones >= cost;
    setText(el.goalIcon, it.icon);
    setText(el.goalName, it.name);
    setText(el.goalProgress, ready ? 'покупай!' : `${fmt(Math.min(S.bones, cost))} / ${fmt(cost)}`);
    el.goalFill.style.width = clamp((S.bones / cost) * 100, 0, 100).toFixed(1) + '%';
    el.goal.classList.toggle('is-ready', ready);
  }

  function updateStatsUI() {
    setText(el.rate, fmtRate(D.cps));
    setText(el.perClick, fmt(Math.round(D.click)));
    setText(el.critChance, `${Math.round(D.crit * 100)}%`);
    setText(el.critMult, `×${D.critMult}`);
    setText(el.multiplier, `×${D.glob.toFixed(2).replace('.', ',')}`);
    setText(el.achCount, `${S.ach.length}/${ACHIEVEMENTS.length}`);
    setText(el.achBonus, `+${Math.round(S.ach.length * ECONOMY.achBonus * 100)}%`);

    const pct = clamp((combo / ECONOMY.comboMax) * 100, 0, 100);
    el.comboFill.style.width = pct.toFixed(1) + '%';
    setText(el.comboMult, `×${comboMult.toFixed(1).replace('.', ',')}`);
    el.comboBox.classList.toggle('is-hot', combo >= 15);
    el.stage.classList.toggle('is-hot', combo >= 15);
    el.stage.classList.toggle('is-blazing', combo >= 40);

    const left = S.frenzyUntil - performance.now();
    const frenzyOn = left > 0;
    if (frenzyOn) {
      el.frenzy.hidden = false;
      setText(el.frenzyTime, Math.ceil(left / 1000) + 'с');
    } else if (!el.frenzy.hidden) {
      el.frenzy.hidden = true;
    }
    el.stage.classList.toggle('is-frenzy', frenzyOn);

    const bonusLive = goldenActive || frenzyOn;
    setText(el.bonusState, goldenActive ? 'уже на сцене — лови!' : (frenzyOn ? 'безумие активно' : 'появится случайно'));
    el.bonusNote.classList.toggle('is-live', bonusLive);
    el.bonusNote.hidden = frenzyOn;

    updateGoal();
    updateShop();
  }

  function updateSoundBtn() {
    if (!el.soundBtn) return;
    el.soundBtn.setAttribute('aria-pressed', String(STORE.sound));
    el.soundBtn.setAttribute('aria-label', STORE.sound ? 'Звук: включён' : 'Звук: выключен');
    el.soundBtn.classList.toggle('is-off', !STORE.sound);
    if (el.soundIcon) el.soundIcon.setAttribute('href', STORE.sound ? '#i-volume' : '#i-muted');
  }

  /* ---------------- profiles ---------------- */

  function renderProfiles() {
    if (!el.profiles) return;
    el.profiles.querySelectorAll('.profile').forEach((btn) => {
      const on = btn.dataset.char === STORE.active;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-selected', String(on));
      btn.tabIndex = on ? 0 : -1;
    });
  }

  function applyCharacter(c) {
    document.documentElement.dataset.theme = c.id;
    document.title = `${c.brand} — ${c.tagline}`;
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) metaTheme.setAttribute('content', c.themeColor);
    setText(el.brandName, c.brand);
    setText(el.brandTagline, c.tagline);
    setText(el.diaryTitle, c.diary);
    setText(el.heroHint, c.dative);
    el.heroBtn.setAttribute('aria-label', c.pet);
    el.stage.setAttribute('aria-label', `Сцена: ${c.name}`);

    if (el.brandFace.getAttribute('src') !== c.face) el.brandFace.src = c.face;
    if (el.heroImg.getAttribute('src') !== c.hero) {
      el.heroImg.src = c.hero;
      el.heroImg.alt = c.alt;
    }
    if (el.shopTipImg.getAttribute('src') !== c.chibi) el.shopTipImg.src = c.chibi;
    el.shopTipText.innerHTML = c.tip;
    if (el.favicon && el.favicon.getAttribute('href') !== c.favicon) el.favicon.href = c.favicon;

    buildShop();
    renderProfiles();
    updateGoal();
  }

  function resetRuntime() {
    combo = 0;
    comboMult = 1;
    lastClickAt = -1e9;
    S.frenzyUntil = 0;
    goldenActive = false;
    clearTimeout(goldenHideTimer);
    el.golden.hidden = true;
    el.speech.classList.remove('is-on');
  }

  function switchProfile(id) {
    if (switching || id === STORE.active || !STORE.profiles[id]) return;
    switching = true;
    save();
    el.stage.classList.add('is-switching');

    setTimeout(() => {
      STORE.active = id;
      S = STORE.profiles[id];
      CH = characterById(id);
      resetRuntime();
      recalc();
      applyCharacter(CH);
      applyOffline(S);
      displayBones = S.bones;
      updateShop();
      updateStatsUI();
      el.stage.classList.remove('is-switching');
      toast(`Профиль: <b>${CH.name}</b>`, CH.badgeIcon);
      scheduleGolden(rand(35, 70) * 1000);
      save();
      switching = false;
    }, 190);
  }

  /* ---------------- modal ---------------- */

  let resetArmed = 0;

  function statTile(label, value) {
    return `<div class="mstat"><span>${label}</span><b>${value}</b></div>`;
  }

  function renderModal() {
    const levels = totalLevels();
    const achHtml = ACHIEVEMENTS.map((a) => {
      const on = S.ach.includes(a.id);
      return `<div class="ach ${on ? 'is-unlocked' : ''}">
        <span class="ach__icon">${a.icon}</span>
        <span><span class="ach__name">${a.name}</span><span class="ach__desc">${a.desc}</span></span>
      </div>`;
    }).join('');

    el.modalBody.innerHTML = `
      <div class="mstats">
        ${statTile('Всего косточек', fmt(S.totalBones))}
        ${statTile('Кликов', fmt(S.clicks))}
        ${statTile('Критов', fmt(S.crits))}
        ${statTile('Лучшее комбо', String(Math.round(S.bestCombo)))}
        ${statTile('За клик', fmt(Math.round(D.click)))}
        ${statTile('В секунду', fmtRate(D.cps))}
        ${statTile('Улучшений куплено', String(levels))}
        ${statTile('В игре', fmtTime(S.playMs))}
      </div>
      <h3 class="section-title"><svg class="icon"><use href="#i-trophy"/></svg>Достижения · ${S.ach.length}/${ACHIEVEMENTS.length}</h3>
      <div class="ach-grid">${achHtml}</div>
    `;
  }

  function bindResetButton() {
    if (!el.resetBtn) return;
    el.resetBtn.addEventListener('click', () => {
      if (Date.now() - resetArmed > 3500) {
        resetArmed = Date.now();
        el.resetBtn.classList.add('is-armed');
        el.resetBtn.textContent = 'Точно? Нажми ещё раз';
        setTimeout(() => {
          if (Date.now() - resetArmed >= 3500) {
            el.resetBtn.classList.remove('is-armed');
            el.resetBtn.textContent = 'Сбросить прогресс';
          }
        }, 3600);
      } else {
        resetGame();
      }
    });
  }

  function openModal() {
    renderModal();
    el.modal.hidden = false;
    const card = el.modal.querySelector('.modal__card');
    if (card) card.focus({ preventScroll: true });
  }

  function closeModal() {
    el.modal.hidden = true;
    el.heroBtn.focus({ preventScroll: true });
  }

  function resetGame() {
    const name = CH.name;
    try {
      localStorage.removeItem(SAVE_KEY);
      localStorage.removeItem(LEGACY_KEY);
    } catch { /* ignore */ }

    S = defaultState();
    STORE.profiles[STORE.active] = S;
    resetRuntime();
    displayBones = 0;
    resetArmed = 0;
    if (el.resetBtn) {
      el.resetBtn.classList.remove('is-armed');
      el.resetBtn.textContent = 'Сбросить прогресс';
    }
    recalc();
    updateShop();
    updateStatsUI();
    renderModal();
    closeModal();
    toast(`Прогресс <b>${name}</b> сброшен. Начинаем заново 🐾`, '🔄');
    scheduleGolden(20000);
    save();
  }

  /* ---------------- loop ---------------- */

  function frame(now) {
    const dt = lastFrame ? Math.min((now - lastFrame) / 1000, 0.5) : 0;
    lastFrame = now;

    if (D.cps > 0) addBones(D.cps * dt);
    S.playMs += dt * 1000;

    if (combo > 0 && now - lastClickAt > ECONOMY.comboWindow) {
      combo = Math.max(0, combo - dt * 36);
      comboMult = comboMultiplier();
    }

    if (!goldenActive && now >= nextGoldenAt && now > 15000) spawnGolden();

    displayBones += (S.bones - displayBones) * Math.min(1, dt * 11);
    if (Math.abs(S.bones - displayBones) < 0.6) displayBones = S.bones;
    setText(el.score, fmt(displayBones));

    if (now >= nextUISync) {
      nextUISync = now + 120;
      updateStatsUI();
    }

    if (now >= nextAchCheck) {
      nextAchCheck = now + 900;
      checkAchievements();
    }

    if (saveDirty && now % 5000 < 20) save();

    requestAnimationFrame(frame);
  }

  /* ---------------- events ---------------- */

  function bindEvents() {
    el.heroBtn.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      Sfx.ensure();
      doClick({ x: e.clientX, y: e.clientY });
    });

    el.heroBtn.addEventListener('click', (e) => {
      // keyboard activation fallback (Enter / Space)
      if (e.detail === 0) doClick(centerPoint());
    });

    el.golden.addEventListener('click', (e) => {
      e.stopPropagation();
      collectGolden();
    });

    el.shopList.addEventListener('click', (e) => {
      const card = e.target.closest('.card');
      if (!card) return;
      Sfx.ensure();
      buy(card.dataset.id);
    });

    el.profiles.addEventListener('click', (e) => {
      const btn = e.target.closest('.profile');
      if (btn && btn.dataset.char) switchProfile(btn.dataset.char);
    });

    el.profiles.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      const idx = CHARACTERS.findIndex((c) => c.id === STORE.active);
      const dir = e.key === 'ArrowRight' ? 1 : CHARACTERS.length - 1;
      const next = CHARACTERS[(idx + dir) % CHARACTERS.length];
      if (next) {
        switchProfile(next.id);
        setTimeout(() => {
          const tab = el.profiles.querySelector(`[data-char="${STORE.active}"]`);
          if (tab) tab.focus({ preventScroll: true });
        }, 260);
      }
    });

    el.soundBtn.addEventListener('click', () => {
      STORE.sound = !STORE.sound;
      Sfx.setEnabled(STORE.sound);
      updateSoundBtn();
      if (STORE.sound) Sfx.click();
      toast(STORE.sound ? 'Звук включён' : 'Звук выключен', STORE.sound ? '🔊' : '🔇');
      save();
    });

    el.statsBtn.addEventListener('click', openModal);

    el.modal.addEventListener('click', (e) => {
      if (e.target.closest('[data-close]')) closeModal();
    });

    document.addEventListener('keydown', (e) => {
      if (!el.modal.hidden) {
        if (e.key === 'Escape') closeModal();
        return;
      }

      if (e.key === 'Escape') return;

      const target = e.target;
      const isHero = target === el.heroBtn;
      const onControl = target instanceof Element &&
        target.closest('button, a, input, textarea, select') && !isHero;

      if (onControl) return;

      if (e.key === 'Enter' && isHero) {
        e.preventDefault();
        Sfx.ensure();
        doClick(centerPoint());
        return;
      }

      if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault();
        Sfx.ensure();
        doClick(centerPoint());
      }
    });

    // first gesture unlocks audio
    const unlock = () => { Sfx.ensure(); };
    document.addEventListener('pointerdown', unlock, { once: true });
    document.addEventListener('keydown', unlock, { once: true });

    window.addEventListener('beforeunload', save);

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        save();
        hiddenAt = Date.now();
      } else if (hiddenAt) {
        const secs = Math.min((Date.now() - hiddenAt) / 1000, 3600);
        if (D.cps > 0 && secs > 5) {
          const gain = Math.floor(D.cps * secs * 0.85);
          if (gain > 0) {
            addBones(gain);
            toast(`<b>${CH.name}</b> накопила <b>${fmt(gain)}</b> ${boneWord(gain)}, пока тебя не было`, '🌙');
          }
        }
        hiddenAt = 0;
        lastFrame = performance.now();
      }
    });
  }

  /* ---------------- boot ---------------- */

  function init() {
    const loaded = load();
    S = STORE.profiles[STORE.active];
    CH = characterById(STORE.active);
    recalc();
    displayBones = S.bones;
    lastFrame = 0;

    applyCharacter(CH);
    bindEvents();
    bindResetButton();
    Sfx.on = STORE.sound;
    updateSoundBtn();

    if (loaded) applyOffline(S);
    recalc();
    checkAchievements();
    updateShop();
    updateStatsUI();
    save();
    scheduleGolden(22000);

    requestAnimationFrame(frame);
    setTimeout(() => say(loaded ? CH.welcomeBack : CH.welcome, true), 700);
    setInterval(() => { if (saveDirty) save(); }, 5000);
  }

  init();
})();
