import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Trophy, Flame, Star, Heart, Zap, Timer, Lock, Crown, Swords, CalendarCheck, Volume2, VolumeX, Target, Sparkles, ArrowRight, Award, X, Check, BookOpen, RotateCcw, ChevronRight, Undo2 } from 'lucide-react';
import { chapterHref, enrichContent } from './content.js';
import { gradeChoice } from './quiz.js';
import { RANKS, XP, LEVEL_HEARTS, BOSS_SIZE, DAILY_SIZE, REVIEW_SIZE, RUSH_SECONDS, BADGES, rankOf, xpBreakdown, streakOf, recordAnswer, recordLevel, starsFor, levelState, bossLevel, bossId, seeded, shuffle, today, cheer } from './game.js';
import { confetti, celebrate, centerOf, floatText, shake, sound } from './fx.js';

const asset = path => `${import.meta.env.BASE_URL}${path}`;
const banks = new Map();
export function loadBank(course) {
  if (!banks.has(course)) banks.set(course, fetch(asset(`data/arena-${course}.json`), { cache: 'no-cache' }).then(r => {
    if (!r.ok) throw new Error('题库暂时未能加载');
    return r.json();
  }).catch(error => { banks.delete(course); throw error; }));
  return banks.get(course);
}
const html = value => ({ __html: value });
const Stars = ({ value, total = 3, size = 15, animate = false }) => <span className={`stars ${animate ? 'stars-animate' : ''}`} aria-label={`${value} 星`}>{Array.from({ length: total }, (_, i) => <Star key={i} size={size} className={i < value ? 'star-on' : 'star-off'} style={{ '--i': i }} fill="currentColor" />)}</span>;

