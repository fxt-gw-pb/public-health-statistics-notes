#!/usr/bin/env python3
"""Convert the finalized LaTeX notes to chapter JSON without rewriting their text.

Requires Pandoc. Extracted TikZ figures are rendered separately by render_figures.py.
The browser build consumes the checked-in JSON, so TeX is not needed to deploy.
"""
from pathlib import Path
from html import escape, unescape
from html.parser import HTMLParser
import collections
import hashlib
import json
import re
import shutil
import subprocess
from quiz_metadata import grading_for, quiz_markup

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'public' / 'data'
LOCAL = ROOT / '.local'
COURSES = [
    dict(id='linear', title='应用线性回归', english='Applied Linear Regression', pages=234,
         description='从矩阵与最小二乘出发，理解回归模型的构建、诊断与解释。',
         topics=['矩阵基础', '多重线性回归', '一般线性模型', '重复测量'], exercises={2: 1, 3: 2, 4: 3, 5: 4},
         supplements={1: 'supplement/ch1.tex'}),
    dict(id='multivariate', title='应用多元分析', english='Applied Multivariate Analysis', pages=180,
         description='在多个变量中提炼结构，学习降维、聚类与判别的统计思路。',
         topics=['主成分分析', '因子分析', '聚类分析', '判别分析'], exercises={1: 1, 2: 2, 3: 3, 4: 4}),
    dict(id='glm', title='广义线性模型', english='Generalized Linear Models', pages=295,
         description='将回归扩展到二分类、计数与生存资料，建立模型选择的全局视野。',
         topics=['Logistic 回归', '生存分析', '对数线性模型', '计数回归'], exercises={1: 1, 3: 2, 5: 3, 7: 4},
         supplements={8: 'supplement/ex8.tex'}),
]


def group(text, start, opening='{', closing='}'):
    """Read a balanced LaTeX group, preserving nested braces and escapes."""
    while start < len(text) and text[start].isspace():
        start += 1
    if start >= len(text) or text[start] != opening:
        raise ValueError(f'Expected {opening} near {text[start:start+60]!r}')
    depth = 1
    pos = start + 1
    while pos < len(text):
        if text[pos] == '\\' and pos + 1 < len(text) and text[pos + 1] in '{}[]%':
            pos += 2
            continue
        if text[pos] == opening:
            depth += 1
        elif text[pos] == closing:
            depth -= 1
            if depth == 0:
                return text[start + 1:pos], pos + 1
        pos += 1
    raise ValueError('Unclosed LaTeX group')


def macro(text, name, count, replacement, optional=False):
    pattern = re.compile(r'\\' + re.escape(name) + r'(?![A-Za-z])\*?')
    result = []
    last = 0
    for match in pattern.finditer(text):
        if match.start() < last:
            continue
        pos = match.end()
        args = []
        if optional:
            while pos < len(text) and text[pos].isspace():
                pos += 1
            if pos < len(text) and text[pos] == '[':
                opt, pos = group(text, pos, '[', ']')
                args.append(opt)
            else:
                args.append('')
        try:
            for _ in range(count):
                arg, pos = group(text, pos)
                args.append(arg)
        except ValueError:
            continue  # A math command can be intentionally left for KaTeX.
        result.extend([text[last:match.start()], replacement(*args)])
        last = pos
    result.append(text[last:])
    return ''.join(result)


def strip_comments(text):
    return re.sub(r'(?<!\\)%[^\n]*', '', text)


def expand_inputs(text, course):
    return macro(text, 'input', 1, lambda name: (ROOT / 'notes' / course / name).read_text(encoding='utf-8'))


def clean_text(text):
    text = re.sub(r'\\(?:quad|qquad|enspace|,|;|!)', ' ', text)
    return re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', unescape(text))).strip()


