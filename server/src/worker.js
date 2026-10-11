// Progress sync and leaderboard for the 医学统计学 study notes: one account per username and six-digit PIN.
// A six-digit PIN has only a million values, so the server is what protects it:
// PINs are stored as salted HMACs under a secret pepper, and failed attempts are
// limited per account and per client address.

const ORIGINS = ['https://fxt-gw-pb.github.io', 'http://127.0.0.1:5173', 'http://127.0.0.1:4173', 'http://localhost:5173', 'http://localhost:4173'];
const SESSION_DAYS = 90;
const MAX_PROGRESS_BYTES = 256 * 1024;
const LOCK_AFTER = 5, LOCK_MINUTES = 15;
const IP_FAILS_PER_HOUR = 20, IP_REGISTRATIONS_PER_HOUR = 5;
const WEAK_PINS = new Set(['123456', '654321', '012345', '123123', '112233', '121212', '123321', '000123', '111222']);

const encoder = new TextEncoder();
const hex = buffer => [...new Uint8Array(buffer)].map(b => b.toString(16).padStart(2, '0')).join('');
const randomHex = bytes => hex(crypto.getRandomValues(new Uint8Array(bytes)));
const sha256 = async text => hex(await crypto.subtle.digest('SHA-256', encoder.encode(text)));
async function hmac(secret, text) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, encoder.encode(text)));
}
function sameString(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

class HttpError extends Error {
  constructor(status, message, extra = {}) { super(message); this.status = status; this.extra = extra; }
}

function cors(request) {
  const origin = request.headers.get('Origin');
  return {
    'Access-Control-Allow-Origin': ORIGINS.includes(origin) ? origin : ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}
const json = (request, body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...cors(request) } });

async function readBody(request) {
  const text = await request.text();
  if (text.length > MAX_PROGRESS_BYTES + 4096) throw new HttpError(413, '存档太大，无法保存。');
  try { const body = JSON.parse(text || '{}'); if (body && typeof body === 'object' && !Array.isArray(body)) return body; } catch { /* handled below */ }
  throw new HttpError(400, '请求格式不正确。');
}

export function normalizeUsername(value) {
  const name = String(value ?? '').normalize('NFKC').trim();
  if (!/^[\p{Script=Han}A-Za-z0-9_\-]{2,20}$/u.test(name)) throw new HttpError(400, '用户名需为 2–20 个汉字、字母、数字、下划线或连字符。');
  return { name, key: name.toLowerCase() };
}
export function checkPin(pin, { creating = false } = {}) {
  if (typeof pin !== 'string' || !/^\d{6}$/.test(pin)) throw new HttpError(400, 'PIN 必须是 6 位数字。');
  if (creating && (/^(\d)\1{5}$/.test(pin) || WEAK_PINS.has(pin))) throw new HttpError(400, '这个 PIN 太容易被猜到，请换一个。');
  return pin;
}
// Leaderboard figures come from the learner's own record; keep them within plausible bounds.
const LIMITS = { xp: 100000, stars: 1000, answered: 5000, correct: 5000, streak: 3650, rank: 18 };
export function checkSummary(summary) {
  if (summary == null) return null;
  if (typeof summary !== 'object' || Array.isArray(summary)) throw new HttpError(400, '排行榜数据不正确。');
  const out = {};
  for (const [key, max] of Object.entries(LIMITS)) {
    const value = summary[key] ?? 0;
    if (!Number.isInteger(value) || value < 0 || value > max) throw new HttpError(400, '排行榜数据不正确。');
    out[key] = value;
  }
  if (out.correct > out.answered) throw new HttpError(400, '排行榜数据不正确。');
  out.lastDay = typeof summary.lastDay === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(summary.lastDay) ? summary.lastDay : '';
  return out;
}
const SUMMARY_SQL = 'xp = ?, stars = ?, answered = ?, correct = ?, streak = ?, last_day = ?, rank_ordinal = ?';
const summaryValues = s => [s.xp, s.stars, s.answered, s.correct, s.streak, s.lastDay, s.rank];
// Calendar days in China Standard Time, used to expire stale streaks.
const chinaDay = (now, offset = 0) => new Date(now + 8 * 3600_000 + offset * 86400_000).toISOString().slice(0, 10);
const liveStreak = 'CASE WHEN last_day >= ? THEN streak ELSE 0 END';
const entry = (row, now) => ({ username: row.username, xp: row.xp, stars: row.stars, answered: row.answered, accuracy: row.answered ? Math.round(row.correct / row.answered * 100) : 0,
  streak: row.last_day >= chinaDay(now, -1) ? row.streak : 0, rank: row.rank_ordinal });

