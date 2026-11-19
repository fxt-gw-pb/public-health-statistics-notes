#!/usr/bin/env python3
"""Bring the R practice notes (应用线性回归_R实操) into notes/rcode/ for import_notes.py.

Usage:  python3 scripts/prepare_rcode.py /path/to/应用线性回归_R实操

The R notes are written for the einfart/pku-notes LaTeX template (RCode/ROut code
boxes, tcolorbox note boxes, siunitx tables, longtable).  This script
  1. copies the original LaTeX sources to notes/rcode/source/ (kept for reference),
  2. rewrites each chapter into the subset of LaTeX that import_notes.py already
     understands (rcode/routput blocks, study* boxes, plain tabular, \\figtitle),
  3. writes notes/rcode/references.json from the source labels,
  4. renders the vector figures to PNG in notes/rcode/assets/,
  5. publishes the PDF (public/pdfs/rcode.pdf) and the complete R learning kit
     (public/downloads/rcode-kit.zip).
Run import_notes.py afterwards.  Needs Poppler (pdftoppm) for step 4.
"""
from pathlib import Path
import json
import re
import shutil
import subprocess
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[1]
NOTES = ROOT / 'notes' / 'rcode'
ENTRY = '应用线性回归R实操笔记_1119'
KIT_NAME = '应用线性回归_R实操'
# Chapter files in reading order: (source sections, output stem). Chapter 0 is the guide.
CHAPTERS = [(['s0_abstract', 's0_guide'], 'lec0')] + [([f's{n}_{name}'], f'lec{n}') for n, name in enumerate(
    ['workflow', 'mlr', 'selection', 'diagnostics', 'ridge', 'glm', 'ancova', 'rm', 'homework'], 1)] + [(['sA_appendix'], 'appendix')]
SKIP_IN_ZIP = {'.DS_Store', '__pycache__', 'build', 'output', '.Rhistory', '.Rproj.user'}


def group(text, start, opening='{', closing='}'):
    depth, pos = 0, start
    while pos < len(text):
        ch = text[pos]
        if ch == '\\':
            pos += 2
            continue
        if ch == opening:
            depth += 1
        elif ch == closing:
            depth -= 1
            if depth == 0:
                return text[start + 1:pos], pos + 1
        pos += 1
    raise ValueError(f'unbalanced group near {text[start:start + 60]!r}')


def replace_macro(text, name, handler, nargs=1):
    out, pos = [], 0
    pattern = re.compile(r'\\' + name + r'(?![A-Za-z])')
    while True:
        m = pattern.search(text, pos)
        if not m:
            out.append(text[pos:])
            return ''.join(out)
        args, end = [], m.end()
        for _ in range(nargs):
            while text[end].isspace():
                end += 1
            arg, end = group(text, end)
            args.append(arg)
        out.extend([text[pos:m.start()], handler(*args)])
        pos = end


def split_code(text):
    """Yield (is_code, chunk) so prose edits never touch verbatim code blocks."""
    pattern = re.compile(r'\\begin\{(RCode|ROut)\}.*?\\end\{\1\}', re.S)
    pos = 0
    for m in pattern.finditer(text):
        yield False, text[pos:m.start()]
        yield True, m.group(0)
        pos = m.end()
    yield False, text[pos:]


class Numbering:
    """Reproduce the PDF's numbering so captions and \\ref read the same online."""
    def __init__(self):
        self.table = self.figure = 0
        self.section = -1
        self.subsection = 0
        self.labels = {}


