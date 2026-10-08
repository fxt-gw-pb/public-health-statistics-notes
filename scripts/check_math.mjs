import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import katex from 'katex';
import { mathMacros, normalizeMath } from '../src/content.js';

const errors = [];
let count = 0;
const decode = text => text.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'");
for (const file of readdirSync('public/data').filter(f => /^.+-(lec\d+|ex\d+|appendix)\.json$/.test(f))) {
  const record = JSON.parse(readFileSync(`public/data/${file}`, 'utf8'));
  for (const match of record.html.matchAll(/<span class="math (inline|display)">([\s\S]*?)<\/span>/g)) {
    count++;
    const source = normalizeMath(decode(match[2]));
    try { katex.renderToString(source, { displayMode: match[1]==='display', throwOnError: true, strict: 'ignore', macros: mathMacros, trust: false }); }
    catch (error) { errors.push({ chapter: record.id, formula: source, error: error.message }); }
  }
}
mkdirSync('.local', { recursive: true });
writeFileSync('.local/math-errors.json', JSON.stringify(errors, null, 2));
console.log(JSON.stringify({ formulas: count, errors: errors.length, examples: errors.slice(0, 8) }, null, 2));
if (errors.length) process.exitCode = 1;
