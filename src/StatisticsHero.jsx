import { useEffect, useRef, useState } from 'react';
import { Play, Pause, BookOpen, ClipboardList } from 'lucide-react';
import { chapterHref } from './content.js';
import { students, standardized, example, residualSum, sigmoid } from './statistics.js';

const modes = [
  {id:'regression',label:'线性回归',course:'linear',title:'从散点中，寻找趋势',subtitle:'12 名学生的身高与体重 · 原笔记例 1.1'},
  {id:'pca',label:'主成分',course:'multivariate',title:'换一个方向，看见结构',subtitle:'同一组数据 · 按样本标准差进行标准化'},
  {id:'logistic',label:'Logistic',course:'glm',title:'从线性得分，到概率',subtitle:'函数示意 · p = 1 / (1 + exp(−η))'},
];
const P={left:64,right:493,top:30,bottom:258},W=P.right-P.left,H=P.bottom-P.top;
const xmap=(value,min,max)=>P.left+(value-min)/(max-min)*W;
const ymap=(value,min,max)=>P.bottom-(value-min)/(max-min)*H;

function Axes({xs,ys,xmin,xmax,ymin,ymax,xlabel,ylabel}){
  return <g className="hero-chart-axes">
    {ys.map(y=><g key={y}><line x1={P.left} x2={P.right} y1={ymap(y,ymin,ymax)} y2={ymap(y,ymin,ymax)} className="hero-grid-line"/><text x={P.left-13} y={ymap(y,ymin,ymax)+5} textAnchor="end" className="hero-tick">{y}</text></g>)}
    {xs.map(x=><g key={x}><line y1={P.top} y2={P.bottom} x1={xmap(x,xmin,xmax)} x2={xmap(x,xmin,xmax)} className="hero-grid-line"/><text x={xmap(x,xmin,xmax)} y={P.bottom+27} textAnchor="middle" className="hero-tick">{x}</text></g>)}
    <line x1={P.left} x2={P.right} y1={P.bottom} y2={P.bottom} className="hero-axis-line"/>
    <line x1={P.left} x2={P.left} y1={P.top} y2={P.bottom} className="hero-axis-line"/>
    <text x={P.left} y={17} className="hero-axis-label">{ylabel}</text><text x={P.right} y={310} textAnchor="end" className="hero-axis-label">{xlabel}</text>
  </g>;
}

