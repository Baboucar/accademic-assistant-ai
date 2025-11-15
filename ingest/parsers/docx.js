import mammoth from 'mammoth';
export async function parseDocxNotice(path){
  const base=path.split('/').pop();
  const { value } = await mammoth.extractRawText({ path });
  const text=value.split('\n').map(s=>s.trim()).filter(Boolean).join('\n');
  const today=new Date().toISOString().slice(0,10);
  return [[today, base.replace(/\.docx$/,''), text, base]];
}
