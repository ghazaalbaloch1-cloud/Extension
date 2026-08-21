const $ = s => document.querySelector(s);

function escapeHtml(v='') {
  return String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

async function send(message) {
  try {
    return await chrome.runtime.sendMessage(message);
  } catch (error) {
    return { ok:false, error:error?.message || 'Extension service worker is unavailable.' };
  }
}

function renderDiagnostics() {
  const manifest = chrome.runtime.getManifest();
  $('#extensionId').textContent = chrome.runtime.id;
  const clientId = typeof EXTENSION_GOOGLE_CLIENT_ID === 'string' ? EXTENSION_GOOGLE_CLIENT_ID : '';
  const configured = !!clientId && !clientId.startsWith('REPLACE_') && clientId.endsWith('.apps.googleusercontent.com');
  $('#oauthState').innerHTML = configured
    ? '<span class="ok">✓ Google OAuth client ID configured</span>'
    : '<span class="warn">⚠ Google OAuth client ID is still a placeholder in extension/config.js</span>';
  $('#state').textContent = `Version ${escapeHtml(manifest.version)} · MV3 service worker active`;
}

async function render() {
  renderDiagnostics();
  const response = await send({type:'accounts'});
  const root = $('#accounts');
  root.innerHTML = '';
  if (!response.ok) {
    $('#state').innerHTML = `<span class="bad">${escapeHtml(response.error)}</span>`;
    return;
  }
  if (!response.accounts.length) {
    root.innerHTML='<p class="muted">No Google accounts connected.</p>';
    return;
  }
  for (const account of response.accounts) {
    const row=document.createElement('div');
    row.className='row';
    const statusClass = account.status === 'connected' ? 'ok' : account.status === 'reauthorization_required' ? 'warn' : 'bad';
    row.innerHTML=`<strong>${escapeHtml(account.email)}</strong><br><span class="${statusClass}">${escapeHtml(account.status)} · ${(account.blogs||[]).length} blog(s)</span>${account.lastError?`<br><small class="warn">${escapeHtml(account.lastError)}</small>`:''}<br><br><button class="secondary disconnect" data-id="${escapeHtml(account.id)}">Disconnect</button>`;
    row.querySelector('.disconnect').onclick=async()=>{await send({type:'disconnect',accountId:account.id});await render();};
    root.appendChild(row);
  }
}

$('#connect').onclick=async()=>{
  $('#state').textContent='Opening Google authorization…';
  const r=await send({type:'connect'});
  $('#state').textContent=r.ok?`Connected ${r.account.email}.`:(r.error||'Connection failed.');
  await render();
};

$('#refresh').onclick=render;
render();
