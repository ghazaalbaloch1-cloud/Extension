const CONFIG = {
  clientId: EXTENSION_GOOGLE_CLIENT_ID,
  scope: 'https://www.googleapis.com/auth/blogger openid email profile',
  authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenUrl: 'https://oauth2.googleapis.com/token',
  userInfoUrl: 'https://openidconnect.googleapis.com/v1/userinfo',
  bloggerBase: 'https://www.googleapis.com/blogger/v3'
};

const ACCOUNTS_KEY = 'blogger_accounts_v1';
const HISTORY_KEY = 'publication_history_v1';

chrome.runtime.onInstalled.addListener(() => refreshBadge());
chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  if (!isAllowedSender(sender)) {
    sendResponse({ ok: false, error: 'Unauthorized CMS origin' });
    return false;
  }
  handleMessage(message).then(sendResponse).catch(error => sendResponse({ ok: false, error: safeError(error) }));
  return true;
});

async function handleMessage(message = {}) {
  switch (message.type) {
    case 'ping':
      return { ok: true, installed: true, version: chrome.runtime.getManifest().version };
    case 'accounts':
      return { ok: true, accounts: publicAccounts(await loadAccounts()) };
    case 'connect':
      return { ok: true, account: await connectAccount() };
    case 'disconnect':
      return { ok: true, ...(await disconnectAccount(message.accountId)) };
    case 'refresh_blogs':
      return { ok: true, account: await refreshBlogs(message.accountId) };
    case 'publish':
      return { ok: true, results: await publishMany(message.targets || [], message.post || {}) };
    case 'history':
      return { ok: true, history: await loadHistory() };
    case 'retry':
      return { ok: true, results: await publishMany(message.targets || [], message.post || {}, true) };
    default:
      return { ok: false, error: 'Unknown extension request' };
  }
}

function isAllowedSender(sender) {
  const url = sender?.url || '';
  return /^https:\/\/ghazaalbaloch1-cloud\.github\.io\//.test(url) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(url);
}

async function connectAccount() {
  if (!CONFIG.clientId || CONFIG.clientId.startsWith('REPLACE_')) throw new Error('Configure extension/config.js with a Chrome Extension OAuth client ID first.');
  const verifier = randomString(96);
  const challenge = await sha256Base64Url(verifier);
  const redirectUri = chrome.identity.getRedirectURL('oauth2');
  const state = randomString(32);
  const params = new URLSearchParams({
    client_id: CONFIG.clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: CONFIG.scope,
    access_type: 'offline',
    prompt: 'select_account consent',
    include_granted_scopes: 'true',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state
  });
  const resultUrl = await chrome.identity.launchWebAuthFlow({
    url: `${CONFIG.authUrl}?${params}`,
    interactive: true
  });
  if (!resultUrl) throw new Error('Google authorization did not return a result.');
  const callback = new URL(resultUrl);
  if (callback.searchParams.get('state') !== state) throw new Error('OAuth state validation failed.');
  const oauthError = callback.searchParams.get('error');
  if (oauthError) throw new Error(`Google authorization failed: ${oauthError}`);
  const code = callback.searchParams.get('code');
  if (!code) throw new Error('Google did not return an authorization code.');

  const tokenResponse = await fetch(CONFIG.tokenUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CONFIG.clientId,
      code,
      code_verifier: verifier,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code'
    })
  });
  const tokens = await tokenResponse.json().catch(() => ({}));
  if (!tokenResponse.ok || !tokens.access_token) throw new Error(tokens.error_description || 'Google token exchange failed.');

  const profile = await googleJson(CONFIG.userInfoUrl, tokens.access_token);
  if (!profile.sub) throw new Error('Google account identity could not be verified.');
  const accounts = await loadAccounts();
  const old = accounts.find(a => a.id === `google:${profile.sub}`);
  const account = {
    id: `google:${profile.sub}`,
    email: profile.email || old?.email || 'Google account',
    name: profile.name || old?.name || '',
    refreshToken: tokens.refresh_token || old?.refreshToken || '',
    accessToken: tokens.access_token,
    expiresAt: Date.now() + Number(tokens.expires_in || 3600) * 1000,
    status: 'connected',
    lastAuthorizedAt: new Date().toISOString(),
    lastError: null,
    blogs: old?.blogs || []
  };
  if (!account.refreshToken) throw new Error('No refresh token was returned. Reconnect with Google consent.');
  await saveAccounts([...accounts.filter(a => a.id !== account.id), account]);
  account.blogs = await fetchBlogs(account);
  await saveAccounts((await loadAccounts()).map(a => a.id === account.id ? account : a));
  await refreshBadge();
  return publicAccount(account);
}

