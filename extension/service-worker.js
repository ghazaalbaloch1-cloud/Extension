// MV3 bootstrap for the Blogger Access bridge.
// Keep the OAuth client ID in config.js and load the existing runtime afterward.
// A local ping handler is registered first so the CMS can always distinguish
// an installed worker from a worker that failed while loading the Blogger runtime.
importScripts('config.js');

chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'bridge_ping') return;
  const url = sender?.url || '';
  const allowed = /^https:\/\/ghazaalbaloch1-cloud\.github\.io\//.test(url) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(url);
  sendResponse({
    ok: allowed,
    installed: true,
    extensionId: chrome.runtime.id,
    version: chrome.runtime.getManifest().version,
    senderAllowed: allowed
  });
});

try {
  importScripts('background.js');
} catch (error) {
  console.error('[Extension] background runtime failed to load:', error);
  chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
    if (message?.type === 'bridge_diagnostics') {
      sendResponse({
        ok: false,
        installed: true,
        extensionId: chrome.runtime.id,
        error: String(error?.message || error || 'background.js failed to load')
      });
    }
  });
}