function Plot({mode,time}){
  if(mode==='regression'){
    const slope=example.slope+.55*Math.sin(time*.48),predict=x=>example.meanWeight+slope*(x-example.meanHeight),fit=x=>example.intercept+example.slope*x;
    const X=x=>xmap(x,150,178),Y=y=>ymap(y,28,76);
    return <><svg className="hero-plot" viewBox="0 0 540 324" role="img" aria-labelledby="regression-plot-title regression-plot-description"><title id="regression-plot-title">12 名学生的身高体重散点图与回归直线</title><desc id="regression-plot-description">横轴身高，单位厘米；纵轴体重，单位千克。圆点为原笔记数据。实线围绕均数旋转，展示残差变化；虚线为最小二乘拟合。完整数据位于图示说明。</desc><Axes xs={[150,160,170]} ys={[30,50,70]} xmin={150} xmax={178} ymin={28} ymax={76} xlabel="身高 / cm" ylabel="体重 / kg"/>
      {students.map(p=><line key={'r'+p.id} className="hero-residual" x1={X(p.height)} x2={X(p.height)} y1={Y(p.weight)} y2={Y(predict(p.height))}/>)}
      <line className="hero-reference" x1={X(152)} x2={X(175)} y1={Y(fit(152))} y2={Y(fit(175))}/>
      <line className="hero-model-line" x1={X(152)} x2={X(175)} y1={Y(predict(152))} y2={Y(predict(175))}/>
      {students.map(p=><circle key={p.id} className="hero-observation" cx={X(p.height)} cy={Y(p.weight)} r="5.5"><title>学生 {p.id}：身高 {p.height} cm，体重 {p.weight} kg</title></circle>)}
    </svg><div className="hero-chart-readout"><span><i className="legend-line"/>当前直线 <strong>斜率 {slope.toFixed(2)}</strong></span><span>残差平方和 / kg² <strong>{residualSum(slope).toFixed(1)}</strong></span></div><p className="hero-chart-caption">旋转直线，比较残差。虚线标出最小二乘拟合的位置。</p></>;
  }
  if(mode==='pca'){
    const angle=(45+32*Math.sin(time*.4))*Math.PI/180,a=Math.cos(angle),b=Math.sin(angle),variance=1+example.correlation*Math.sin(2*angle),X=x=>xmap(x,-2.6,2.6),Y=y=>ymap(y,-2.6,2.6);
    return <><svg className="hero-plot" viewBox="0 0 540 324" role="img" aria-labelledby="pca-plot-title pca-plot-description"><title id="pca-plot-title">标准化身高与体重的投影方向</title><desc id="pca-plot-description">横轴为标准化身高，纵轴为标准化体重。数据按样本均数中心化、按样本标准差缩放。实线是旋转的投影方向，虚线为第一主成分方向；细线连接观察点与其投影。</desc><Axes xs={[-2,0,2]} ys={[-2,0,2]} xmin={-2.6} xmax={2.6} ymin={-2.6} ymax={2.6} xlabel="标准化身高" ylabel="标准化体重"/>
      <line className="hero-reference" x1={X(-2.25)} x2={X(2.25)} y1={Y(-2.25)} y2={Y(2.25)}/>
      <line className="hero-model-line" x1={X(-2.55*a)} x2={X(2.55*a)} y1={Y(-2.55*b)} y2={Y(2.55*b)}/>
      {standardized.map(p=>{const projection=p.x*a+p.y*b;return <g key={p.id}><line className="hero-residual" x1={X(p.x)} y1={Y(p.y)} x2={X(projection*a)} y2={Y(projection*b)}/><circle className="hero-projection" cx={X(projection*a)} cy={Y(projection*b)} r="3"/><circle className="hero-observation" cx={X(p.x)} cy={Y(p.y)} r="5.5"/></g>;})}
    </svg><div className="hero-chart-readout"><span>方向角 <strong>{(angle*180/Math.PI).toFixed(0)}°</strong></span><span>投影方差 <strong>{variance.toFixed(2)}</strong></span></div><p className="hero-chart-caption">方向在旋转，数据不变。虚线方向保留最大的投影方差。</p></>;
  }
  const eta=4.6*Math.sin(time*.42),probability=sigmoid(eta),X=x=>xmap(x,-6,6),Y=y=>ymap(y,0,1);
  const curve=Array.from({length:121},(_,i)=>{const x=-6+i*.1;return `${i?'L':'M'} ${X(x).toFixed(2)} ${Y(sigmoid(x)).toFixed(2)}`;}).join(' ');
  return <><svg className="hero-plot" viewBox="0 0 540 324" role="img" aria-labelledby="logistic-plot-title logistic-plot-description"><title id="logistic-plot-title">Logistic 函数示意图</title><desc id="logistic-plot-description">横轴为线性预测量 eta，纵轴为概率，范围为零到一。亮点沿 p 等于一除以一加 exp 负 eta 的曲线运动；辅助线标示当前得分及概率。本图展示数学函数，未使用病例数据。</desc><Axes xs={[-6,-3,0,3,6]} ys={[0,.5,1]} xmin={-6} xmax={6} ymin={0} ymax={1} xlabel="线性预测量 η" ylabel="概率 p"/>
    <path d={curve} className="hero-model-line" fill="none"/><line className="hero-residual" x1={P.left} x2={X(eta)} y1={Y(probability)} y2={Y(probability)}/><line className="hero-residual" x1={X(eta)} x2={X(eta)} y1={Y(probability)} y2={P.bottom}/><circle className="hero-travel-halo" cx={X(eta)} cy={Y(probability)} r="14"/><circle className="hero-travel-point" cx={X(eta)} cy={Y(probability)} r="6"/>
  </svg><div className="hero-chart-readout"><span>线性得分 <strong>η = {eta.toFixed(2)}</strong></span><span>对应概率 <strong>{(probability*100).toFixed(1)}%</strong></span></div><p className="hero-chart-caption">同一条曲线，把任意实数映射为 0 到 1 之间的概率。</p></>;
}

