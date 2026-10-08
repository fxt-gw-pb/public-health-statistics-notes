#!/usr/bin/env python3
"""Check coverage against the actual source, and all locally served assets."""
from pathlib import Path
from html.parser import HTMLParser
import json
import re

ROOT = Path(__file__).resolve().parents[1]
class Inspector(HTMLParser):
    def __init__(self):
        super().__init__(); self.ids=[]; self.images=[]; self.answers=[]; self.unsafe=[]; self.quizzes=[]; self.radios=[]
    def handle_starttag(self,tag,attrs):
        a=dict(attrs)
        if 'id' in a: self.ids.append(a['id'])
        if tag=='img': self.images.append(a['src'])
        if tag=='details' and a.get('class')=='answer': self.answers.append(a['data-question'])
        if a.get('class')=='quiz-panel': self.quizzes.append(a['data-question'])
        if tag=='input' and a.get('type')=='radio': self.radios.append((a.get('data-quiz'),a.get('value')))
        if tag in ('script','iframe','object','embed') or any(k.startswith('on') for k in a): self.unsafe.append(tag)

def main():
    manifest=json.loads((ROOT/'public/data/index.json').read_text())
    assert len(manifest['chapters'])==31, 'Expected all 31 documents'
    figures=set(); questions=0; codes=0; choices=0; issues=[]
    for c in manifest['chapters']:
        d=json.loads((ROOT/'public/data'/(c['id']+'.json')).read_text())
        source=(ROOT/d['source']).read_text()
        parser=Inspector(); parser.feed(d['html'])
        source_q=re.findall(r'\\Question\{([^}]+)\}',source)
        source_a=re.findall(r'\\Answer\{([^}]+)\}',source)
        web_q=[q['id'] for q in d['questions']]
        if source_q!=web_q or set(source_q)!=set(source_a): issues.append(c['id']+': question coverage mismatch')
        if parser.answers!=source_q: issues.append(c['id']+': answer order mismatch')
        for q in d['questions']:
            if not q['answer'].strip(): issues.append(c['id']+': empty answer '+q['id'])
            if q.get('quiz'):
                quiz=q['quiz']; values=[o['value'] for o in quiz['options']]
                if len(values)<2 or len(values)!=len(set(values)): issues.append(c['id']+': invalid choices '+q['id'])
                if len([r for r in parser.radios if r[0]==q['id']])!=len(values): issues.append(c['id']+': missing radio controls '+q['id'])
                grading=quiz['grading']
                if grading['status'] not in ('verified','conditional','unverified'): issues.append(c['id']+': invalid grading status '+q['id'])
                if any(v not in values for v in grading['correct']): issues.append(c['id']+': answer outside the choices '+q['id'])
                if grading['status']=='unverified' and grading['correct']: issues.append(c['id']+': unverified question must not be scored '+q['id'])
        source_choices=len(re.findall(r'\\begin\{choices\}',source))
        quizzes=[q for q in d['questions'] if q.get('quiz')]
        if source_choices!=len(quizzes) or source_choices!=len(parser.quizzes): issues.append(c['id']+': choice coverage mismatch')
        if c.get('choiceCount',0)!=len(quizzes): issues.append(c['id']+': choice metadata mismatch')
        choices+=len(quizzes)
        for src in parser.images:
            file=ROOT/'public'/src.removeprefix('./')
            if not file.is_file(): issues.append(c['id']+': missing '+src)
            figures.add(src)
        if len(parser.ids)!=len(set(parser.ids)): issues.append(c['id']+': duplicate anchors')
        if parser.unsafe: issues.append(c['id']+': unsafe HTML '+str(parser.unsafe))
        if 'WEBTOKEN' in d['html']: issues.append(c['id']+': unresolved conversion token')
        if len(d['text'])<400: issues.append(c['id']+': unexpectedly short content')
        for h in c['toc']:
            if h['id'] not in parser.ids: issues.append(c['id']+': missing table-of-contents anchor')
        c['anchors']=parser.ids
        questions+=len(web_q);codes+=d['codeCount']
    for c in manifest['courses']:
        if not (ROOT/'public'/c['pdf'].removeprefix('./')).is_file():issues.append('Missing original PDF '+c['id'])
    (ROOT/'public/data/index.json').write_text(json.dumps(manifest,ensure_ascii=False))
    result=dict(documents=len(manifest['chapters']),questions=questions,choices=choices,figures=len(figures),codeBlocks=codes,issues=issues)
    print(json.dumps(result,ensure_ascii=False,indent=2))
    if issues:raise SystemExit(1)

if __name__=='__main__':main()
