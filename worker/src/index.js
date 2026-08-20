const BLOGGER_API = 'https://www.googleapis.com/blogger/v3';
const GOOGLE_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO = 'https://openidconnect.googleapis.com/v1/userinfo';
const BLOGGER_SCOPE = 'https://www.googleapis.com/auth/blogger';
const OAUTH_SCOPES = [BLOGGER_SCOPE, 'openid', 'email', 'profile'];
const SESSION_TTL = 60 * 60 * 24 * 7;
const STATE_TTL = 60 * 10;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (request.method === 'OPTIONS') return cors(new Response(null, { status: 204 }), env);
      if (url.pathname === '/api/health' && request.method === 'GET') return cors(json({ ok: true, service: 'extension-blogger-publisher' }), env);

      if (url.pathname === '/api/auth/login' && request.method === 'POST') return cors(await login(request, env), env);
      if (url.pathname === '/api/auth/logout' && request.method === 'POST') return cors(await logout(request, env), env);
      if (url.pathname === '/api/auth/me' && request.method === 'GET') return cors(await requireSession(request, env, true), env);

      if (url.pathname === '/oauth/google/start' && request.method === 'GET') return await oauthStart(request, env);
      if (url.pathname === '/oauth/google/callback' && request.method === 'GET') return await oauthCallback(request, env);

      const session = await requireSession(request, env);
      if (session instanceof Response) return cors(session, env);

      if (url.pathname === '/api/accounts' && request.method === 'GET') return cors(await listAccounts(env), env);
      if (url.pathname === '/api/accounts/refresh' && request.method === 'POST') return cors(await refreshAllAccounts(env), env);
      if (url.pathname.startsWith('/api/accounts/') && url.pathname.endsWith('/disconnect') && request.method === 'POST') {
        const accountId = decodeURIComponent(url.pathname.split('/')[3]);
        return cors(await disconnectAccount(accountId, env), env);
      }
      if (url.pathname === '/api/publish' && request.method === 'POST') return cors(await publish(request, env, session), env);
      if (url.pathname === '/api/publications/retry' && request.method === 'POST') return cors(await retryPublication(request, env, session), env);
      if (url.pathname === '/api/publications/recent' && request.method === 'GET') return cors(await recentPublications(env), env);

      return cors(json({ error: 'Not found' }, 404), env);
    } catch (error) {
      console.error('request_error', { path: url.pathname, message: error?.message });
      return cors(json({ error: 'Internal server error' }, 500), env);
    }
  }
};

async function login(request, env) {
  requireConfig(env, ['CMS_ADMIN_PASSWORD', 'SESSION_SECRET']);
  const body = await readJson(request);
  if (!body || typeof body.password !== 'string' || !constantTimeEqual(body.password, env.CMS_ADMIN_PASSWORD)) {
    return json({ error: 'Invalid administrator credentials' }, 401);
  }
  const sessionId = randomId(32);
  await env.APP_KV.put(`session:${sessionId}`, JSON.stringify({ cmsUserId: 'bootstrap-admin', createdAt: Date.now() }), { expirationTtl: SESSION_TTL });
  return withCookie(json({ ok: true, user: { id: 'bootstrap-admin', role: 'admin' } }), 'publisher_session', sessionId, SESSION_TTL);
}

async function logout(request, env) {
  const cookies = parseCookies(request.headers.get('Cookie') || '');
  if (cookies.publisher_session) await env.APP_KV.delete(`session:${cookies.publisher_session}`);
  return clearCookie(json({ ok: true }), 'publisher_session');
}

async function requireSession(request, env, asResponse = false) {
  const cookies = parseCookies(request.headers.get('Cookie') || '');
  const id = cookies.publisher_session;
  if (!id) return asResponse ? json({ authenticated: false }, 401) : json({ error: 'Authentication required' }, 401);
  const session = await env.APP_KV.get(`session:${id}`, 'json');
  if (!session) return asResponse ? json({ authenticated: false }, 401) : json({ error: 'Session expired' }, 401);
  return asResponse ? json({ authenticated: true, user: { id: session.cmsUserId, role: 'admin' } }) : session;
}

