const $ = s => document.querySelector(s);
async function send(message){ return chrome.runtime.sendMessage(message); }
async function render(){
  const response = await send({type:'accounts'});
  const root = $('#accounts');
  root.innerHTML = '';
  if(!response.ok){ $('#state').textContent = response.error; return; }
  if(!response.accounts.length){ root.innerHTML='<p class="muted">No Google accounts connected.</p>'; return; }
  for(const account of response.accounts){
    const row=document.createElement('div'); row.className='row';
    row.innerHTML=`<strong>${escapeHtml(account.email)}</strong><br><span class="muted">${escapeHtml(account.status)} · ${(account.blogs||[]).length} blog(s)</span><br><br><button class="secondary" data-id="${escapeHtml(account.id)}">Disconnect</button>`;
    row.querySelector('button').onclick=async()=>{await send({type:'disconnect',accountId:account.id});await render();};
    root.appendChild(row);
  }
}
$('#connect').onclick=async()=>{ $('#state').textContent='Opening Google authorization…'; const r=await send({type:'connect'}); $('#state').textContent=r.ok?`Connected ${r.account.email}.`:(r.error||'Connection failed.'); await render(); };
function escapeHtml(v=''){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
render();
