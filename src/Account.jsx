import { useEffect, useRef, useState } from 'react';
import { UserRound, X, Eye, EyeOff, CheckCircle2, CloudOff, RefreshCw, LogOut, KeyRound, Trash2, Download, Upload, ShieldCheck, Cloud } from 'lucide-react';
import { hasProgress, mergeLearning, normalizeLearning, rankOf, xpBreakdown } from './game.js';
import { celebrate } from './fx.js';

const STATUS = { guest: '未登录', syncing: '正在同步…', synced: '已同步', offline: '暂未同步', expired: '需要重新登录' };
const hue = name => [...name].reduce((h, c) => (h * 31 + c.codePointAt(0)) % 360, 7);
export const Avatar = ({ name, size = 30 }) => <span className="avatar" style={{ '--hue': hue(name), width: size, height: size, fontSize: size * .45 }} aria-hidden="true">{[...name][0].toUpperCase()}</span>;

export function AccountButton({ sync, onOpen }) {
  const { account, status } = sync;
  if (!account) return <button className="account-button guest" onClick={onOpen}><UserRound size={17} /><span>登录存档</span></button>;
  return <button className="account-button" onClick={onOpen} title={`${account.username} · ${STATUS[status]}`} aria-label={`个人存档：${account.username}，${STATUS[status]}`}>
    <Avatar name={account.username} size={28} /><span className={`sync-dot ${status}`} />
  </button>;
}

function PinInput({ value, onChange, label, autoFocus, id }) {
  const [shown, setShown] = useState(false);
  return <div className="pin-field">
    <label htmlFor={id}>{label}</label>
    <div className="pin-cells">
      <input id={id} className="pin-input" type={shown ? 'text' : 'password'} inputMode="numeric" autoComplete="off" pattern="\d{6}" maxLength={6} value={value} autoFocus={autoFocus}
        onChange={e => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))} aria-describedby={`${id}-hint`} />
      {Array.from({ length: 6 }, (_, i) => <span key={i} className={`pin-cell ${i < value.length ? 'filled' : ''} ${i === value.length ? 'caret' : ''}`} aria-hidden="true">{i < value.length ? (shown ? value[i] : '●') : ''}</span>)}
      <button type="button" className="icon-button pin-eye" onClick={() => setShown(x => !x)} aria-label={shown ? '隐藏 PIN' : '显示 PIN'}>{shown ? <EyeOff size={17} /> : <Eye size={17} />}</button>
    </div>
    <small id={`${id}-hint`} className="sr-only">6 位数字</small>
  </div>;
}