function checkProgress(progress) {
  if (!progress || typeof progress !== 'object' || Array.isArray(progress)) throw new HttpError(400, '存档内容不正确。');
  const text = JSON.stringify(progress);
  if (encoder.encode(text).length > MAX_PROGRESS_BYTES) throw new HttpError(413, '存档太大，无法保存。');
  return text;
}

const pinHash = (env, salt, pin) => hmac(env.PIN_PEPPER, `${salt}:${pin}`);
const clientKey = (env, request) => hmac(env.PIN_PEPPER, `ip:${request.headers.get('CF-Connecting-IP') || 'local'}`);

async function ipCount(env, ip, kind, now) {
  await env.DB.prepare('DELETE FROM ip_events WHERE ip_hash = ? AND at < ?').bind(ip, now - 86400_000).run();
  const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM ip_events WHERE ip_hash = ? AND kind = ? AND at > ?').bind(ip, kind, now - 3600_000).first();
  return row.n;
}
const ipEvent = (env, ip, kind, now) => env.DB.prepare('INSERT INTO ip_events (ip_hash, kind, at) VALUES (?, ?, ?)').bind(ip, kind, now).run();

async function createSession(env, userId, now) {
  const token = randomHex(32);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND expires_at < ?').bind(userId, now),
    env.DB.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').bind(await sha256(token), userId, now, now + SESSION_DAYS * 86400_000),
  ]);
  return token;
}
async function sessionUser(env, request, now) {
  const match = /^Bearer ([0-9a-f]{64})$/.exec(request.headers.get('Authorization') || '');
  if (!match) throw new HttpError(401, '请先登录。');
  const tokenHash = await sha256(match[1]);
  const user = await env.DB.prepare('SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?').bind(tokenHash, now).first();
  if (!user) throw new HttpError(401, '登录已过期，请重新登录。');
  return { user, tokenHash };
}

// Verify a PIN with per-account lockout and per-address limits.
async function verifyPin(env, request, user, pin, now) {
  const ip = await clientKey(env, request);
  if (await ipCount(env, ip, 'fail', now) >= IP_FAILS_PER_HOUR) throw new HttpError(429, '尝试次数过多，请一小时后再试。');
  if (!user) { await ipEvent(env, ip, 'fail', now); throw new HttpError(401, '用户名或 PIN 不正确。'); }
  if (user.locked_until > now) throw new HttpError(429, `PIN 连续输错，账户已暂时锁定，请 ${Math.ceil((user.locked_until - now) / 60000)} 分钟后再试。`, { lockedUntil: user.locked_until });
  if (sameString(await pinHash(env, user.pin_salt, pin), user.pin_hash)) {
    if (user.failed_count) await env.DB.prepare('UPDATE users SET failed_count = 0, locked_until = 0 WHERE id = ?').bind(user.id).run();
    return;
  }
  const failed = user.failed_count + 1;
  const lockedUntil = failed >= LOCK_AFTER ? now + LOCK_MINUTES * 60000 * 2 ** Math.min(4, Math.floor(failed / LOCK_AFTER) - 1) : 0;
  await env.DB.prepare('UPDATE users SET failed_count = ?, locked_until = ? WHERE id = ?').bind(failed, lockedUntil, user.id).run();
  await ipEvent(env, ip, 'fail', now);
  const left = LOCK_AFTER - (failed % LOCK_AFTER || LOCK_AFTER);
  throw new HttpError(401, lockedUntil ? `PIN 连续输错 ${failed} 次，账户已锁定 ${Math.round((lockedUntil - now) / 60000)} 分钟。` : `用户名或 PIN 不正确，再错 ${left} 次将暂时锁定。`);
}

