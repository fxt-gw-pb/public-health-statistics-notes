import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { gradeChoice } from '../src/quiz.js';
import { example, students, standardized, residualSum, sigmoid } from '../src/statistics.js';

const chapters = readdirSync('public/data').filter(f => /-(ex|sup)\d+\.json$/.test(f)).map(f => JSON.parse(readFileSync(`public/data/${f}`,'utf8')));
const questions = chapters.flatMap(c => c.questions.filter(q=>q.quiz).map(q=>({...q,chapter:c.id})));
assert.equal(questions.length,302);
let verified=0,conditional=0,unverified=0;
for(const q of questions){
  const quiz=q.quiz;
  assert.equal(gradeChoice(quiz,undefined).status,'unanswered');
  assert.equal(gradeChoice(quiz,'outside-the-options').status,'unanswered');
  for(const option of quiz.options){
    // An incomplete source must never produce a fabricated right/wrong score.
    if(quiz.grading.status==='unverified')assert.equal(gradeChoice(quiz,option.value).status,'unverified',`${q.chapter}:${q.id}`);
  }
  if(quiz.grading.status==='verified')verified++;else if(quiz.grading.status==='conditional')conditional++;else unverified++;
}
assert.deepEqual({verified,conditional,unverified},{verified:285,conditional:5,unverified:12});
function question(chapter,id){return questions.find(q=>q.chapter===chapter&&q.id===id).quiz;}
// Known source cases, including supplemental option F and ambiguous definitions.
assert.equal(gradeChoice(question('multivariate-ex1','M15-1'),'A').status,'correct');
assert.equal(gradeChoice(question('multivariate-ex1','M15-1'),'B').status,'incorrect');
assert.equal(gradeChoice(question('linear-ex2','E17-L2'),'F').status,'correct');
assert.equal(gradeChoice(question('linear-ex2','E14-19'),'A').status,'unverified');
assert.equal(gradeChoice(question('linear-ex2','E21-2'),'B').status,'conditional');
assert.equal(gradeChoice(question('linear-ex2','E21-2'),'E').status,'conditional');
assert.equal(gradeChoice(question('multivariate-ex4','M15-4'),'D').status,'conditional');
// Supplementary sets added 2026-10-11, including the “选X” answer form.
assert.equal(gradeChoice(question('linear-sup1','SUPL1-01'),'D').status,'correct');
assert.equal(gradeChoice(question('linear-ex1','SUPL2-01'),'C').status,'correct');
assert.equal(gradeChoice(question('glm-sup8','SUPG8-01'),'C').status,'correct');
assert.equal(gradeChoice(question('glm-sup8','SUPG8-01'),'A').status,'incorrect');
assert.equal(students.length,12);
assert.ok(Math.abs(example.meanHeight-161.8666666667)<1e-8);
assert.ok(Math.abs(example.meanWeight-48.0833333333)<1e-8);
assert.ok(Math.abs(example.correlation-.8926)<1e-4);
assert.ok(residualSum(example.slope)<residualSum(example.slope+.4));
const projectionVariance=standardized.reduce((s,p)=>s+((p.x+p.y)/Math.sqrt(2))**2,0)/(students.length-1);
assert.ok(Math.abs(projectionVariance-(1+example.correlation))<1e-10);
assert.equal(sigmoid(0),.5);assert.ok(sigmoid(-6)<.01);assert.ok(sigmoid(6)>.99);
console.log(JSON.stringify({choiceQuestions:questions.length,verified,conditional,unverified,heroData:'12 original observations; regression, PCA and logistic checks passed'}));

// Challenge mode: question banks, levels and the derived rank/XP rules.
const { rankOf, recordAnswer, starsFor, xpBreakdown, levelState, bossLevel, streakOf, newBadges, seeded, shuffle, XP } = await import('../src/game.js');
const manifest = JSON.parse(readFileSync('public/data/index.json', 'utf8'));
const bank = new Map();
for (const course of manifest.courses) {
  const data = JSON.parse(readFileSync(`public/data/arena-${course.id}.json`, 'utf8'));
  for (const q of data.questions) {
    assert.ok(!bank.has(q.key), `duplicate bank key ${q.key}`);
    assert.ok(q.stem && q.answer && q.options.length >= 2, `incomplete bank question ${q.key}`);
    assert.notEqual(q.grading.status, 'unverified', `unverified question in challenge bank ${q.key}`);
    if (q.context) assert.ok(data.contexts[q.context], `missing shared material ${q.key}`);
    const source = questions.find(x => `${x.chapter}:${x.id}` === q.key);
    assert.deepEqual(q.grading, source.quiz.grading, `bank grading differs from chapter ${q.key}`);
    bank.set(q.key, q);
  }
}
assert.equal(bank.size, 290);
const levelKeys = manifest.levels.flatMap(l => l.questions);
assert.equal(levelKeys.length, bank.size); assert.equal(new Set(levelKeys).size, bank.size);
assert.ok(manifest.levels.every(l => l.questions.length >= 4 && l.questions.length <= 6));
const blank = { firstTry: {}, wrong: [], fixed: [], levels: {}, days: [], badges: [], dailyDone: [], mastered: [], completed: [], bestCombo: 0, rushBest: 0 };
assert.equal(rankOf(0).label, '样本新手 Ⅲ'); assert.equal(rankOf(200).label, '均值学徒 Ⅲ'); assert.equal(rankOf(6500).label, '统计宗师');
for (let xp = 0; xp < 7000; xp += 7) { const r = rankOf(xp); if (r.ceiling) { assert.ok(r.ceiling > xp); assert.equal(rankOf(r.ceiling).label, r.nextLabel); } }
let s = recordAnswer(blank, 'a', 'incorrect'); s = recordAnswer(s, 'a', 'correct');
assert.deepEqual([s.firstTry.a, s.wrong, s.fixed], ['incorrect', [], ['a']]);
assert.equal(xpBreakdown(s).total, XP.incorrect + XP.fixed + XP.day);
assert.deepEqual([starsFor(6, 6), starsFor(5, 6), starsFor(4, 6), starsFor(3, 6), starsFor(6, 6, true)], [3, 2, 1, 0, 0]);
const linear = manifest.levels.filter(l => l.course === 'linear'), boss = bossLevel(manifest.courses[0]), all = [...manifest.levels, boss];
assert.ok(levelState(all, blank, linear.find(l => l.stage === 1)).unlocked);
assert.ok(!levelState(all, blank, linear.find(l => l.stage === 2)).unlocked);
assert.ok(!levelState(all, blank, boss).unlocked);
assert.ok(levelState(all, { ...blank, levels: Object.fromEntries(linear.map(l => [l.id, { stars: 1 }])) }, boss).unlocked);
assert.equal(streakOf(['2026-10-09', '2026-10-10', '2026-10-11'], '2026-10-11'), 3);
assert.equal(streakOf(['2026-10-09', '2026-10-10'], '2026-10-11'), 2);
assert.equal(streakOf(['2026-10-08'], '2026-10-11'), 0);
assert.deepEqual(newBadges(s), ['first']);
assert.deepEqual(shuffle([1, 2, 3, 4, 5], seeded('2026-10-11')), shuffle([1, 2, 3, 4, 5], seeded('2026-10-11')));
console.log(JSON.stringify({ challengeQuestions: bank.size, levels: manifest.levels.length, rankAndXpRules: 'passed' }));
