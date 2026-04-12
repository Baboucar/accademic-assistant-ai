import { env } from '../env.js';
export async function chatGroq(messages){
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method:'POST',
    headers:{ 'Authorization': `Bearer ${env.GROQ_API_KEY}`, 'Content-Type':'application/json' },
    body: JSON.stringify({ model: env.MODEL, messages, temperature: 0.2 })
  });
    if (!r.ok) throw new Error(`Groq error ${r.status}: ${await r.text()}`);
  const j = await r.json();
  return j.choices?.[0]?.message?.content?.trim() || '';
}
