#!/usr/bin/env python3
"""Render original TikZ figure source; never redraw or estimate statistical data."""
from pathlib import Path
import concurrent.futures
import json
import os
import re
import subprocess
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]


def render_course(course, figures):
    folder = ROOT / 'notes' / course
    output = ROOT / '.local' / 'figures' / course; output.mkdir(parents=True, exist_ok=True)
    main = next(folder.glob('*_总笔记.tex')).read_text()
    preamble = main.split(r'\begin{document}')[0]
    source = preamble + r'\usepackage[active,tightpage]{preview}' + '\n' + r'\setlength\PreviewBorder{5pt}' + '\n' + r'\begin{document}' + '\n'
    for figure in figures:
        source += '\n\\begin{preview}\n' + figure['tex'] + '\n\\end{preview}\n'
    source += '\n\\end{document}\n'
    texfile = output / 'figures.tex'; texfile.write_text(source)
    env = dict(os.environ); env['TEXINPUTS'] = '.:' + str(ROOT / 'notes' / 'common') + '//:'
    result = subprocess.run(['xelatex', '-no-shell-escape', '-interaction=nonstopmode', '-halt-on-error', f'-output-directory={output}', str(texfile)], cwd=folder, env=env, capture_output=True, text=True)
    (output / 'compile.txt').write_text(result.stdout)
    if result.returncode:
        raise RuntimeError(course + ': ' + result.stdout[-2500:])
    result = subprocess.run(['pdftoppm', '-r', '180', '-png', str(output / 'figures.pdf'), str(output / 'figure')], capture_output=True, text=True, check=True)
    images = sorted(output.glob('figure-*.png'), key=lambda p: int(re.search(r'-(\d+)\.png',p.name)[1]))
    if len(images) != len(figures):
        raise RuntimeError(f'{course}: expected {len(figures)} figure pages, got {len(images)}')
    destination = ROOT / 'public' / 'figures' / course; destination.mkdir(parents=True, exist_ok=True)
    for item, image in zip(figures, images):
        with Image.open(image) as im:
            im.convert('RGB').save(destination / (item['name'] + '.webp'), quality=93, method=6)
    return course, len(images)


if __name__ == '__main__':
    manifest = json.loads((ROOT / '.local' / 'figure-manifest.json').read_text())
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        futures = [pool.submit(render_course, course, figures) for course, figures in manifest.items()]
        for future in concurrent.futures.as_completed(futures):
            print(future.result(), flush=True)