def number_headings(text, chapter):
    counts = [0, 0, 0]
    result = []
    last = 0
    for m in re.finditer(r'\\(section|subsection|subsubsection)(\*?)\{', text):
        if m[2]:
            continue
        title, end = group(text, m.end() - 1)
        level = {'section': 0, 'subsection': 1, 'subsubsection': 2}[m[1]]
        counts[level] += 1
        for reset in range(level + 1, 3):
            counts[reset] = 0
        # The original books number sections and subsections (secnumdepth=2).
        prefix = '.'.join(map(str, [chapter] + counts[:level + 1])) + ' ' if level < 2 else ''
        result.extend([text[last:m.start()], '\\' + m[1] + '{' + prefix + title + '}'])
        last = end
    result.append(text[last:])
    return ''.join(result)


class Outline(HTMLParser):
    def __init__(self):
        super().__init__()
        self.toc = []
        self.text = []
        self.heading = None
        self.heading_text = []
        self.details_depth = 0
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == 'details':
            self.details_depth += 1
        if tag in ('h2', 'h3') and 'id' in a and not self.details_depth:
            self.heading = dict(id=a['id'], level=int(tag[1]))
            self.heading_text = []
        if tag in ('p', 'li', 'h1', 'h2', 'h3', 'h4', 'td', 'th', 'pre', 'figcaption'):
            self.text.append('\n')
    def handle_endtag(self, tag):
        if tag == 'details':
            self.details_depth = max(0, self.details_depth - 1)
        if self.heading and tag == 'h' + str(self.heading['level']):
            self.heading['title'] = clean_text(''.join(self.heading_text))
            self.toc.append(self.heading)
            self.heading = None
    def handle_data(self, data):
        self.text.append(data)
        if self.heading:
            self.heading_text.append(data)


