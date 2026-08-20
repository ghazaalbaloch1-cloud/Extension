# Extension — GitHub-only Multi-Blogger Publisher

A central Blogger publishing CMS hosted on GitHub Pages, with a local Chrome extension acting as the secure Google/Blogger access bridge.

## Architecture

```text
GitHub Pages CMS
      ↓ Chrome external messaging
Extension Blogger Access
      ↓ Google OAuth 2.0
Google Account 1 ──→ Blog A / Blog B
Google Account 2 ──→ Blog C
Google Account 3 ──→ Blog D / Blog E
      ↓
Blogger REST API v3
```

The GitHub Pages site never receives or stores Google refresh tokens. The Chrome extension owns OAuth tokens and calls Blogger directly.

## Features

- Multiple independently authorized Google accounts
- Blogger blog discovery per account
- Select multiple blogs across accounts
- One-click multi-blog publishing
- Individual success/failure results
- Reauthorization handling
- Duplicate protection using a deterministic post marker
- Retry support through the extension message API
- Local publication history
- No Cloudflare Worker
- No Firestore
- No paid backend
- No Google OAuth client secret in the repository

## Chrome extension setup

1. Enable the Blogger API in Google Cloud.
2. Create an OAuth 2.0 client of type **Chrome Extension**.
3. First load `extension/` as an unpacked extension in Chrome.
4. Copy the Extension ID shown by `chrome://extensions`.
5. Configure the Chrome Extension OAuth client for that Extension ID.
6. Put the OAuth client ID in `extension/config.js`.
7. Reload the extension.
8. Copy the same Extension ID into `frontend/config.js`.
9. Deploy GitHub Pages using the included Pages workflow.
10. Open the live CMS and click **Connect Google account**.

Google's Chrome extension guidance recommends the Chrome Identity API for extension OAuth, and Google's OAuth documentation identifies Chrome Extension as the appropriate client type for Chrome extensions. The implementation uses Chrome's identity authorization flow and PKCE-style state/challenge protection where the extension handles the browser OAuth exchange.

## Install locally

```powershell
# GitHub CLI
 gh repo clone ghazaalbaloch1-cloud/Extension
 cd Extension
 explorer .\extension
```

Then Chrome → `chrome://extensions` → **Developer mode** → **Load unpacked** → select the `extension` folder.

## Security

- Never commit Google client secrets.
- Never put access/refresh tokens in GitHub Pages files.
- The extension stores its account authorization state in Chrome extension storage.
- The CMS is allowlisted in `externally_connectable` so arbitrary websites cannot call the extension.
- Blogger API requests use the OAuth scope `https://www.googleapis.com/auth/blogger`.

## Important limitation

This is intentionally an operator-controlled GitHub + Chrome architecture. The Chrome extension must be installed and running for publishing. If the extension is removed, the GitHub Pages CMS cannot access Blogger. Fully server-side/background publishing without the browser present requires a server-side OAuth backend.
