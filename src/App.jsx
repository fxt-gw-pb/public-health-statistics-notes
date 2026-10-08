import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Search, Library, Bookmark, ChevronRight, ChevronLeft, Download, GraduationCap, Menu, X, Check, CheckCircle2, List, FileText, ClipboardList, Github, ArrowUp, RotateCcw, ChartNoAxesCombined, Network, Sigma, Minus, Plus, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { chapterHref, enrichContent, loadChapter } from './content.js';
import { updateQuizPanel } from './quiz.js';
import StatisticsHero from './StatisticsHero.jsx';

const REPO = 'https://github.com/fxt-gw-pb/public-health-statistics-notes';
const DEFAULT = { bookmarks: [], completed: [], mastered: [], last: null, positions: {}, fontSize: 18, sidebarCollapsed: false, quizAnswers: {} };
const asset = path => `${import.meta.env.BASE_URL}${path.replace(/^\.\//, '')}`;
const kindName = k => k === 'exercises' ? '习题与解析' : k === 'appendix' ? '勘误附录' : '讲解笔记';
const CourseIcon = ({ id, ...p }) => id === 'linear' ? <ChartNoAxesCombined {...p} /> : id === 'multivariate' ? <Network {...p} /> : <Sigma {...p} />;
function readLearning() {
  try {
    const s = JSON.parse(localStorage.getItem('ph-statistics-learning-v1'));
    if (!s || typeof s !== 'object') return DEFAULT;
    return { ...DEFAULT, bookmarks: Array.isArray(s.bookmarks) ? s.bookmarks : [], completed: Array.isArray(s.completed) ? s.completed : [], mastered: Array.isArray(s.mastered) ? s.mastered : [], last: typeof s.last === 'string' ? s.last : null, positions: s.positions && typeof s.positions === 'object' ? s.positions : {}, fontSize: [16,18,20,22].includes(s.fontSize) ? s.fontSize : 18, sidebarCollapsed: s.sidebarCollapsed === true, quizAnswers: s.quizAnswers && typeof s.quizAnswers === 'object' && !Array.isArray(s.quizAnswers) ? s.quizAnswers : {} };
  } catch { return DEFAULT; }
}
function readRoute() {
  const [path, q] = (location.hash.slice(1) || '/').split('?');
  const parts = path.split('/').filter(Boolean);
  return { view: parts[0] || 'home', id: parts[1] || '', section: new URLSearchParams(q).get('section') || '' };
}
function ProgressBar({ value = 0 }) {
  return <div className="progress-track" role="progressbar" aria-label="学习进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(value)}><span style={{ width: `${Math.min(100, Math.max(0,value))}%` }} /></div>;
}

