import {aiChat,parseJson} from './ai-engine.js';

export async function researchKeyword({keyword,context,language,searchEndpoint,searchKey,ai}){
  let serp=[];
  if(searchEndpoint&&searchKey){
    const url=new URL(searchEndpoint); url.searchParams.set('q',keyword); url.searchParams.set('num','10');
    const r=await fetch(url,{headers:{'Authorization':`Bearer ${searchKey}`,'Accept':'application/json'}});
    if(!r.ok) throw new Error(`Search API failed: ${r.status}`);
    const data=await r.json();
    serp=(data.results||data.organic||data.items||[]).slice(0,10).map((x,i)=>({rank:i+1,title:x.title||x.name||'',url:x.url||x.link||'',snippet:x.snippet||x.description||''}));
  }
  const sourceText=serp.length?JSON.stringify(serp):'No live SERP connector configured. Infer the research framework without inventing rankings or URLs.';
  const prompt=`You are a senior SEO strategist. Analyze the target keyword and supplied SERP data. Do not invent URLs, metrics, facts, or rankings. Identify search intent, entities, questions, content gaps, likely user expectations, useful angles, and a superior outline. The goal is genuinely helpful original content, not rewriting competitors. Return strict JSON with keys: intent, audience, entities[], questions[], competitor_gaps[], differentiation[], outline[{h2,string,points[]}], serp[]. Keyword: ${keyword}. Context: ${context||'none'}. Language: ${language}. SERP: ${sourceText}`;
  const raw=await aiChat({...ai,messages:[{role:'system',content:'You are an evidence-aware SEO research analyst. Never fabricate evidence.'},{role:'user',content:prompt}],maxTokens:5000});
  const result=parseJson(raw); result.serp=serp; return result;
}
