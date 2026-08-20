const $ = s => document.querySelector(s);
const EXTENSION_ID = window.BLOGGER_EXTENSION_ID || '';
let accounts = [];

function extensionAvailable(){ return !!EXTENSION_ID && !EXTENSION_ID.startsWith('REPLACE_') && !!window.chrome?.runtime?.sendMessage; }

async function bridge(type, payload = {}){
  if(!extensionAvailable()) throw new Error('Chrome Blogger Access extension is not configured or installed.');
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(EXTENSION_ID, { type, ...payload }, response => {
      const last = chrome.runtime.lastError;
      if(last) return reject(new Error('Chrome extension is not reachable. Check that it is installed and that frontend/config.js contains its correct Extension ID.'));
      if(!response?.ok) return reject(new Error(response?.error || 'Extension request failed.'));
      resolve(response);
    });
  });
}

function escapeHtml(v=''){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function setBridgeState(message, ok=false){$('#bridgeState').textContent=message;$('#bridgeState').className=ok?'success':'muted';}

async function loadAccounts(){
  try{
    const data=await bridge('accounts'); accounts=data.accounts||[]; renderAccounts(); setBridgeState(`Extension connected. ${accounts.length} Google account(s) available.`,true);
  }catch(error){
    accounts=[]; renderAccounts(); setBridgeState(error.message); 
  }
}

function renderAccounts(){
  const root=$('#accountList'), blogsRoot=$('#blogList'); root.innerHTML=''; blogsRoot.innerHTML='';
  if(!accounts.length) root.innerHTML='<p class="muted">No Google accounts connected yet. Click “Connect Google account”.</p>';
  let count=0;
  for(const account of accounts){
    const el=document.createElement('div'); el.className='account';
    const statusClass=account.status==='connected'?'success':account.status==='reauthorization_required'?'warning':'failed';
    el.innerHTML=`<div class="account-top"><div><strong>${escapeHtml(account.email)}</strong><br><small>${escapeHtml(account.name||'')}</small></div><div><span class="status ${statusClass}">${escapeHtml(account.status||'connected')}</span> <button class="ghost reconnect">Reconnect</button> <button class="ghost disconnect">Disconnect</button></div></div>${account.lastError?`<small class="warning">${escapeHtml(account.lastError)}</small>`:''}`;
    el.querySelector('.reconnect').onclick=async()=>{try{await bridge('connect');await loadAccounts();}catch(e){alert(e.message);}};
    el.querySelector('.disconnect').onclick=async()=>{if(confirm(`Disconnect ${account.email}?`)){await bridge('disconnect',{accountId:account.id});await loadAccounts();}};
    root.appendChild(el);
    for(const blog of account.blogs||[]){
      count++; const row=document.createElement('label'); row.className='blog';
      row.innerHTML=`<input type="checkbox" name="blogTarget" data-account="${escapeHtml(account.id)}" data-blog="${escapeHtml(blog.id)}"><span><strong>${escapeHtml(blog.name)}</strong><br><small>${escapeHtml(blog.url||'')}</small><small>Google account: ${escapeHtml(account.email)}</small></span>`;
      blogsRoot.appendChild(row);
    }
  }
  if(!count) blogsRoot.innerHTML='<p class="muted">No Blogger blogs available. The connected account may not have Blogger access.</p>';
}

$('#connectGoogle').addEventListener('click',async()=>{try{await bridge('connect');await loadAccounts();}catch(e){alert(e.message);}});
$('#testBridge').addEventListener('click',loadAccounts);

$('#publishForm').addEventListener('submit',async e=>{
  e.preventDefault();
  const state=$('#publishState');
  const selected=[...document.querySelectorAll('input[name="blogTarget"]:checked')].map(x=>({accountId:x.dataset.account,blogId:x.dataset.blog}));
  if(!selected.length){state.textContent='Select at least one Blogger blog.';return;}
  const f=new FormData(e.currentTarget);
  const post={title:String(f.get('title')||'').trim(),chapterNumber:String(f.get('chapterNumber')||'').trim(),slug:String(f.get('slug')||'').trim(),content:String(f.get('content')||''),featuredImage:String(f.get('featuredImage')||'').trim(),labels:String(f.get('labels')||'').split(',').map(x=>x.trim()).filter(Boolean)};
  if(!post.title||!post.slug||!post.content){state.textContent='Title, slug and content are required.';return;}
  state.textContent=`Publishing to ${selected.length} blog(s)…`;
  try{const data=await bridge('publish',{targets:selected,post});renderResults(data.results||[]);await loadHistory();state.textContent='Done. Each blog was handled independently.';}
  catch(error){state.textContent=error.message;}
});

function renderResults(results){
  $('#resultsCard').hidden=false; const root=$('#resultList'); root.innerHTML='';
  for(const r of results){const el=document.createElement('div');el.className='result';const cls=r.success?'success':r.status==='duplicate'?'warning':'failed';el.innerHTML=`<div class="result-grid"><div><strong>${escapeHtml(r.blogName||r.blogId)}</strong><br><span class="${cls}">${escapeHtml(r.status||'failed')}</span></div>${r.url?`<a class="url" href="${escapeHtml(r.url)}" target="_blank" rel="noopener">Open post</a>`:''}</div><small>${escapeHtml(r.error||'')}</small>`;root.appendChild(el);}
}

async function loadHistory(){try{const data=await bridge('history');renderHistory(data.history||[]);}catch(error){$('#publicationList').innerHTML=`<p class="error">${escapeHtml(error.message)}</p>`;}}
function renderHistory(items){const root=$('#publicationList');if(!items.length){root.innerHTML='<p class="muted">No publications recorded yet.</p>';return;}root.innerHTML=items.map(p=>`<div class="publication"><strong>${escapeHtml(p.blogName||p.blogId)}</strong> — <span class="${p.status==='success'||p.status==='duplicate'?'success':p.status==='reauthorization_required'?'warning':'failed'}">${escapeHtml(p.status)}</span><br><small>${escapeHtml(p.accountEmail||'')} · ${escapeHtml(p.slug||'')} · ${escapeHtml(p.at||'')}</small>${p.url?`<br><a class="url" href="${escapeHtml(p.url)}" target="_blank" rel="noopener">Open post</a>`:''}${p.error?`<br><small class="failed">${escapeHtml(p.error)}</small>`:''}</div>`).join('');}
$('#refreshPublications').addEventListener('click',loadHistory);

loadAccounts();
loadHistory();
