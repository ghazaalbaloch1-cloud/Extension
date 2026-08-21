// MV3 bootstrap for the Blogger Access bridge.
// This file is intentionally the first and most reliable external-message receiver.
// OAuth/Blogger runtime remains in background.js and is loaded after the bootstrap.

importScripts('config.js');

const ACCOUNTS_KEY = 'blogger_accounts_v1';

function isAllowedSender(sender) {
  const url = sender?.url || '';
  return /^https:\/\/ghazaalbaloch1-cloud\.github\.io\//.test(url) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(url) || /^file:\/\//.test(url);
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
  const data = await chrome.storage.local.get(ACCOUNTS_KEY);
  const accounts = Array.isArray(data[ACCOUNTS_KEY]) ? data[ACCOUNTS_KEY] : [];
  return accounts.map(publicAccount);
}

// Register the bridge before loading the large Blogger runtime.
// The CMS currently starts by asking for "accounts". Handling that request here
// prevents a failed/slow background bootstrap from producing "Receiving end does not exist".
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
  // The bootstrap receiver above intentionally remains alive so the CMS can
  // report a useful connection state instead of Chrome's generic receiver error.
}
