// Ranks, experience, levels and achievements. Everything here is derived from the
// learning record in localStorage, so the score can always be recomputed.

export const RANKS = [
  { id: 'novice', name: '样本新手', glyph: 'n', min: 0, color: '#b9805a', light: '#f3c9a6' },
  { id: 'mean', name: '均值学徒', glyph: 'x̄', min: 200, color: '#7d8ea6', light: '#dbe4ef' },
  { id: 'variance', name: '方差行者', glyph: 'σ²', min: 600, color: '#d39b1c', light: '#ffe08a' },
  { id: 'regression', name: '回归骑士', glyph: 'β', min: 1300, color: '#2f9e94', light: '#9ff0e2' },
  { id: 'component', name: '主成分术士', glyph: 'λ', min: 2400, color: '#4f6ff0', light: '#b9c8ff' },
  { id: 'likelihood', name: '似然大师', glyph: 'ℓ', min: 4000, color: '#8a4fe8', light: '#dcc4ff' },
  { id: 'grand', name: '统计宗师', glyph: 'Σ', min: 6500, color: '#d9414b', light: '#ffc0c4' },
];
const DIVISIONS = ['Ⅲ', 'Ⅱ', 'Ⅰ'];

export const XP = { correct: 10, conditional: 8, incorrect: 2, fixed: 4, mastered: 5, completed: 30, star: 15, badge: 50, daily: 40, day: 10 };
export const LEVEL_HEARTS = 3;
export const BOSS_SIZE = 10, DAILY_SIZE = 5, REVIEW_SIZE = 8, RUSH_SECONDS = 60;

export function rankOf(xp) {
  const index = RANKS.findLastIndex(r => xp >= r.min);
  const tier = RANKS[index], next = RANKS[index + 1];
  if (!next) return { ...tier, index, division: '', ordinal: index * 3, label: tier.name, floor: tier.min, ceiling: null, nextLabel: null, progress: 1 };
  const step = (next.min - tier.min) / 3, division = Math.min(2, Math.floor((xp - tier.min) / step));
  const floor = tier.min + division * step, ceiling = floor + step;
  const nextLabel = division < 2 ? `${tier.name} ${DIVISIONS[division + 1]}` : RANKS[index + 2] ? `${next.name} ${DIVISIONS[0]}` : next.name;
  return { ...tier, index, division: DIVISIONS[division], ordinal: index * 3 + division, label: `${tier.name} ${DIVISIONS[division]}`,
    floor: Math.round(floor), ceiling: Math.ceil(ceiling), nextLabel, progress: (xp - floor) / step };
}

export const today = (date = new Date()) => date.toLocaleDateString('sv');
function previousDay(day) { const d = new Date(`${day}T12:00:00`); d.setDate(d.getDate() - 1); return today(d); }

export function streakOf(days, now = today()) {
  const set = new Set(days);
  let day = set.has(now) ? now : previousDay(now), count = 0;
  while (set.has(day)) { count++; day = previousDay(day); }
  return count;
}

export function xpBreakdown(s) {
  const answers = Object.values(s.firstTry).reduce((sum, r) => sum + (XP[r] || 0), 0);
  const stars = Object.values(s.levels).reduce((sum, l) => sum + (l.stars || 0), 0);
  const parts = { answers, fixed: s.fixed.length * XP.fixed, mastered: s.mastered.length * XP.mastered, completed: s.completed.length * XP.completed,
    stars: stars * XP.star, badges: s.badges.length * XP.badge, daily: s.dailyDone.length * XP.daily, days: s.days.length * XP.day };
  return { ...parts, total: Object.values(parts).reduce((a, b) => a + b, 0), starCount: stars };
}

// One answer from the reader or a challenge. Only the first attempt scores;
// later corrections clear the question from the mistake book.
export function recordAnswer(s, key, status) {
  const right = status === 'correct' || status === 'conditional';
  const firstTry = key in s.firstTry ? s.firstTry : { ...s.firstTry, [key]: status };
  const wasWrong = s.wrong.includes(key);
  const wrong = right ? s.wrong.filter(k => k !== key) : wasWrong ? s.wrong : [...s.wrong, key];
  const fixed = right && wasWrong && !s.fixed.includes(key) ? [...s.fixed, key] : s.fixed;
  return { ...s, firstTry, wrong, fixed, days: s.days.includes(today()) ? s.days : [...s.days, today()].slice(-400) };
}

export function starsFor(correct, total, failed) {
  if (failed || !total) return 0;
  const rate = correct / total;
  return rate === 1 ? 3 : rate >= .8 ? 2 : rate >= .6 ? 1 : 0;
}

