// MV3 bootstrap: load public OAuth configuration before the existing worker.
// The existing background.js contains the Blogger/OAuth runtime.
importScripts('config.js', 'background.js');
