# Extension architecture

## Current runtime

```text
GitHub Pages CMS
      |
      | chrome.runtime.sendMessage
      v
Chrome Extension (MV3 service worker)
      |
      +--> Google OAuth 2.0
      |
      +--> Blogger API v3
      |
      +--> chrome.storage.local
      |       +-- authorized Google accounts
      |       +-- access/refresh tokens
      |       +-- discovered Blogger blogs
      |       +-- publication history
      |
      +--> GitHub Contents API (CMS media uploader)
              |
              +-- public chapter images under /media
```

## Security boundaries

- Google OAuth tokens are kept in the Chrome extension's local storage and are never sent to the GitHub Pages CMS.
- The CMS communicates with the extension only through `externally_connectable` origins listed in `extension/manifest.json`.
- The extension validates the sender origin before handling external messages.
- The Google OAuth client ID is public configuration. No Google client secret belongs in the repository.
- GitHub image hosting uses a user-supplied fine-grained GitHub token. The token is stored only in the current browser's localStorage and should be restricted to the media repository with `Contents: read and write`.

## Account model

A CMS user can connect multiple Google accounts. Each account is identified by Google's stable `sub` claim and owns its own authorization state and Blogger blog list. There is no hardcoded five-account limit.

A Blogger blog is always published through the Google account that authorized that blog. One failed target does not roll back successful targets.

## OAuth

The extension performs the Google OAuth authorization-code flow using PKCE. `extension/service-worker.js` loads the public `extension/config.js` before the existing `background.js` runtime starts. The client ID must be created in Google Cloud as a Chrome Extension OAuth client for the exact extension ID.

## Publishing

Each selected blog is handled independently through Blogger REST API v3 `posts.insert`. Duplicate protection uses a deterministic marker derived from blog ID, slug, and chapter number. A retry rechecks the target before creating another post.

Blogger controls the final public URL structure. The CMS treats the supplied slug as the logical publication identifier rather than pretending it can force every part of a Blogger URL.

## Images

Blogger's `posts.insert` accepts HTML content but does not provide a separate simple chapter-image storage workflow. The CMS therefore uploads local PC images to a public GitHub repository through the GitHub Contents API and places the resulting raw GitHub URLs in the Blogger HTML. Existing public image URLs can still be used directly.

Uploads are performed sequentially to avoid conflicting updates to the same repository contents endpoint.

## Failure isolation

Results are returned per blog:

- `success`
- `duplicate`
- `failed`
- `reauthorization_required`

Authorization failures affect only the account/blog that encountered them. Other selected blogs continue independently.
