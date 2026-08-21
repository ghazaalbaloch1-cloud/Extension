/*
 * Production fixes that sit beside the original CMS UI logic.
 *
 * Responsibilities:
 *  - render Blogger blog checkboxes (the original page was missing #blogList)
 *  - provide a browser-local GitHub media uploader for PC chapter images
 *  - publish the generated post through the Chrome extension
 *
 * The GitHub token is never committed to the repository. It is stored only in
 * this browser's localStorage and should be a fine-grained token restricted to
 * this repository with Contents: write.
 */
(() => {
  'use strict';

  const EXTENSION_ID = window.BLOGGER_EXTENSION_ID || '';
  const MEDIA_SETTINGS_KEY = 'extension_github_media_v1';
  const SETTINGS_KEY = 'extension_cms_settings_v2';

  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const esc = (v = '') => String(v).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));

  function extensionSend(type, payload = {}) {
    return new Promise((resolve, reject) => {
      if (!EXTENSION_ID) return reject(new Error('Extension ID is not configured.'));
      if (!window.chrome?.runtime?.sendMessage) return reject(new Error('Chrome extension messaging is unavailable. Open the CMS in Chrome.'));
      chrome.runtime.sendMessage(EXTENSION_ID, { type, ...payload }, response => {
        const runtimeError = chrome.runtime.lastError;
        if (runtimeError) return reject(new Error(runtimeError.message || 'Extension is not reachable.'));
        if (!response?.ok) return reject(new Error(response?.error || 'Extension request failed.'));
        resolve(response);
      });
    });
  }

  function getMediaSettings() {
    try { return JSON.parse(localStorage.getItem(MEDIA_SETTINGS_KEY) || '{}'); } catch { return {}; }
  }

  function saveMediaSettings() {
    const settings = {
      token: $('#githubMediaToken')?.value.trim() || '',
      owner: $('#githubMediaOwner')?.value.trim() || 'ghazaalbaloch1-cloud',
      repo: $('#githubMediaRepo')?.value.trim() || 'Extension',
      branch: $('#githubMediaBranch')?.value.trim() || 'main',
      folder: ($('#githubMediaFolder')?.value.trim() || 'media').replace(/^\/+|\/+$/g, '')
    };
    localStorage.setItem(MEDIA_SETTINGS_KEY, JSON.stringify(settings));
    const state = $('#githubMediaState');
    if (state) state.textContent = 'Saved in this browser.';
    return settings;
  }

  function mediaCard() {
    if ($('#githubMediaCard')) return;
    const anchor = $('.setup-card') || $('#app')?.firstElementChild;
    if (!anchor) return;
    const s = getMediaSettings();
    const card = document.createElement('section');
    card.className = 'card setup-card';
    card.id = 'githubMediaCard';
    card.innerHTML = `
      <h2>PC image hosting</h2>
      <p class="muted">Chapter images selected from your PC are uploaded to a public GitHub repository before Blogger publishing. The token stays only in this browser.</p>
      <div class="grid">
        <label>GitHub owner<input id="githubMediaOwner" value="${esc(s.owner || 'ghazaalbaloch1-cloud')}" autocomplete="off"></label>
        <label>Repository<input id="githubMediaRepo" value="${esc(s.repo || 'Extension')}" autocomplete="off"></label>
      </div>
      <div class="grid">
        <label>Branch<input id="githubMediaBranch" value="${esc(s.branch || 'main')}" autocomplete="off"></label>
        <label>Media folder<input id="githubMediaFolder" value="${esc(s.folder || 'media')}" autocomplete="off"></label>
      </div>
      <label>Fine-grained GitHub token<input id="githubMediaToken" type="password" value="${esc(s.token || '')}" autocomplete="off" placeholder="github_pat_..."></label>
      <div class="actions"><button type="button" id="saveGithubMedia" class="ghost">Save image settings</button><span id="githubMediaState" class="muted"></span></div>
      <p class="muted">Use a fine-grained token limited to this repository with <strong>Contents: Read and write</strong>. Do not paste a token into GitHub files or share it.</p>`;
    anchor.parentNode.insertBefore(card, anchor.nextSibling);
    $('#saveGithubMedia').onclick = saveMediaSettings;
  }

  function ensureBlogContainer() {
    if ($('#fixedBlogList')) return $('#fixedBlogList');
    const accountCard = $('#accountList')?.closest('.card');
    if (!accountCard) return null;
    const section = document.createElement('div');
    section.className = 'card nested';
    section.id = 'fixedBlogList';
    section.innerHTML = '<h3>Select Blogger blogs</h3><div id="fixedBlogRows"><p class="muted">Checking Blogger accounts…</p></div>';
    accountCard.parentNode.insertBefore(section, accountCard.nextSibling);
    return section;
  }

  let fixedAccounts = [];

  async function renderFixedAccounts() {
    const root = $('#fixedBlogRows');
    if (!root) return;
    try {
      const data = await extensionSend('accounts');
      fixedAccounts = data.accounts || [];
      root.innerHTML = '';
      let count = 0;
      for (const account of fixedAccounts) {
        const heading = document.createElement('div');
        heading.className = 'account';
        heading.innerHTML = `<strong>${esc(account.email || 'Google account')}</strong> <span class="status">${esc(account.status || 'connected')}</span>`;
        root.appendChild(heading);
        for (const blog of account.blogs || []) {
          count += 1;
          const row = document.createElement('label');
          row.className = 'blog';
          row.innerHTML = `<input type="checkbox" name="fixedBlogTarget" data-account="${esc(account.id)}" data-blog="${esc(blog.id)}"><span><strong>${esc(blog.name)}</strong><br><small>${esc(blog.url || '')}</small></span>`;
          root.appendChild(row);
        }
      }
      if (!count) root.insertAdjacentHTML('beforeend', '<p class="muted">No Blogger blogs found. Connect a Google account from the button above, then refresh.</p>');
    } catch (error) {
      root.innerHTML = `<p class="error">${esc(error.message)}</p>`;
    }
  }

  function readForm() {
    const form = $('#publishForm');
    const f = new FormData(form);
    return {
      seriesName: String(f.get('seriesName') || '').trim(),
      title: String(f.get('title') || '').trim(),
      chapterNumber: String(f.get('chapterNumber') || '').trim(),
      slug: String(f.get('slug') || '').trim(),
      featuredImage: String(f.get('featuredImage') || '').trim(),
      labels: String(f.get('labels') || '').split(',').map(x => x.trim()).filter(Boolean),
      fullChapterText: String(f.get('fullChapterText') || '完全なチャプターを読む').trim(),
      fullChapterUrl: String(f.get('fullChapterUrl') || '').trim()
    };
  }

  function generatorSettings() {
    try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'); } catch { return {}; }
  }

  function buttonHtml(p) {
    if (!p.fullChapterUrl) return '';
    return `<p style="text-align:center;margin:20px 0"><a href="${esc(p.fullChapterUrl)}" target="_blank" rel="noopener">${esc(p.fullChapterText || '完全なチャプターを読む')}</a></p>`;
  }

  function openingText(p, end = false) {
    const tone = generatorSettings().contentTone || 'standard';
    if (end) return `<div class="chapter-copy"><h3>End of Chapter ${esc(p.chapterNumber)}</h3><p>You have reached the end of this chapter of ${esc(p.seriesName)}. Thanks for reading, and use the button below to continue to the complete chapter page.</p></div>`;
    if (tone === 'short') return `<div class="chapter-copy"><h3>${esc(p.seriesName)} — Chapter ${esc(p.chapterNumber)}</h3><p>Read the latest chapter below in page order.</p></div>`;
    if (tone === 'detailed') return `<div class="chapter-copy"><h3>${esc(p.seriesName)} — Chapter ${esc(p.chapterNumber)}</h3><p>Welcome to the latest chapter of ${esc(p.seriesName)}. This chapter is arranged in a clean page-by-page layout for comfortable reading on desktop and mobile.</p><p>Continue below to read Chapter ${esc(p.chapterNumber)}, and use the full-chapter button whenever you want to open the complete reading page.</p></div>`;
    return `<div class="chapter-copy"><h3>${esc(p.seriesName)} — Chapter ${esc(p.chapterNumber)}</h3><p>Welcome to the latest chapter of ${esc(p.seriesName)}. Read Chapter ${esc(p.chapterNumber)} below in order and enjoy the complete page-by-page experience.</p></div>`;
  }

  function buildHtml(p, images) {
    const s = generatorSettings();
    const target = Math.max(0, Math.min(Number(s.adCount) || 8, Math.floor(images.length / 2.5)));
    const slots = new Set();
    for (let i = 1; i <= target; i++) slots.add(Math.max(1, Math.min(images.length - 1, Math.round(i * images.length / (target + 1)))));
    let html = `<article class="extension-chapter" style="background:#0b1220;color:#e8eefc;padding:20px;border-radius:14px;line-height:1.6;font-family:Arial,sans-serif">${buttonHtml(p)}${openingText(p)}`;
    images.forEach((url, i) => {
      const image = `<img src="${esc(url)}" alt="${esc(p.seriesName)} Chapter ${esc(p.chapterNumber)} Page ${i + 1}" loading="lazy" style="display:block;max-width:100%;height:auto;margin:14px auto">`;
      html += `<p style="text-align:center">${image}</p>`;
      if (slots.has(i + 1) && s.adHtml) html += `<div class="chapter-ad" style="text-align:center;margin:18px auto">${s.adHtml}</div>`;
    });
    return html + `${openingText(p, true)}${buttonHtml(p)}</article>`;
  }

  function fileForRow(name) {
    const files = [...($('#imageFiles')?.files || [])];
    return files.find(f => f.name === name) || files.find(f => f.name.toLowerCase() === String(name).toLowerCase()) || null;
  }

  function orderedLocalFiles() {
    const rows = $$('.local-image-row');
    const ordered = [];
    for (const row of rows) {
      const name = row.querySelector('small')?.textContent || '';
      const file = fileForRow(name);
      if (file) ordered.push(file);
    }
    if (ordered.length) return ordered;
    return [...($('#imageFiles')?.files || [])];
  }

  function toBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
      reader.onload = () => {
        const value = String(reader.result || '');
        const comma = value.indexOf(',');
        if (comma < 0) return reject(new Error(`Could not encode ${file.name}.`));
        resolve(value.slice(comma + 1));
      };
      reader.readAsDataURL(file);
    });
  }

  async function githubFileSha(settings, path) {
    const url = `https://api.github.com/repos/${encodeURIComponent(settings.owner)}/${encodeURIComponent(settings.repo)}/contents/${path.split('/').map(encodeURIComponent).join('/')}`;
    const response = await fetch(`${url}?ref=${encodeURIComponent(settings.branch)}`, {
      headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${settings.token}`, 'X-GitHub-Api-Version': '2026-03-10' }
    });
    if (response.status === 404) return null;
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || `GitHub lookup failed (${response.status}).`);
    return data.sha || null;
  }

  async function uploadFile(file, index, total, post) {
    const settings = getMediaSettings();
    if (!settings.token) throw new Error('Configure the GitHub image-hosting token first.');
    if (!settings.owner || !settings.repo) throw new Error('GitHub image-hosting owner and repository are required.');
    const safeName = file.name.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/-+/g, '-');
    const stem = `${post.slug || 'chapter'}-${post.chapterNumber || 'page'}-${String(index + 1).padStart(3, '0')}`;
    const path = `${settings.folder || 'media'}/${stem}-${safeName}`;
    const content = await toBase64(file);
    const sha = await githubFileSha(settings, path);
    const response = await fetch(`https://api.github.com/repos/${encodeURIComponent(settings.owner)}/${encodeURIComponent(settings.repo)}/contents/${path.split('/').map(encodeURIComponent).join('/')}`, {
      method: 'PUT',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${settings.token}`,
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2026-03-10'
      },
      body: JSON.stringify({
        message: `media: upload ${post.slug || 'chapter'} page ${index + 1}`,
        content,
        branch: settings.branch,
        ...(sha ? { sha } : {})
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || `GitHub upload failed for ${file.name} (${response.status}).`);
    const status = $('#publishState');
    if (status) status.textContent = `Uploading image ${index + 1}/${total}: ${file.name}`;
    return `https://raw.githubusercontent.com/${settings.owner}/${settings.repo}/${encodeURIComponent(settings.branch)}/${path.split('/').map(encodeURIComponent).join('/')}`;
  }

  function selectedTargets() {
    return $$('input[name="fixedBlogTarget"]:checked').map(x => ({ accountId: x.dataset.account, blogId: x.dataset.blog }));
  }

  function renderOwnResults(results) {
    const card = $('#resultsCard');
    const root = $('#resultList');
    if (!card || !root) return;
    card.hidden = false;
    root.innerHTML = results.map(r => `<div class="result"><div class="result-grid"><div><strong>${esc(r.blogName || r.blogId || '')}</strong><br><span class="${r.success ? 'success' : r.status === 'duplicate' ? 'warning' : 'failed'}">${esc(r.status || 'failed')}</span></div>${r.url ? `<a class="url" href="${esc(r.url)}" target="_blank" rel="noopener">Open post</a>` : ''}</div><small>${esc(r.error || '')}</small></div>`).join('');
  }

  async function publishFixed(event) {
    event.preventDefault();
    event.stopImmediatePropagation();
    const state = $('#publishState');
    const p = readForm();
    const targets = selectedTargets();
    if (!p.seriesName || !p.chapterNumber || !p.title || !p.slug) return state.textContent = 'Series name, chapter number, title and slug are required.';
    if (!targets.length) return state.textContent = 'Select at least one Blogger blog.';
    if (p.fullChapterUrl && !/^https?:\/\//i.test(p.fullChapterUrl)) return state.textContent = 'Full chapter URL must start with http:// or https://';

    const localFiles = orderedLocalFiles();
    const urlImages = $$('.image-row:not(.local-image-row)').map(row => row.querySelector('.image-url')?.value.trim()).filter(Boolean);
    const images = [];
    try {
      if (localFiles.length) {
        for (let i = 0; i < localFiles.length; i++) images.push(await uploadFile(localFiles[i], i, localFiles.length, p));
      }
      images.push(...urlImages);
      if (!images.length && p.featuredImage) images.push(p.featuredImage);
      if (!images.length) throw new Error('Select at least one chapter image or provide a featured image URL.');
      state.textContent = `Publishing to ${targets.length} blog(s)…`;
      const post = { ...p, images, content: buildHtml(p, images) };
      const data = await extensionSend('publish', { targets, post });
      renderOwnResults(data.results || []);
      state.textContent = 'Done. Each blog was handled independently.';
    } catch (error) {
      state.textContent = error.message || 'Publishing failed.';
    }
  }

  function install() {
    mediaCard();
    ensureBlogContainer();
    renderFixedAccounts();
    $('#testBridge')?.addEventListener('click', () => setTimeout(renderFixedAccounts, 250));
    $('#connectGoogle')?.addEventListener('click', () => setTimeout(renderFixedAccounts, 1200));
    $('#publishForm')?.addEventListener('submit', publishFixed, true);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