class Converter:
    def __init__(self, course, stem):
        self.course = course
        self.stem = stem
        self.tokens = {}
        self.figures = []
        self.code_count = 0
        self.warnings = []
    def token(self, markup):
        key = f'WEBTOKEN{len(self.tokens):05d}END'
        self.tokens[key] = markup
        return '\n\n' + key + '\n\n'
    def code(self, kind, options, body):
        lang = 'text' if kind in ('routput', 'verbatim') else 'R'
        if kind == 'coursecode':
            lang = options or 'R'
        if kind == 'code':
            for name in ['RKeyword', 'RFunction', 'RString', 'RNumber', 'RComment', 'ROperator', 'textcolor']:
                body = macro(body, name, 2 if name == 'textcolor' else 1, lambda *args: args[-1])
            body = body.replace(r'\textbackslash{}', '\\').replace(r'\{', '{').replace(r'\}', '}')
            body = body.replace(r'\textasciicircum{}', '^').replace(r'\textasciitilde{}', '~')
            references = json.loads((ROOT / 'notes' / self.course / 'references.json').read_text())
            body = macro(body, 'ref', 1, lambda name: references.get(name, name))
        body = body.strip('\n')
        self.code_count += 1
        is_output = kind == 'routput'
        cls = 'code-block output-block' if is_output else 'code-block'
        label = '运行结果' if is_output else lang
        return self.token(f'<div class="{cls}" data-language="{escape(lang)}"><div class="code-header"><span>{escape(label)}</span><button type="button" class="copy-code" aria-label="复制代码">复制</button></div><pre><code class="language-{escape(lang.lower())}">{escape(body)}</code></pre></div>')
    def figure(self, match):
        name = f'{self.stem}-{len(self.figures) + 1:02d}'
        self.figures.append(dict(name=name, tex=match.group(0)))
        return self.token(f'<figure class="note-figure"><img src="./figures/{self.course}/{name}.webp" alt="原笔记统计图 · {self.stem} · 图 {len(self.figures)}" loading="lazy" /></figure>')
    def preprocess(self, text):
        text = expand_inputs(text, self.course)
        # Verbatim comes first: R modulo operators and percent signs are not TeX comments.
        pattern = re.compile(r'\\begin\{(rcode|routput|coursecode|code|verbatim)\}(?:\[([^\]]*)\]|\{([^}]*)\})?(.*?)\\end\{\1\}', re.S)
        text = pattern.sub(lambda m: self.code(m[1], m[3] or m[2] or '', m[4]), text)
        # URLs may contain percent-encoding, which is not a TeX comment.
        text = macro(text, 'url', 1, lambda url: ' ' + self.token(f'<a class="uri" href="{escape(url)}" target="_blank" rel="noopener noreferrer">{escape(url)}</a>').strip() + ' ')
        text = strip_comments(text)
        # Supplement answers end with a muted source line; source entries are line-separated.
        text = re.sub(r'\{\\footnotesize\\color\{Muted\}\\noindent\s*(.*?)\\par\}',
                      lambda m: '\n\n\\begin{studysource}\n' + m[1] + '\n\\end{studysource}\n\n', text, flags=re.S)
        if self.stem == 'sources':
            text = text.replace(r'{\sffamily\bfseries\color{black}', r'\textbf{')
            text = re.sub(r'\\par(?![A-Za-z])', '\n\n', text)
        text = re.sub(r'\\begin\{tikzpicture\}.*?\\end\{tikzpicture\}', self.figure, text, flags=re.S)
        def image(opt, name):
            filename = Path(name).name
            if Path(filename).suffix == '.pdf' and (ROOT / 'notes' / self.course / 'assets' / Path(filename).with_suffix('.png')).exists():
                filename = str(Path(filename).with_suffix('.png'))
            return self.token(f'<figure class="note-figure"><img src="./figures/{self.course}/{filename}" alt="原笔记配图 · {escape(Path(name).stem)}" loading="lazy" /></figure>')
        text = macro(text, 'includegraphics', 1, image, optional=True)
        for command in ['ctable', 'cfigure']:
            text = macro(text, command, 2, lambda title, body: '\n\\begin{studyfigure}\n\\textbf{' + title + '}\n\n' + body + '\n\\end{studyfigure}\n')
        for command in ['ann', 'Note', 'revnote']:
            text = macro(text, command, 1, lambda body: '\n\\begin{studynote}\n' + body + '\n\\end{studynote}\n')
        for env, cls, title in [('sikao', 'studyexplain', '理解与思考'), ('fuxi', 'studyreview', '本章要点'), ('keyidea', 'studyreview', '要点'), ('zm', 'studyproof', '证明')]:
            text = re.sub(r'\\begin\{' + env + r'\}(?:\[([^\]]*)\])?', lambda m: '\n\\begin{' + cls + '}\n\\textbf{' + (m[1] or title) + '}\n\n', text)
            text = text.replace('\\end{' + env + '}', '\n\\end{' + cls + '}\n')
        text = re.sub(r'\\begin\{derivation\}\{([^}]+)\}', lambda m: '\n\\begin{studyderive}\n\\textbf{' + m[1] + '}\n\n', text)
        text = text.replace(r'\end{derivation}', '\n\\end{studyderive}\n')
        text = text.replace(r'\begin{annotation}', '\n\\begin{studynote}\n').replace(r'\end{annotation}', '\n\\end{studynote}\n')
        text = re.sub(r'\\begin\{chaptersummary\}\{([^}]+)\}', lambda m: '\n\\subsection*{' + m[1] + '}\n\\begin{tabular}{ll}\n', text)
        text = text.replace(r'\end{chaptersummary}', r'\end{tabular}')
        # Choice environments are converted to semantic radio controls below,
        # after they have been associated with their own question and answer.
        for command in ['code', 'rinline']:
            text = macro(text, command, 1, lambda body: r'\texttt{' + body.replace('_', r'\_').replace('#', r'\#').replace('%', r'\%') + '}')
        for command in ['tbltitle', 'figtitle', 'Example', 'dpart']:
            text = macro(text, command, 1, lambda body: '\n\n\\textbf{' + body + '}\n\n')
        text = macro(text, 'sourcepages', 2, lambda *_: '')
        text = macro(text, 'Source', 1, lambda body: '\n\n' + body + '\n\n')
        text = macro(text, 'worklines', 1, lambda _: '')
        text = macro(text, 'Needspace', 1, lambda _: '')
        text = re.sub(r'\\begin\{minipage\}(?:\[[^\]]*\])?\{[^}]*\}', '', text)
        text = text.replace(r'\end{minipage}', '')
        text = re.sub(r'\\(?:par|noindent|smallskip|medskip|bigskip|clearpage|newpage|FloatBarrier|EndExercises|centering|raggedright|footnotesize|small|normalsize|scriptsize|sffamily|bfseries|hfill|tightlist)(?![A-Za-z])', '', text)
        text = re.sub(r'\\(?:vspace|hspace|addvspace)\*?\{[^}]*\}', '', text)
        text = re.sub(r'\\setlength\{[^}]*\}\{[^}]*\}', '', text)
        text = re.sub(r'\\renewcommand\{\\arraystretch\}\{[^}]*\}', '', text)
        text = re.sub(r'\\def\\labelenumi\{[^\n]*', '', text)
        text = re.sub(r'\\begin\{landscape\}|\\end\{landscape\}', '', text)
        text = macro(text, 'addcontentsline', 3, lambda *_: '')
        text = macro(text, 'markboth', 2, lambda *_: '')
        return text
    def convert(self, text):
        result = subprocess.run(['pandoc', '--from=latex', '--to=html5', '--mathjax', '--wrap=none', '--shift-heading-level-by=1'], input=text, text=True, capture_output=True)
        if result.returncode:
            LOCAL.mkdir(exist_ok=True)
            (LOCAL / f'{self.course}-{self.stem}-failed.tex').write_text(text)
            raise RuntimeError(result.stderr)
        self.warnings.extend(result.stderr.splitlines())
        output = result.stdout
        references = json.loads((ROOT / 'notes' / self.course / 'references.json').read_text())
        output = re.sub(r'(<a\b[^>]*data-reference="([^"]+)"[^>]*>).*?</a>',
                        lambda m: m[1] + escape(references.get(unescape(m[2]), '引用')) + '</a>', output, flags=re.S)
        # Source-list labels sit in one paragraph; give each its own visible anchor target.
        output = re.sub(r'<span id="(src:[^"]+)" data-label="[^"]*"></span>', r'<span class="source-anchor" id="\1"></span>', output)
        for token, markup in self.tokens.items():
            output = output.replace('<p>' + token + '</p>', markup).replace(token, markup)
        def equation_anchor(m):
            anchors = re.findall(r'\\label\{([^}]+)\}', m[0])
            return ''.join(f'<span class="equation-anchor" id="{escape(a)}"></span>' for a in anchors) + m[0]
        output = re.sub(r'<span class="math (?:inline|display)">.*?</span>', equation_anchor, output, flags=re.S)
        output = re.sub(r'<table\b', '<div class="table-scroll"><table', output).replace('</table>', '</table></div>')
        return output