async function oauthStart(request, env) {
  const session = await requireSession(request, env);
  if (session instanceof Response) return session;
  requireConfig(env, ['GOOGLE_CLIENT_ID', 'GOOGLE_REDIRECT_URI']);
  const state = randomId(32);
  await env.APP_KV.put(`oauth_state:${state}`, JSON.stringify({ sessionId: getSessionId(request), createdAt: Date.now() }), { expirationTtl: STATE_TTL });
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: env.GOOGLE_REDIRECT_URI,
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    scope: OAUTH_SCOPES.join(' '),
    state
  });
  return Response.redirect(`${GOOGLE_AUTH}?${params}`, 302);
}

async function oauthCallback(request, env) {
  requireConfig(env, ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI', 'TOKEN_ENCRYPTION_KEY']);
  const url = new URL(request.url);
  const state = url.searchParams.get('state');
  const code = url.searchParams.get('code');
  if (!state || !code) return redirectToApp(env, 'oauth_error=missing_code');
  const stateData = await env.APP_KV.get(`oauth_state:${state}`, 'json');
  await env.APP_KV.delete(`oauth_state:${state}`);
  if (!stateData || !stateData.sessionId) return redirectToApp(env, 'oauth_error=invalid_state');
  const session = await env.APP_KV.get(`session:${stateData.sessionId}`, 'json');
  if (!session) return redirectToApp(env, 'oauth_error=session_expired');

  const tokenResponse = await fetch(GOOGLE_TOKEN, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, redirect_uri: env.GOOGLE_REDIRECT_URI, grant_type: 'authorization_code' })
  });
  const tokens = await tokenResponse.json().catch(() => ({}));
  if (!tokenResponse.ok || !tokens.access_token) {
    console.error('oauth_token_exchange_failed', { status: tokenResponse.status, error: tokens.error });
    return redirectToApp(env, 'oauth_error=token_exchange_failed');
  }

  const profile = await googleJson(GOOGLE_USERINFO, tokens.access_token);
  if (!profile?.sub) return redirectToApp(env, 'oauth_error=profile_failed');
  const accountId = `google:${profile.sub}`;
  const existing = await env.APP_KV.get(`account:${accountId}`, 'json');
  const refreshToken = tokens.refresh_token || existing?.encryptedRefreshToken;
  if (!refreshToken) return redirectToApp(env, 'oauth_error=missing_refresh_token');
  const account = {
    id: accountId,
    provider: 'google',
    googleSub: profile.sub,
    email: profile.email || null,
    name: profile.name || null,
    encryptedRefreshToken: tokens.refresh_token ? await encryptSecret(tokens.refresh_token, env.TOKEN_ENCRYPTION_KEY) : existing.encryptedRefreshToken,
    encryptedAccessToken: await encryptSecret(tokens.access_token, env.TOKEN_ENCRYPTION_KEY),
    accessTokenExpiresAt: Date.now() + Number(tokens.expires_in || 3600) * 1000,
    status: 'connected',
    lastAuthorizedAt: new Date().toISOString(),
    lastError: null,
    blogs: []
  };
  await env.APP_KV.put(`account:${accountId}`, JSON.stringify({ ...account, blogs: existing?.blogs || [] }));
  await addToIndex(env, 'accounts:index', accountId);
  try {
    const blogs = await bloggerListBlogs(account, env);
    account.blogs = blogs;
    await env.APP_KV.put(`account:${accountId}`, JSON.stringify(account));
  } catch (error) {
    account.status = error.code === 'AUTH_REQUIRED' ? 'reauthorization_required' : 'connected';
    account.lastError = safeError(error);
    await env.APP_KV.put(`account:${accountId}`, JSON.stringify(account));
  }
  return redirectToApp(env, 'connected=1');
}