export function RankBadge({ rank, size = 64, className = '' }) {
  const id = useId().replace(/:/g, '');
  const pips = rank.division ? ['Ⅲ', 'Ⅱ', 'Ⅰ'].indexOf(rank.division) + 1 : 0;
  return <svg className={`rank-badge rank-tier-${rank.index} ${className}`} width={size} height={size * 1.1} viewBox="0 0 100 110" role="img" aria-label={`段位：${rank.label}`}>
    <defs>
      <linearGradient id={`g${id}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={rank.light} /><stop offset=".55" stopColor={rank.color} /><stop offset="1" stopColor={rank.color} stopOpacity=".85" /></linearGradient>
      <linearGradient id={`s${id}`} x1="0" x2="1"><stop offset="0" stopColor="#fff" stopOpacity="0" /><stop offset=".5" stopColor="#fff" stopOpacity=".55" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></linearGradient>
      <clipPath id={`c${id}`}><path d="M50 4 90 18v36c0 26-18 42-40 52C28 96 10 80 10 54V18Z" /></clipPath>
    </defs>
    {rank.index >= 3 && <g className="rank-wings" fill={rank.color} opacity=".55"><path d="M10 30 0 22l4 22 6 6Z" /><path d="M90 30l10-8-4 22-6 6Z" /></g>}
    <path d="M50 4 90 18v36c0 26-18 42-40 52C28 96 10 80 10 54V18Z" fill={`url(#g${id})`} />
    <path d="M50 13 81 24v30c0 20-14 33-31 41-17-8-31-21-31-41V24Z" fill="none" stroke="#fff" strokeOpacity=".45" strokeWidth="2" />
    <g clipPath={`url(#c${id})`}><rect className="rank-shine" x="-60" y="0" width="40" height="110" fill={`url(#s${id})`} transform="skewX(-20)" /></g>
    {rank.index === RANKS.length - 1 && <path d="M34 2l8 8 8-10 8 10 8-8-3 14H37Z" fill="#ffd45c" stroke="#b8860b" strokeWidth="1.5" />}
    <text x="50" y="63" textAnchor="middle" className="rank-glyph" fontSize={rank.glyph.length > 1 ? 30 : 38}>{rank.glyph}</text>
    {Array.from({ length: pips }, (_, i) => <circle key={i} cx={50 + (i - (pips - 1) / 2) * 11} cy="84" r="3.6" fill="#fff" opacity=".9" />)}
  </svg>;
}

function CountUp({ value, duration = 900 }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { setShown(value); return; }
    let raf; const start = performance.now();
    const step = now => { const t = Math.min(1, (now - start) / duration); setShown(Math.round(value * (1 - (1 - t) ** 3))); if (t < 1) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return <>{shown}</>;
}

export function RankProgress({ xp }) {
  const rank = rankOf(xp);
  return <div className="rank-progress">
    <div className="rank-progress-track"><span style={{ width: `${Math.round(rank.progress * 100)}%`, '--rank': rank.color }} /></div>
    <small>{rank.ceiling ? <>距 {rank.nextLabel} 还差 <strong>{rank.ceiling - xp}</strong> XP</> : '已达最高段位'}</small>
  </div>;
}

export function RankChip({ learning: s }) {
  const xp = xpBreakdown(s).total, rank = rankOf(xp), streak = streakOf(s.days);
  return <a className="rank-chip" href="#/arena" title={`${rank.label} · ${xp} XP`} style={{ '--rank': rank.color }}>
    <RankBadge rank={rank} size={26} />
    <span className="rank-chip-text"><strong>{rank.label}</strong><span className="rank-chip-bar"><i style={{ width: `${Math.round(rank.progress * 100)}%` }} /></span></span>
    <span className={`streak-pill ${streak ? 'lit' : ''}`} title={`连续学习 ${streak} 天`}><Flame size={14} />{streak}</span>
  </a>;
}

// Shown on the overview page as the entrance to the challenge mode.
export function RankPanel({ learning: s, manifest: m }) {
  const parts = xpBreakdown(s), rank = rankOf(parts.total), streak = streakOf(s.days), dailyDone = s.dailyDone.includes(today());
  const answered = Object.keys(s.firstTry).length, right = Object.values(s.firstTry).filter(v => v !== 'incorrect').length;
  return <section className="rank-panel" style={{ '--rank': rank.color, '--rank-light': rank.light }} aria-label="我的段位">
    <div className="rank-panel-main">
      <RankBadge rank={rank} size={92} className="float-badge" />
      <div>
        <span className="eyebrow">MY RANK · 当前段位</span>
        <h2>{rank.label}</h2>
        <p className="rank-xp"><strong><CountUp value={parts.total} /></strong> XP</p>
        <RankProgress xp={parts.total} />
      </div>
    </div>
    <div className="rank-panel-stats">
      <span><Flame size={18} className={streak ? 'flame-lit' : ''} /><strong>{streak}</strong>连续天数</span>
      <span><Star size={18} /><strong>{parts.starCount}</strong>/ {(m.levels.length + m.courses.length) * 3} 星</span>
      <span><Target size={18} /><strong>{answered ? Math.round(right / answered * 100) : 0}%</strong>首答正确率</span>
      <span><Award size={18} /><strong>{s.badges.length}</strong>/ {BADGES.length} 成就</span>
    </div>
    <div className="rank-panel-actions">
      <a className={`daily-cta ${dailyDone ? 'done' : ''}`} href="#/play/daily/today">{dailyDone ? <CalendarCheck size={18} /> : <Sparkles size={18} />}<span><strong>{dailyDone ? '今日挑战已完成' : '每日挑战'}</strong><small>{dailyDone ? '明天还有新的 5 题' : `5 道随机题 · +${XP.daily} XP`}</small></span></a>
      <a className="primary-button arena-cta" href="#/arena"><Trophy size={17} />进入闯关<ArrowRight size={16} /></a>
    </div>
  </section>;
}

export function RankUpModal({ rank, onClose }) {
  const button = useRef(null);
  useEffect(() => { button.current?.focus(); celebrate(); }, []);
  return <div className="rankup-overlay" role="dialog" aria-modal="true" aria-label="段位晋升" onClick={e => e.target === e.currentTarget && onClose()}>
    <div className="rankup-card" style={{ '--rank': rank.color, '--rank-light': rank.light }}>
      <div className="rankup-rays" aria-hidden="true" />
      <span className="eyebrow">RANK UP</span>
      <RankBadge rank={rank} size={150} className="rankup-badge" />
      <h2>段位晋升！</h2>
      <p className="rankup-name">{rank.label}</p>
      <p className="rankup-note">继续答题、读章节、摘星星，冲击下一个段位。</p>
      <button ref={button} className="primary-button" onClick={onClose}>太棒了，继续</button>
    </div>
  </div>;
}

export function BadgeToast({ badge, rank }) {
  if (rank) return <div className="badge-toast rank-toast" role="status" style={{ '--rank': rank.color }}><RankBadge rank={rank} size={40} /><span><small>段位晋级</small><strong>{rank.label}</strong></span></div>;
  return <div className="badge-toast" role="status"><span className="badge-medal">{badge.glyph}</span><span><small>成就解锁 · +{XP.badge} XP</small><strong>{badge.name}</strong></span></div>;
}

function useLevels(m) {
  return useMemo(() => [...m.levels, ...m.courses.map(bossLevel)], [m]);
}

export function ArenaPage({ manifest: m, learning: s, setLearning, route, toast }) {
  const levels = useLevels(m);
  const course = m.courses.find(c => c.id === route.id) || m.courses[0];
  const parts = xpBreakdown(s), rank = rankOf(parts.total), streak = streakOf(s.days), dailyDone = s.dailyDone.includes(today());
  const own = levels.filter(l => l.course === course.id && !l.boss), boss = levels.find(l => l.id === bossId(course.id));
  const worlds = m.chapters.filter(c => c.course === course.id && c.kind === 'exercises').map(c => ({ chapter: c, stages: own.filter(l => l.chapter === c.id) })).filter(w => w.stages.length);
  const current = own.find(l => { const st = levelState(levels, s, l); return st.unlocked && !st.cleared; });
  const earned = own.reduce((sum, l) => sum + (s.levels[l.id]?.stars || 0), 0) + (s.levels[boss.id]?.stars || 0);
  let n = 0;
  function open(level, event) {
    const st = levelState(levels, s, level);
    if (!st.unlocked) { shake(event.currentTarget); toast(level.boss ? '通过本课程全部关卡后解锁终极挑战' : '先通过本章上一关'); return; }
    location.hash = level.boss ? `#/play/boss/${level.course}` : `#/play/level/${level.id}`;
  }
  return <div className="arena page-pad page-enter">
    <section className="arena-hero" style={{ '--rank': rank.color, '--rank-light': rank.light }}>
      <div className="arena-hero-rank">
        <RankBadge rank={rank} size={120} className="float-badge" />
        <div>
          <span className="eyebrow">CHALLENGE ARENA · 闯关挑战</span>
          <h1>{rank.label}</h1>
          <p className="rank-xp"><strong><CountUp value={parts.total} /></strong> XP</p>
          <RankProgress xp={parts.total} />
        </div>
      </div>
      <div className="arena-hero-side">
        <div className="arena-ladder" aria-label="段位阶梯">{RANKS.map((r, i) => <span key={r.id} className={i < rank.index ? 'passed' : i === rank.index ? 'here' : ''} style={{ '--c': r.color }} title={`${r.name} · ${r.min} XP`}><b>{r.glyph}</b><small>{r.name}</small></span>)}</div>
        <div className="arena-hero-stats">
          <span><Flame size={17} className={streak ? 'flame-lit' : ''} />连学 <strong>{streak}</strong> 天</span>
          <span><Star size={17} />共 <strong>{parts.starCount}</strong> 星</span>
          <span><Zap size={17} />最高连击 <strong>{s.bestCombo}</strong></span>
          <button className="sound-toggle" aria-pressed={s.soundOn} onClick={() => setLearning(x => ({ ...x, soundOn: !x.soundOn }))}>{s.soundOn ? <Volume2 size={16} /> : <VolumeX size={16} />}音效{s.soundOn ? '开' : '关'}</button>
        </div>
      </div>
    </section>

    <div className="mode-grid stagger">
      <a className={`mode-card mode-daily ${dailyDone ? 'done' : ''}`} href="#/play/daily/today" style={{ '--i': 0 }}><span className="mode-icon">{dailyDone ? <CalendarCheck size={24} /> : <Sparkles size={24} />}</span><strong>每日挑战</strong><p>{dailyDone ? '今日已完成，明天再来。' : `每天 ${DAILY_SIZE} 道随机题，完成 +${XP.daily} XP。`}</p><span className="mode-tag">{dailyDone ? '已完成' : '今日未完成'}</span></a>
      <a className={`mode-card mode-review ${s.wrong.length ? '' : 'empty'}`} href={s.wrong.length ? '#/play/review/all' : undefined} onClick={e => { if (!s.wrong.length) { e.preventDefault(); toast('错题本是空的，继续保持！'); } }} style={{ '--i': 1 }}><span className="mode-icon"><Undo2 size={24} /></span><strong>错题复活赛</strong><p>重做答错的题，订正一题 +{XP.fixed} XP。</p><span className="mode-tag">{s.wrong.length} 道待复活</span></a>
      <a className="mode-card mode-rush" href="#/play/rush/all" style={{ '--i': 2 }}><span className="mode-icon"><Timer size={24} /></span><strong>{RUSH_SECONDS} 秒极速</strong><p>限时连答，看看一分钟能对几题。</p><span className="mode-tag">最佳 {s.rushBest} 题</span></a>
    </div>

    <div className="section-heading"><h2>闯关地图</h2><span>每章第一关直接开放，通关后解锁下一关</span></div>
    <div className="filter-tabs arena-tabs">{m.courses.map(c => <a key={c.id} href={`#/arena/${c.id}`} className={c.id === course.id ? 'active' : ''} aria-current={c.id === course.id ? 'page' : undefined}><span className="course-dot" data-course={c.id} />{c.title}</a>)}</div>
    <div className="arena-map" data-course={course.id} key={course.id}>
      <div className="arena-map-summary"><span><Star size={15} fill="currentColor" /> {earned} / {(own.length + 1) * 3}</span><span>{own.filter(l => s.levels[l.id]?.stars).length} / {own.length} 关已通过</span></div>
      {worlds.map((w, wi) => <section className="world" key={w.chapter.id} style={{ '--i': wi }}>
        <header className="world-header"><span className="world-number">{String(w.chapter.number).padStart(2, '0')}</span><div><strong>{w.chapter.title}</strong><small>{w.stages.length} 关 · {w.stages.reduce((a, l) => a + l.questions.length, 0)} 题</small></div><span className="world-stars"><Star size={14} fill="currentColor" />{w.stages.reduce((a, l) => a + (s.levels[l.id]?.stars || 0), 0)} / {w.stages.length * 3}</span></header>
        <div className="world-path">{w.stages.map(l => { const st = levelState(levels, s, l); n++; return <button key={l.id} className={`level-node ${st.cleared ? 'cleared' : ''} ${st.unlocked ? '' : 'locked'} ${current?.id === l.id ? 'current' : ''}`} style={{ '--n': n }} onClick={e => open(l, e)} aria-label={`第 ${w.chapter.number} 章第 ${l.stage} 关${st.unlocked ? '' : '（未解锁）'}，${st.stars} 星`}>
          <span className="level-orb">{st.unlocked ? `${w.chapter.number}-${l.stage}` : <Lock size={18} />}</span>
          <Stars value={st.stars} size={12} />
          {current?.id === l.id && <span className="level-bubble">开始</span>}
        </button>; })}</div>
      </section>)}
      {(() => { const st = levelState(levels, s, boss); return <button className={`boss-node ${st.unlocked ? '' : 'locked'} ${st.cleared ? 'cleared' : ''}`} onClick={e => open(boss, e)}>
        <span className="boss-icon">{st.unlocked ? <Crown size={30} /> : <Lock size={26} />}</span>
        <span><strong>终极挑战 · {course.title}</strong><small>{st.unlocked ? `${BOSS_SIZE} 道随机题，3 颗心。击败它获得课程通关成就。` : '通过本课程全部关卡后解锁'}</small></span>
        <Stars value={st.stars} size={16} />
      </button>; })()}
    </div>

    <div className="section-heading"><h2>成就徽章</h2><span>{s.badges.length} / {BADGES.length} 已解锁 · 每枚 +{XP.badge} XP</span></div>
    <div className="badge-grid stagger">{BADGES.map((b, i) => { const got = s.badges.includes(b.id); return <div key={b.id} className={`badge-item ${got ? 'got' : ''}`} style={{ '--i': i }} title={b.desc}><span className="badge-medal">{got ? b.glyph : <Lock size={16} />}</span><strong>{b.name}</strong><small>{b.desc}</small></div>; })}</div>

    <div className="xp-rules"><strong>XP 怎么来</strong><span>首次答对 +{XP.correct}</span><span>首次答错也 +{XP.incorrect}</span><span>订正错题 +{XP.fixed}</span><span>标记掌握 +{XP.mastered}</span><span>读完一章 +{XP.completed}</span><span>每颗星 +{XP.star}</span><span>每日挑战 +{XP.daily}</span><span>每个学习日 +{XP.day}</span></div>
  </div>;
}

const MODES = { level: '闯关', boss: '终极挑战', daily: '每日挑战', review: '错题复活赛', rush: '极速挑战' };

export function Play({ mode, target, manifest: m, learning: s, setLearning, toast, onPlaying }) {
  const levels = useLevels(m);
  const level = mode === 'level' ? levels.find(l => l.id === target) : mode === 'boss' ? levels.find(l => l.id === bossId(target)) : null;
  const locked = level && !levelState(levels, s, level).unlocked;
  const [bank, setBank] = useState(null), [error, setError] = useState('');
  const [run, setRun] = useState(null), [choice, setChoice] = useState(null), [attempt, setAttempt] = useState(0), [clock, setClock] = useState(RUSH_SECONDS);
  const card = useRef(null), nextButton = useRef(null), state = useRef(s), runRef = useRef(null);
  state.current = s; runRef.current = run;
  const courses = useMemo(() => mode === 'level' || mode === 'boss' ? [level?.course].filter(Boolean) : mode === 'rush' && target !== 'all' ? [target] : m.courses.map(c => c.id), [mode, target, level, m]);

  useEffect(() => {
    let cancel = false;
    Promise.all(courses.map(loadBank)).then(list => {
      if (cancel) return;
      const questions = new Map(), contexts = {};
      list.forEach(b => { b.questions.forEach(q => questions.set(q.key, q)); Object.assign(contexts, b.contexts); });
      setBank({ questions, contexts });
    }).catch(e => !cancel && setError(e.message));
    return () => { cancel = true; };
  }, [courses]);

  // A fresh run each time the page opens or the visitor retries.
  useEffect(() => {
    if (!bank || locked) return;
    const all = [...bank.questions.values()];
    let list = [];
    if (mode === 'level' && level) list = level.questions.map(k => bank.questions.get(k)).filter(Boolean);
    else if (mode === 'boss') list = shuffle(all).slice(0, BOSS_SIZE);
    else if (mode === 'daily') list = shuffle(all.sort((a, b) => a.key.localeCompare(b.key)), seeded(today())).slice(0, DAILY_SIZE);
    else if (mode === 'review') list = shuffle(state.current.wrong.map(k => bank.questions.get(k)).filter(Boolean)).slice(0, REVIEW_SIZE);
    else if (mode === 'rush') list = shuffle(all);
    setRun({ list, index: 0, hearts: LEVEL_HEARTS, combo: 0, maxCombo: 0, correct: 0, log: [], xpStart: xpBreakdown(state.current).total, bestBefore: state.current.rushBest, done: false, failed: false, stars: 0 });
    setChoice(null); setClock(RUSH_SECONDS);
  }, [bank, mode, level, locked, attempt]);

  const q = run && !run.done ? run.list[run.index] : null;
  // Hold big celebrations until the run ends.
  useEffect(() => { onPlaying?.(!!q); }, [!!q, onPlaying]);
  useEffect(() => () => onPlaying?.(false), [onPlaying]);
  const usesHearts = mode === 'level' || mode === 'boss';

  const finish = useCallback((r, timeUp = false) => {
    const total = mode === 'rush' ? r.log.length : r.list.length;
    const failed = usesHearts && r.hearts <= 0;
    const stars = usesHearts ? starsFor(r.correct, total, failed) : 0;
    setRun({ ...r, done: true, failed, stars, timeUp });
    setLearning(x => {
      let y = { ...x, bestCombo: Math.max(x.bestCombo, r.maxCombo) };
      if (usesHearts) y = recordLevel(y, level.id, stars, r.correct, total);
      if (mode === 'daily' && !y.dailyDone.includes(today())) y.dailyDone = [...y.dailyDone, today()].slice(-400);
      if (mode === 'rush') y.rushBest = Math.max(y.rushBest, r.correct);
      return y;
    });
    if (stars > 0 || mode === 'daily' || (mode === 'rush' && r.correct > 0) || (mode === 'review' && r.correct > 0)) { celebrate(); if (state.current.soundOn) sound('clear'); }
  }, [mode, usesHearts, level, setLearning]);

  const next = useCallback(() => {
    const r = runRef.current;
    if (!r || r.done) return;
    if ((usesHearts && r.hearts <= 0) || r.index >= r.list.length - 1) return finish(r);
    setRun({ ...r, index: r.index + 1 }); setChoice(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [finish, usesHearts]);

  const pick = useCallback((value, element) => {
    const r = runRef.current;
    if (!q || choice || !r || r.done) return;
    const result = gradeChoice(q, value), right = result.status !== 'incorrect';
    const first = !(q.key in state.current.firstTry);
    const combo = right ? r.combo + 1 : 0;
    const updated = { ...r, combo, maxCombo: Math.max(r.maxCombo, combo), correct: r.correct + (right ? 1 : 0), hearts: usesHearts && !right ? r.hearts - 1 : r.hearts, log: [...r.log, { q, value, status: result.status }] };
    setChoice({ value, status: result.status, cheer: cheer(right), first });
    setRun(updated);
    setLearning(x => ({ ...recordAnswer(x, q.key, result.status), quizAnswers: { ...x.quizAnswers, [q.key]: value } }));
    const [x, y] = element ? centerOf(element) : [innerWidth / 2, innerHeight / 2];
    if (right) {
      confetti(x, y, { count: combo >= 5 ? 50 : 24, spread: .6 });
      floatText(x, y - 20, first ? `+${XP[result.status]} XP` : '✓', 'good');
      if ([3, 5, 10, 15, 20].includes(combo)) setTimeout(() => floatText(x, y - 60, `连击 ×${combo}！`, 'combo'), 220);
    } else {
      shake(card.current);
      floatText(x, y - 20, usesHearts ? '−♥' : first ? `+${XP.incorrect} XP` : '×', 'bad');
    }
    if (state.current.soundOn) sound(right ? 'correct' : 'wrong');
    if (mode === 'rush') setTimeout(() => {
      const latest = runRef.current;
      if (latest.done) return;
      if (latest.index >= latest.list.length - 1) return finish(latest);
      setRun({ ...latest, index: latest.index + 1 }); setChoice(null);
    }, right ? 420 : 900);
  }, [q, choice, usesHearts, mode, setLearning, finish]);

  useEffect(() => {
    if (mode !== 'rush' || !run || run.done) return;
    const id = setInterval(() => setClock(c => c - 1), 1000);
    return () => clearInterval(id);
  }, [mode, run?.done, attempt, !!run]);
  useEffect(() => { if (mode === 'rush' && clock <= 0 && runRef.current && !runRef.current.done) finish(runRef.current, true); else if (mode === 'rush' && clock <= 5 && clock > 0 && state.current.soundOn) sound('tick'); }, [clock, mode, finish]);

  useEffect(() => { if (card.current) enrichContent(card.current); if (choice) nextButton.current?.focus({ preventScroll: true }); }, [q, choice]);
  useEffect(() => {
    function key(e) {
      if (e.metaKey || e.ctrlKey || e.altKey || e.target.closest('input,textarea')) return;
      const k = e.key.toUpperCase(), index = '12345'.indexOf(k) >= 0 ? '12345'.indexOf(k) : 'ABCDE'.indexOf(k);
      if (q && !choice && index >= 0 && q.options[index]) { e.preventDefault(); pick(q.options[index].value, card.current?.querySelector(`[data-option="${q.options[index].value}"]`)); }
      else if (choice && (e.key === 'Enter' || e.key === ' ') && mode !== 'rush' && !e.target.closest('button,a,summary')) { e.preventDefault(); next(); }
    }
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [q, choice, pick, next, mode]);

  const title = level?.boss ? level.title : level ? `第 ${level.number} 章 · 第 ${level.stage} 关` : MODES[mode];
  if (!MODES[mode] || (['level', 'boss'].includes(mode) && !level)) return <div className="empty-state"><h2>没有找到这一关</h2><a className="primary-button" href="#/arena">返回闯关地图</a></div>;
  if (locked) return <div className="empty-state page-enter"><Lock size={38} /><h2>这一关还没有解锁</h2><p>{level.boss ? '通过本课程全部关卡后即可挑战。' : '先通过本章上一关。'}</p><a className="primary-button" href={`#/arena/${level.course}`}>返回闯关地图</a></div>;
  if (error) return <div className="empty-state"><h2>题库未能加载</h2><p>{error}</p><button className="secondary-button" onClick={() => { setError(''); setAttempt(a => a + 1); }}><RotateCcw size={16} />重试</button></div>;
  if (!run) return <div className="reader-loading play-loading" aria-live="polite"><Swords size={28} />正在准备关卡…</div>;
  if (!run.list.length) return <div className="empty-state page-enter"><Check size={38} /><h2>{mode === 'review' ? '错题本已清空' : '暂无可用题目'}</h2><p>{mode === 'review' ? '没有需要复活的错题，去闯下一关吧。' : ''}</p><a className="primary-button" href="#/arena">返回闯关地图</a></div>;
  if (run.done) return <Result run={run} mode={mode} level={level} levels={levels} manifest={m} learning={s} title={title} retry={() => setAttempt(a => a + 1)} />;

  const context = q.context && bank.contexts[q.context];
  const course = m.courses.find(c => c.id === q.course), chapter = m.chapters.find(c => c.id === q.chapter);
  const right = choice && choice.status !== 'incorrect';
  return <div className={`play page-enter ${mode === 'rush' ? 'play-rush' : ''}`}>
    <header className="play-hud">
      <a className="icon-button play-exit" href={level ? `#/arena/${level.course}` : '#/arena'} aria-label="退出挑战"><X size={20} /></a>
      <div className="play-title">{level && <span>{MODES[mode]}</span>}<strong>{title}</strong></div>
      {mode === 'rush'
        ? <div className={`rush-clock ${clock <= 10 ? 'urgent' : ''}`} role="timer" aria-label={`剩余 ${clock} 秒`}><Timer size={18} /><strong>{Math.max(0, clock)}</strong>s<span className="rush-bar"><i style={{ width: `${Math.max(0, clock) / RUSH_SECONDS * 100}%` }} /></span></div>
        : <div className="play-steps" aria-label={`第 ${run.index + 1} 题，共 ${run.list.length} 题`}>{run.list.map((item, i) => { const log = run.log[i]; return <i key={item.key} className={log ? (log.status === 'incorrect' ? 'bad' : 'good') : i === run.index ? 'now' : ''} />; })}</div>}
      <div className="play-meters">
        {usesHearts && <span className="hearts" aria-label={`剩余 ${run.hearts} 颗心`}>{Array.from({ length: LEVEL_HEARTS }, (_, i) => <Heart key={i} size={20} className={i < run.hearts ? 'heart-on' : 'heart-off'} fill="currentColor" />)}</span>}
        {mode === 'rush' && <span className="rush-score"><Check size={16} />{run.correct}</span>}
        <span className={`combo ${run.combo >= 2 ? 'hot' : ''}`} key={run.combo}><Zap size={16} />×{run.combo}</span>
      </div>
    </header>
    <article className="play-card" ref={card} key={q.key}>
      <div className="play-meta"><span className="course-dot" data-course={q.course} />{course.title}<span>·</span>题 {q.number}<span className="play-meta-title">{q.title}</span>{mode !== 'rush' && <span className="play-count">{run.index + 1} / {run.list.length}</span>}</div>
      {context && mode !== 'rush' && <details className="play-context" open><summary>共用资料</summary><div className="note-content" dangerouslySetInnerHTML={html(context)} /></details>}
      <div className="play-stem note-content" dangerouslySetInnerHTML={html(q.stem)} />
      <div className="play-options" role="radiogroup" aria-label="选项">{q.options.map((o, i) => {
        const picked = choice?.value === o.value, correct = choice && q.grading.correct.includes(o.value);
        return <button key={o.value} type="button" role="radio" aria-checked={picked} data-option={o.value} disabled={!!choice} style={{ '--i': i }}
          className={`play-option ${picked ? (right ? 'is-right' : 'is-wrong') : ''} ${choice && !picked && correct ? 'is-answer' : ''}`}
          onClick={e => pick(o.value, e.currentTarget)}>
          <span className="play-letter">{o.value}</span><span className="play-option-body note-content" dangerouslySetInnerHTML={html(o.html)} />
          {picked && <span className="play-mark">{right ? <Check size={18} /> : <X size={18} />}</span>}
        </button>;
      })}</div>
      {choice && mode !== 'rush' && <div className={`play-feedback ${right ? 'good' : 'bad'}`}>
        <div className="play-feedback-head"><span className="play-feedback-icon">{right ? <Sparkles size={22} /> : <Target size={22} />}</span><div><strong>{right ? choice.cheer : `正确答案是 ${q.grading.correct.join('、')}`}</strong><p>{right ? (choice.status === 'conditional' ? q.grading.note : choice.first ? `首次答对 +${XP[choice.status]} XP` : '已作答过的题不重复计分') : choice.cheer}</p></div></div>
        <details className="play-explain" open={!right}><summary>查看解析</summary><div className="note-content" dangerouslySetInnerHTML={html(q.answer)} /></details>
        <div className="play-feedback-actions">
          <a className="text-link" href={chapterHref(q.chapter, `q:${q.id}`)}><BookOpen size={15} />在{chapter?.title ? `《${chapter.title}》` : '笔记'}中查看</a>
          <button ref={nextButton} className="primary-button play-next" onClick={next}>{(usesHearts && run.hearts <= 0) ? '查看结果' : run.index >= run.list.length - 1 ? '完成挑战' : '下一题'}<ChevronRight size={17} /></button>
        </div>
      </div>}
      {!choice && <p className="play-hint">按 <kbd>A</kbd>–<kbd>E</kbd> 或 <kbd>1</kbd>–<kbd>5</kbd> 作答{mode !== 'rush' && <>，<kbd>Enter</kbd> 下一题</>}</p>}
    </article>
  </div>;
}

function Result({ run, mode, level, levels, manifest: m, learning: s, title, retry }) {
  const xp = xpBreakdown(s).total, gained = Math.max(0, xp - run.xpStart), rank = rankOf(xp);
  const total = run.log.length, rate = total ? Math.round(run.correct / total * 100) : 0;
  const nextLevel = level && !level.boss ? levels.find(l => l.chapter === level.chapter && l.stage === level.stage + 1) || levels.find((l, i) => i > levels.indexOf(level) && l.course === level.course && !l.boss && l.stage === 1) : null;
  const passed = mode === 'level' || mode === 'boss' ? run.stars > 0 : true;
  const heading = mode === 'rush' ? (run.timeUp ? '时间到！' : '全部答完！') : mode === 'daily' ? '今日挑战完成！' : mode === 'review' ? '复活赛结束' : passed ? (run.stars === 3 ? '完美通关！' : '通关成功！') : '挑战失败';
  return <div className="result page-enter">
    <div className={`result-card ${passed ? 'passed' : 'failed'}`} style={{ '--rank': rank.color, '--rank-light': rank.light }}>
      <span className="eyebrow">{title}</span>
      <h1>{heading}</h1>
      {(mode === 'level' || mode === 'boss') && <Stars value={run.stars} size={44} animate />}
      {!passed && <p className="result-note">心心用完了。看看解析，再来一次就能过！</p>}
      <div className="result-stats">
        <span><strong>{run.correct}</strong><small>{mode === 'rush' ? '答对题数' : `答对 / ${total}`}</small></span>
        <span><strong>{rate}%</strong><small>正确率</small></span>
        <span><strong>{run.maxCombo}</strong><small>最高连击</small></span>
        <span className="result-xp"><strong>+<CountUp value={gained} /></strong><small>获得 XP</small></span>
      </div>
      {mode === 'rush' && <p className="result-note">{run.correct > run.bestBefore ? '刷新个人最佳纪录！' : `个人最佳：${s.rushBest} 题`}</p>}
      <div className="result-rank"><RankBadge rank={rank} size={54} /><div><strong>{rank.label}</strong><RankProgress xp={xp} /></div></div>
      <div className="result-actions">
        {nextLevel && passed && <a className="primary-button" href={`#/play/level/${nextLevel.id}`}>下一关<ArrowRight size={17} /></a>}
        <button className={nextLevel && passed ? 'secondary-button' : 'primary-button'} onClick={retry}><RotateCcw size={16} />{mode === 'daily' ? '再做一遍' : '再来一次'}</button>
        <a className="secondary-button" href={level ? `#/arena/${level.course}` : '#/arena'}><Trophy size={16} />闯关地图</a>
      </div>
    </div>
    {run.log.length > 0 && <div className="result-review"><h2>本局回顾</h2>{run.log.map(({ q, value, status }, i) => <a key={`${q.key}-${i}`} href={chapterHref(q.chapter, `q:${q.id}`)} className={`review-row ${status === 'incorrect' ? 'bad' : 'good'}`} style={{ '--i': i }}>
      <span className="review-mark">{status === 'incorrect' ? <X size={15} /> : <Check size={15} />}</span>
      <span><strong>题 {q.number} · {q.title}</strong><small>{m.courses.find(c => c.id === q.course).title} · 你的答案 {value}{status === 'incorrect' ? ` · 正确答案 ${q.grading.correct.join('、')}` : ''}</small></span>
      <ChevronRight size={16} />
    </a>)}</div>}
  </div>;
}
