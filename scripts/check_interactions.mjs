import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { gradeChoice } from '../src/quiz.js';
import { example, students, standardized, residualSum, sigmoid } from '../src/statistics.js';

const chapters = readdirSync('public/data').filter(f => /-ex\d+\.json$/.test(f)).map(f => JSON.parse(readFileSync(`public/data/${f}`,'utf8')));
const questions = chapters.flatMap(c => c.questions.filter(q=>q.quiz).map(q=>({...q,chapter:c.id})));
assert.equal(questions.length,200);
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
assert.deepEqual({verified,conditional,unverified},{verified:183,conditional:5,unverified:12});
function question(chapter,id){return questions.find(q=>q.chapter===chapter&&q.id===id).quiz;}
// Known source cases, including supplemental option F and ambiguous definitions.
assert.equal(gradeChoice(question('multivariate-ex1','M15-1'),'A').status,'correct');
assert.equal(gradeChoice(question('multivariate-ex1','M15-1'),'B').status,'incorrect');
assert.equal(gradeChoice(question('linear-ex2','E17-L2'),'F').status,'correct');
assert.equal(gradeChoice(question('linear-ex2','E14-19'),'A').status,'unverified');
assert.equal(gradeChoice(question('linear-ex2','E21-2'),'B').status,'conditional');
assert.equal(gradeChoice(question('linear-ex2','E21-2'),'E').status,'conditional');
assert.equal(gradeChoice(question('multivariate-ex4','M15-4'),'D').status,'conditional');
assert.equal(students.length,12);
assert.ok(Math.abs(example.meanHeight-161.8666666667)<1e-8);
assert.ok(Math.abs(example.meanWeight-48.0833333333)<1e-8);
assert.ok(Math.abs(example.correlation-.8926)<1e-4);
assert.ok(residualSum(example.slope)<residualSum(example.slope+.4));
const projectionVariance=standardized.reduce((s,p)=>s+((p.x+p.y)/Math.sqrt(2))**2,0)/(students.length-1);
assert.ok(Math.abs(projectionVariance-(1+example.correlation))<1e-10);
assert.equal(sigmoid(0),.5);assert.ok(sigmoid(-6)<.01);assert.ok(sigmoid(6)>.99);
console.log(JSON.stringify({choiceQuestions:questions.length,verified,conditional,unverified,heroData:'12 original observations; regression, PCA and logistic checks passed'}));
