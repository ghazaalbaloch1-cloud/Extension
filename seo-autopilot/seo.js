export function scoreSeo({article,keyword,research}){
 const html=(article.html||'').toLowerCase(), k=keyword.toLowerCase().trim();
 const text=html.replace(/<[^>]+>/g,' '), words=text.trim().split(/\s+/).filter(Boolean).length;
 const checks=[
  ['Title keyword', (article.title||'').toLowerCase().includes(k), 12],
  ['Meta description', (article.metaDescription||'').length>=120&&(article.metaDescription||'').length<=170, 12],
  ['Keyword coverage', k && text.includes(k), 10],
  ['Strong structure', (html.match(/<h2/gi)||[]).length>=3, 12],
  ['Readable length', words>=900, 12],
  ['FAQ coverage', (article.faq||[]).length>=3||html.includes('faq'), 10],
  ['Questions addressed', (research.questions||[]).length>=3, 10],
  ['Differentiation', (research.competitor_gaps||[]).length>=3, 12],
  ['Internal link opportunities', html.includes('INTERNAL_LINK')||html.includes('href='), 10]
 ];
 const total=checks.reduce((s,x)=>s+(x[1]?x[2]:0),0); return {score:total,checks,words};
}
