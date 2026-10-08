export function gradeChoice(quiz, selection) {
  if (!quiz?.options.some(option => option.value === selection)) return { status: 'unanswered', message: '选择一个选项，核对作答结果。' };
  const grading = quiz.grading;
  if (grading.status === 'unverified') return { status: 'unverified', message: `已选择 ${selection}。此题答案待核实，暂不判断对错。${grading.note}` };
  const accepted = grading.correct.includes(selection);
  if (grading.status === 'conditional') return { status: accepted ? 'conditional' : 'incorrect', message: `${accepted ? '此选项符合原解析的一种解释' : '此选项与原解析不符'}。${grading.note}请展开解析核对条件。` };
  return { status: accepted ? 'correct' : 'incorrect', message: `${accepted ? `回答正确 · ${selection}` : `答错了 · 你选择了 ${selection}，正确答案是 ${grading.correct.join('、')}`}。${grading.note}` };
}

export function updateQuizPanel(panel, quiz, selection) {
  const result = gradeChoice(quiz, selection);
  panel.dataset.grade = result.status;
  panel.querySelectorAll('.quiz-option').forEach(label => {
    const selected = label.dataset.option === selection;
    label.querySelector('input').checked = selected;
    label.classList.toggle('selected', selected);
    label.classList.toggle('correct', selected && result.status === 'correct');
    label.classList.toggle('incorrect', selected && result.status === 'incorrect');
    label.classList.toggle('conditional', selected && result.status === 'conditional');
    label.querySelector('.quiz-option-result').textContent = selected ? result.status === 'correct' ? '✓' : result.status === 'incorrect' ? '×' : '●' : '';
  });
  panel.querySelector('.quiz-feedback').textContent = result.message;
  panel.querySelector('.quiz-reset').hidden = result.status === 'unanswered';
}
