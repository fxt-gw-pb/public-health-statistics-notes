import katex from 'katex';
import hljs from 'highlight.js/lib/core';
import r from 'highlight.js/lib/languages/r';
import sas from 'highlight.js/lib/languages/sas';
hljs.registerLanguage('r', r);
hljs.registerLanguage('sas', sas);

export const mathMacros = {
  '\\Var': '\\operatorname{Var}', '\\Cov': '\\operatorname{Cov}',
  '\\var': '\\operatorname{var}', '\\cov': '\\operatorname{cov}',
  '\\tr': '\\operatorname{tr}', '\\rank': '\\operatorname{rank}',
  '\\diag': '\\operatorname{diag}', '\\E': '\\operatorname{E}',
  '\\SE': '\\operatorname{SE}', '\\OR': '\\operatorname{OR}',
  '\\RR': '\\operatorname{RR}', '\\HR': '\\operatorname{HR}',
  '\\IRR': '\\operatorname{IRR}', '\\logit': '\\operatorname{logit}',
  '\\trans': '^{\\mathsf T}', '\\bm': '\\boldsymbol{#1}',
  '\\symbf': '\\boldsymbol{#1}', '\\SSq': '\\mathrm{SS}_{\\text{#1}}',
  '\\ms': '\\mathrm{MS}_{\\text{#1}}', '\\code': '\\texttt{#1}',
};
export function normalizeMath(source) {
  return source.replace(/^\\[([]/, '').replace(/\\[)\]]$/, '')
    .replace(/\\begin\{align\*?\}/g, '\\begin{aligned}')
    .replace(/\\end\{align\*?\}/g, '\\end{aligned}')
    .replace(/\\begin\{gather\*?\}/g, '\\begin{gathered}')
    .replace(/\\end\{gather\*?\}/g, '\\end{gathered}')
    .replace(/\\label\{[^}]+\}/g, '')
    .replace(/@\{\\quad\}/g, '');
}
export function enrichContent(root) {
  root.querySelectorAll('.math').forEach(element => {
    if (element.dataset.formula) return;
    const source = normalizeMath(element.textContent);
    element.dataset.formula = source;
    katex.render(source, element, { displayMode: element.classList.contains('display'), throwOnError: false, strict: 'ignore', macros: mathMacros, trust: false });
  });
  root.querySelectorAll('pre code').forEach(element => {
    const language = element.className.replace('language-', '').toLowerCase();
    if (hljs.getLanguage(language)) element.innerHTML = hljs.highlight(element.textContent, { language, ignoreIllegals: true }).value;
  });
}
const cache = new Map();
export async function loadChapter(id) {
  if (!cache.has(id)) cache.set(id, fetch(`${import.meta.env.BASE_URL}data/${id}.json`).then(response => {
    if (!response.ok) throw new Error('章节暂时未能加载');
    return response.json();
  }).catch(error => { cache.delete(id); throw error; }));
  return cache.get(id);
}
export function chapterHref(id, section) {
  return `#/read/${id}${section ? `?section=${encodeURIComponent(section)}` : ''}`;
}
