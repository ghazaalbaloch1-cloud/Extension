const API_BASE = window.PUBLISHER_API_BASE || 'https://REPLACE_WITH_WORKER_DOMAIN';
const $ = (s) => document.querySelector(s);

async function api(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, { credentials: 'include', ...options, headers: { ...(options.body ? {'Content-Type':'application/json'} : {}), ...(options.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}

function escapeHtml(value=''){return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function setAuthenticated(on){$('#loginCard').hidden=on;$('#app').hidden=!on;$('#logout').hidden=!on;}

async function checkAuth(){
  try { await api('/api/auth/me'); setAuthenticated(true); await loadAccounts(); await loadPublications(); }
  catch { setAuthenticated(false); }
}

$('#loginForm').addEventListener('submit', async (e)=>{
  e.preventDefault(); $('#loginError').textContent='';
  const password=new FormData(e.currentTarget).get('password');
  try { await api('/api/auth/login',{method:'POST',body:JSON.stringify({password})}); e.currentTarget.reset(); setAuthenticated(true); await loadAccounts(); await loadPublications(); }
  catch(err){ $('#loginError').textContent=err.message; }
});
$('#logout').addEventListener('click', async()=>{await api('/api/auth/logout',{method:'POST'}).catch(()=>{});setAuthenticated(false);});
$('#connectGoogle').addEventListener('click',()=>{window.location.href=`${API_BASE}/oauth/google/start`;});

async function loadAccounts(){
  try { const data=await api('/api/accounts'); renderAccounts(data.accounts || []); }
  catch(err){ $('#accountList').innerHTML=`<p class="error">${escapeHtml(err.message)}</p>`; }
}

function renderAccounts(accounts){
  const root=$('#accountList'), blogs=$('#blogList'); root.innerHTML=''; blogs.innerHTML='';
  if(!accounts.length) root.innerHTML='<p class="muted">No Google accounts connected yet.</p>';
  let blogCount=0;
  for(const account of accounts){
    const el=document.createElement('div'); el.className='account';
    const statusClass=account.status==='connected'?'success':account.status==='reauthorization_required'?'warning':'failed';
    el.innerHTML=`<div class="account-top"><div><strong>${escapeHtml(account.email || account.id)}</strong><br><small>${escapeHtml(account.name || '')}</small></div><span class="status ${statusClass}">${escapeHtml(account.status || 'connected')}</span><button class="ghost disconnect" data-id="${escapeHtml(account.id)}">Disconnect</button></div>${account.lastError?`<small class="warning">${escapeHtml(account.lastError)}</small>`:''}`;
    root.appendChild(el);
    el.querySelector('.disconnect').addEventListener('click',async()=>{if(!confirm('Disconnect this Google account?'))return;await api(`/api/accounts/${encodeURIComponent(account.id)}/disconnect`,{method:'POST'});await loadAccounts();});
    for(const blog of account.blogs || []){
      blogCount++; const row=document.createElement('label'); row.className='blog';
      row.innerHTML=`<input type="checkbox" name="blogId" value="${escapeHtml(blog.id)}"><span><strong>${escapeHtml(blog.name)}</strong><br><small>${escapeHtml(blog.url || '')}</small><small>Google account: ${escapeHtml(account.email || '')}</small></span>`;
      blogs.appendChild(row);
    }
  }
  if(!blogCount) blogs.innerHTML='<p class="muted">No Blogger blogs are available to the connected accounts. The account may need Blogger permission or reauthorization.</p>';
}

$('#publishForm').addEventListener('submit',async(e)=>{
  e.preventDefault(); const state=$('#publishState'); state.textContent='Publishing…';
  const form=new FormData(e.currentTarget); const blogIds=[...document.querySelectorAll('input[name="blogId"]:checked')].map(x=>x.value);
  const labels=String(form.get('labels')||'').split(',').map(x=>x.trim()).filter(Boolean);
  if(!blogIds.length){state.textContent='Select at least one blog.';return;}
  const post={title:String(form.get('title')),chapterNumber:String(form.get('chapterNumber')||''),slug:String(form.get('slug')),content:String(form.get('content')),featuredImage:String(form.get('featuredImage')||''),labels,blogIds};
  try{const data=await api('/api/publish',{method:'POST',body:JSON.stringify(post)});renderResults(data.results||[]);state.textContent='Done. Each blog was handled independently.';await loadPublications();}
  catch(err){state.textContent=err.message;}
});

function renderResults(results){
  $('#resultsCard').hidden=false; const root=$('#resultList'); root.innerHTML='';
  for(const r of results){const el=document.createElement('div');el.className='result';const cls=r.success?'success':r.status==='duplicate'?'warning':'failed';el.innerHTML=`<div class="result-grid"><div><strong>${escapeHtml(r.blogName||r.blogId)}</strong><br><span class="${cls}">${escapeHtml(r.status||'failed')}</span></div>${r.url?`<a class="url" href="${escapeHtml(r.url)}" target="_blank" rel="noopener">Open post</a>`:''}</div><small>${escapeHtml(r.error||'')}</small>`;root.appendChild(el);}
}

async function loadPublications(){try{const data=await api('/api/publications/recent');renderPublications(data.publications||[]);}catch(err){$('#publicationList').innerHTML=`<p class="error">${escapeHtml(err.message)}</p>`;}}
function renderPublications(items){const root=$('#publicationList');root.innerHTML='';if(!items.length){root.innerHTML='<p class="muted">No publications recorded yet.</p>';return;}for(const p of items){const cls=p.status==='success'||p.status==='duplicate'?'success':p.status==='reauthorization_required'?'warning':'failed';const el=document.createElement('div');el.className='publication';el.innerHTML=`<strong>${escapeHtml(p.blogName||p.blogId)}</strong> — <span class="${cls}">${escapeHtml(p.status)}</span><br><small>${escapeHtml(p.accountEmail||'')} · ${escapeHtml(p.slug||'')} · ${escapeHtml(p.chapterNumber||'')}</small>${p.url?`<br><a class="url" href="${escapeHtml(p.url)}" target="_blank" rel="noopener">${escapeHtml(p.url)}</a>`:''}${p.error?`<br><small class="failed">${escapeHtml(p.error)}</small>`:''}`;root.appendChild(el);}}
$('#refreshPublications').addEventListener('click',loadPublications);

checkAuth();
