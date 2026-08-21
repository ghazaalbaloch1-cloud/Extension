// Public Google OAuth configuration for the Chrome Extension.
// This must be the OAuth 2.0 client ID created in Google Cloud with
// application type "Chrome Extension" for this exact extension ID.
// Never put a Google client secret in this file.
//
// Use `var` because this file is loaded by importScripts() into the MV3
// service-worker global scope before background.js is evaluated.
var EXTENSION_GOOGLE_CLIENT_ID = 'REPLACE_WITH_CHROME_EXTENSION_CLIENT_ID.apps.googleusercontent.com';
