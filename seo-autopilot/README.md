# WordPress SEO Autopilot

A browser-based autonomous SEO publishing workspace added alongside the existing Blogger extension/CMS. Existing Blogger files are preserved.

## Pipeline

1. Accept keyword, niche/context, article type and target length.
2. Query an optional search API for live SERP results.
3. Ask an AI model to analyze intent, entities, questions and competitor content gaps without fabricating evidence.
4. Generate an original article from the research strategy rather than rewriting competitor pages.
5. Generate WordPress-ready semantic HTML, title, slug, excerpt and meta description.
6. Run a local on-page SEO scorecard.
7. Publish through the WordPress REST API using a WordPress Application Password.

## Configuration

The UI supports OpenAI-compatible chat-completions endpoints. It can work with any provider that accepts the same request shape. Search is provider-neutral: configure an endpoint that accepts `q` and returns `results`, `organic`, or `items`.

No API keys are committed to GitHub. Values entered in the UI are stored in browser localStorage on the current device.

## Important architecture note

The current MVP is client-side. It can research/generate/publish while the page is open. True unattended scheduling, retries, ranking monitoring and background publishing should be implemented in a server-side worker/queue later; putting long-lived secrets in a public GitHub Pages site would be unsafe.

## GitHub Pages

The Pages workflow now copies this directory to `/seo-autopilot/` while continuing to deploy the existing Blogger CMS unchanged.