def document_kind(stem):
    if stem.startswith(('ex', 'sup')):
        return 'exercises'
    return {'appendix': 'appendix', 'sources': 'sources'}.get(stem, 'lecture')


def build_chapter(course, path, number=None, stem=None):
    stem = stem or path.stem
    kind = document_kind(stem)
    identifier = course['id'] + '-' + stem
    original = path.read_text(encoding='utf-8')
    titlematch = re.search(r'\\(?:chapter\*?|ExerciseChapter)\{([^}]+)\}', original)
    title = clean_text(titlematch[1])
    converter = Converter(course['id'], stem)
    text = converter.preprocess(original)
    if kind == 'lecture':
        text = number_headings(text, number)
    text = macro(text, 'ExerciseChapter', 1, lambda _: '')
    text = macro(text, 'chapter', 1, lambda _: '')
    questions = []
    contexts = {}
    if kind == 'exercises':
        answer_markers = list(re.finditer(r'\\Answer\{([^}]+)\}\{([^}]+)\}', text))
        answers = {}
        for index, marker in enumerate(answer_markers):
            end = answer_markers[index + 1].start() if index + 1 < len(answer_markers) else len(text)
            segment = text[marker.end():end]
            segment = re.sub(r'\\(?:sub)?section\*?\{(?:补充练习解析|本次补充习题解析|习题解析|参考答案与解析)\}', '', segment)
            answers[marker[1]] = segment
        first_answer = answer_markers[0].start() if answer_markers else len(text)
        question_text = text[:first_answer]
        question_text = re.split(r'\\section\{(?:习题解析|参考答案与解析)\}', question_text)[0]
        question_markers = list(re.finditer(r'\\Question\{([^}]+)\}\{([^}]+)\}', question_text))
        # Keep shared tables, subheadings and preambles in their original order.
        replacements = []
        context_html, context_id, previous_end = None, None, 0
        context_family, context_serial = None, 0
        for index, marker in enumerate(question_markers):
            qid, qtitle = marker[1], marker[2]
            qnum = f'{number}.{index + 1}'
            anchor = 'q:' + qid
            replacements.append((marker.start(), marker.end(), '\n\\subsubsection*{题 ' + qnum + ' · ' + qtitle + '}\\label{' + anchor + '}\n'))
            answer_html = converter.convert(answers.get(qid, ''))
            # Answers are separately converted. Namespace their generated anchors
            # so repeated category headings cannot collide with question headings.
            answer_ids = re.findall(r'\bid="([^"]+)"', answer_html)
            for aid in answer_ids:
                namespaced = f'answer-{qid}-{aid}'
                answer_html = answer_html.replace(f'id="{aid}"', f'id="{namespaced}"').replace(f'href="#{aid}"', f'href="#{namespaced}"')
            question = dict(id=qid, number=qnum, title=qtitle, anchor=anchor, answer=answer_html)
            segment_end = question_markers[index + 1].start() if index + 1 < len(question_markers) else len(question_text)
            segment = question_text[marker.end():segment_end]
            choice_sets = list(re.finditer(r'\\begin\{choices\}(.*?)\\end\{choices\}', segment, re.S))
            # Shared case material sits between questions; carry it until the next group.
            between = question_text[previous_end:marker.start()]
            headings = list(re.finditer(r'\\(?:sub)*section\*?\{', between))
            if index and previous_end == question_markers[index - 1].end():
                between = between[headings[-1].start():] if headings else ''
            # The source marks where shared material begins but not where its group ends.
            # Keep it only within one ID family with increasing numbers (E14-20, E14-21, ...).
            family, serial = id_family(qid)
            material = plain_tex(between)
            if '共用资料' in between or len(material) >= 150:
                context_id = f'{identifier}:{qid}'
                labelled = [h.start() for h in headings if between.startswith('共用资料', h.end())]
                context_html = converter.convert(between[labelled[-1]:] if labelled else between)
                context_family, context_serial = family, serial - 1
            elif headings:
                context_id = context_html = None
            if context_id and (family != context_family or serial <= context_serial):
                context_id = context_html = None
            if context_id:
                context_serial = serial
                question['context'] = context_id
                contexts[context_id] = context_html
            previous_end = marker.end() + choice_sets[0].end() if choice_sets else marker.end()
            if len(choice_sets) > 1:
                raise ValueError(f'{identifier}:{qid}: multiple choice sets need explicit handling')
            if choice_sets:
                choices = choice_sets[0]
                parts = re.split(r'\\item(?:\s*\[[^\]]*\])?', choices[1])[1:]
                options = [dict(value=chr(65 + i), html=converter.convert(part.strip())) for i, part in enumerate(parts)]
                grading = grading_for(course['id'], qid, answers.get(qid, ''), [o['value'] for o in options])
                question['quiz'] = dict(options=options, grading=grading)
                # A standalone stem for the challenge mode; anchors are namespaced like answers.
                stem_html = converter.convert(segment[:choices.start()])
                for sid in re.findall(r'\bid="([^"]+)"', stem_html):
                    stem_html = stem_html.replace(f'id="{sid}"', f'id="stem-{qid}-{sid}"')
                question['stem'] = stem_html
                start = marker.end() + choices.start()
                end = marker.end() + choices.end()
                replacements.append((start, end, converter.token(quiz_markup(identifier, question, options, grading))))
            questions.append(question)
        for start, end, replacement in sorted(replacements, reverse=True):
            question_text = question_text[:start] + replacement + question_text[end:]
        # Use a marker at the exact end of each question to place its own answer,
        # while shared-material headings remain outside the preceding answer.
        markers = list(re.finditer(r'\\subsubsection\*?\{题 [^\n]+', question_text))
        for index in reversed(range(len(markers))):
            end = markers[index + 1].start() if index + 1 < len(markers) else len(question_text)
            segment = question_text[markers[index].end():end]
            heading = re.search(r'\\(?:sub)?(?:sub)?section\*?\{', segment)
            if heading:
                end = markers[index].end() + heading.start()
            html_answer = '<details class="answer" data-question="' + escape(questions[index]['id']) + '"><summary><span>查看解析</span><span class="answer-number">题 ' + questions[index]['number'] + '</span></summary><div class="answer-body">' + questions[index]['answer'] + '</div></details>'
            question_text = question_text[:end] + converter.token(html_answer) + question_text[end:]
        html = converter.convert(question_text)
    else:
        html = converter.convert(text)
    outline = Outline(); outline.feed(html)
    searchable = clean_text(' '.join(outline.text))
    record = dict(id=identifier, course=course['id'], slug=stem, title=title, number=number,
                  kind=kind, supplement=path.parent.name == 'supplement',
                  html=html, toc=outline.toc, questions=questions, text=searchable,
                  codeCount=converter.code_count, figureCount=len(converter.figures),
                  source=str(path.relative_to(ROOT)), sha256=hashlib.sha256(original.encode()).hexdigest())
    record['contexts'] = contexts
    return record, converter.figures, converter.warnings