export function recordLevel(s, id, stars, correct, total) {
  const old = s.levels[id] || { stars: 0, best: 0, plays: 0 };
  return { ...s, levels: { ...s.levels, [id]: { stars: Math.max(old.stars, stars), best: Math.max(old.best, total ? correct / total : 0), plays: old.plays + 1 } } };
}

export const bossId = course => `boss-${course}`;

// The first stage of every chapter is open; later stages need the previous one
// cleared, and a course's final challenge needs all its stages cleared.
export function levelState(levels, s, level) {
  const stars = s.levels[level.id]?.stars || 0;
  if (level.boss) {
    const own = levels.filter(l => l.course === level.course && !l.boss);
    return { stars, unlocked: own.every(l => (s.levels[l.id]?.stars || 0) > 0), cleared: stars > 0 };
  }
  const previous = levels.find(l => l.chapter === level.chapter && l.stage === level.stage - 1);
  return { stars, unlocked: !previous || (s.levels[previous.id]?.stars || 0) > 0, cleared: stars > 0 };
}

export function bossLevel(course) {
  return { id: bossId(course.id), course: course.id, boss: true, title: `${course.title} · 终极挑战`, stage: 1, stages: 1, questions: [] };
}

// Deterministic shuffling so a day's challenge is the same on every visit.
export function seeded(seed) {
  let h = 2166136261;
  for (const ch of String(seed)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => { h += 0x6D2B79F5; let t = h; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
export function shuffle(items, random = Math.random) {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// Daily challenge scope: 'today' (all courses), a course id, or an exercise chapter id.
export function dailyQuestions(all, scope = 'today', day = today()) {
  const pool = all.filter(q => scope === 'today' || q.course === scope || q.chapter === scope).sort((a, b) => a.key.localeCompare(b.key));
  return shuffle(pool, seeded(scope === 'today' ? day : `${day}:${scope}`)).slice(0, DAILY_SIZE);
}

export const BADGES = [
  { id: 'first', name: '首战告捷', desc: '第一次答对选择题', glyph: '✓', test: s => s.fixed.length > 0 || Object.values(s.firstTry).some(v => v !== 'incorrect') },
  { id: 'answer100', name: '百题斩', desc: '作答 100 道选择题', glyph: '100', test: s => Object.keys(s.firstTry).length >= 100 },
  { id: 'combo5', name: '五连击', desc: '闯关中连续答对 5 题', glyph: '×5', test: s => s.bestCombo >= 5 },
  { id: 'combo10', name: '势不可挡', desc: '闯关中连续答对 10 题', glyph: '×10', test: s => s.bestCombo >= 10 },
  { id: 'perfect', name: '完美通关', desc: '任意关卡获得三星', glyph: '★', test: s => Object.values(s.levels).some(l => l.stars === 3) },
  { id: 'stars30', name: '摘星者', desc: '累计获得 30 颗星', glyph: '30★', test: s => xpBreakdown(s).starCount >= 30 },
  { id: 'boss-linear', name: '回归通关', desc: '击败应用线性回归终极挑战', glyph: 'β', test: s => s.levels[bossId('linear')]?.stars > 0 },
  { id: 'boss-multivariate', name: '降维通关', desc: '击败应用多元分析终极挑战', glyph: 'λ', test: s => s.levels[bossId('multivariate')]?.stars > 0 },
  { id: 'boss-glm', name: '广义通关', desc: '击败广义线性模型终极挑战', glyph: 'η', test: s => s.levels[bossId('glm')]?.stars > 0 },
  { id: 'daily', name: '日日精进', desc: '完成一次每日挑战', glyph: '日', test: s => s.dailyDone.length > 0 },
  { id: 'streak3', name: '三日连学', desc: '连续 3 天学习', glyph: '3', test: s => streakOf(s.days) >= 3 },
  { id: 'streak7', name: '七日不辍', desc: '连续 7 天学习', glyph: '7', test: s => streakOf(s.days) >= 7 },
  { id: 'fixer', name: '知错能改', desc: '订正 10 道错题', glyph: '↺', test: s => s.fixed.length >= 10 },
  { id: 'reader', name: '博览群书', desc: '读完 10 个章节', glyph: '册', test: s => s.completed.length >= 10 },
  { id: 'master50', name: '胸有成竹', desc: '标记掌握 50 道题', glyph: '50', test: s => s.mastered.length >= 50 },
  { id: 'rush15', name: '闪电手', desc: '60 秒极速挑战答对 15 题', glyph: '⚡', test: s => s.rushBest >= 15 },
];
export const newBadges = s => BADGES.filter(b => !s.badges.includes(b.id) && b.test(s)).map(b => b.id);

const PRAISE = ['漂亮！', '稳如最小二乘！', 'p < 0.05，显著正确！', '置信区间稳稳覆盖！', '残差为零，完美拟合！', '这一题拿下了！', '方向找对了！'];
const COMFORT = ['别灰心，残差也是信息。', '再看看解析，下次就对了。', '错误是最好的样本。', '方差大一点没关系，继续！', '记进错题本，回头复活它。'];
export const cheer = (right, random = Math.random) => (right ? PRAISE : COMFORT)[Math.floor(random() * (right ? PRAISE : COMFORT).length)];

// The learning record kept in localStorage and, for signed-in learners, in the cloud.
export const DEFAULT_LEARNING = { bookmarks: [], completed: [], mastered: [], last: null, positions: {}, fontSize: 18, sidebarCollapsed: false, quizAnswers: {},
  firstTry: {}, wrong: [], fixed: [], levels: {}, days: [], badges: [], dailyDone: [], bestCombo: 0, rushBest: 0, rankSeen: -1, soundOn: false, dailyScope: 'today' };
const strings = value => Array.isArray(value) ? value.filter(v => typeof v === 'string') : [];
const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const count = value => Number.isFinite(value) && value >= 0 ? value : 0;
export function normalizeLearning(s) {
  if (!s || typeof s !== 'object' || Array.isArray(s)) return DEFAULT_LEARNING;
  return { ...DEFAULT_LEARNING, bookmarks: strings(s.bookmarks), completed: strings(s.completed), mastered: strings(s.mastered), last: typeof s.last === 'string' ? s.last : null,
    positions: object(s.positions), fontSize: [16, 18, 20, 22].includes(s.fontSize) ? s.fontSize : 18, sidebarCollapsed: s.sidebarCollapsed === true, quizAnswers: object(s.quizAnswers),
    firstTry: object(s.firstTry), wrong: strings(s.wrong), fixed: strings(s.fixed), levels: object(s.levels), days: strings(s.days), badges: strings(s.badges), dailyDone: strings(s.dailyDone),
    bestCombo: count(s.bestCombo), rushBest: count(s.rushBest), rankSeen: Number.isInteger(s.rankSeen) ? s.rankSeen : -1, soundOn: s.soundOn === true,
    dailyScope: typeof s.dailyScope === 'string' && /^[a-z0-9-]{1,40}$/.test(s.dailyScope) ? s.dailyScope : 'today' };
}

// Combine two copies of a record so that no progress is lost. The cloud copy keeps
// its earlier first attempts; display preferences stay with this device.
export function mergeLearning(local, cloud) {
  const a = normalizeLearning(local), b = normalizeLearning(cloud);
  const union = key => [...new Set([...b[key], ...a[key]])];
  const fixed = union('fixed');
  const wrong = union('wrong').filter(k => !fixed.includes(k) || (a.wrong.includes(k) && b.wrong.includes(k)));
  const levels = { ...b.levels };
  for (const [id, l] of Object.entries(a.levels)) {
    const o = levels[id] || {};
    levels[id] = { stars: Math.max(l.stars || 0, o.stars || 0), best: Math.max(l.best || 0, o.best || 0), plays: Math.max(l.plays || 0, o.plays || 0) };
  }
  return { ...a, bookmarks: union('bookmarks'), completed: union('completed'), mastered: union('mastered'), badges: union('badges'), dailyDone: union('dailyDone'), days: union('days').sort().slice(-400),
    fixed, wrong, levels, firstTry: { ...a.firstTry, ...b.firstTry }, quizAnswers: { ...b.quizAnswers, ...a.quizAnswers }, positions: { ...b.positions, ...a.positions },
    last: a.last || b.last, bestCombo: Math.max(a.bestCombo, b.bestCombo), rushBest: Math.max(a.rushBest, b.rushBest), rankSeen: Math.max(a.rankSeen, b.rankSeen) };
}
export const hasProgress = s => xpBreakdown(normalizeLearning(s)).total > 0 || normalizeLearning(s).bookmarks.length > 0;

// The figures shown on the leaderboard, sent with each cloud save.
export function summaryOf(s) {
  const parts = xpBreakdown(s), answered = Object.keys(s.firstTry).length;
  return { xp: parts.total, stars: parts.starCount, answered, correct: Object.values(s.firstTry).filter(v => v !== 'incorrect').length,
    streak: streakOf(s.days), lastDay: [...s.days].sort().at(-1) || '', rank: rankOf(parts.total).ordinal };
}