function SearchDialog({ open, onClose, manifest }) {
  const dialog = useRef(null), input = useRef(null);
  const [query,setQuery] = useState(''), [scope,setScope] = useState('all'), [index,setIndex] = useState(null), [error,setError] = useState(false), [active,setActive] = useState(0);
  useEffect(() => { if (open) { dialog.current.showModal(); input.current.focus(); } else if (dialog.current.open) dialog.current.close(); }, [open]);
  useEffect(() => {
    if (!open || index) return;
    let cancel = false;
    setError(false);
    fetch(asset('data/search.json')).then(r => { if (!r.ok) throw new Error(); return r.json(); }).then(d => { if (!cancel) setIndex(d); }).catch(() => { if (!cancel) setError(true); });
    return () => { cancel = true; };
  }, [open,index]);
  const results = useMemo(() => {
    if (!query.trim() || !index) return [];
    const terms = query.trim().toLowerCase().split(/\s+/);
    return index.filter(d => scope === 'all' || d.course === scope).map(d => {
      const text = `${d.title} ${d.text}`.toLowerCase();
      if (!terms.every(t => text.includes(t))) return null;
      const pos = d.text.toLowerCase().indexOf(terms[0]);
      const section = d.toc.find(h => terms.some(t => h.title.toLowerCase().includes(t)));
      const excerpt = d.text.slice(Math.max(0,pos-35),Math.max(0,pos-35)+145).replace(/\\[()\[\]]/g,'').replace(/\\(?:text|mathrm|operatorname|mathsf|mathbf)\{([^}]+)\}/g,'$1').replace(/\\(beta|alpha|mu|sigma|Sigma|lambda|rho|pi|theta)/g,(_,g)=>({beta:'β',alpha:'α',mu:'μ',sigma:'σ',Sigma:'Σ',lambda:'λ',rho:'ρ',pi:'π',theta:'θ'}[g]));
      return { ...d, section, excerpt: excerpt.replace(/\\[A-Za-z]+\*?/g,'').replace(/[{}]/g,'').replace(/\\+/g,''), score: (terms.some(t => d.title.toLowerCase().includes(t)) ? 100 : 0) + (section ? 20 : 0) };
    }).filter(Boolean).sort((a,b) => b.score-a.score).slice(0,30);
  }, [query,scope,index]);
  useEffect(() => setActive(0),[query,scope]);
  function choose(r) { location.hash = chapterHref(r.id,r.section?.id); onClose(); }
  function highlighted(text) {
    const term = query.trim().split(/\s+/)[0], pos = text.toLowerCase().indexOf(term.toLowerCase());
    return pos < 0 || !term ? text : <>{text.slice(0,pos)}<mark>{text.slice(pos,pos+term.length)}</mark>{text.slice(pos+term.length)}</>;
  }
  return <dialog ref={dialog} className="search-dialog" onCancel={onClose} onClick={e => { if(e.target === e.currentTarget) onClose(); }} aria-label="搜索全部笔记">
    <div className="search-dialog-head"><Search size={22}/><input ref={input} aria-label="搜索关键词" placeholder="搜索知识点、公式、代码或题目…" value={query} onChange={e=>setQuery(e.target.value)} autoComplete="off" onKeyDown={e => { if(e.key==='ArrowDown'){e.preventDefault();setActive(i=>Math.min(i+1,results.length-1));} if(e.key==='ArrowUp'){e.preventDefault();setActive(i=>Math.max(0,i-1));} if(e.key==='Enter'&&results[active])choose(results[active]); }}/><button className="icon-button" aria-label="关闭搜索" onClick={onClose}><X size={20}/></button></div>
    <div className="search-scopes">{[{id:'all',title:'全部课程'},...manifest.courses].map(c=><button key={c.id} aria-pressed={scope===c.id} className={scope===c.id?'selected':''} onClick={()=>setScope(c.id)}>{c.title}</button>)}</div>
    <div className="search-results" aria-live="polite">{!query.trim()?<div className="search-empty"><Search size={32}/><strong>在三门课程中寻找知识点</strong><p>试试「共线性」「Cox」「主成分」或「glm」。</p></div>:error?<div className="search-empty">索引未能加载，请检查网络后重新打开。</div>:!index?<div className="search-empty">正在加载完整笔记…</div>:!results.length?<div className="search-empty"><strong>没有找到相关内容</strong><p>可以缩短关键词，或选择「全部课程」。</p></div>:<><div className="result-count">找到 {results.length===30?'至少 30':results.length} 个相关章节</div>{results.map((r,i)=><button key={r.id} className={`search-result ${active===i?'keyboard-active':''}`} onMouseEnter={()=>setActive(i)} onClick={()=>choose(r)}><div className="result-meta"><span className="course-dot" data-course={r.course}/>{manifest.courses.find(c=>c.id===r.course).title}<span>·</span>{kindName(r.kind)}</div><strong>{highlighted(r.title)}</strong><p>…{highlighted(r.excerpt)}…</p></button>)}</>}</div><div className="search-dialog-footer"><span><kbd>↑</kbd><kbd>↓</kbd> 选择 <kbd>Enter</kbd> 阅读</span><span><kbd>Esc</kbd> 关闭</span></div>
  </dialog>;
}