async function listAccounts(env) {
  const ids = (await env.APP_KV.get('accounts:index', 'json')) || [];
  const accounts = (await Promise.all(ids.map(id => env.APP_KV.get(`account:${id}`, 'json')))).filter(Boolean);
  return json({ accounts: accounts.map(publicAccount) });
}

async function refreshAllAccounts(env) {
  const ids = (await env.APP_KV.get('accounts:index', 'json')) || [];
  const results = [];
  for (const id of ids) {
    const account = await env.APP_KV.get(`account:${id}`, 'json');
    if (!account) continue;
    try {
      await getValidAccessToken(account, env, true);
      const updated = await env.APP_KV.get(`account:${id}`, 'json');
      results.push({ id, status: updated?.status || 'connected' });
    } catch (error) {
      results.push({ id, status: updatedStatus(error), error: safeError(error) });
    }
  }
  return json({ results });
}

async function disconnectAccount(accountId, env) {
  const account = await env.APP_KV.get(`account:${accountId}`, 'json');
  if (!account) return json({ error: 'Account not found' }, 404);
  await env.APP_KV.delete(`account:${accountId}`);
  const ids = (await env.APP_KV.get('accounts:index', 'json')) || [];
  await env.APP_KV.put('accounts:index', ids.filter(id => id !== accountId));
  return json({ ok: true });
}

