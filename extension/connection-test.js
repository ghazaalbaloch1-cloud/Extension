// Lightweight MV3 connection diagnostics.
// Loaded only by the extension popup; it verifies that the service worker is reachable.
(async () => {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'ping' });
    if (!response?.ok) console.error('Extension local ping failed:', response);
  } catch (error) {
    console.error('Extension local ping failed:', error);
  }
})();
