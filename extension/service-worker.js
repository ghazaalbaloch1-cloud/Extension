// MV3 bootstrap for the Blogger Access bridge.
// This file is intentionally the first external-message receiver.
// The full Blogger/OAuth runtime remains in background.js.

importScripts('config.js');

// IMPORTANT: use a unique global name here. background.js declares ACCOUNTS_KEY,
// so declaring the same const in this service-worker scope would make
// importScripts('background.js') fail with "Identifier 'ACCOUNTS_KEY' has already been declared".
const BOOTSTRAP_ACCOUNTS_KEY = 'blogger_accounts_v1';

function isAllowedSender(sender) {
  const url = sender?.url || '';
  return /^https:\/\/ghazaalbaloch1-cloud\.github\.io\//.test(url)
    || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(url)
    || /^file:\/\//.test(url);
}

function publicAccount(account = {}) {
  return {
    id: account.id,
    email: account.email,
    name: account.name,
    status: account.status,
    lastAuthorizedAt: account.lastAuthorizedAt,
    lastError: account.lastError,
    blogs: Array.isArray(account.blogs) ? account.blogs : []
  };
}

async function connectionSnapshot() {
  const data = await chrome.storage.local.get(BOOTSTRAP_ACCOUNTS_KEY);
  const accounts = Array.isArray(data[BOOTSTRAP_ACCOUNTS_KEY]) ? data[BOOTSTRAP_ACCOUNTS_KEY] : [];
  return accounts.map(publicAccount);
}

// Register the external bridge before loading the larger Blogger runtime.
chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  if (!isAllowedSender(sender)) {
    sendResponse({ ok: false, error: 'Unauthorized CMS origin' });
    return false;
  }

  if (message?.type === 'bridge_ping' || message?.type === 'ping') {
    sendResponse({
      ok: true,
      installed: true,
      extensionId: chrome.runtime.id,
      version: chrome.runtime.getManifest().version,
      senderAllowed: true
    });
    return false;
  }

  // The CMS asks for accounts immediately after loading.
  // Answer this from the bootstrap itself so connection testing does not depend
  // on background.js completing its initialization.
  if (message?.type === 'accounts') {
    connectionSnapshot()
      .then(accounts => sendResponse({ ok: true, accounts }))
      .catch(error => sendResponse({ ok: false, error: String(error?.message || error) }));
    return true;
  }

  if (message?.type === 'bridge_diagnostics') {
    sendResponse({
      ok: true,
      installed: true,
      extensionId: chrome.runtime.id,
      version: chrome.runtime.getManifest().version
    });
    return false;
  }

  // connect/disconnect/publish/history/etc. are handled by background.js.
  return false;
});

try {
  importScripts('background.js');
  console.info('[Extension] Blogger background runtime loaded.');
} catch (error) {
  console.error('[Extension] Blogger background runtime failed to load:', error);
}