async function disconnectAccount(accountId) {
  const accounts = await loadAccounts();
  const account = accounts.find(a => a.id === accountId);
  if (!account) return { removed: false };
  if (account.accessToken) {
    try { await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(account.accessToken)}`, { method: 'POST' }); } catch {}
  }
  await saveAccounts(accounts.filter(a => a.id !== accountId));
  await refreshBadge();
  return { removed: true };
}

async function refreshBlogs(accountId) {
  const accounts = await loadAccounts();
  const account = accounts.find(a => a.id === accountId);
  if (!account) throw new Error('Connected Google account not found.');
  account.blogs = await fetchBlogs(account);
  account.status = 'connected';
  account.lastError = null;
  await saveAccounts(accounts);
  return publicAccount(account);
}

async function fetchBlogs(account) {
  const token = await getAccessToken(account);
  const data = await bloggerRequest('/users/self/blogs?fields=items(id,name,url,published,updated)', token);
  return (data.items || []).map(blog => ({
    id: String(blog.id),
    name: blog.name || String(blog.id),
    url: blog.url || '',
    published: blog.published || null,
    updated: blog.updated || null
  }));
}

async function publishMany(targets, post, isRetry = false) {
  if (!post.title || !post.slug || !post.content) throw new Error('Title, slug and content are required.');
  if (!Array.isArray(targets) || !targets.length) throw new Error('Select at least one Blogger blog.');
  const accounts = await loadAccounts();
  const results = [];
  for (const target of targets) {
    const account = accounts.find(a => a.id === target.accountId);
    const blog = account?.blogs?.find(b => String(b.id) === String(target.blogId));
    if (!account || !blog) {
      results.push({ accountId: target.accountId, blogId: target.blogId, status: 'failed', success: false, error: 'Connected account/blog was not found.' });
      continue;
    }
    results.push(await publishOne(account, blog, post, isRetry));
  }
  await refreshBadge();
  return results;
}

async function publishOne(account, blog, post, isRetry) {
  const marker = `extension-publisher:${await sha256(`${blog.id}|${post.slug}|${post.chapterNumber || ''}`)}`;
  try {
    const token = await getAccessToken(account);
    const duplicate = await findDuplicate(blog.id, marker, token);
    if (duplicate && !isRetry) return result(blog, account, false, 'duplicate', 'Already published', duplicate.url || '');
    let content = post.content;
    if (post.featuredImage && !content.includes(post.featuredImage)) content = `<p><img src="${escapeAttribute(post.featuredImage)}" alt=""></p>${content}`;
    content += `\n<!-- ${marker} -->`;
    const payload = { title: post.title, content };
    if (Array.isArray(post.labels) && post.labels.length) payload.labels = post.labels;
    const data = await bloggerRequest(`/blogs/${encodeURIComponent(blog.id)}/posts?isDraft=false`, token, { method: 'POST', body: JSON.stringify(payload) });
    const r = result(blog, account, true, 'success', '', data.url || '');
    r.postId = data.id || '';
    await appendHistory({ ...r, slug: post.slug, chapterNumber: post.chapterNumber || '', at: new Date().toISOString() });
    return r;
  } catch (error) {
    if (error.httpStatus === 401) {
      try {
        account.accessToken = '';
        const token = await getAccessToken(account, true);
        const duplicate = await findDuplicate(blog.id, marker, token);
        if (duplicate) return result(blog, account, false, 'duplicate', 'Already published', duplicate.url || '');
        let content = post.content;
        if (post.featuredImage && !content.includes(post.featuredImage)) content = `<p><img src="${escapeAttribute(post.featuredImage)}" alt=""></p>${content}`;
        content += `\n<!-- ${marker} -->`;
        const payload = { title: post.title, content };
        if (Array.isArray(post.labels) && post.labels.length) payload.labels = post.labels;
        const data = await bloggerRequest(`/blogs/${encodeURIComponent(blog.id)}/posts?isDraft=false`, token, { method: 'POST', body: JSON.stringify(payload) });
        const r = result(blog, account, true, 'success', '', data.url || '');
        r.postId = data.id || '';
        await appendHistory({ ...r, slug: post.slug, chapterNumber: post.chapterNumber || '', at: new Date().toISOString() });
        return r;
      } catch (retryError) { error = retryError; }
    }
    const status = error.code === 'AUTH_REQUIRED' ? 'reauthorization_required' : 'failed';
    const r = result(blog, account, false, status, friendlyError(error), '');
    await appendHistory({ ...r, slug: post.slug, chapterNumber: post.chapterNumber || '', at: new Date().toISOString() });
    return r;
  }
}

async function getAccessToken(account, forceRefresh = false) {
  if (!forceRefresh && account.accessToken && Number(account.expiresAt || 0) > Date.now() + 60000) return account.accessToken;
  if (!account.refreshToken) { account.status = 'reauthorization_required'; throw authError('Google authorization must be renewed.'); }
  const response = await fetch(CONFIG.tokenUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CONFIG.clientId, refresh_token: account.refreshToken, grant_type: 'refresh_token' })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    if (data.error === 'invalid_grant' || response.status === 401) {
      account.status = 'reauthorization_required';
      account.lastError = 'Google authorization expired or was revoked.';
      await saveAccounts((await loadAccounts()).map(a => a.id === account.id ? account : a));
      throw authError('Google authorization expired or was revoked. Reconnect this account.');
    }
    throw apiError(data.error_description || 'Google token refresh failed.', response.status);
  }
  account.accessToken = data.access_token;
  account.expiresAt = Date.now() + Number(data.expires_in || 3600) * 1000;
  account.status = 'connected';
  account.lastError = null;
  await saveAccounts((await loadAccounts()).map(a => a.id === account.id ? account : a));
  return account.accessToken;
}

async function findDuplicate(blogId, marker, token) {
  try {
    const data = await bloggerRequest(`/blogs/${encodeURIComponent(blogId)}/posts/search?q=${encodeURIComponent(marker)}&fetchBodies=true`, token);
    return (data.items || []).find(item => typeof item.content === 'string' && item.content.includes(marker)) || null;
  } catch (error) {
    if ([403, 404].includes(error.httpStatus)) return null;
    throw error;
  }
}

async function bloggerRequest(path, token, options = {}) {
  const response = await fetch(`${CONFIG.bloggerBase}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', ...(options.body ? { 'content-type': 'application/json' } : {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw apiError(mapGoogleError(response.status, data), response.status);
  return data;
}

async function googleJson(url, token) {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error('Google profile request failed.');
  return data;
}

function mapGoogleError(status, data) {
  if (status === 401) return 'Blogger authorization expired.';
  if (status === 403) return 'Insufficient Blogger permissions or Blogger API access is disabled.';
  if (status === 404) return 'Blogger blog was not found or access was revoked.';
  if (status === 429) return 'Blogger API rate limit reached; retry later.';
  if (status >= 500) return 'Temporary Google/Blogger API failure.';
  return data?.error?.message || `Blogger API request failed (${status}).`;
}

function publicAccount(a) {
  return { id: a.id, email: a.email, name: a.name, status: a.status, lastAuthorizedAt: a.lastAuthorizedAt, lastError: a.lastError, blogs: a.blogs || [] };
}
function publicAccounts(accounts) { return accounts.map(publicAccount); }
async function loadAccounts() { return (await chrome.storage.local.get(ACCOUNTS_KEY))[ACCOUNTS_KEY] || []; }
async function saveAccounts(accounts) { await chrome.storage.local.set({ [ACCOUNTS_KEY]: accounts }); }
async function loadHistory() { return (await chrome.storage.local.get(HISTORY_KEY))[HISTORY_KEY] || []; }
async function appendHistory(item) { const history = await loadHistory(); history.unshift(item); await chrome.storage.local.set({ [HISTORY_KEY]: history.slice(0, 200) }); }
function result(blog, account, success, status, error, url) { return { accountId: account.id, accountEmail: account.email, blogId: String(blog.id), blogName: blog.name, success, status, error: error || null, url: url || null }; }
function friendlyError(error) { if (error.code === 'AUTH_REQUIRED') return error.message; return error.message || 'Publishing failed.'; }
function authError(message) { const e = new Error(message); e.code = 'AUTH_REQUIRED'; return e; }
function apiError(message, httpStatus) { const e = new Error(message); e.httpStatus = httpStatus; return e; }
function safeError(error) { return String(error?.message || 'Unknown error').slice(0, 500); }
function escapeAttribute(value) { return String(value).replace(/[&<>\"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '\"':'&quot;', "'":'&#39;' }[c])); }
function randomString(length) { const bytes = new Uint8Array(Math.ceil(length * 0.75)); crypto.getRandomValues(bytes); return btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, '').slice(0, length); }
async function sha256(value) { const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)); return [...new Uint8Array(hash)].map(x => x.toString(16).padStart(2, '0')).join(''); }
async function sha256Base64Url(value) { const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)); let binary = ''; for (const b of new Uint8Array(hash)) binary += String.fromCharCode(b); return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, ''); }
async function refreshBadge() { const count = (await loadAccounts()).filter(a => a.status === 'connected').length; await chrome.action.setBadgeText({ text: count ? String(count) : '' }); }