def convert_tables(text, num):
    def table(m):
        body = m.group(1)
        cap = re.search(r'\\caption\{', body)
        title = ''
        if cap:
            title, end = group(body, cap.end() - 1)
            body = body[:cap.start()] + body[end:]
        note = ''
        tn = re.search(r'\\TableNote\{', body)
        if tn:
            note, end = group(body, tn.end() - 1)
            body = body[:tn.start()] + body[end:]
        body = re.sub(r'\\label\{[^}]*\}|\\centering|\\(?:small|footnotesize)\b', '', body)
        num.table += 1
        out = f'\n\\tbltitle{{表 {num.table}\\quad {title}}}\n' + body.strip() + '\n'
        if note:
            out += f'\n\\begin{{studysource}}\n注：{note}\n\\end{{studysource}}\n'
        return out
    text = re.sub(r'\\begin\{table\}(?:\[[^\]]*\])?(.*?)\\end\{table\}', table, text, flags=re.S)

    def longtable(m):
        spec, body = m.group(1), m.group(2)
        cap = re.search(r'\\caption\{', body)
        assert cap, 'longtable without caption'
        title, end = group(body, cap.end() - 1)
        body = body[end:]
        body = re.sub(r'^\s*\\\\', '', body)
        # Drop the repeated page header and the page footer of the longtable.
        body = re.sub(r'\\endfirsthead.*?\\endhead', '', body, flags=re.S)
        body = re.sub(r'\\bottomrule\s*\\endfoot', '', body)
        num.table += 1
        return (f'\n\\tbltitle{{表 {num.table}\\quad {title}}}\n\\begin{{tabular}}{{{spec}}}' + body.rstrip() +
                '\n\\bottomrule\n\\end{tabular}\n')
    text = re.sub(r'\\begin\{longtable\}\{((?:[^{}]|\{[^{}]*\})*)\}(.*?)\\end\{longtable\}', longtable, text, flags=re.S)
    text = re.sub(r'\\begingroup\\(?:footnotesize|small)|\\endgroup', '', text)

    def tabular_spec(m):
        spec = m.group(1)
        spec = re.sub(r'@\{[^}]*\}', '', spec)
        spec = re.sub(r'S\[[^\]]*\]', 'r', spec)
        return '\\begin{tabular}{' + spec + '}'
    text = re.sub(r'\\begin\{tabular\}\{((?:[^{}]|\{[^{}]*\})*)\}', tabular_spec, text)
    text = re.sub(r'\\multicolumn\{(\d+)\}\{@\{\}([lcr])\}', r'\\multicolumn{\1}{\2}', text)
    text = re.sub(r'\\cmidrule(?:\([^)]*\))?\{[^}]*\}', '', text)
    return text


def convert_figures(text, num):
    def figure(m):
        body = m.group(1)
        img = re.search(r'\\includegraphics(?:\[[^\]]*\])?\{([^}]*)\}', body)
        cap = re.search(r'\\caption\{', body)
        assert img and cap, 'figure needs an image and a caption'
        title, _ = group(body, cap.end() - 1)
        num.figure += 1
        return f'\n\\includegraphics{{{Path(img.group(1)).name}}}\n\n\\figtitle{{图 {num.figure}\\quad {title}}}\n'
    return re.sub(r'\\begin\{figure\}(?:\[[^\]]*\])?(.*?)\\end\{figure\}', figure, text, flags=re.S)


def convert_boxes(text):
    def box(env, cls, title_fmt, has_label=False, optional=True, default=''):
        nonlocal text
        while True:
            m = re.search(r'\\begin\{' + env + r'\}', text)
            if not m:
                return
            pos = m.end()
            title = default
            if optional and pos < len(text) and text[pos] == '[':
                close = text.index(']', pos)
                title, pos = text[pos + 1:close], close + 1
            elif not optional:
                title, pos = group(text, pos)
                if has_label:
                    _, pos = group(text, pos)
            head = f'\n\\begin{{{cls}}}\n' + (f'\\textbf{{{title_fmt.format(title)}}}\n\n' if title else '')
            text = text[:m.start()] + head + text[pos:]
            text = text.replace(f'\\end{{{env}}}', f'\n\\end{{{cls}}}\n', 1)
    box('notesabstract', 'studyreview', '{}', default='摘要')
    box('notebox', 'studyexplain', '{}', default='说明')
    box('resultbox', 'studyreview', '{}', default='结果解读')
    box('definitionbox', 'studyreview', '{}', has_label=True, optional=False)
    box('exercisebox', 'studyexplain', '练习：{}', has_label=True, optional=False)
    return text


def convert_chapter(source, num, stem):
    # Headings never occur inside the code boxes, so they are renamed on the whole file:
    # the source's \section is the chapter, \subsection the numbered section.
    if stem == 'appendix':
        letters = iter('ABCD')
        source = re.sub(r'\\section\{', lambda _: '\\section{' + next(letters) + '\\quad ', source)
    else:
        source = source.replace('\\section{', '\\chapter{', 1)
        source = source.replace('\\subsection{', '\\section{')
    pieces = []
    for is_code, chunk in split_code(source):
        if is_code:
            chunk = chunk.replace('\\begin{RCode}', '\\begin{rcode}').replace('\\end{RCode}', '\\end{rcode}')
            chunk = chunk.replace('\\begin{ROut}', '\\begin{routput}').replace('\\end{ROut}', '\\end{routput}')
            pieces.append(chunk)
            continue
        chunk = re.sub(r'\\setcounter\{[^}]*\}\{[^}]*\}', '', chunk)
        chunk = replace_macro(chunk, 'srcnote', lambda body: f'\n\\begin{{studysource}}\n\\textbf{{来源说明}}\\quad {body}\n\\end{{studysource}}\n')
        chunk = convert_tables(chunk, num)
        chunk = convert_figures(chunk, num)
        chunk = convert_boxes(chunk)
        chunk = chunk.replace('\\begin{center}', '').replace('\\end{center}', '')
        # Pandoc drops \quad; keep the gap as an ideographic space.
        chunk = re.sub(r'\\quad(?![A-Za-z])\s*', '\u3000', chunk)
        pieces.append(chunk)
    text = ''.join(pieces)
    if stem == 'appendix':
        text = '\\chapter{附录}\n' + text
    return text


