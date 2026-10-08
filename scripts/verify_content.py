#!/usr/bin/env python3
"""Check coverage against the actual source, and all locally served assets."""
from pathlib import Path
from html.parser import HTMLParser
import json
import re

ROOT = Path(__file__).resolve().parents[1]
class Inspector(HTMLParser):
    def __init__(self):
        super().__init__(); self.ids=[]; self.images=[]; self.answers=[]; self.unsafe=[]
    def handle_starttag(self,tag,attrs):
        a=dict(attrs)
        if 'id' in a: self.ids.append(a['id'])
        if tag=='img': self.images.append(a['src'])
        if tag=='details' and a.get('class')=='answer': self.answers.append(a['data-question'])
        if tag in ('script','iframe','object','embed') or any(k.startswith('on') for k in a): self.unsafe.append(tag)

def main():
    manifest=json.loads((ROOT/'public/data/index.json').read_text())
    assert len(manifest['chapters'])==31, 'Expected all 31 documents'
    figures=set(); questions=0; codes=0; issues=[]
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
    result=dict(documents=len(manifest['chapters']),questions=questions,figures=len(figures),codeBlocks=codes,issues=issues)
    print(json.dumps(result,ensure_ascii=False,indent=2))
    if issues:raise SystemExit(1)

if __name__=='__main__':main()