async function publish(request, env, session) {
  requireConfig(env, ['TOKEN_ENCRYPTION_KEY', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET']);
  const body = await readJson(request);
  const validation = validatePost(body);
  if (validation) return json({ error: validation }, 400);
  const blogIds = [...new Set(body.blogIds.map(String))];
  const accounts = await loadAccounts(env);
  const blogMap = new Map();
  for (const account of accounts) for (const blog of account.blogs || []) blogMap.set(String(blog.id), { account, blog });
  const operationId = randomId(16);
  const results = await Promise.all(blogIds.map(async blogId => {
    const target = blogMap.get(blogId);
    if (!target) return publicationResult(blogId, null, false, 'Blog is not connected or no longer available');
    return publishToBlog(target.account, target.blog, body, operationId, env, session.cmsUserId);
  }));
  return json({ operationId, results });
}

async function publishToBlog(account, blog, post, operationId, env, cmsUserId) {
  const key = publicationKey(blog.id, post.slug, post.chapterNumber);
  const existing = await env.APP_KV.get(key, 'json');
  if (existing?.status === 'success' || existing?.status === 'duplicate') return publicationResult(blog.id, blog, false, 'Duplicate prevented', existing.url, 'duplicate');
  const marker = `extension-publisher:${sha256Text(`${blog.id}|${post.slug}|${post.chapterNumber || ''}`)}`;
  const content = appendMarker(post.content, marker);
  const recordBase = { operationId, cmsUserId, blogId: String(blog.id), blogName: blog.name, accountId: account.id, accountEmail: account.email, slug: post.slug, chapterNumber: post.chapterNumber || null, createdAt: new Date().toISOString(), status: 'pending' };
  try {
    const token = await getValidAccessToken(account, env);
    const duplicate = await findMarker(blog.id, marker, token);
    if (duplicate) {
      const record = { ...recordBase, status: 'duplicate', postId: duplicate.id, url: duplicate.url, finishedAt: new Date().toISOString() };
      await env.APP_KV.put(key, JSON.stringify(record));
      return publicationResult(blog.id, blog, false, 'Already published', duplicate.url, 'duplicate');
    }
    const payload = { title: post.title, content };
    if (post.labels?.length) payload.labels = post.labels;
    const response = await bloggerRequest(`/blogs/${encodeURIComponent(blog.id)}/posts?isDraft=false`, token, { method: 'POST', body: JSON.stringify(payload) });
    const record = { ...recordBase, status: 'success', postId: response.id || null, url: response.url || null, finishedAt: new Date().toISOString() };
    await env.APP_KV.put(key, JSON.stringify(record));
    return publicationResult(blog.id, blog, true, null, response.url || null, 'success');
  } catch (error) {
    if (error.httpStatus === 401) {
      try {
        const freshAccount = await env.APP_KV.get(`account:${account.id}`, 'json');
        const token = await getValidAccessToken(freshAccount, env, true);
        const duplicate = await findMarker(blog.id, marker, token);
        if (!duplicate) {
          const response = await bloggerRequest(`/blogs/${encodeURIComponent(blog.id)}/posts?isDraft=false`, token, { method: 'POST', body: JSON.stringify({ title: post.title, content, labels: post.labels?.length ? post.labels : undefined }) });
          const record = { ...recordBase, status: 'success', postId: response.id || null, url: response.url || null, finishedAt: new Date().toISOString() };
          await env.APP_KV.put(key, JSON.stringify(record));
          return publicationResult(blog.id, blog, true, null, response.url || null, 'success');
        }
        return publicationResult(blog.id, blog, false, 'Already published', duplicate.url, 'duplicate');
      } catch (retryError) { error = retryError; }
    }
    const status = error.code === 'AUTH_REQUIRED' ? 'reauthorization_required' : 'failed';
    await env.APP_KV.put(key, JSON.stringify({ ...recordBase, status, error: safeError(error), finishedAt: new Date().toISOString() }));
    return publicationResult(blog.id, blog, false, friendlyError(error), null, status);
  }
}

async function retryPublication(request, env, session) {
  const body = await readJson(request);
  if (!body?.blogId || !body?.slug) return json({ error: 'blogId and slug are required' }, 400);
  const accounts = await loadAccounts(env);
  for (const account of accounts) {
    const blog = (account.blogs || []).find(b => String(b.id) === String(body.blogId));
    if (blog) {
      const record = await env.APP_KV.get(publicationKey(body.blogId, body.slug, body.chapterNumber), 'json');
      if (!record || !body.post) return json({ error: 'Original post payload is required for retry' }, 400);
      return json({ results: [await publishToBlog(account, blog, body.post, randomId(16), env, session.cmsUserId)] });
    }
  }
  return json({ error: 'Blog is not connected' }, 404);
}

async function recentPublications(env) {
  const keys = await env.APP_KV.list({ prefix: 'publication:' });
  const records = (await Promise.all(keys.keys.slice(0, 100).map(k => env.APP_KV.get(k.name, 'json')))).filter(Boolean);
  records.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return json({ publications: records.slice(0, 50).map(publicPublication) });
}

async function getValidAccessToken(account, env, forceRefresh = false) {
  if (!forceRefresh && account.encryptedAccessToken && Number(account.accessTokenExpiresAt || 0) > Date.now() + 60000) return decryptSecret(account.encryptedAccessToken, env.TOKEN_ENCRYPTION_KEY);
  if (!account.encryptedRefreshToken) throw authError('No refresh token; reconnect this Google account');
  requireConfig(env, ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'TOKEN_ENCRYPTION_KEY']);
  const refreshToken = await decryptSecret(account.encryptedRefreshToken, env.TOKEN_ENCRYPTION_KEY);
  const response = await fetch(GOOGLE_TOKEN, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, refresh_token: refreshToken, grant_type: 'refresh_token' }) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    if (data.error === 'invalid_grant' || response.status === 401) {
      account.status = 'reauthorization_required';
      account.lastError = 'Google authorization must be renewed';
      await env.APP_KV.put(`account:${account.id}`, JSON.stringify(account));
      throw authError('Google authorization expired or was revoked; reconnect this account');
    }
    throw apiError('Google token refresh failed', response.status, data.error);
  }
  account.encryptedAccessToken = await encryptSecret(data.access_token, env.TOKEN_ENCRYPTION_KEY);
  account.accessTokenExpiresAt = Date.now() + Number(data.expires_in || 3600) * 1000;
  account.status = 'connected';
  account.lastError = null;
  await env.APP_KV.put(`account:${account.id}`, JSON.stringify(account));
  return data.access_token;
}

