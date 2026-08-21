# Extension — GitHub-only Multi-Blogger Publisher

A central Blogger publishing CMS hosted on GitHub Pages, with a local Chrome extension acting as the Google/Blogger access bridge.

## Architecture

```text
GitHub Pages CMS
      ↓ Chrome external messaging
Extension Blogger Access (MV3)
      ↓ Google OAuth 2.0
Google Account 1 ──→ Blog A / Blog B
Google Account 2 ──→ Blog C
Google Account 3 ──→ Blog D / Blog E
      ↓
Blogger REST API v3

PC chapter images
      ↓
GitHub Contents API
      ↓
public /media URLs
      ↓
Blogger post HTML
```

The GitHub Pages site never receives or stores Google refresh tokens. The Chrome extension owns Google OAuth tokens and calls Blogger directly.

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
- PC chapter image upload to a public GitHub media folder
- Existing public image URLs are also supported
- No Cloudflare Worker
- No Firestore
- No paid backend
- No Google OAuth client secret in the repository

## Chrome extension setup

1. Enable the Blogger API in Google Cloud.
2. Create an OAuth 2.0 client of type **Chrome Extension**.
3. Load `extension/` as an unpacked extension in Chrome.
4. Copy the Extension ID shown by `chrome://extensions`.
5. Configure the OAuth client for that exact Extension ID.
6. Put the OAuth client ID in `extension/config.js`.
7. Reload the extension.
8. Make sure `frontend/config.js` contains the same extension ID.
9. Deploy GitHub Pages using the included Pages workflow.
10. Open the live CMS and click **Check extension connection**.
11. Click **Connect Google account** and authorize Blogger access.
12. The CMS will show the blogs discovered for every connected Google account.

The extension popup now shows the installed Extension ID, MV3 worker status, OAuth configuration status, connected accounts, and blog counts.

## PC image hosting setup

The CMS can upload local chapter images to GitHub before publishing the Blogger post.

Create a **fine-grained GitHub personal access token** restricted to the media repository with:

- Repository access: only the selected media repository (the default setup uses `ghazaalbaloch1-cloud/Extension`)
- Repository permissions: **Contents → Read and write**

Enter the token in the **PC image hosting** panel in the CMS. The token is stored only in the current browser's localStorage and is never committed to the repository.

The uploader creates files under `media/` and uses public `raw.githubusercontent.com` URLs in the Blogger HTML. Uploads are sequential so multiple writes do not race the GitHub Contents API.

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
- Never put Google access/refresh tokens in GitHub Pages files.
- The extension stores its account authorization state in Chrome extension storage.
- The CMS is allowlisted in `externally_connectable` so arbitrary websites cannot call the extension.
- The extension validates the sender origin before processing requests.
- The GitHub media token should be a fine-grained repository-scoped token with only Contents write access.
- Blogger API requests use the OAuth scope `https://www.googleapis.com/auth/blogger`.

## Validation

Every push runs `extension-check.yml`, which validates the extension manifest and syntax-checks the MV3 worker, OAuth config, Blogger background runtime, popup, and CMS JavaScript.

## Important limitation

This remains an operator-controlled GitHub + Chrome architecture. The Chrome extension must be installed and running for Blogger publishing. Fully server-side/background publishing without the browser present would require a server-side OAuth backend.