export default function StatisticsHero({last}){
  const container=useRef(null),elapsed=useRef(0);
  const [paused,setPaused]=useState(()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches),[visible,setVisible]=useState(true),[time,setTime]=useState(0),[chosen,setChosen]=useState(null);
  useEffect(()=>{const observer=new IntersectionObserver(([entry])=>setVisible(entry.isIntersecting),{threshold:.05});observer.observe(container.current);const media=window.matchMedia('(prefers-reduced-motion: reduce)'),change=()=>{if(media.matches)setPaused(true);};media.addEventListener('change',change);return()=>{observer.disconnect();media.removeEventListener('change',change);};},[]);
  useEffect(()=>{if(paused||!visible)return;let raf,previous=null,lastPaint=0;function tick(now){if(previous!==null)elapsed.current+=Math.min(now-previous,100)/1000;previous=now;if(now-lastPaint>=40){setTime(elapsed.current);lastPaint=now;}raf=requestAnimationFrame(tick);}raf=requestAnimationFrame(tick);return()=>cancelAnimationFrame(raf);},[paused,visible]);
  const active=chosen===null?Math.floor(time/12)%modes.length:chosen,mode=modes[active];
  return <section ref={container} className={`statistics-hero ${paused?'hero-paused':''}`} aria-label="统计学习动态导览"><div className="hero-copy"><div className="hero-kicker"><span>PUBLIC HEALTH</span><span className="hero-kicker-divider"/>STATISTICS</div><div className="hero-edition">2026 秋季 · 学习总笔记</div><h1>从数据出发，<br/>读懂<span>统计。</span></h1><p className="hero-intro">找到趋势，提炼结构，理解不确定性。<span className="hero-intro-extra"><br/>从一张图开始，走进三门统计课程。</span></p><div className="hero-actions"><a className="hero-primary" href={chapterHref(last?.id||'linear-lec1')}><BookOpen size={17}/>{last?'继续学习':'开始学习'}</a><a className="hero-secondary" href="#/practice"><ClipboardList size={17}/>习题练习</a></div><div className="hero-bottom-note"><span>17 章讲解</span><i/><span>348 道习题</span><i/><span>完整推导与代码</span></div></div>
    <div className="hero-laboratory"><div className="hero-lab-top"><span className="hero-lab-title">STATISTICS IN MOTION</span><button className="hero-play-toggle" onClick={()=>setPaused(p=>!p)} aria-label={paused?'播放统计动画':'暂停统计动画'} aria-pressed={paused}>{paused?<Play size={15}/>:<Pause size={15}/>}<span>{paused?'播放':'暂停'}</span></button></div><div className="hero-mode-tabs" aria-label="选择统计图示">{modes.map((m,i)=><button key={m.id} className={active===i?'active':''} aria-pressed={active===i} onClick={()=>setChosen(i)}><span>0{i+1}</span>{m.label}</button>)}</div><div className="hero-chart-heading"><h2>{mode.title}</h2><p>{mode.subtitle}</p></div><div key={mode.id} className="hero-chart-stage" data-chart={mode.id}><Plot mode={mode.id} time={time}/></div><a href={`#/course/${mode.course}`} className="hero-course-link">阅读{mode.course==='linear'?'应用线性回归':mode.course==='multivariate'?'应用多元分析':'广义线性模型'}</a></div>
    <details className="hero-data"><summary>图示说明与数据</summary><div className="hero-data-content"><div><p>回归和主成分图示使用原笔记第 1 章例 1.1 的 12 名学生数据。回归图以身高为自变量、体重为因变量；虚线为最小二乘拟合。主成分图按样本均数和样本标准差作标准化，第一主成分方向为 45°。</p><p>Logistic 图是数学函数示意，没有加入病例观测。动画用于展示直线、投影方向或函数自变量的变化；原始数据保持不变。</p></div><div className="hero-data-table"><table><thead><tr><th>编号</th><th>身高 / cm</th><th>体重 / kg</th></tr></thead><tbody>{students.map(p=><tr key={p.id}><td>{p.id}</td><td>{p.height}</td><td>{p.weight}</td></tr>)}</tbody></table></div></div></details>
  </section>;
}