function CourseCard({ course:c, manifest, learning:s }) {
  const read=manifest.chapters.filter(d=>d.course===c.id&&d.kind==='lecture'&&s.completed.includes(d.id)).length;
  return <a className={`course-card ${c.id}`} href={`#/course/${c.id}`}><div className="course-card-top"><span className="course-number">{c.no}</span><CourseIcon id={c.id} size={25} strokeWidth={1.5}/></div><p className="course-english">{c.english}</p><h3>{c.title}</h3><p className="course-description">{c.description}</p><div className="course-topics">{c.topics.map(t=><span key={t}>{t}</span>)}</div><div className="course-progress"><ProgressBar value={read/c.chapters*100}/><span>{read}/{c.chapters} 章已读</span></div><div className="card-divider"/><div className="course-card-bottom"><span>{c.questionCount} 道习题<i/>{c.pages} 页笔记</span><span className="start-reading">查看课程</span></div></a>;
}
function Home({manifest:m,learning:s}) {
  const last=m.chapters.find(c=>c.id===s.last), read=m.chapters.filter(c=>c.kind==='lecture'&&s.completed.includes(c.id)).length;
  return <div className="overview"><StatisticsHero last={last}/><div className="summary-strip"><span><strong>3</strong>门课程</span><span><strong>17</strong>讲解章节</span><span><strong>{m.stats.questions}</strong>道习题</span><div className="summary-caption"><BookOpen size={17}/>讲解 · 推导 · 代码 · 练习</div></div>
    {last&&<a href={chapterHref(last.id)} className="continue-card"><span className="continue-icon"><BookOpen size={22}/></span><div><span className="continue-label">继续上次阅读</span><strong>{last.title}</strong><small>{m.courses.find(c=>c.id===last.course).title} · {kindName(last.kind)}</small></div><span className="continue-right">继续阅读<ChevronRight size={18}/></span></a>}
    <div className="section-heading"><h2>我的课程</h2><span>{read?`${read} / 17 章讲解已读`:'按章节学习，随时回看'}</span></div><div className="course-grid">{m.courses.map(c=><CourseCard key={c.id} course={c} manifest={m} learning={s}/>)}</div><div className="study-path"><div className="path-heading"><span className="eyebrow">LEARNING PATH</span><h2>知识之间的联系</h2></div>{[['矩阵与线性模型','理解参数估计和模型假设'],['多变量的结构','从相关性走向降维与分类'],['不同结局的建模','根据资料类型选择模型']].map((p,i)=><div className="path-step" key={p[0]}><span>0{i+1}</span><div><strong>{p[0]}</strong><small>{p[1]}</small></div></div>)}</div><footer className="overview-footer"><span>公卫统计 · 学习总笔记</span><a href={REPO} target="_blank" rel="noreferrer"><Github size={14}/>GitHub</a><span>进度与收藏保存在当前浏览器</span></footer></div>;
}
function ChapterRow({chapter:c,learning:s,manifest:m}) {
  return <a className="chapter-row" href={chapterHref(c.id)}><span className={`chapter-row-number ${c.kind==='exercises'?'exercise-number':''}`}>{c.kind==='appendix'?<FileText size={20}/>:c.kind==='exercises'?<ClipboardList size={20}/>:String(c.number).padStart(2,'0')}</span><div><strong>{c.title}</strong><p>{kindName(c.kind)}{c.questionCount?` · ${c.questionCount} 道习题`:''}<span className="row-course"> · {m.courses.find(x=>x.id===c.course).title}</span></p></div><span className="chapter-row-status">{s.completed.includes(c.id)?<CheckCircle2 size={19}/>:<ChevronRight size={19}/>}</span></a>;
}
function CoursePage({course:c,manifest:m,learning:s}) {
  const docs=m.chapters.filter(d=>d.course===c.id), read=docs.filter(d=>d.kind==='lecture'&&s.completed.includes(d.id)).length;
  return <div className="course-page page-pad"><div className="course-page-heading"><div><div className="eyebrow">COURSE {c.no} · {c.english.toUpperCase()}</div><h1>{c.title}<span className="heading-period">.</span></h1><p>{c.description}</p></div><a className="secondary-button" href={asset(c.pdf)} download={`${c.title}_总笔记.pdf`}><Download size={17}/>下载原 PDF</a></div><div className="course-meta"><span>{c.chapters} 章讲解</span><span>{c.questionCount} 道习题</span><span>{c.pages} 页原笔记</span><span className="course-completion">已读 {read}/{c.chapters} 章</span></div><ProgressBar value={read/c.chapters*100}/><div className="section-heading"><h2>章节目录</h2><span>讲解与习题按原书顺序排列</span></div><div className="chapter-list">{docs.map(d=><ChapterRow key={d.id} chapter={d} manifest={m} learning={s}/>)}</div></div>;
}
function CollectionPage({view,manifest:m,learning:s}) {
  const [scope,setScope]=useState('all');
  const all=m.chapters.filter(c=>view==='saved'?s.bookmarks.includes(c.id):c.kind==='exercises'), docs=all.filter(c=>scope==='all'||c.course===scope);
  return <div className="page-pad collection-page"><div className="overview-heading"><div><div className="eyebrow">{view==='saved'?'BOOKMARKS':'PRACTICE'}</div><h1>{view==='saved'?'我的收藏':'习题练习'}<span className="heading-period">.</span></h1><p>{view==='saved'?'把需要回看的章节放在一起。':'先独立作答，再展开解析核对思路。'}</p></div><span className="edition">{view==='saved'?`${all.length} 个收藏`:`${m.stats.questions} 道习题`}</span></div><div className="filter-tabs">{[{id:'all',title:'全部课程'},...m.courses].map(c=><button key={c.id} aria-pressed={scope===c.id} className={scope===c.id?'active':''} onClick={()=>setScope(c.id)}>{c.title}</button>)}</div>{docs.length?<div className="chapter-list">{docs.map(c=><ChapterRow key={c.id} chapter={c} manifest={m} learning={s}/>)}</div>:<div className="empty-state"><Bookmark size={38} strokeWidth={1.3}/><h2>{all.length?'这门课程还没有收藏':'还没有收藏章节'}</h2><p>阅读时点击「收藏本章」，之后可以在这里快速回看。</p><a href="#/" className="primary-button">浏览课程</a></div>}</div>;
}

