import JSZip from 'jszip';
import { PDFDocument, PDFDict, PDFName } from 'pdf-lib';
import * as pdfjs from 'pdfjs-dist';
pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
export { pdfjs };
const MAX_BYTES = 30 * 1024 * 1024;
function xml(text) { const doc = new DOMParser().parseFromString(text,'application/xml'); if(doc.querySelector('parsererror')) throw Error('The EPUB contains damaged XML. Export a new EPUB or upload a print-ready PDF.'); return doc; }
const local = (doc,tag) => [...doc.getElementsByTagNameNS('*',tag)];
function resolve(base, href) { const path = new URL(href, 'https://epub.local/'+base).pathname.slice(1); return decodeURIComponent(path); }
export async function parseManuscript(file, progress) {
 if(file.size > MAX_BYTES) throw Error('This browser studio accepts files up to 30 MB. Export a smaller file or split a large manuscript.');
 const bytes = new Uint8Array(await file.arrayBuffer()); progress('Inspecting manuscript…');
 if(file.name.toLowerCase().endsWith('.pdf')) {
  let doc; try { doc = await PDFDocument.load(bytes); } catch { throw Error('This PDF is damaged or password-protected. Export an unlocked PDF and try again.'); }
  if(doc.isEncrypted) throw Error('Remove password protection before uploading this PDF.');
  if(!doc.getPageCount() || doc.getPageCount()>800) throw Error('Use a PDF with 1–800 pages for this preview studio.');
  const sizes = doc.getPages().map(p=>p.getSize());
  const warnings = [];
  if(sizes.some(s=>Math.abs(s.width-sizes[0].width)>1 || Math.abs(s.height-sizes[0].height)>1)) warnings.push({text:'Mixed page sizes detected. Review each page before choosing a printer.',page:1});
  sizes.forEach((s,i)=>{if(s.width>s.height) warnings.push({text:'Landscape page: this may be a two-page spread. Split spreads before printing.',page:i+1});});
  let fontCount=0,unembedded=0;
  for(const [,object] of doc.context.enumerateIndirectObjects()){
   if(!(object instanceof PDFDict)||object.get(PDFName.of('Type'))?.toString()!=='/Font')continue;
   if(object.get(PDFName.of('Subtype'))?.toString()==='/Type0')continue;
   fontCount++;
   const descriptor=object.lookup(PDFName.of('FontDescriptor'));
   if(!(descriptor instanceof PDFDict)||!['FontFile','FontFile2','FontFile3'].some(key=>descriptor.has(PDFName.of(key))))unembedded++;
  }
  if(unembedded)warnings.push({text:`${unembedded} of ${fontCount} detected font resources have no embedded font program. Re-export with fonts embedded before printing.`,page:1});
  warnings.push({text:'Source-image effective resolution and complete font coverage still require printer preflight. This proof is not certified print-ready.',page:1});
  const render = await pdfjs.getDocument({data:bytes.slice(),isEvalSupported:false}).promise;
  for(let i=1;i<=Math.min(render.numPages,10);i++){const pg=await render.getPage(i); await pg.getTextContent();}
  await render.destroy();
  return {type:'pdf',name:file.name,bytes,title:doc.getTitle()||file.name.replace(/\.pdf$/i,''),author:doc.getAuthor()||'',count:doc.getPageCount(),sizes,warnings,fontCount,unembedded};
 }
 if(!file.name.toLowerCase().endsWith('.epub')) throw Error('Choose a PDF or EPUB file. Word documents need to be exported first.');
 let zip; try{zip=await JSZip.loadAsync(bytes);}catch{throw Error('This EPUB could not be opened. Export a fresh EPUB or a print-ready PDF.');}
 const entries=Object.values(zip.files); if(entries.length>3000 || entries.reduce((n,f)=>n+(f._data?.uncompressedSize||0),0)>100*1024*1024) throw Error('This EPUB is too large to safely unpack in the browser. Please use a smaller EPUB or a PDF.');
 if(zip.file('META-INF/encryption.xml')) throw Error('Encrypted or DRM-protected EPUBs cannot be converted. Upload an unlocked file you have permission to print.');
 const container=zip.file('META-INF/container.xml'); if(!container) throw Error('Missing EPUB container. Re-export your book as EPUB 3 or PDF.');
 const root=local(xml(await container.async('string')),'rootfile')[0]?.getAttribute('full-path');
 if(!root || !zip.file(root)) throw Error('The EPUB package file is missing. Re-export the book.');
 const opf=xml(await zip.file(root).async('string'));
 if(local(opf,'meta').some(n=>n.textContent==='pre-paginated')) throw Error('Fixed-layout EPUBs are not supported. Export a print-ready PDF to preserve their layout.');
 const items = Object.fromEntries(local(opf,'item').map(n=>[n.getAttribute('id'),n]));
 const chapters=[]; const warnings=[];
 for(const ref of local(opf,'itemref')) {
  if(ref.getAttribute('linear')==='no')continue;
  const item=items[ref.getAttribute('idref')]; if(!item)throw Error('The EPUB reading order references a missing chapter. Re-export your EPUB.');
  const path=resolve(root,item.getAttribute('href')); const entry=zip.file(path); if(!entry)throw Error('An EPUB chapter is missing. Re-export your EPUB.');
  const html=xml(await entry.async('string'));
  if(html.querySelector('table, math, svg, video, audio') || local(html,'ruby').length) throw Error('This EPUB contains tables, mathematical notation, ruby text, or complex media. Upload a print-ready PDF to preserve these features.');
  const body=local(html,'body')[0]; if(!body)continue;
  const blocks=[];
  async function walk(node) {
   if(node.nodeType!==1)return;
   const tag=node.localName;
   if(['script','style','nav'].includes(tag))return;
   if(tag==='img') {
    const src=node.getAttribute('src'); const entry=src&&zip.file(resolve(path,src));
    if(!entry) throw Error('An EPUB illustration is missing. Upload a corrected EPUB or PDF.');
    const extension=src.split('.').pop().toLowerCase(); if(!['png','jpg','jpeg'].includes(extension))throw Error('An EPUB image format is unsupported. Convert its images to JPG/PNG or upload a PDF.');
    blocks.push({type:'image',data:await entry.async('uint8array'),mime:extension==='png'?'image/png':'image/jpeg'});return;
   }
   if(['h1','h2','h3','p','blockquote','li'].includes(tag) && !node.querySelector('img')) {
    const runs=[];
    function inline(n,bold=false,italic=false){
     if(n.nodeType===3){const text=n.textContent.replace(/\s+/g,' ');if(text)runs.push({text,bold,italic});return;}
     if(n.nodeType!==1||['script','style'].includes(n.localName))return;
     if(n.localName==='br'){runs.push({text:'\n',bold,italic});return;}
     for(const child of n.childNodes)inline(child,bold||['b','strong'].includes(n.localName),italic||['i','em','cite'].includes(n.localName));
    }
    inline(node);
    const text=runs.map(r=>r.text).join('').trim();
    const align=node.getAttribute('style')?.match(/text-align\s*:\s*(center|right|left)/i)?.[1]?.toLowerCase()||'left';
    if(text)blocks.push({type:tag.startsWith('h')?'heading':'text',text,runs,align,quote:tag==='blockquote'});return;
   }
   for(const child of node.children)await walk(child);
  }
  await walk(body); if(blocks.length)chapters.push({title:blocks.find(b=>b.type==='heading')?.text||`Chapter ${chapters.length+1}`,blocks});
 }
 if(!chapters.length)throw Error('No readable chapters found. Try exporting a print-ready PDF.');
 warnings.push({text:'EPUB preserves basic bold/italic emphasis, paragraphs, headings, images and inline left/center/right alignment. Complex CSS and footnote positioning require a print-ready PDF. Check every page.',page:1});
 return {type:'epub',name:file.name,bytes,title:local(opf,'title')[0]?.textContent||file.name.replace(/\.epub$/i,''),author:local(opf,'creator')[0]?.textContent||'',chapters,count:chapters.length,warnings};
}
