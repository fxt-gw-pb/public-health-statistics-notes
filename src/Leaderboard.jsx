import { useEffect, useState } from 'react';
import { Crown, Star, Flame, RefreshCw, Cloud, Eye, EyeOff, Target } from 'lucide-react';
import { RANKS } from './game.js';
import { api } from './sync.js';
import { RankBadge } from './Arena.jsx';
import { Avatar } from './Account.jsx';

const collator = new Intl.Collator('zh-Hans-CN-u-co-pinyin', { sensitivity: 'base', numeric: true });
const SORTS = [['xp', '总 XP'], ['stars', '星星'], ['streak', '连续天数'], ['name', '用户名']];
const rankFromOrdinal = ordinal => {
  const index = Math.min(RANKS.length - 1, Math.floor(ordinal / 3)), tier = RANKS[index];
  const division = index === RANKS.length - 1 ? '' : ['Ⅲ', 'Ⅱ', 'Ⅰ'][ordinal % 3];
  return { ...tier, index, division, label: division ? `${tier.name} ${division}` : tier.name };
};
const metric = (e, sort) => sort === 'stars' ? <><Star size={14} fill="currentColor" />{e.stars}</> : sort === 'streak' ? <><Flame size={14} />{e.streak} 天</> : <>{e.xp}<small>XP</small></>;

export function LeaderboardPage({ sync, toast }) {
  const [sort, setSort] = useState('xp'), [data, setData] = useState(null), [error, setError] = useState(''), [attempt, setAttempt] = useState(0), [busy, setBusy] = useState(false);
  const { account } = sync;
  useEffect(() => {
    let cancel = false;
    setError(''); setBusy(true);
    api(`/api/leaderboard?sort=${sort}`, { token: account?.token }).then(d => !cancel && setData(d)).catch(e => !cancel && setError(e.message)).finally(() => !cancel && setBusy(false));
    return () => { cancel = true; };
  }, [sort, attempt, account?.token, account?.public, sync.status === 'synced']);
  // Han names sort by pinyin, mixed with Latin names, rather than by code point.
  const entries = data?.sort !== sort ? [] : sort === 'name' ? [...data.entries].sort((x, y) => collator.compare(x.username, y.username)) : data.entries;
  const podium = sort === 'name' ? [] : entries.slice(0, 3);
  const rest = sort === 'name' ? entries : entries.slice(3);
  const me = data?.me;
  async function toggleVisibility() {
    try { await sync.setVisibility(!account.public); toast(account.public ? '已在排行榜中隐藏' : '已在排行榜中显示'); setAttempt(a => a + 1); }
    catch (e) { toast(e.message); }
  }
  return <div className="leaderboard page-pad page-enter">
    <div className="overview-heading leaderboard-heading">
      <div><div className="eyebrow">LEADERBOARD · 排行榜</div><h1>学习排行榜<span className="heading-period">.</span></h1><p>和同学比一比：答题、摘星、连续学习都会让名次上升。</p></div>
      <button className="secondary-button" onClick={() => setAttempt(a => a + 1)} disabled={busy}><RefreshCw size={16} className={busy ? 'spin' : ''} />刷新</button>
    </div>
    {!account && <button className="board-join" onClick={() => window.dispatchEvent(new Event('ph-open-account'))}><span className="mode-icon"><Cloud size={22} /></span><span><strong>创建个人存档，登上排行榜</strong><small>用一个用户名和 6 位 PIN 保存进度，你的成绩就会出现在这里。</small></span></button>}
    {account && <div className="board-me-bar">
      <Avatar name={account.username} size={34} />
      <span><strong>{account.username}</strong><small>{account.public ? (me?.position ? `当前排名第 ${me.position} 位` : sort === 'name' ? '按用户名排序时不显示名次' : '答题获得 XP 后即可上榜') : '你已在排行榜中隐藏'}</small></span>
      <button className="secondary-button" onClick={toggleVisibility}>{account.public ? <EyeOff size={15} /> : <Eye size={15} />}{account.public ? '在排行榜中隐藏我' : '在排行榜中显示我'}</button>
    </div>}
    <div className="filter-tabs arena-tabs board-tabs" role="tablist">{SORTS.map(([id, label]) => <button key={id} role="tab" aria-selected={sort === id} className={sort === id ? 'active' : ''} onClick={() => setSort(id)}>{label}</button>)}</div>
    {error ? <div className="empty-state"><Target size={34} /><h2>排行榜暂时无法加载</h2><p>{error}</p><button className="secondary-button" onClick={() => setAttempt(a => a + 1)}><RefreshCw size={16} />重试</button></div>
      : !data ? <div className="board-skeleton">{Array.from({ length: 6 }, (_, i) => <span key={i} style={{ '--i': i }} />)}</div>
      : !entries.length ? <div className="empty-state"><Crown size={36} /><h2>排行榜还空着</h2><p>成为第一个上榜的人吧：创建存档，然后去闯关拿 XP。</p><a className="primary-button" href="#/arena">去闯关</a></div>
      : <>
        {podium.length > 0 && <div className="podium" key={sort}>{[1, 0, 2].filter(i => podium[i]).map(i => { const e = podium[i], rank = rankFromOrdinal(e.rank); return <div key={e.username} className={`podium-spot place-${i + 1} ${e.username === account?.username ? 'is-me' : ''}`} style={{ '--rank': rank.color }}>
          {i === 0 && <Crown size={30} className="podium-crown" />}
          <Avatar name={e.username} size={i === 0 ? 70 : 56} />
          <strong>{e.username}</strong>
          <span className="podium-rank"><RankBadge rank={rank} size={18} />{rank.label}</span>
          <span className="podium-metric">{metric(e, sort)}</span>
          <div className="podium-block"><b>{i + 1}</b></div>
        </div>; })}</div>}
        <ol className="board-list stagger" key={`list-${sort}`} start={sort === 'name' ? 1 : 4}>{rest.map((e, i) => { const rank = rankFromOrdinal(e.rank); return <li key={e.username} className={`board-row ${e.username === account?.username ? 'is-me' : ''}`} style={{ '--i': Math.min(i, 15), '--rank': rank.color }}>
          <span className="board-pos">{sort === 'name' ? '·' : i + 4}</span>
          <Avatar name={e.username} size={36} />
          <span className="board-name"><strong>{e.username}</strong><small><RankBadge rank={rank} size={14} />{rank.label} · 正确率 {e.accuracy}%</small></span>
          <span className="board-side"><span><Star size={13} fill="currentColor" />{e.stars}</span><span><Flame size={13} />{e.streak}</span></span>
          <span className="board-metric">{metric(e, sort)}</span>
        </li>; })}</ol>
        <p className="board-foot">共 {data.total} 位同学上榜{data.total > 100 ? '，显示前 100 名' : ''}。成绩来自各自的学习记录，隐藏的存档不会出现在这里。</p>
      </>}
  </div>;
}
