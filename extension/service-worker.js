// AZAD Blogger Access Bridge — MV3 bootstrap
importScripts('config.js');

const BOOTSTRAP_ACCOUNTS_KEY = 'blogger_accounts_v1';
const EXTENSION_VERSION = '1.0.3';

function isAllowedSender(sender) {
  const url = sender?.url || '';
  return /^https:\/\/ghazaalbaloch1-cloud\.github\.io\//.test(url) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(url) || /^file:\/\//.test(url);
}

async function getAccounts() {
  const data = await chrome.storage.local.get(BOOTSTRAP_ACCOUNTS_KEY);
  return Array.isArray(data[BOOTSTRAP_ACCOUNTS_KEY]) ? data[BOOTSTRAP_ACCOUNTS_KEY] : [];
}

function publicAccount(account = {}) {
  return { id: account.id, email: account.email, name: account.name, status: account.status, lastAuthorizedAt: account.lastAuthorizedAt, lastError: account.lastError, blogs: Array.isArray(account.blogs) ? account.blogs : [] };
}

chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  if (!isAllowedSender(sender)) {
    sendResponse({ ok: false, error: 'Unauthorized CMS origin' });
    return false;
  }
  console.info('[AZAD Bridge] External message:', message?.type, 'from:', sender?.url);
  if (message?.type === 'ping' || message?.type === 'bridge_ping') {
    sendResponse({ ok: true, installed: true, extensionId: chrome.runtime.id, version: EXTENSION_VERSION, senderAllowed: true });
    return false;
  }
  if (message?.type === 'accounts') {
    getAccounts().then(accounts => sendResponse({ ok: true, accounts: accounts.map(publicAccount) })).catch(error => sendResponse({ ok: false, error: String(error?.message || error) }));
    return true;
  }
  if (message?.type === 'bridge_diagnostics') {
    sendResponse({ ok: true, installed: true, extensionId: chrome.runtime.id, version: EXTENSION_VERSION, senderUrl: sender?.url || '' });
    return false;
  }
  sendResponse({ ok: false, error: `Blogger runtime request received: ${String(message?.type || 'unknown')}`, extensionId: chrome.runtime.id });
  return false;
});

console.info('[AZAD Bridge] MV3 service worker started:', chrome.runtime.id);
