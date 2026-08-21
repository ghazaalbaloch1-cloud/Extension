// MV3 bootstrap for the Blogger Access bridge.
// Keep OAuth config loaded before the existing Blogger runtime.
// Register the external bridge receiver first so the CMS can always reach the worker.
importScripts('config.js');

function isAllowedSender(sender) {
  const url = sender?.url || '';
  return /^https:\/\/ghazaalbaloch1-cloud\.github\.io\//.test(url) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(url);
}

chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  if (!isAllowedSender(sender)) {
    sendResponse({ ok: false, error: 'Unauthorized CMS origin', senderUrl: sender?.url || '' });
    return false;
  }

  // CMS connection test uses bridge_ping. Handle it directly before loading background.js.
  if (message?.type === 'bridge_ping') {
    sendResponse({
      ok: true,
      installed: true,
      extensionId: chrome.runtime.id,
      version: chrome.runtime.getManifest().version,
      senderAllowed: true
    });
    return false;
  }

  // All normal Blogger/OAuth requests are handled by background.js below.
  if (message?.type === 'bridge_diagnostics') {
    sendResponse({ ok: true, installed: true, extensionId: chrome.runtime.id, version: chrome.runtime.getManifest().version });
    return false;
  }

  return false;
});

try {
  importScripts('background.js');
} catch (error) {
  console.error('[Extension] background runtime failed to load:', error);
  chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
    if (!isAllowedSender(sender)) {
      sendResponse({ ok: false, error: 'Unauthorized CMS origin' });
      return false;
    }
    if (message?.type === 'bridge_diagnostics') {
      sendResponse({
        ok: false,
        installed: true,
        extensionId: chrome.runtime.id,
        error: String(error?.message || error || 'background.js failed to load')
      });
      return false;
    }
    return false;
  });
}