function SignInForm({ sync, learning, toast, onDone }) {
  const [mode, setMode] = useState('login'), [username, setUsername] = useState(''), [pin, setPin] = useState(''), [confirm, setConfirm] = useState('');
  const local = hasProgress(learning), [mergeLocal, setMergeLocal] = useState(local), [showOnBoard, setShowOnBoard] = useState(true), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const create = mode === 'create', xp = xpBreakdown(learning).total;
  async function submit(e) {
    e.preventDefault(); setError('');
    if (!/^[\p{Script=Han}A-Za-z0-9_\-]{2,20}$/u.test(username.normalize('NFKC').trim())) return setError('用户名需为 2–20 个汉字、字母、数字、下划线或连字符。');
    if (pin.length !== 6) return setError('请输入 6 位数字 PIN。');
    if (create && pin !== confirm) return setError('两次输入的 PIN 不一致。');
    setBusy(true);
    try {
      const r = await sync.signIn({ username: username.normalize('NFKC').trim(), pin, create, mergeLocal, showOnBoard });
      if (create) celebrate();
      toast(create ? `存档已创建，欢迎你，${r.username}！` : `欢迎回来，${r.username}！进度已同步`);
      onDone();
    } catch (err) { setError(err.message); setBusy(false); }
  }
  return <form onSubmit={submit} className="account-form">
    <div className="account-tabs" role="tablist">
      {[['login', '登录存档'], ['create', '创建存档']].map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={mode === id} className={mode === id ? 'active' : ''} onClick={() => { setMode(id); setError(''); }}>{label}</button>)}
    </div>
    <label className="account-label" htmlFor="account-name">用户名</label>
    <input id="account-name" className="account-input" value={username} onChange={e => setUsername(e.target.value)} placeholder="2–20 个字，例如 小北同学" autoComplete="username" maxLength={20} autoFocus />
    <PinInput id="account-pin" label={create ? '设置 6 位 PIN' : '6 位 PIN'} value={pin} onChange={setPin} />
    {create && <PinInput id="account-pin-confirm" label="再输一次 PIN" value={confirm} onChange={setConfirm} />}
    {local && <label className="account-check"><input type="checkbox" checked={mergeLocal} onChange={e => setMergeLocal(e.target.checked)} /><span>把本机当前进度（{xp} XP）并入{create ? '新存档' : '这个存档'}</span></label>}
    {create && <label className="account-check"><input type="checkbox" checked={showOnBoard} onChange={e => setShowOnBoard(e.target.checked)} /><span>在排行榜中显示我的用户名和成绩（之后可随时关闭）</span></label>}
    {error && <p className="account-error" role="alert">{error}</p>}
    <button className="primary-button account-submit" disabled={busy}>{busy ? '请稍候…' : create ? '创建并开始同步' : '登录并同步'}</button>
    <div className="account-notes">
      <p><ShieldCheck size={15} />PIN 只以加密哈希保存；连续输错 5 次会锁定 15 分钟。</p>
      <p>请不要使用银行卡等其他场合的密码。没有邮箱找回，忘记 PIN 将无法恢复，建议定期导出备份。</p>
    </div>
  </form>;
}