const account = (user, token) => ({ username: user.username, token, progress: user.progress ? JSON.parse(user.progress) : null, version: user.version, updatedAt: user.updated_at, public: !!user.public });

async function route(request, env, now) {
  const { pathname } = new URL(request.url);
  if (pathname === '/api/health') return { ok: true };

  if (pathname === '/api/register' && request.method === 'POST') {
    const body = await readBody(request);
    const { name, key } = normalizeUsername(body.username), pin = checkPin(body.pin, { creating: true });
    const ip = await clientKey(env, request);
    if (await ipCount(env, ip, 'register', now) >= IP_REGISTRATIONS_PER_HOUR) throw new HttpError(429, '创建账户过于频繁，请稍后再试。');
    if (await env.DB.prepare('SELECT 1 FROM users WHERE username_key = ?').bind(key).first()) throw new HttpError(409, '这个用户名已被使用，请换一个，或直接登录。');
    const progress = body.progress == null ? null : checkProgress(body.progress);
    const summary = checkSummary(body.summary) || checkSummary({});
    const salt = randomHex(16);
    const result = await env.DB.prepare('INSERT INTO users (username, username_key, pin_salt, pin_hash, progress, version, created_at, updated_at, xp, stars, answered, correct, streak, last_day, rank_ordinal, public) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(name, key, salt, await pinHash(env, salt, pin), progress, progress ? 1 : 0, now, now, ...summaryValues(summary), body.public === false ? 0 : 1).run();
    await ipEvent(env, ip, 'register', now);
    const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(result.meta.last_row_id).first();
    return [201, account(user, await createSession(env, user.id, now))];
  }

  if (pathname === '/api/login' && request.method === 'POST') {
    const body = await readBody(request);
    const { key } = normalizeUsername(body.username), pin = checkPin(body.pin);
    const user = await env.DB.prepare('SELECT * FROM users WHERE username_key = ?').bind(key).first();
    await verifyPin(env, request, user, pin, now);
    return account(user, await createSession(env, user.id, now));
  }

  if (pathname === '/api/progress' && request.method === 'GET') {
    const { user } = await sessionUser(env, request, now);
    return account(user);
  }

  if (pathname === '/api/progress' && request.method === 'PUT') {
    const { user } = await sessionUser(env, request, now);
    const body = await readBody(request);
    const text = checkProgress(body.progress), summary = checkSummary(body.summary);
    // Another device saved since this one last synced: return the newer copy to merge.
    if (!Number.isInteger(body.baseVersion) || body.baseVersion !== user.version) return [409, { ...account(user), message: '存档已在其他设备更新。' }];
    const result = summary
      ? await env.DB.prepare(`UPDATE users SET progress = ?, version = version + 1, updated_at = ?, ${SUMMARY_SQL} WHERE id = ? AND version = ?`).bind(text, now, ...summaryValues(summary), user.id, user.version).run()
      : await env.DB.prepare('UPDATE users SET progress = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ?').bind(text, now, user.id, user.version).run();
    if (!result.meta.changes) return [409, { ...account(await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(user.id).first()), message: '存档已在其他设备更新。' }];
    return { version: user.version + 1, updatedAt: now };
  }

  if (pathname === '/api/leaderboard' && request.method === 'GET') {
    const sort = new URL(request.url).searchParams.get('sort') || 'xp';
    const order = { xp: 'xp DESC, stars DESC, username_key', stars: 'stars DESC, xp DESC, username_key', streak: `${liveStreak} DESC, xp DESC, username_key`, name: 'username_key' }[sort];
    if (!order) throw new HttpError(400, '不支持的排序方式。');
    const yesterday = chinaDay(now, -1);
    const query = env.DB.prepare(`SELECT username, xp, stars, answered, correct, streak, last_day, rank_ordinal FROM users WHERE public = 1 AND xp > 0 ORDER BY ${order} LIMIT 100`);
    const { results } = await (sort === 'streak' ? query.bind(yesterday) : query).all();
    const total = (await env.DB.prepare('SELECT COUNT(*) AS n FROM users WHERE public = 1 AND xp > 0').first()).n;
    let me = null;
    if (request.headers.get('Authorization')) {
      const { user } = await sessionUser(env, request, now).catch(() => ({}));
      if (user) {
        let ahead = null;
        if (sort !== 'name') {
          const metric = { xp: 'xp', stars: 'stars', streak: liveStreak }[sort];
          const mine = sort === 'streak' ? (user.last_day >= yesterday ? user.streak : 0) : user[sort];
          const count = env.DB.prepare(`SELECT COUNT(*) AS n FROM users WHERE public = 1 AND xp > 0 AND ${metric} > ?`);
          ahead = (await (sort === 'streak' ? count.bind(yesterday, mine) : count.bind(mine)).first()).n;
        }
        me = { ...entry(user, now), position: ahead == null ? null : ahead + 1, public: !!user.public };
      }
    }
    return { sort, total, entries: results.map(row => entry(row, now)), me };
  }

  if (pathname === '/api/visibility' && request.method === 'POST') {
    const { user } = await sessionUser(env, request, now);
    const body = await readBody(request);
    if (typeof body.public !== 'boolean') throw new HttpError(400, '请求格式不正确。');
    await env.DB.prepare('UPDATE users SET public = ? WHERE id = ?').bind(body.public ? 1 : 0, user.id).run();
    return { public: body.public };
  }

  if (pathname === '/api/logout' && request.method === 'POST') {
    const { tokenHash } = await sessionUser(env, request, now);
    await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(tokenHash).run();
    return { ok: true };
  }

  if (pathname === '/api/pin' && request.method === 'POST') {
    const { user, tokenHash } = await sessionUser(env, request, now);
    const body = await readBody(request);
    await verifyPin(env, request, user, checkPin(body.pin), now);
    const newPin = checkPin(body.newPin, { creating: true }), salt = randomHex(16);
    await env.DB.batch([
      env.DB.prepare('UPDATE users SET pin_salt = ?, pin_hash = ? WHERE id = ?').bind(salt, await pinHash(env, salt, newPin), user.id),
      env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?').bind(user.id, tokenHash),
    ]);
    return { ok: true };
  }

  if (pathname === '/api/account' && request.method === 'DELETE') {
    const { user } = await sessionUser(env, request, now);
    const body = await readBody(request);
    await verifyPin(env, request, user, checkPin(body.pin), now);
    await env.DB.batch([
      env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(user.id),
      env.DB.prepare('DELETE FROM users WHERE id = ?').bind(user.id),
    ]);
    return { ok: true };
  }

  throw new HttpError(404, '没有这个接口。');
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(request) });
    try {
      if (!env.PIN_PEPPER || env.PIN_PEPPER.length < 32) throw new HttpError(500, '服务器尚未配置密钥。');
      const result = await route(request, env, Date.now());
      return Array.isArray(result) ? json(request, result[1], result[0]) : json(request, result);
    } catch (error) {
      if (error instanceof HttpError) return json(request, { error: error.message, ...error.extra }, error.status);
      console.error(error);
      return json(request, { error: '服务器暂时出错，请稍后再试。' }, 500);
    }
  },
};
