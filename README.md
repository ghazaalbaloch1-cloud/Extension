# Extension — Multi-Blogger Central Publisher

A production-oriented central CMS for publishing one logical post to multiple Blogger blogs, including blogs authorized through different Google accounts.

## Current implementation

- GitHub Pages-compatible central CMS
- Cloudflare Worker API
- Google OAuth 2.0 authorization-code flow
- Independent Google publishing accounts
- Blogger API v3 REST publishing
- Automatic access-token refresh using encrypted refresh tokens
- Per-account Blogger blog discovery
- Multi-blog publishing with isolated results
- Duplicate protection using server records plus Blogger labels
- Reauthorization state for revoked/expired Google access
- Server-side session authentication for the CMS
- Encrypted token storage using AES-GCM before Cloudflare KV persistence
- GitHub Pages deployment workflow
- Server-side publication history and useful error statuses

## Architecture

```text
GitHub Pages CMS
      ↓
Cloudflare Worker API
      ↓
Google OAuth / encrypted account storage
      ↓
Blogger REST API v3
      ↓
Blog A + Blog B + Blog C + ...
```

The number of connected Google accounts is not hardcoded to five.

## Important security rule

Never put OAuth client secrets, refresh tokens, access tokens, encryption keys, or administrator secrets in frontend files or GitHub commits. Configure them as Cloudflare Worker secrets.

## Documentation

- `docs/ARCHITECTURE.md` — system/data/publishing architecture
- `docs/DEPLOYMENT.md` — Google, Cloudflare, GitHub Pages, and first-account setup
- `worker/wrangler.toml` — Worker configuration
- `frontend/` — central CMS

## Blogger behavior

The Blogger REST API is used directly. The CMS treats the supplied slug as the logical publication identifier; Blogger remains responsible for its final URL/date path behavior.

Each selected blog is processed independently. A failed authorization/API request on one blog does not mark successful publications on other blogs as failed.