async function bloggerListBlogs(account, env) {
  const token = await getValidAccessToken(account, env);
  const data = await bloggerRequest('/users/self/blogs?fields=items(id,name,url,published,updated,locale)', token);
  return (data.items || []).map(blog => ({ id: String(blog.id), name: blog.name || String(blog.id), url: blog.url || null, published: blog.published || null, updated: blog.updated || null }));
}

async function findMarker(blogId, marker, token) {
  const q = encodeURIComponent(marker);
  try {
    const data = await bloggerRequest(`/blogs/${encodeURIComponent(blogId)}/posts/search?q=${q}&fetchBodies=true`, token);
    const items = data.items || [];
    return items.find(item => typeof item.content === 'string' && item.content.includes(marker)) || null;
  } catch (error) {
    if ([403, 404].includes(error.httpStatus)) return null;
    throw error;
  }
}

async function bloggerRequest(path, token, options = {}) {
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json', ...(options.body ? { 'content-type': 'application/json' } : {}) };
  const response = await fetch(`${BLOGGER_API}${path}`, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw apiError(mapBloggerError(response.status, data), response.status, data?.error?.status || data?.error);
  return data;
}

function mapBloggerError(status, data) {
  if (status === 401) return 'Blogger authorization expired';
  if (status === 403) return 'Insufficient Blogger permissions or Blogger API access is disabled';
  if (status === 404) return 'Blogger blog was not found or access was revoked';
  if (status === 429) return 'Blogger API rate limit reached; retry later';
  if (status >= 500) return 'Temporary Google/Blogger API failure';
  return data?.error?.message || `Blogger API request failed (${status})`;
}

async function googleJson(url, token) {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Google profile request failed (${response.status})`);
  return data;
}

async function loadAccounts(env) {
  const ids = (await env.APP_KV.get('accounts:index', 'json')) || [];
  return (await Promise.all(ids.map(id => env.APP_KV.get(`account:${id}`, 'json')))).filter(Boolean);
}

async function addToIndex(env, key, value) {
  const list = (await env.APP_KV.get(key, 'json')) || [];
  if (!list.includes(value)) await env.APP_KV.put(key, JSON.stringify([...list, value]));
}

function publicAccount(account) {
  return { id: account.id, email: account.email, name: account.name, status: account.status, lastAuthorizedAt: account.lastAuthorizedAt, lastError: account.lastError, blogs: account.blogs || [] };
}
function publicPublication(r) { return { operationId: r.operationId, cmsUserId: r.cmsUserId, accountEmail: r.accountEmail, blogId: r.blogId, blogName: r.blogName, slug: r.slug, chapterNumber: r.chapterNumber, status: r.status, error: r.error || null, url: r.url || null, createdAt: r.createdAt, finishedAt: r.finishedAt || null }; }
function publicationResult(blogId, blog, success, error, url, status = success ? 'success' : 'failed') { return { blogId: String(blogId), blogName: blog?.name || null, success, status, error: error || null, url: url || null }; }
function publicationKey(blogId, slug, chapterNumber) { return `publication:${safeKey(blogId)}:${safeKey(slug)}:${safeKey(chapterNumber || '-')}`; }
function safeKey(v) { return encodeURIComponent(String(v)).slice(0, 180); }
function appendMarker(content, marker) { return `${content}\n<!-- ${marker} -->`; }
function validatePost(body) { if (!body || typeof body.title !== 'string' || !body.title.trim()) return 'Title is required'; if (typeof body.slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(body.slug.trim())) return 'Slug must contain letters, numbers and hyphens only'; if (typeof body.content !== 'string' || !body.content.trim()) return 'Post content is required'; if (!Array.isArray(body.blogIds) || !body.blogIds.length) return 'Select at least one Blogger blog'; if (body.blogIds.length > 50) return 'Too many blogs selected'; return null; }
function friendlyError(error) { if (error.code === 'AUTH_REQUIRED') return error.message; if (error.httpStatus === 403) return error.message; if (error.httpStatus === 404) return error.message; if (error.httpStatus === 429) return error.message; if (error.httpStatus >= 500) return 'Temporary Google API failure; retry this blog'; return error.message || 'Publishing failed'; }
function safeError(error) { return String(error?.message || 'Unknown error').slice(0, 500); }
function updatedStatus(error) { return error.code === 'AUTH_REQUIRED' ? 'reauthorization_required' : 'error'; }
function authError(message) { const e = new Error(message); e.code = 'AUTH_REQUIRED'; return e; }
function apiError(message, httpStatus, providerError) { const e = new Error(message); e.httpStatus = httpStatus; e.providerError = typeof providerError === 'string' ? providerError : undefined; return e; }
function requireConfig(env, names) { for (const name of names) if (!env[name]) throw new Error(`Missing server configuration: ${name}`); }
async function readJson(request) { try { return await request.json(); } catch { return null; } }
function json(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } }); }
function cors(response, env) { const headers = new Headers(response.headers); const origin = env.ALLOWED_ORIGIN || env.APP_BASE_URL || ''; if (origin) headers.set('Access-Control-Allow-Origin', origin); headers.set('Access-Control-Allow-Credentials', 'true'); headers.set('Access-Control-Allow-Headers', 'Content-Type'); headers.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS'); return new Response(response.body, { status: response.status, headers }); }
function withCookie(response, name, value, ttl) { const headers = new Headers(response.headers); headers.append('Set-Cookie', `${name}=${value}; Max-Age=${ttl}; Path=/; HttpOnly; Secure; SameSite=Lax`); return new Response(response.body, { status: response.status, headers }); }
function clearCookie(response, name) { const headers = new Headers(response.headers); headers.append('Set-Cookie', `${name}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax`); return new Response(response.body, { status: response.status, headers }); }
function parseCookies(value) { const result = {}; for (const part of value.split(';')) { const i = part.indexOf('='); if (i > 0) result[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); } return result; }
function getSessionId(request) { return parseCookies(request.headers.get('Cookie') || '').publisher_session; }
function randomId(bytes) { const data = new Uint8Array(bytes); crypto.getRandomValues(data); return base64url(data); }
function base64url(bytes) { let binary = ''; for (const b of bytes) binary += String.fromCharCode(b); return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, ''); }
function fromBase64url(value) { const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4); const binary = atob(padded); return Uint8Array.from(binary, c => c.charCodeAt(0)); }
async function sha256Text(value) { const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)); return [...new Uint8Array(hash)].map(x => x.toString(16).padStart(2, '0')).join(''); }
async function encryptionKey(secret) { const raw = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret)); return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']); }
async function encryptSecret(value, secret) { const key = await encryptionKey(secret); const iv = crypto.getRandomValues(new Uint8Array(12)); const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(value)); const packed = new Uint8Array(iv.length + encrypted.byteLength); packed.set(iv, 0); packed.set(new Uint8Array(encrypted), iv.length); return base64url(packed); }
async function decryptSecret(value, secret) { const packed = fromBase64url(value); const iv = packed.slice(0, 12); const encrypted = packed.slice(12); const key = await encryptionKey(secret); const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, encrypted); return new TextDecoder().decode(plain); }
function constantTimeEqual(a, b) { if (a.length !== b.length) return false; let diff = 0; for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i); return diff === 0; }
function redirectToApp(env, query) { const base = env.APP_BASE_URL || '/'; return Response.redirect(`${base}${base.includes('?') ? '&' : '?'}${query}`, 302); }
