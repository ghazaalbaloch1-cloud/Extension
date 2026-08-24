export async function aiChat({endpoint,apiKey,model,messages,temperature=.45,maxTokens=6000}){
  if(!endpoint||!apiKey) throw new Error('Configure an AI endpoint and API key first.');
  const res=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${apiKey}`},body:JSON.stringify({model,messages,temperature,max_tokens:maxTokens})});
  const data=await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(data.error?.message||`AI request failed: ${res.status}`);
  const text=data.choices?.[0]?.message?.content||data.output_text;
  if(!text) throw new Error('AI provider returned no text.');
  return text;
}
export function parseJson(text){
  const cleaned=text.replace(/^```json\s*/i,'').replace(/^```\s*/,'').replace(/\s*```$/,'').trim();
  try{return JSON.parse(cleaned)}catch{
    const a=cleaned.indexOf('{'),b=cleaned.lastIndexOf('}');
    if(a>=0&&b>a) return JSON.parse(cleaned.slice(a,b+1));
    throw new Error('AI returned invalid JSON.');
  }
}