def collect_labels(sources):
    """Number sections, figures and tables in document order, as XeLaTeX does."""
    labels, chapter, sub, fig, tab, letter = {}, -1, 0, 0, 0, None
    token = re.compile(r'\\(section|subsection|appendix|caption|label)\b|\\begin\{(longtable)\}')
    for name in sources:
        text = sources[name]
        text = re.sub(r'\\begin\{(RCode|ROut)\}.*?\\end\{\1\}', '', text, flags=re.S)
        last = None
        for m in token.finditer(text):
            kind = m.group(1) or m.group(2)
            if kind == 'section':
                if name == 'sA_appendix':
                    letter = 'ABCD'[(ord(letter) - 64) if letter else 0]
                    last = letter
                else:
                    chapter += 1; sub = 0; last = str(chapter)
            elif kind == 'subsection':
                sub += 1; last = f'{chapter}.{sub}'
            elif kind == 'caption':
                env = text.rfind('\\begin{figure}', 0, m.start()) > text.rfind('\\end{figure}', 0, m.start())
                if env:
                    fig += 1; last = str(fig)
                else:
                    tab += 1; last = str(tab)
            elif kind == 'longtable':
                pass  # its \caption follows and is counted there
            elif kind == 'label':
                label, _ = group(text, m.end())
                labels[label] = last
    return labels


def render_figures(kit):
    assets = NOTES / 'assets'
    assets.mkdir(parents=True, exist_ok=True)
    for pdf in sorted((kit / '笔记' / 'figures').glob('*.pdf')):
        stem = assets / pdf.stem
        subprocess.run(['pdftoppm', '-r', '170', '-png', '-singlefile', str(pdf), str(stem)], check=True)


def build_zip(kit, target):
    target.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for path in sorted(kit.rglob('*')):
            rel = path.relative_to(kit)
            if any(part in SKIP_IN_ZIP for part in rel.parts) or path.is_dir():
                continue
            z.write(path, Path(KIT_NAME) / rel)
    return target.stat().st_size


def main():
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    kit = Path(sys.argv[1]).expanduser().resolve()
    notes_dir = kit / '笔记'
    if not (notes_dir / f'{ENTRY}.pdf').is_file():
        raise SystemExit(f'Not an R learning kit (missing 笔记/{ENTRY}.pdf): {kit}')
    sources = {p.stem: p.read_text(encoding='utf-8') for p in sorted((notes_dir / 'sections').glob('*.tex'))}
    order = [name for names, _ in CHAPTERS for name in names]
    missing = set(order) - set(sources)
    if missing:
        raise SystemExit(f'Missing section files: {sorted(missing)}')
    # 1. Original sources
    src_dir = NOTES / 'source' / 'sections'
    src_dir.mkdir(parents=True, exist_ok=True)
    for name in order:
        shutil.copy2(notes_dir / 'sections' / f'{name}.tex', src_dir / f'{name}.tex')
    shutil.copy2(notes_dir / f'{ENTRY}.tex', NOTES / 'source' / f'{ENTRY}.tex')
    # 2. Chapters for the importer
    content = NOTES / 'content'
    content.mkdir(parents=True, exist_ok=True)
    num = Numbering()
    for names, stem in CHAPTERS:
        text = '\n\n'.join(sources[n] for n in names)
        if stem == 'lec0':
            # The abstract box goes right under the chapter title of the guide.
            guide = convert_chapter(sources['s0_guide'], num, stem)
            abstract = convert_boxes(sources['s0_abstract'])
            first = guide.index('\n', guide.index('\\chapter{'))
            text = guide[:first + 1] + abstract + guide[first + 1:]
        else:
            text = convert_chapter(text, num, stem)
        (content / f'{stem}.tex').write_text(text.strip() + '\n', encoding='utf-8')
    # 3. Cross-references
    labels = collect_labels({n: sources[n] for n in order})
    (NOTES / 'references.json').write_text(json.dumps(labels, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    # 4. Figures
    render_figures(kit)
    # 5. Downloads
    shutil.copy2(notes_dir / f'{ENTRY}.pdf', ROOT / 'public' / 'pdfs' / 'rcode.pdf')
    size = build_zip(kit, ROOT / 'public' / 'downloads' / 'rcode-kit.zip')
    print(f'rcode: {len(CHAPTERS)} documents, {num.figure} figures, {num.table} tables, '
          f'{len(labels)} labels, kit {size / 1e6:.1f} MB')


if __name__ == '__main__':
    main()
