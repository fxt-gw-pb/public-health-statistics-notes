// Alibaba Cloud Function Compute relay for learners in mainland China, where
// *.workers.dev does not resolve. It forwards /api/ requests unchanged to the
// Cloudflare Worker and reports the learner's address for rate limiting.
'use strict';

const UPSTREAM = (process.env.UPSTREAM || '').replace(/\/$/, '');
const RELAY_KEY = process.env.RELAY_KEY || '';
const FORWARD = ['authorization', 'content-type', 'origin', 'access-control-request-method', 'access-control-request-headers'];
const RETURN = ['content-type', 'cache-control', 'vary', 'access-control-allow-origin', 'access-control-allow-methods', 'access-control-allow-headers', 'access-control-max-age'];

const lower = headers => Object.fromEntries(Object.entries(headers || {}).map(([k, v]) => [k.toLowerCase(), Array.isArray(v) ? v.join(', ') : String(v)]));
const reply = (statusCode, body, headers = {}) => ({ statusCode, headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers }, isBase64Encoded: false, body: JSON.stringify(body) });

exports.handler = async event => {
  const request = JSON.parse(Buffer.isBuffer(event) ? event.toString('utf8') : typeof event === 'string' ? event : JSON.stringify(event));
  const http = request.requestContext?.http || {};
  const method = (http.method || 'GET').toUpperCase(), path = request.rawPath || http.path || '/';
  const headers = lower(request.headers);
  if (!UPSTREAM || RELAY_KEY.length < 32) return reply(500, { error: '中转服务尚未配置。' });
  if (!/^\/api\/[a-z]+$/.test(path)) return reply(404, { error: '没有这个接口。' });

  const query = new URLSearchParams(request.queryParameters || {}).toString();
  const address = http.sourceIp || (headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  const forward = { 'X-Relay-Key': RELAY_KEY, 'X-Client-IP': address };
  for (const name of FORWARD) if (headers[name]) forward[name] = headers[name];
  const body = ['GET', 'HEAD', 'OPTIONS'].includes(method) || request.body == null ? undefined
    : request.isBase64Encoded ? Buffer.from(request.body, 'base64').toString('utf8') : String(request.body);

  let response;
  try {
    response = await fetch(`${UPSTREAM}${path}${query ? `?${query}` : ''}`, { method, headers: forward, body, signal: AbortSignal.timeout(15000) });
  } catch {
    return reply(502, { error: '存档服务暂时无法连接，请稍后再试。' }, { 'Access-Control-Allow-Origin': headers.origin || '*' });
  }
  const back = {};
  for (const name of RETURN) { const value = response.headers.get(name); if (value) back[name] = value; }
  return { statusCode: response.status, headers: back, isBase64Encoded: false, body: await response.text() };
};
