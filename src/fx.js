// Lightweight celebratory effects. All of them are skipped when the visitor
// prefers reduced motion.
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const COLORS = ['#e0484f', '#f5b83d', '#2f9e94', '#4f6ff0', '#8a4fe8', '#ff8a5b'];

let canvas, context, particles = [], frame = 0;
function loop() {
  context.clearRect(0, 0, canvas.width, canvas.height);
  particles = particles.filter(p => p.life > 0);
  for (const p of particles) {
    p.vy += .32 * p.gravity; p.vx *= .985; p.vy *= .985; p.x += p.vx; p.y += p.vy; p.spin += p.vr; p.life -= 1;
    context.save(); context.globalAlpha = Math.min(1, p.life / 30); context.translate(p.x, p.y); context.rotate(p.spin);
    context.fillStyle = p.color;
    if (p.round) { context.beginPath(); context.arc(0, 0, p.size / 2, 0, Math.PI * 2); context.fill(); }
    else context.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
    context.restore();
  }
  frame = particles.length ? requestAnimationFrame(loop) : 0;
  if (!frame) context.clearRect(0, 0, canvas.width, canvas.height);
}
export function confetti(x = innerWidth / 2, y = innerHeight / 3, { count = 70, spread = 1, colors = COLORS, gravity = 1 } = {}) {
  if (reduced()) return;
  if (!canvas) {
    canvas = Object.assign(document.createElement('canvas'), { className: 'fx-canvas' });
    canvas.setAttribute('aria-hidden', 'true'); document.body.appendChild(canvas); context = canvas.getContext('2d');
  }
  const ratio = devicePixelRatio || 1;
  if (canvas.width !== innerWidth * ratio) { canvas.width = innerWidth * ratio; canvas.height = innerHeight * ratio; }
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  for (let i = 0; i < count; i++) {
    const angle = -Math.PI / 2 + (Math.random() - .5) * Math.PI * 1.3 * spread, speed = 5 + Math.random() * 9;
    particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, size: 6 + Math.random() * 7, color: colors[i % colors.length],
      spin: Math.random() * 6, vr: (Math.random() - .5) * .4, life: 70 + Math.random() * 50, round: Math.random() < .3, gravity });
  }
  if (!frame) frame = requestAnimationFrame(loop);
}
export function celebrate() {
  confetti(innerWidth * .25, innerHeight * .55, { count: 60 });
  setTimeout(() => confetti(innerWidth * .75, innerHeight * .55, { count: 60 }), 180);
  setTimeout(() => confetti(innerWidth / 2, innerHeight * .4, { count: 90, spread: 1.4 }), 360);
}
export function centerOf(element) {
  const r = element.getBoundingClientRect();
  return [r.left + r.width / 2, r.top + r.height / 2];
}
export function floatText(x, y, text, tone = 'good') {
  if (reduced()) return;
  const span = Object.assign(document.createElement('span'), { className: `fx-float fx-${tone}`, textContent: text });
  span.setAttribute('aria-hidden', 'true');
  span.style.left = `${x}px`; span.style.top = `${y}px`;
  document.body.appendChild(span);
  span.addEventListener('animationend', () => span.remove());
}
export function shake(element) {
  if (!element || reduced()) return;
  element.classList.remove('fx-shake'); void element.offsetWidth; element.classList.add('fx-shake');
  element.addEventListener('animationend', () => element.classList.remove('fx-shake'), { once: true });
}

// Short synthesized cues; only played after the visitor turns sound on.
let audio;
export function sound(kind) {
  try {
    audio ||= new AudioContext();
    const notes = { correct: [660, 880], wrong: [220, 165], clear: [523, 659, 784, 1047], rank: [392, 523, 659, 784, 1047], tick: [1200] }[kind] || [];
    notes.forEach((frequency, i) => {
      const osc = audio.createOscillator(), gain = audio.createGain(), at = audio.currentTime + i * (kind === 'wrong' ? .14 : .09);
      osc.type = kind === 'wrong' ? 'sawtooth' : 'triangle'; osc.frequency.value = frequency;
      gain.gain.setValueAtTime(.0001, at); gain.gain.exponentialRampToValueAtTime(kind === 'tick' ? .05 : .16, at + .015); gain.gain.exponentialRampToValueAtTime(.0001, at + .22);
      osc.connect(gain).connect(audio.destination); osc.start(at); osc.stop(at + .25);
    });
  } catch { /* Audio is optional. */ }
}