function FontControls({s,setLearning}) {
  return <span className="font-controls"><span>字号</span><button aria-label="缩小正文字号" disabled={s.fontSize<=16} onClick={()=>setLearning(x=>({...x,fontSize:Math.max(16,x.fontSize-2)}))}><Minus size={15}/></button><span>{s.fontSize}</span><button aria-label="放大正文字号" disabled={s.fontSize>=22} onClick={()=>setLearning(x=>({...x,fontSize:Math.min(22,x.fontSize+2)}))}><Plus size={15}/></button></span>;
}
function Reader({meta,manifest:m,route,learning:s,setLearning,toggle,toast}) {
  const [chapter,setChapter]=useState(null),[error,setError]=useState(''),[attempt,setAttempt]=useState(0),[active,setActive]=useState(''),[tocOpen,setTocOpen]=useState(false),[allAnswers,setAllAnswers]=useState(false),[progress,setProgress]=useState(0);
  const root=useRef(null), positions=useRef(s.positions);
  const course=m.courses.find(c=>c.id===meta.course), saved=s.bookmarks.includes(meta.id), complete=s.completed.includes(meta.id);
  const related=m.chapters.find(c=>c.course===meta.course&&c.number===meta.number&&c.kind===(meta.kind==='exercises'?'lecture':'exercises'));
  const lectures=m.chapters.filter(c=>c.course===meta.course&&c.kind==='lecture'), pos=lectures.findIndex(c=>c.id===meta.id), previous=meta.kind==='lecture'?lectures[pos-1]:null, next=meta.kind==='lecture'?lectures[pos+1]:null;
  useEffect(()=>{positions.current=s.positions;},[s.positions]);
  useEffect(()=>{let cancel=false;setChapter(null);setError('');loadChapter(meta.id).then(d=>{if(!cancel){setChapter(d);setLearning(x=>({...x,last:meta.id}));}}).catch(e=>{if(!cancel)setError(e.message);});return()=>{cancel=true;};},[meta.id,attempt,setLearning]);
  useEffect(()=>{
    if(!chapter||!root.current)return;
    const el=root.current;enrichContent(el);
    el.querySelectorAll('.answer').forEach(d=>{if(d.querySelector('.master-question'))return;const b=document.createElement('button');b.type='button';b.className='master-question secondary-button';b.dataset.question=`${meta.id}:${d.dataset.question}`;b.textContent='标记已掌握';d.querySelector('.answer-body').appendChild(b);});
    function onQuizInput(e){const input=e.target;if(input.matches('input[data-quiz]'))setLearning(x=>({...x,quizAnswers:{...x.quizAnswers,[`${meta.id}:${input.dataset.quiz}`]:input.value}}));}
    el.addEventListener('change',onQuizInput);
    let raf,timer;
    function scroll(){cancelAnimationFrame(raf);raf=requestAnimationFrame(()=>{const r=el.getBoundingClientRect();setProgress(Math.round(Math.max(0,Math.min(100,(window.innerHeight*.45-r.top)/r.height*100))));const hs=[...el.querySelectorAll('h2[id],h3[id]')],current=hs.filter(h=>h.getBoundingClientRect().top<=180).at(-1);setActive(current?.id||hs[0]?.id||'');clearTimeout(timer);timer=setTimeout(()=>setLearning(x=>({...x,positions:{...x.positions,[meta.id]:Math.max(0,window.scrollY)}})),350);});}
    window.addEventListener('scroll',scroll,{passive:true});if(!route.section)requestAnimationFrame(()=>window.scrollTo(0,Number(positions.current[meta.id])||0));scroll();
    return()=>{window.removeEventListener('scroll',scroll);el.removeEventListener('change',onQuizInput);clearTimeout(timer);cancelAnimationFrame(raf);};
  },[chapter,meta.id,setLearning]);
  useEffect(()=>{if(chapter&&route.section){const target=root.current?.querySelector(`[id="${CSS.escape(route.section)}"]`);if(target)requestAnimationFrame(()=>target.scrollIntoView({block:'start'}));}},[chapter,route.section]);
  useEffect(()=>{if(!chapter)return;root.current?.querySelectorAll('.master-question').forEach(b=>{const checked=s.mastered.includes(b.dataset.question);b.classList.toggle('mastered',checked);b.textContent=checked?'✓ 已掌握':'标记已掌握';b.setAttribute('aria-pressed',String(checked));});},[chapter,s.mastered]);
  useEffect(()=>{
    if(!chapter||!root.current)return;
    chapter.questions.filter(q=>q.quiz).forEach(q=>{
      const panel=root.current.querySelector(`.quiz-panel[data-question="${CSS.escape(q.id)}"]`);
      if(panel)updateQuizPanel(panel,q.quiz,s.quizAnswers[`${meta.id}:${q.id}`]);
    });
  },[chapter,s.quizAnswers,meta.id]);
  async function click(e){
    const reset=e.target.closest('[data-quiz-reset]');if(reset){setLearning(x=>{const answers={...x.quizAnswers};delete answers[`${meta.id}:${reset.dataset.quizReset}`];return {...x,quizAnswers:answers};});return;}
    const copy=e.target.closest('.copy-code');if(copy){try{await navigator.clipboard.writeText(copy.closest('.code-block').querySelector('code').textContent);toast('代码已复制');}catch{toast('可以选中代码手动复制');}return;}
    const master=e.target.closest('.master-question');if(master){toggle('mastered',master.dataset.question);return;}
    const a=e.target.closest('a[href^="#"]');if(a&&!a.hash.startsWith('#/')){e.preventDefault();const id=decodeURIComponent(a.hash.slice(1)),target=root.current.querySelector(`[id="${CSS.escape(id)}"]`);if(target)target.scrollIntoView({behavior:'smooth',block:'start'});else{const c=m.chapters.find(c=>c.course===meta.course&&(c.anchors||[]).includes(id));if(c)location.hash=chapterHref(c.id,id);else toast('该引用可在原 PDF 中查看');}}
  }
  function markRead(){toggle('completed',meta.id);toast(complete?'已取消已读标记':'学习进度已更新');}
  const mastered=chapter?.questions.filter(q=>s.mastered.includes(`${meta.id}:${q.id}`)).length||0;
  const attempted=chapter?.questions.filter(q=>q.quiz&&q.quiz.options.some(o=>o.value===s.quizAnswers[`${meta.id}:${q.id}`])).length||0;
  return <div className="reader-page"><div className="reading-progress" style={{'--progress':progress}}/><div className="reader-layout"><div className="reader-main"><div className="reader-heading"><div className="chapter-eyebrow"><span className="course-dot" data-course={course.id}/>{course.title}<span>·</span>{meta.kind==='appendix'?'附录':`第 ${meta.number} 章`}</div><h1>{meta.title}</h1><div className="reader-meta"><span><BookOpen size={15}/>{kindName(meta.kind)}</span>{meta.questionCount>0&&<span><ClipboardList size={15}/>{meta.questionCount} 道习题</span>}<span className="reader-source-date">笔记更新于 2026.10.06</span></div></div>
    <div className="reader-toolbar"><div className="reader-tabs"><a className={meta.kind!=='exercises'?'active':''} href={meta.kind==='exercises'&&related?chapterHref(related.id):chapterHref(meta.id)}><BookOpen size={16}/>{meta.kind==='appendix'?'勘误附录':'讲解笔记'}</a>{(meta.kind==='exercises'||related)&&<a className={meta.kind==='exercises'?'active':''} href={meta.kind==='exercises'?chapterHref(meta.id):chapterHref(related.id)}><ClipboardList size={16}/>习题与解析{meta.kind!=='exercises'&&<span>{related.questionCount}</span>}</a>}</div><button className={`bookmark-button ${saved?'saved':''}`} aria-pressed={saved} onClick={()=>{toggle('bookmarks',meta.id);toast(saved?'已取消收藏':'已收藏本章');}}><Bookmark size={16} fill={saved?'currentColor':'none'}/>{saved?'已收藏':'收藏本章'}</button></div>
    {meta.kind==='exercises'&&<div className="exercise-toolbar"><div className="exercise-progress"><span>已掌握 <strong>{mastered}</strong> / {meta.questionCount} 道</span>{meta.choiceCount>0&&<span>选择题已答 <strong>{attempted}</strong> / {meta.choiceCount} 道</span>}</div><button onClick={()=>{root.current?.querySelectorAll('details.answer').forEach(d=>{d.open=!allAnswers;});setAllAnswers(x=>!x);}}>{allAnswers?'收起全部解析':'展开全部解析'}</button></div>}
    <div className="mobile-reader-tools"><button onClick={()=>setTocOpen(x=>!x)}><List size={17}/>本章目录</button><FontControls s={s} setLearning={setLearning}/></div>
    {error?<div className="empty-state"><FileText size={32}/><h2>章节未能加载</h2><p>{error}</p><button className="secondary-button" onClick={()=>setAttempt(x=>x+1)}><RotateCcw size={16}/>重试</button></div>:!chapter?<div className="reader-loading" aria-live="polite">正在加载章节…</div>:<><article className={`note-content ${meta.kind}`} ref={root} style={{'--reading-font':`${s.fontSize}px`}} onClick={click} dangerouslySetInnerHTML={{__html:chapter.html}}/><div className="chapter-complete"><div><CheckCircle2 size={24}/><strong>{complete?'这一章已读完':'读完这一章了'}</strong><p>{complete?'可以继续下一章，或回看需要巩固的内容。':'标记已读，记录你的学习进度。'}</p></div><button className={complete?'secondary-button':'primary-button'} aria-pressed={complete} onClick={markRead}><Check size={17}/>{complete?'已标记读完':'标记已读'}</button></div><div className="chapter-pagination"><a href={previous?chapterHref(previous.id):`#/course/${course.id}`}><span>{previous?<><ChevronLeft size={15}/>上一章</>:'课程目录'}</span><strong>{previous?.title||course.title}</strong></a><a href={next?chapterHref(next.id):related?chapterHref(related.id):`#/course/${course.id}`}><span>{next?<>下一章<ChevronRight size={15}/></>:related?meta.kind==='exercises'?'返回讲解':'配套练习':'回到课程'}</span><strong>{next?.title||related?.title||course.title}</strong></a></div></>}
    </div><aside className={`chapter-toc ${tocOpen?'toc-open':''}`} aria-label="本章目录"><div className="toc-sticky"><div className="toc-title"><List size={16}/>本章目录<button className="icon-button toc-close" aria-label="关闭本章目录" onClick={()=>setTocOpen(false)}><X size={17}/></button></div><div className="toc-items">{meta.toc.map((h,i)=><a key={`${h.id}-${i}`} className={`${h.level===3?'toc-subsection':''} ${active===h.id?'active':''}`} href={chapterHref(meta.id,h.id)} onClick={()=>setTocOpen(false)}>{h.title}</a>)}</div><div className="toc-footer"><span>阅读进度 {progress}%</span><ProgressBar value={progress}/><div className="toc-actions"><button className="secondary-button" onClick={markRead}><Check size={15}/>{complete?'已读完本章':'标记已读'}</button><a className="pdf-link" href={asset(course.pdf)} download={`${course.title}_总笔记.pdf`}><Download size={15}/>原 PDF</a></div><FontControls s={s} setLearning={setLearning}/></div></div></aside></div><button className="back-top" aria-label="返回顶部" onClick={()=>window.scrollTo({top:0,behavior:'smooth'})}><ArrowUp size={19}/></button></div>;
}

