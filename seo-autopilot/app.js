import {WordPressClient} from './wp-client.js';
import {researchKeyword} from './research.js';
import {generateArticle,safeHtml} from './content.js';
import {scoreSeo} from './seo.js';

const $=id=>document.getElementById(id);
let state={research:null,article:null,score:null};
const fields=['wpUrl','wpUser','wpPass','aiEndpoint','aiModel','aiKey','searchEndpoint','searchKey','language'];
function load(){try{const c=JSON.parse(localStorage.getItem('seoAutopilotConfig')||'{}');fields.forEach(k=>{if(c[k]!==undefined)$(k).value=c[k]})}catch{}}
function save(){const c={};fields.forEach(k=>c[k]=$(k).value);localStorage.setItem('seoAutopilotConfig',JSON.stringify(c));$('connectionState').textContent='Saved in this browser.'}
function ai(){return{endpoint:$('aiEndpoint').value.trim(),apiKey:$('aiKey').value.trim(),model:$('aiModel').value.trim()}}
function wp(){return new WordPressClient({baseUrl:$('wpUrl').value.trim(),username:$('wpUser').value,applicationPassword:$('wpPass').value})}
function setStep(n){document.querySelectorAll('#steps span').forEach((x,i)=>x.classList.toggle('active',i===n-1))}
function renderResearch(r){$('researchPanel').innerHTML=`<p><strong>Intent:</strong> ${esc(r.intent)}</p><p><strong>Audience:</strong> ${esc(r.audience)}</p><h3>Entities</h3><ul>${(r.entities||[]).map(x=>`<li>${esc(x)}</li>`).join('')}</ul><h3>Competitor gaps</h3><ul>${(r.competitor_gaps||[]).map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`;}
function renderStrategy(r){$('strategyPanel').innerHTML=`<p><strong>Differentiation:</strong></p><ul>${(r.differentiation||[]).map(x=>`<li>${esc(x)}</li>`).join('')}</ul><h3>Outline</h3><ol>${(r.outline||[]).map(x=>`<li><strong>${esc(x.h2)}</strong><ul>${(x.points||[]).map(p=>`<li>${esc(p)}</li>`).join('')}</ul></li>`).join('')}</ol>`}
function renderArticle(a){const html=safeHtml(a.html);$('articlePreview').innerHTML=html;$('articleHtml').textContent=html;$('publishPanel').innerHTML=`<p><strong>${esc(a.title)}</strong></p><p class="muted">Slug: ${esc(a.slug)} · Meta: ${esc(a.metaDescription||'')}</p>`;$('publishWp').disabled=false}
function renderScore(s){$('seoPanel').innerHTML=s.checks.map(([name,ok,pts])=>`<div class="score"><strong class="${ok?'ok':'warn'}">${ok?pts:0}/${pts}</strong><span>${esc(name)}</span></div>`).join('')+`<div class="score"><strong>${s.score}/100</strong><span>Overall on-page score · ${s.words} words</span></div>`}
function esc(v){return String(v??'').replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\\':'&#39;'}[c]))}
$('saveConfig').onclick=save;
$('testWp').onclick=async()=>{try{const u=await wp().test();$('connectionState').textContent=`Connected as ${u.name||u.slug||'WordPress user'}.`}catch(e){$('connectionState').textContent=e.message}}
$('runAutopilot').onclick=async()=>{
 try{
  save(); const keyword=$('keyword').value.trim(); if(!keyword)throw new Error('Enter a primary keyword.');
  $('runState').textContent='Researching SERP and competitor gaps…';setStep(1);
  state.research=await researchKeyword({keyword,context:$('context').value,language:$('language').value,searchEndpoint:$('searchEndpoint').value.trim(),searchKey:$('searchKey').value.trim(),ai:ai()});
  renderResearch(state.research);setStep(2);renderStrategy(state.research);
  $('runState').textContent='Writing original article…';setStep(3);
  state.article=await generateArticle({brief:{keyword,context:$('context').value,language:$('language').value,articleType:$('articleType').value,targetWords:Number($('length').value)},research:state.research,ai:ai()});
  renderArticle(state.article);setStep(4);
  state.score=scoreSeo({article:state.article,keyword,research:state.research});renderScore(state.score);setStep(5);
  $('runState').textContent=`Ready. SEO score ${state.score.score}/100.`;setStep(6);
 }catch(e){$('runState').textContent='Error: '+e.message;console.error(e)}
};
$('copyArticle').onclick=async()=>{if(state.article)await navigator.clipboard.writeText(safeHtml(state.article.html))};
$('publishWp').onclick=async()=>{try{if(!state.article)throw new Error('Generate an article first.');$('publishState').textContent='Publishing…';const a=state.article;const result=await wp().createPost({title:a.title,content:safeHtml(a.html),status:$('status').value,slug:a.slug,excerpt:a.excerpt||a.metaDescription||''});$('publishState').textContent=`Published: ${result.link||result.id}`;state.published=result}catch(e){$('publishState').textContent='Error: '+e.message}};
load();
