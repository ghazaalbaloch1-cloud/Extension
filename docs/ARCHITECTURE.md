# Extension architecture

## Runtime

```text
GitHub Pages CMS
      |
      | HTTPS + secure session cookie
      v
Cloudflare Worker API
      |
      +--> Google OAuth 2.0
      |
      +--> Blogger API v3
      |
      +--> Cloudflare KV
              |
              +-- CMS sessions / OAuth state
              +-- independently authorized Google accounts
              +-- discovered Blogger blogs
              +-- per-blog publication records
```

## Account model

A CMS user is separate from a Google publishing account. The current bootstrap CMS user is authenticated by a server-side password and receives a short-lived session. Google publishing accounts are identified by Google's stable `sub` claim and each account owns its own encrypted OAuth token set and Blogger blog list.

A blog is stored as a child of the Google account that authorized access to it. There is no global Google account assumption and no hardcoded five-account limit.

## OAuth

The Worker performs the OAuth authorization-code flow. It requests the Blogger management scope plus `openid`, `email`, and `profile` so the connected account can be identified. Offline access is requested so the server can refresh expired access tokens. OAuth state is random, short-lived, and stored server-side.

Refresh tokens and access tokens are encrypted with AES-GCM before being written to KV. Client secrets are Worker secrets and never enter the frontend.

## Publishing

Each selected blog is resolved to its authorized Google account. Publishing is performed independently for every blog. One failure does not roll back successful publications on other blogs.

The publisher uses Blogger REST API v3 `posts.insert` for publishing. Duplicate protection uses two layers:

1. A server-side publication record keyed by blog ID + slug + chapter.
2. A Blogger-generated unique label (`ext-<hash>`) attached to the post and checked through Blogger's posts list API before inserting.

Blogger controls the final URL structure/date path; the CMS treats the supplied slug as the logical identifier rather than falsely claiming it can force every part of the Blogger URL.

## Storage

Cloudflare KV is intentionally used instead of Firestore or a traditional database. Token values are encrypted before storage. Logs never contain access tokens, refresh tokens, client secrets, or cookies.

## Failure isolation

Results are returned per blog:

- `success`
- `duplicate`
- `failed`
- `reauthorization_required`

Authorization failures affect only the account/blog that encountered them. Other selected blogs continue independently.
