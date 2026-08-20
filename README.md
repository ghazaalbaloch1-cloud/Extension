# Extension — GitHub-only Multi-Blogger Publisher

Static GitHub Pages CMS for publishing one post to multiple Blogger blogs across independently authorized Google accounts.

## GitHub-only architecture

- GitHub Pages hosts the complete CMS.
- Google Identity Services obtains short-lived Blogger OAuth access tokens in the browser.
- The browser calls the Blogger REST API directly with `https://www.googleapis.com/auth/blogger`.
- No Cloudflare Worker, server, database, or Google OAuth client secret is required.

## Security

Only the OAuth client ID is configured in the frontend. Never commit a Google client secret, refresh token, service-account credential, or access token. This design intentionally does not request offline refresh tokens; access tokens are temporary and may require reconnecting an account after expiry.

## Setup

1. Create a Google Cloud OAuth 2.0 **Web application** client.
2. Add the exact GitHub Pages origin to Authorized JavaScript origins.
3. Enable the Blogger API in that Google Cloud project.
4. Open the live Pages site and enter the OAuth client ID.
5. Connect each Google account separately.
6. Select blogs and publish.

## Important limitation

GitHub Pages is static hosting, so it cannot securely store refresh tokens or operate a private OAuth callback server. Therefore this GitHub-only version uses browser access tokens. It is appropriate for an operator-controlled publishing console. Persistent background publishing would require a server-side OAuth backend.
