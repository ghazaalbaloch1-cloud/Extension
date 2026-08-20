# Deployment

## 1. Google Cloud project

Create or use a Google Cloud project. Enable **Blogger API v3**. Create an OAuth 2.0 Web application client. Add the exact Worker callback URL as an authorized redirect URI:

`https://YOUR-WORKER-DOMAIN/oauth/google/callback`

The OAuth consent screen must include the Blogger scope:

`https://www.googleapis.com/auth/blogger`

The Worker also requests OpenID/email/profile identity scopes so connected Google accounts can be displayed safely.

## 2. Cloudflare KV

Create one Workers KV namespace for production and one preview namespace. Put their IDs into `worker/wrangler.toml`.

KV is used for sessions, OAuth state, account records, blog mappings, and publication records. Token values are encrypted before storage.

## 3. Worker secrets

From `worker/`, configure:

```bash
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put GOOGLE_REDIRECT_URI
npx wrangler secret put TOKEN_ENCRYPTION_KEY
npx wrangler secret put SESSION_SECRET
npx wrangler secret put CMS_ADMIN_PASSWORD
```

Use a long random value for `TOKEN_ENCRYPTION_KEY` and `SESSION_SECRET`. Never commit them.

## 4. Deploy Worker

```bash
cd worker
npx wrangler deploy
```

The resulting HTTPS Worker URL becomes the API base used by the CMS.

## 5. Configure frontend

Edit `frontend/config.js` and replace:

`https://REPLACE_WITH_WORKER_DOMAIN`

with the deployed Worker URL.

Also set `APP_BASE_URL` to the GitHub Pages URL and `ALLOWED_ORIGIN` to the GitHub Pages origin as Worker secrets/vars.

## 6. GitHub Pages

In the repository settings, enable GitHub Pages using **GitHub Actions** as the source. The included workflow publishes only the `frontend/` static files.

The frontend contains no Google client secret, access token, or refresh token.

## 7. First connection

1. Open the GitHub Pages CMS.
2. Sign in with the server-side CMS administrator password.
3. Click **Connect Google account**.
4. Complete Google's authorization for Blogger.
5. The Worker retrieves the authorized account identity and its Blogger blogs.
6. Select one or more blogs and publish a test post.

## 8. Additional Google accounts

Repeat **Connect Google account** while signed into the CMS. Each Google account is stored independently. The system does not require the blogs to belong to one Google account.

If a Blogger blog changes ownership/admin and the connected account loses access, the system reports that account/blog as requiring reauthorization. It never bypasses Google's permissions.

## 9. Testing checklist

- One account connects and lists blogs.
- One blog publishes successfully.
- Two independent Google accounts can be connected.
- Blogs from both accounts can be selected in one publish operation.
- A failed blog produces a per-blog failure while successful blogs remain successful.
- Expired access tokens refresh through the stored refresh token.
- Revoked refresh tokens move the account to `reauthorization_required`.
- Repeating the same blog/slug/chapter is blocked as a duplicate.
- No secret/token appears in frontend source or server logs.
