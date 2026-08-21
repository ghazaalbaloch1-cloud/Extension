# Deployment

## 1. Google Cloud project

Create or use a Google Cloud project and enable **Blogger API v3**.

Create an OAuth 2.0 client with application type **Chrome Extension** for the exact Chrome extension ID declared by `extension/manifest.json`. Put that public client ID in `extension/config.js` before packaging the extension.

The extension requests the Blogger scope:

`https://www.googleapis.com/auth/blogger`

It also requests OpenID/email/profile identity scopes so connected Google accounts can be displayed safely.

> There is no Cloudflare Worker or server-side OAuth service in the current architecture. The extension owns the OAuth flow and Blogger API calls.

## 2. Extension package

Load the `extension/` directory in Chrome at `chrome://extensions` with **Developer mode** enabled, or use the packaged ZIP produced by the GitHub Actions workflow.

Before loading/packaging, replace the placeholder in `extension/config.js` with the real Chrome Extension OAuth client ID. Never commit a client secret, access token, or refresh token.

After loading the extension, open its popup and click **Connect Google account**. Complete Google's authorization. The extension stores account/token data locally in Chrome storage.

## 3. GitHub Pages

In repository settings, enable GitHub Pages using **GitHub Actions** as the source. The included Pages workflow publishes only the `frontend/` static files.

The frontend communicates with the installed extension through `chrome.runtime.sendMessage`. `frontend/config.js` must contain the exact extension ID shown by Chrome.

## 4. First connection

1. Install the extension.
2. Confirm the extension ID matches `frontend/config.js`.
3. Confirm `extension/config.js` contains the real Chrome Extension OAuth client ID.
4. Open the extension popup and connect a Google account.
5. Open the GitHub Pages CMS.
6. Click **Connect Google account** if the extension is not already connected.
7. Confirm the CMS lists the account and its Blogger blogs.
8. Select one or more blogs and publish a test post.

## 5. Testing checklist

- Extension loads without manifest/config errors.
- Google account connection opens successfully.
- One account connects and lists Blogger blogs.
- Multiple Google accounts can be connected independently.
- CMS can discover accounts through the extension bridge.
- One blog publishes successfully.
- Multiple selected blogs receive the same post independently.
- A failed blog produces a per-blog failure while successful blogs remain successful.
- Expired access tokens refresh through the stored refresh token.
- Revoked access is reported as requiring reauthorization.
- Repeating the same blog/slug/chapter is blocked as a duplicate.
- No secret/token appears in frontend source or committed repository files.
