import {aiChat,parseJson} from './ai-engine.js';

export async function generateArticle({brief,research,ai}){
 const system=`You are an expert editorial SEO writer. Produce original, useful, accurate content from the supplied research. Never copy competitor wording. Never claim a fact merely because a competitor said it. If evidence is missing, phrase carefully or omit it. Write for humans first. Avoid keyword stuffing and repetitive filler. Return strict JSON with title, slug, metaDescription, excerpt, html, faq[]. HTML must be WordPress-ready and semantic: one H1 is omitted because WordPress title is separate; use H2/H3, paragraphs, lists, tables only when useful, and a short FAQ section. Include the primary keyword naturally, related entities, clear answers, and internal-link placeholder comments like <!-- INTERNAL_LINK:topic --> only when a useful link is logically appropriate.`;
 const user=JSON.stringify({brief,research});
 const raw=await aiChat({...ai,messages:[{role:'system',content:system},{role:'user',content:user}],maxTokens:8000,temperature:.5});
 return parseJson(raw);
}
export function safeHtml(html){
 const template=document.createElement('template'); template.innerHTML=html||'';
 template.content.querySelectorAll('script,iframe,object,embed,form').forEach(n=>n.remove());
 template.content.querySelectorAll('*').forEach(n=>{[...n.attributes].forEach(a=>{if(/^on/i.test(a.name)||a.name==='srcdoc')n.removeAttribute(a.name)})});
 return template.innerHTML;
}