export default function App(){
  const [manifest,setManifest]=useState(null),[error,setError]=useState(false),[route,setRoute]=useState(readRoute),[s,setLearning]=useState(readLearning),[searchOpen,setSearchOpen]=useState(false),[menuOpen,setMenuOpen]=useState(false),[message,setMessage]=useState('');
  const timer=useRef(null);
  const toast=useCallback(t=>{setMessage(t);clearTimeout(timer.current);timer.current=setTimeout(()=>setMessage(''),2600);},[]);
  const toggle=useCallback((key,value)=>setLearning(x=>({...x,[key]:x[key].includes(value)?x[key].filter(v=>v!==value):[...x[key],value]})),[]);
  useEffect(()=>{fetch(asset('data/index.json')).then(r=>{if(!r.ok)throw new Error();return r.json();}).then(setManifest).catch(()=>setError(true));function hash(){const n=readRoute();setRoute(n);setMenuOpen(false);if(n.view!=='read')window.scrollTo(0,0);}function key(e){if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();setSearchOpen(x=>!x);}if(e.key==='Escape')setMenuOpen(false);}window.addEventListener('hashchange',hash);window.addEventListener('keydown',key);return()=>{window.removeEventListener('hashchange',hash);window.removeEventListener('keydown',key);clearTimeout(timer.current);};},[]);
  useEffect(()=>{try{localStorage.setItem('ph-statistics-learning-v1',JSON.stringify(s));}catch{}},[s]);
  const chapter=manifest?.chapters.find(c=>c.id===route.id),course=manifest?.courses.find(c=>c.id===(chapter?.course||route.id)),title=route.view==='home'?'学习总览':route.view==='saved'?'我的收藏':route.view==='practice'?'习题练习':course?.title||'学习空间';
  useEffect(()=>{document.title=`${chapter?.title||title} · 公卫统计学习笔记`;},[chapter,title]);
  useEffect(()=>{document.body.style.overflow=menuOpen?'hidden':'';return()=>{document.body.style.overflow='';};},[menuOpen]);
  if(!manifest)return <div className="app-loading"><BookOpen size={40}/><h1>公卫统计 · 学习笔记</h1><p>{error?'笔记未能加载，请检查网络后刷新。':'正在打开学习空间…'}</p>{error&&<button className="secondary-button" onClick={()=>location.reload()}>重新加载</button>}</div>;
  return <div className={`app-shell ${s.sidebarCollapsed?'sidebar-collapsed':''}`}><a href="#main-content" className="skip-link" onClick={e=>{e.preventDefault();document.getElementById('main-content').focus();}}>跳转到正文</a>{menuOpen&&<button className="menu-overlay" aria-label="关闭课程菜单" onClick={()=>setMenuOpen(false)}/>}<aside id="course-sidebar" className={`sidebar ${menuOpen?'sidebar-open':''}`} aria-label="课程导航"><a href="#/" className="brand"><span className="brand-mark"><BookOpen size={23}/></span><span>公卫统计<small>STUDY NOTES</small></span></a><button className="mobile-menu-close icon-button" aria-label="关闭菜单" onClick={()=>setMenuOpen(false)}><X size={19}/></button><div className="sidebar-scroll"><div className="sidebar-label">学习空间</div>{[['home','学习总览',Library],['practice','习题练习',ClipboardList],['saved','我的收藏',Bookmark]].map(([view,label,Icon])=><a key={view} href={view==='home'?'#/':`#/${view}`} className={`nav-item ${route.view===view?'active':''}`}><Icon size={18}/>{label}{view==='saved'&&s.bookmarks.length>0&&<span className="nav-count">{s.bookmarks.length}</span>}</a>)}<div className="sidebar-label course-label">课程目录<span>03</span></div>{manifest.courses.map(c=><div key={c.id} className="sidebar-course"><a className={`nav-item ${course?.id===c.id?'course-selected':''}`} href={`#/course/${c.id}`}><span className="course-dot" data-course={c.id}/>{c.title}<ChevronRight size={15} className={`nav-chevron ${course?.id===c.id?'rotated':''}`}/></a>{course?.id===c.id&&<div className="sidebar-chapters">{manifest.chapters.filter(d=>d.course===c.id&&d.kind!=='exercises').map(d=><a key={d.id} href={chapterHref(d.id)} title={d.title} className={d.id===route.id?'active':''}><span>{d.kind==='appendix'?'附':String(d.number).padStart(2,'0')}</span><span>{d.title}</span>{s.completed.includes(d.id)&&<Check size={12}/>}</a>)}</div>}</div>)}</div><div className="sidebar-footer"><GraduationCap size={20}/><div>2026 秋季 · 公卫统计<small>三门课程 · 568 页学习笔记</small></div></div></aside>
  <main id="main-content" tabIndex="-1" className="main-shell"><header className="topbar"><div className="topbar-left"><button className="icon-button sidebar-toggle" aria-label={s.sidebarCollapsed?"展开侧栏":"收起侧栏"} title={s.sidebarCollapsed?"展开侧栏":"收起侧栏"} aria-expanded={!s.sidebarCollapsed} aria-controls="course-sidebar" onClick={()=>setLearning(x=>({...x,sidebarCollapsed:!x.sidebarCollapsed}))}>{s.sidebarCollapsed?<PanelLeftOpen size={20}/>:<PanelLeftClose size={20}/>}</button><button className="icon-button mobile-menu" aria-label="打开课程菜单" aria-expanded={menuOpen} onClick={()=>setMenuOpen(true)}><Menu size={21}/></button><a className="topbar-home" href="#/">学习空间</a><span className="breadcrumb-separator">/</span>{course?<a href={`#/course/${course.id}`}>{title}</a>:<span>{title}</span>}</div><button className="search-trigger" aria-label="搜索全部笔记" onClick={()=>setSearchOpen(true)}><Search size={17}/><span>搜索知识点、公式与习题</span><kbd>⌘ K</kbd></button></header>{route.view==='home'?<Home manifest={manifest} learning={s}/>:['saved','practice'].includes(route.view)?<CollectionPage key={route.view} view={route.view} manifest={manifest} learning={s}/>:route.view==='course'&&course?<CoursePage course={course} manifest={manifest} learning={s}/>:route.view==='read'&&chapter?<Reader key={chapter.id} meta={chapter} manifest={manifest} route={route} learning={s} setLearning={setLearning} toggle={toggle} toast={toast}/>:<div className="empty-state"><FileText size={36}/><h1>没有找到这一页</h1><a className="primary-button" href="#/">回到学习总览</a></div>}</main><SearchDialog open={searchOpen} onClose={()=>setSearchOpen(false)} manifest={manifest}/>{message&&<div className="toast" role="status"><CheckCircle2 size={17}/>{message}</div>}</div>;
}
