import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_LEARNING, mergeLearning, normalizeLearning, summaryOf } from './game.js';

// The Alibaba Cloud relay (server/relay) is reachable from mainland China; the
// Cloudflare Worker behind it (server/) is the fallback. VITE_SYNC_API overrides both.
const RELAY_API = 'https://medstats-relay-kfepmywjpl.cn-hongkong.fcapp.run';
const WORKER_API = 'https://medstats-sync.2210306202.workers.dev';
const ENDPOINTS = (import.meta.env.VITE_SYNC_API ? [import.meta.env.VITE_SYNC_API] : [RELAY_API, WORKER_API]).filter(Boolean).map(u => u.replace(/\/$/, ''));
let preferred = 0;
const ACCOUNT_KEY = 'ph-statistics-account-v1';
const PUSH_DELAY = 2500;

export class SyncError extends Error {
  constructor(status, message, body = {}) { super(message); this.status = status; this.body = body; }
}
// Try the endpoint that last worked, then the others. A request moves on only when
// it could not reach the backend (network failure, or the relay reporting 502).
export async function api(path, { method = 'GET', body, token, keepalive = false } = {}) {
  const order = ENDPOINTS.map((_, i) => (preferred + i) % ENDPOINTS.length);
  for (const index of order) {
    let response;
    try {
      response = await fetch(`${ENDPOINTS[index]}${path}`, { method, keepalive, signal: AbortSignal.timeout(15000), headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
    } catch { continue; }
    if (response.status === 502 && index !== order.at(-1)) continue;
    preferred = index;
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new SyncError(response.status, data.error || data.message || '存档服务暂时不可用。', data);
    return data;
  }
  throw new SyncError(0, '无法连接存档服务，请检查网络后重试。');
}

function readAccount() {
  try {
    const a = JSON.parse(localStorage.getItem(ACCOUNT_KEY));
    return a && typeof a.username === 'string' && /^[0-9a-f]{64}$/.test(a.token) ? { username: a.username, token: a.token, version: Number.isInteger(a.version) ? a.version : 0, syncedAt: a.syncedAt || null, public: a.public !== false } : null;
  } catch { return null; }
}
function writeAccount(a) {
  try { a ? localStorage.setItem(ACCOUNT_KEY, JSON.stringify(a)) : localStorage.removeItem(ACCOUNT_KEY); } catch { /* storage may be blocked */ }
}
const PREFS = ['fontSize', 'sidebarCollapsed', 'soundOn'];
const keepPrefs = s => ({ ...DEFAULT_LEARNING, ...Object.fromEntries(PREFS.map(k => [k, s[k]])) });
const snapshot = s => JSON.stringify(s);

// Keeps the learning record in step with the signed-in account.
// status: guest | syncing | synced | offline | expired
export function useSync(learning, setLearning) {
  const [account, setAccount] = useState(readAccount);
  const [status, setStatus] = useState(account ? 'syncing' : 'guest');
  const [error, setError] = useState('');
  const current = useRef(learning), accountRef = useRef(account), synced = useRef(null), ready = useRef(false), timer = useRef(null), busy = useRef(false);
  current.current = learning; accountRef.current = account;

  const remember = useCallback(next => { accountRef.current = next; setAccount(next); writeAccount(next); }, []);
  const fail = useCallback(e => {
    if (e.status === 401) { setStatus('expired'); setError('登录已过期，请重新登录；本机进度仍然保留。'); }
    else { setStatus('offline'); setError(e.message); }
  }, []);

  // Adopt a cloud copy: merge it with this device's record and remember its version.
  const adopt = useCallback((progress, version) => {
    const merged = progress ? mergeLearning(current.current, progress) : current.current;
    const a = { ...accountRef.current, version, syncedAt: Date.now() };
    remember(a);
    synced.current = progress ? snapshot(normalizeLearning(progress)) : null;
    current.current = merged;
    setLearning(merged);
    return merged;
  }, [remember, setLearning]);

  const push = useCallback(async ({ keepalive = false } = {}) => {
    const a = accountRef.current;
    if (!a || !ready.current || busy.current) return;
    const s = current.current, text = snapshot(s);
    if (text === synced.current) { setStatus('synced'); return; }
    busy.current = true; setStatus('syncing');
    try {
      const r = await api('/api/progress', { method: 'PUT', token: a.token, body: { progress: s, summary: summaryOf(s), baseVersion: a.version }, keepalive });
      synced.current = text; remember({ ...a, version: r.version, syncedAt: r.updatedAt }); setStatus('synced'); setError('');
    } catch (e) {
      if (e.status === 409 && e.body.progress) { adopt(e.body.progress, e.body.version); busy.current = false; return push(); }
      fail(e);
    } finally { busy.current = false; }
    if (snapshot(current.current) !== synced.current) schedule();
  }, [adopt, fail, remember]);
  const schedule = useCallback(() => { clearTimeout(timer.current); timer.current = setTimeout(() => push(), PUSH_DELAY); }, [push]);

  const pull = useCallback(async () => {
    const a = accountRef.current;
    if (!a) return;
    setStatus('syncing');
    try {
      const r = await api('/api/progress', { token: a.token });
      adopt(r.progress, r.version); ready.current = true; setError('');
      await push();
    } catch (e) { fail(e); }
  }, [adopt, fail, push]);

  useEffect(() => { if (accountRef.current) pull(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (account && ready.current && snapshot(learning) !== synced.current) { setStatus(s => s === 'expired' ? s : 'syncing'); schedule(); } }, [learning, account, schedule]);
  useEffect(() => {
    const flush = () => { if (document.visibilityState === 'hidden' && accountRef.current && ready.current) { clearTimeout(timer.current); push({ keepalive: true }); } };
    const online = () => accountRef.current && (ready.current ? push() : pull());
    document.addEventListener('visibilitychange', flush); window.addEventListener('pagehide', flush); window.addEventListener('online', online);
    return () => { document.removeEventListener('visibilitychange', flush); window.removeEventListener('pagehide', flush); window.removeEventListener('online', online); clearTimeout(timer.current); };
  }, [push, pull]);

  // Sign in or create an account; this device's record is merged in when asked.
  const signIn = useCallback(async ({ username, pin, create, mergeLocal, showOnBoard = true }) => {
    const local = mergeLocal ? current.current : keepPrefs(current.current);
    const r = await api(create ? '/api/register' : '/api/login', { method: 'POST', body: { username, pin, ...(create ? { public: showOnBoard, summary: summaryOf(mergeLocal ? local : DEFAULT_LEARNING), ...(mergeLocal ? { progress: local } : {}) } : {}) } });
    remember({ username: r.username, token: r.token, version: r.version, syncedAt: r.updatedAt, public: r.public });
    current.current = local; ready.current = true; setError('');
    adopt(r.progress, r.version);
    await push();
    return r;
  }, [adopt, push, remember]);

  const signOut = useCallback(async ({ clearLocal }) => {
    const a = accountRef.current;
    clearTimeout(timer.current);
    if (a && ready.current) await push().catch(() => {});
    if (a) api('/api/logout', { method: 'POST', token: a.token }).catch(() => {});
    remember(null); ready.current = false; synced.current = null; setStatus('guest'); setError('');
    if (clearLocal) setLearning(keepPrefs(current.current));
  }, [push, remember, setLearning]);

  const changePin = useCallback((pin, newPin) => api('/api/pin', { method: 'POST', token: accountRef.current.token, body: { pin, newPin } }), []);
  const deleteAccount = useCallback(async pin => {
    await api('/api/account', { method: 'DELETE', token: accountRef.current.token, body: { pin } });
    remember(null); ready.current = false; synced.current = null; setStatus('guest');
  }, [remember]);
  const setVisibility = useCallback(async visible => {
    const r = await api('/api/visibility', { method: 'POST', token: accountRef.current.token, body: { public: visible } });
    remember({ ...accountRef.current, public: r.public });
  }, [remember]);
  const syncNow = useCallback(() => (ready.current ? push() : pull()), [push, pull]);

  return { account, status, error, signIn, signOut, changePin, deleteAccount, syncNow, setVisibility };
}
