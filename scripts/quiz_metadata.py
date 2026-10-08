"""Use the answer key in the notes; keep their stated ambiguities explicit."""
import re
from html import escape

# These alternatives are stated explicitly in each original answer, rather than
# inferred from the subject matter or from the wording of an option.
CONDITIONAL = {
    ('linear', 'E14-5'): (['D', 'B'], '原解析以 D 为最直接的答案，同时指出 B 的表述也过强。'),
    ('linear', 'E17-M6'): (['E', 'D'], 'E 需附加线性评分假定；否则按 D 判断。'),
    ('linear', 'E17-C5'): (['D', 'B'], '原解析以 D 为最直接的答案，同时指出 B 的因果表述过强。'),
    ('linear', 'E21-2'): (['B', 'E'], 'B 对应外学生化残差，E 对应内部学生化残差；原题未明确该定义。'),
    ('multivariate', 'M15-4'): (['C', 'D'], '原参考为 C；严格解释时 C、D 均需修正，原题没有严格唯一答案。'),
}


def answer_lead(answer):
    match = re.search(r'\\textbf\{答案[：:]\s*([^}]*)\}', answer)
    return match[1].strip() if match else ''


def grading_for(course, qid, answer, values):
    lead = answer_lead(answer)
    if (course, qid) in CONDITIONAL:
        correct, note = CONDITIONAL[(course, qid)]
        if not all(letter in values and letter in lead for letter in correct):
            raise ValueError(f'Conditional source key changed: {course}:{qid}: {lead}')
        return dict(status='conditional', correct=correct, note=note, sourceAnswer=lead)
    # A remembered or provisional answer is not a verified answer key.
    pending = re.search(r'待[^。]*核|(?:仍需|需)[^。]*(?:核实|核验)|缺失|不能确认|原参考标', lead)
    match = re.match(r'([A-Z])(?=[^A-Za-z]|$)', lead)
    if pending or not match:
        return dict(status='unverified', correct=[], note=lead or '原笔记没有可核实的唯一答案。', sourceAnswer=lead)
    correct = match[1]
    if correct not in values:
        raise ValueError(f'Answer {correct} is outside the options: {course}:{qid}')
    note = '' if lead in (correct, correct + '。') else '原解析：' + lead
    return dict(status='verified', correct=[correct], note=note, sourceAnswer=lead)


def quiz_markup(chapter, question, options, grading):
    key = f'{chapter}:{question["id"]}'
    labels = []
    for option in options:
        value = option['value']
        labels.append('<label class="quiz-option" data-option="' + value + '">'
                      '<input type="radio" name="' + escape(key) + '" value="' + value + '" data-quiz="' + escape(question['id']) + '" />'
                      '<span class="quiz-option-letter">' + value + '</span>'
                      '<span class="quiz-option-content">' + option['html'] + '</span>'
                      '<span class="quiz-option-result" aria-hidden="true"></span></label>')
    return ('<div class="quiz-panel" data-question="' + escape(question['id']) + '">'
            '<fieldset class="quiz-choice-set"><legend class="sr-only">题 ' + escape(question['number']) + '：' + escape(question['title']) + '，请选择一个选项</legend>'
            + ''.join(labels) + '</fieldset>'
            '<div class="quiz-response"><p class="quiz-feedback" role="status" aria-live="polite">选择一个选项，核对作答结果。</p>'
            '<button type="button" class="quiz-reset" data-quiz-reset="' + escape(question['id']) + '" hidden>重新作答</button></div></div>')