LEVEL_SIZE = 6


def id_family(qid):
    """Split E17-C6 into ('E17-C', 6); IDs without a serial form their own family."""
    match = re.match(r'(.*?)(\d+)[a-z]?$', qid)
    return (match[1], int(match[2])) if match else (qid, 0)


def plain_tex(text):
    text = re.sub(r'WEBTOKEN\d+END', ' 材料 ' * 10, text)
    text = re.sub(r'\\(?:sub)*section\*?\{[^}]*\}|\\[A-Za-z]+\*?|[{}\[\]$\s]', '', text)
    return text


def arena_questions(record):
    """Choice questions with a usable answer key, for the challenge mode."""
    return [dict(key=f'{record["id"]}:{q["id"]}', chapter=record['id'], course=record['course'], id=q['id'],
                 context=q.get('context'),
                 number=q['number'], title=q['title'], stem=q['stem'], options=q['quiz']['options'],
                 grading=q['quiz']['grading'], answer=q['answer'])
            for q in record['questions'] if q.get('quiz') and q['quiz']['grading']['status'] != 'unverified']


def arena_levels(record):
    """Split one exercise set into consecutive stages of about LEVEL_SIZE questions."""
    keys = [q['key'] for q in arena_questions(record)]
    if not keys:
        return []
    count = -(-len(keys) // LEVEL_SIZE)
    base, extra = divmod(len(keys), count)
    levels, start = [], 0
    for index in range(count):
        size = base + (index < extra)
        levels.append(dict(id=f'{record["id"]}-{index + 1}', course=record['course'], chapter=record['id'],
                           number=record['number'], title=record['title'], stage=index + 1, stages=count,
                           questions=keys[start:start + size]))
        start += size
    return levels


def main():
    DATA.mkdir(parents=True, exist_ok=True); LOCAL.mkdir(exist_ok=True)
    manifest = dict(title='公卫统计 · 学习笔记', updated='2026-10-11', sourceUpdated='2026-10-11', courses=[], chapters=[])
    figure_manifest = {}; search = []; all_warnings = []; coverage = {}; levels = []
    for idx, course in enumerate(COURSES):
        course = dict(course)
        folder = ROOT / 'notes' / course['id']
        entries = []
        lecture_paths = sorted((folder / 'content').glob('lec*.tex'), key=lambda p: int(p.stem[3:]))
        for number, path in enumerate(lecture_paths, 1):
            entries.append((path, number, None))
            if number in course['exercises']:
                entries.append((folder / 'content' / f'ex{course["exercises"][number]}.tex', number, None))
            if number in course.get('supplements', {}):
                entries.append((folder / 'content' / course['supplements'][number], number, f'sup{number}'))
        if (folder / 'content' / 'appendix.tex').exists():
            entries.append((folder / 'content' / 'appendix.tex', None, None))
        if (folder / 'content' / 'supplement' / 'sources.tex').exists():
            entries.append((folder / 'content' / 'supplement' / 'sources.tex', None, 'sources'))
        figure_manifest[course['id']] = []
        counts = collections.Counter()
        course['no'] = f'{idx+1:02d}'
        course['chapters'] = len(lecture_paths)
        course['documents'] = []
        course['pdf'] = f'./pdfs/{course["id"]}.pdf'
        course.pop('supplements', None)
        bank = dict(contexts={}, questions=[])
        for path, number, stem in entries:
            record, figures, warnings = build_chapter(course, path, number, stem)
            contexts = record.pop('contexts')
            if record['kind'] == 'exercises':
                bank['questions'].extend(arena_questions(record))
                used = {q['context'] for q in arena_questions(record) if q['context']}
                bank['contexts'].update({k: v for k, v in contexts.items() if k in used})
                levels.extend(arena_levels(record))
            record['questions'] = [{k: v for k, v in q.items() if k not in ('stem', 'context')} for q in record['questions']]
            (DATA / (record['id'] + '.json')).write_text(json.dumps(record, ensure_ascii=False), encoding='utf-8')
            figure_manifest[course['id']].extend(figures)
            all_warnings.extend([record['id'] + ': ' + w for w in warnings])
            metadata = {k: v for k, v in record.items() if k not in ('html', 'questions', 'text')}
            metadata['questionCount'] = len(record['questions'])
            metadata['choiceCount'] = sum('quiz' in q for q in record['questions'])
            manifest['chapters'].append(metadata); course['documents'].append(record['id'])
            search.append(dict(id=record['id'], course=record['course'], title=record['title'], kind=record['kind'], text=record['text'], toc=record['toc']))
            counts['questions'] += len(record['questions']); counts['figures'] += len(figures); counts['codeBlocks'] += record['codeCount']
            source = expand_inputs(path.read_text(), course['id'])
            coverage[record['id']] = dict(sourceQuestions=len(re.findall(r'\\Question\{', source)), webQuestions=len(record['questions']), sourceChars=len(source), webChars=len(record['text']))
            print(record['id'], record['title'], len(record['html']), 'chars', len(record['questions']), 'questions', flush=True)
        assetdir = ROOT / 'public' / 'figures' / course['id']; assetdir.mkdir(parents=True, exist_ok=True)
        for asset in (folder / 'assets').glob('*.png'):
            shutil.copy2(asset, assetdir / asset.name)
        course['questionCount'] = counts['questions']; manifest['courses'].append(course)
        (DATA / f'arena-{course["id"]}.json').write_text(json.dumps(bank, ensure_ascii=False), encoding='utf-8')
    manifest['stats'] = dict(lectures=sum(c['chapters'] for c in manifest['courses']),
                             exercises=sum(c['kind'] == 'exercises' for c in manifest['chapters']),
                             questions=sum(c['questionCount'] for c in manifest['courses']), pages=sum(c['pages'] for c in manifest['courses']),
                             figures=sum(len(v) for v in figure_manifest.values()))
    manifest['levels'] = levels
    (DATA / 'index.json').write_text(json.dumps(manifest, ensure_ascii=False), encoding='utf-8')
    (DATA / 'search.json').write_text(json.dumps(search, ensure_ascii=False), encoding='utf-8')
    (LOCAL / 'figure-manifest.json').write_text(json.dumps(figure_manifest, ensure_ascii=False), encoding='utf-8')
    (LOCAL / 'pandoc-warnings.txt').write_text('\n'.join(all_warnings), encoding='utf-8')
    (DATA / 'coverage.json').write_text(json.dumps(coverage, ensure_ascii=False, indent=2), encoding='utf-8')
    print('Total:', json.dumps(manifest['stats'], ensure_ascii=False))
    print('Pandoc warnings:', len(all_warnings))


if __name__ == '__main__':
    main()