function Manage({ sync, learning, setLearning, toast, onDone }) {
  const { account, status, error } = sync, rank = rankOf(xpBreakdown(learning).total);
  const [panel, setPanel] = useState(''), [pin, setPin] = useState(''), [newPin, setNewPin] = useState(''), [confirm, setConfirm] = useState(''), [clearLocal, setClearLocal] = useState(true);
  const [message, setMessage] = useState(''), [busy, setBusy] = useState(false);
  const file = useRef(null);
  const open = name => { setPanel(p => p === name ? '' : name); setPin(''); setNewPin(''); setConfirm(''); setMessage(''); };
  async function run(action) { setBusy(true); setMessage(''); try { await action(); } catch (e) { setMessage(e.message); } finally { setBusy(false); } }
  function exportBackup() {
    const blob = new Blob([JSON.stringify({ app: 'public-health-statistics-notes', version: 1, username: account.username, exportedAt: new Date().toISOString(), progress: learning }, null, 1)], { type: 'application/json' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `医学统计学存档-${account.username}-${new Date().toLocaleDateString('sv')}.json` });
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); toast('备份文件已导出');
  }
  async function importBackup(e) {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (!data || data.app !== 'public-health-statistics-notes' || !data.progress) throw new Error();
      setLearning(x => mergeLearning(x, normalizeLearning(data.progress))); toast('备份已并入当前进度');
    } catch { toast('无法读取这个备份文件'); }
  }
  return <div className="account-manage">
    <div className="account-card" style={{ '--rank': rank.color }}>
      <Avatar name={account.username} size={56} />
      <div><strong>{account.username}</strong><small>{rank.label} · {xpBreakdown(learning).total} XP</small></div>
    </div>
    <div className={`sync-status ${status}`}>
      {status === 'synced' ? <CheckCircle2 size={18} /> : status === 'syncing' ? <RefreshCw size={18} className="spin" /> : status === 'offline' || status === 'expired' ? <CloudOff size={18} /> : <Cloud size={18} />}
      <span><strong>{STATUS[status]}</strong><small>{error || (account.syncedAt ? `上次同步 ${new Date(account.syncedAt).toLocaleString('zh-CN', { hour12: false })}` : '答题、读章节后会自动保存到云端')}</small></span>
      <button className="secondary-button" onClick={() => sync.syncNow()} disabled={status === 'syncing' || status === 'expired'}><RefreshCw size={15} />立即同步</button>
    </div>
    {status === 'expired' && <button className="primary-button" onClick={() => sync.signOut({ clearLocal: false })}>重新登录</button>}
    <label className="account-check"><input type="checkbox" checked={account.public} disabled={busy} onChange={e => run(async () => { await sync.setVisibility(e.target.checked); toast(e.target.checked ? '已在排行榜中显示' : '已在排行榜中隐藏'); })} /><span>在<a href="#/leaderboard" onClick={onDone}>排行榜</a>中显示我的用户名和成绩</span></label>
    <div className="account-actions">
      <button onClick={exportBackup}><Download size={16} />导出备份</button>
      <button onClick={() => file.current.click()}><Upload size={16} />导入备份</button>
      <button onClick={() => open('pin')} aria-expanded={panel === 'pin'}><KeyRound size={16} />修改 PIN</button>
      <button onClick={() => open('logout')} aria-expanded={panel === 'logout'}><LogOut size={16} />退出登录</button>
      <input ref={file} type="file" accept="application/json,.json" hidden onChange={importBackup} />
    </div>
    {panel === 'pin' && <form className="account-panel" onSubmit={e => { e.preventDefault(); if (newPin !== confirm) return setMessage('两次输入的新 PIN 不一致。'); run(async () => { await sync.changePin(pin, newPin); toast('PIN 已修改，其他设备需要重新登录'); open(''); }); }}>
      <PinInput id="pin-old" label="当前 PIN" value={pin} onChange={setPin} autoFocus />
      <PinInput id="pin-new" label="新 PIN" value={newPin} onChange={setNewPin} />
      <PinInput id="pin-new2" label="再输一次新 PIN" value={confirm} onChange={setConfirm} />
      {message && <p className="account-error" role="alert">{message}</p>}
      <button className="primary-button" disabled={busy || pin.length < 6 || newPin.length < 6}>确认修改</button>
    </form>}
    {panel === 'logout' && <div className="account-panel">
      <label className="account-check"><input type="checkbox" checked={clearLocal} onChange={e => setClearLocal(e.target.checked)} /><span>同时清除本机进度（公共电脑建议勾选；云端存档不受影响）</span></label>
      <button className="primary-button" disabled={busy} onClick={() => run(async () => { await sync.signOut({ clearLocal }); toast('已退出登录'); onDone(); })}>退出登录</button>
    </div>}
    <button className="text-danger" onClick={() => open('delete')} aria-expanded={panel === 'delete'}><Trash2 size={14} />删除云端存档</button>
    {panel === 'delete' && <form className="account-panel danger" onSubmit={e => { e.preventDefault(); run(async () => { await sync.deleteAccount(pin); toast('云端存档已删除，本机进度仍保留'); onDone(); }); }}>
      <p>删除后，云端的学习与闯关记录无法恢复；本机进度会保留。</p>
      <PinInput id="pin-delete" label="输入 PIN 确认删除" value={pin} onChange={setPin} autoFocus />
      {message && <p className="account-error" role="alert">{message}</p>}
      <button className="danger-button" disabled={busy || pin.length < 6}>永久删除</button>
    </form>}
  </div>;
}

export function AccountDialog({ open, onClose, sync, learning, setLearning, toast }) {
  const dialog = useRef(null);
  useEffect(() => { if (open) dialog.current.showModal(); else if (dialog.current.open) dialog.current.close(); }, [open]);
  return <dialog ref={dialog} className="account-dialog" onCancel={onClose} onClick={e => { if (e.target === e.currentTarget) onClose(); }} aria-label="个人存档">
    {open && <div className="account-body">
      <header className="account-head">
        <span className="account-head-icon"><Cloud size={22} /></span>
        <div><h2>个人存档</h2><p>用户名 + 6 位 PIN，换设备也能接着学</p></div>
        <button className="icon-button" onClick={onClose} aria-label="关闭"><X size={20} /></button>
      </header>
      {sync.account ? <Manage sync={sync} learning={learning} setLearning={setLearning} toast={toast} onDone={onClose} /> : <SignInForm sync={sync} learning={learning} toast={toast} onDone={onClose} />}
    </div>}
  </dialog>;
}
