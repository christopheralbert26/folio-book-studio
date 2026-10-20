import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { transformedImage } from './images';
import { imagePpi } from './model';
const fonts={};
async function addFont(doc,name='NotoSerif') { fonts[name] ||= new Uint8Array(await (await fetch(`/fonts/${name}-Regular.ttf`)).arrayBuffer());doc.registerFontkit(fontkit);return doc.embedFont(fonts[name],{subset:true}); }
const gray=n=>rgb(n,n,n);
export function wrapText(text,font,size,width) {
 const lines=[]; let line='';
 for(const word of text.split(/\s+/)) {
  if(font.widthOfTextAtSize(word,size)>width) { if(line){lines.push(line);line='';}let part='';for(const char of word){if(font.widthOfTextAtSize(part+char,size)>width){lines.push(part);part='';}part+=char;}line=part;continue; }
  const next=line?line+' '+word:word;if(font.widthOfTextAtSize(next,size)>width){lines.push(line);line=word;}else line=next;
 } if(line)lines.push(line);return lines;
}
function checkGlyphs(text,font){const supported=new Set(font.getCharacterSet());if([...text].some(c=>!supported.has(c.codePointAt(0))&&!/\s/.test(c)))throw Error('This manuscript contains characters not supported by the proof font. Upload a print-ready PDF with your fonts embedded.');}
export async function generateProof(project,progress=()=>{}) {
 const doc=await PDFDocument.create();const font=await addFont(doc,project.layout.font||'NotoSerif');const source=project.source;const layout=project.layout;
 doc.setCreationDate(new Date('2026-01-01T00:00:00Z'));doc.setModificationDate(new Date('2026-01-01T00:00:00Z'));
 let chapterPages=[];let warnings=[...(source?.warnings||[])];
 if(!source)throw Error('Add a manuscript first.');
 if(source.type==='pdf') { const original=await PDFDocument.load(source.bytes);const order=project.pageOrder||original.getPageIndices();const pages=await doc.copyPages(original,order);pages.forEach(p=>doc.addPage(p)); }
 else {
  let page,y;const {width,height,size,line,margin,gutter}=layout;
  const newPage=()=>{page=doc.addPage([width,height]);y=height-margin;};
  const x=()=>margin+(doc.getPageCount()%2===1?gutter:0);
  const textWidth=width-2*margin-gutter;
  for(const chapter of source.chapters){
   if(layout.chapterRecto && doc.getPageCount()%2===1)doc.addPage([width,height]);
   newPage();chapterPages.push({title:chapter.title,page:doc.getPageCount()});y-=size*2;
   for(const block of chapter.blocks){
    if(block.type==='image'){
     const prepared=await transformedImage({bytes:block.data,mime:block.mime,crop:0,rotation:0,gray:true});
     const img=await doc.embedPng(prepared.bytes);const scale=Math.min(textWidth/img.width,(height-2*margin)/img.height);const h=img.height*scale;
     if(y-h<margin)newPage();page.drawImage(img,{x:x(),y:y-h,width:img.width*scale,height:h});y-=h+size;continue;
    }
    checkGlyphs(block.text,font);const s=block.type==='heading'?size*1.7:size;
    for(const text of wrapText(block.text,font,s,textWidth)){if(y-s*line<margin)newPage();page.drawText(text,{x:x(),y:y-s,size:s,font,color:gray(.13)});y-=s*line;}
    y-=size*.7;
   }
  }
 }
 progress('Placing illustrations…');
 // Page placements always refer to the unmodified manuscript, then retain list order.
 const baseCount=doc.getPageCount();const placements=project.illustrations.map((im,index)=>({im,index,after:Math.max(0,Math.min(baseCount,im.after))})).sort((a,b)=>a.after-b.after||a.index-b.index);
 let inserted=0;
 for(const {im,after} of placements){
  const prepared=await transformedImage(im);const img=await doc.embedPng(prepared.bytes);
  const reference=doc.getPage(Math.max(0,Math.min(doc.getPageCount()-1,after-1+inserted)));const {width,height}=reference.getSize();
  const page=doc.insertPage(after+inserted,[width,height]);inserted++;
  const usableW=width-96,usableH=height-120;const scale=Math.min(usableW/img.width,usableH/img.height)*im.scale;
  const w=img.width*scale,h=img.height*scale;
  const px=(width-w)/2+im.x,py=(height-h)/2+im.y;
  page.drawImage(img,{x:px,y:py,width:w,height:h});
  if(im.caption){checkGlyphs(im.caption,font);wrapText(im.caption,font,9,usableW).slice(0,3).forEach((t,i)=>page.drawText(t,{x:48,y:36-i*12,size:9,font}));}
  const ppi=imagePpi(prepared.width,prepared.height,w,h);
  if(ppi<300)warnings.push({text:`${im.name}: approximately ${Math.round(ppi)} PPI at this size; may appear soft.`,page:after+inserted});
  if(prepared.contrast<25)warnings.push({text:`${im.name}: low contrast; inspect the grayscale result.`,page:after+inserted});
  if(!im.gray)warnings.push({text:`${im.name}: color is enabled. Switch to grayscale for a black-and-white interior.`,page:after+inserted});
  if(px<36||py<36||px+w>width-36||py+h>height-36)warnings.push({text:`${im.name}: image extends into the page safety margin.`,page:after+inserted});
 }
 if(source.type==='epub'&&layout.numbering)doc.getPages().forEach((p,i)=>p.drawText(String(i+1),{x:p.getWidth()/2-3,y:24,size:9,font,color:gray(.4)}));
 doc.setTitle(project.title);doc.setAuthor(project.author);doc.setSubject(`Folio digital proof • revision ${project.revision}. Not printer certified.`);
 const bytes=await doc.save();const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(b=>b.toString(16).padStart(2,'0')).join('');
 return {bytes,hash,count:doc.getPageCount(),baseCount,warnings,chapterPages,revision:project.revision};
}
export async function generateCover(project) {
 const doc=await PDFDocument.create();const font=await addFont(doc);const {width,height}=project.layout;const p=doc.addPage([width,height]);
 const c=project.color.match(/\w\w/g).map(v=>parseInt(v,16)/255);p.drawRectangle({x:0,y:0,width,height,color:rgb(...c)});const ink=rgb(.91,.87,.73);
 if(project.coverArt){const img=await doc.embedPng((await transformedImage({...project.coverArt,gray:false,crop:0,rotation:0})).bytes);const s=Math.max(width/img.width,height/img.height);p.drawImage(img,{x:(width-img.width*s)/2,y:(height-img.height*s)/2,width:img.width*s,height:img.height*s});p.drawRectangle({x:0,y:0,width,height,color:rgb(...c),opacity:.5});}
 p.drawRectangle({x:20,y:20,width:width-40,height:height-40,borderWidth:.7,borderColor:ink});
 const centered=(text,size,y)=>{checkGlyphs(text,font);const lines=wrapText(text,font,size,width-70);lines.forEach((t,i)=>p.drawText(t,{x:(width-font.widthOfTextAtSize(t,size))/2,y:y-i*size*1.3,size,font,color:ink}));};
 centered(project.series?`${project.series}${project.volume?' · '+project.volume:''}`:'A PERSONAL EDITION',9,height-65);
 centered(project.title,30,height-135);if(project.subtitle)centered(project.subtitle,11,height-235);
 if(project.coverStyle==='botanical') {
  for(let i=0;i<12;i++){const y=height*.2+i*11;const a=i%2?1:-1;p.drawLine({start:{x:width/2,y},end:{x:width/2+a*(42-i*2),y:y+27},thickness:.8,color:ink});p.drawEllipse({x:width/2+a*(30-i*1.3),y:y+19,xScale:12,yScale:3,rotate:{type:'degrees',angle:a*30},color:ink,opacity:.7});}
  p.drawLine({start:{x:width/2,y:height*.2-15},end:{x:width/2,y:height*.2+145},color:ink,thickness:.8});
 }else{p.drawCircle({x:width/2,y:height*.38,size:55,borderColor:ink,borderWidth:.8});p.drawCircle({x:width/2,y:height*.38,size:40,borderColor:ink,borderWidth:.8});}
 centered(project.author||'AUTHOR NAME',11,55);return doc.save();
}
export function download(bytes,name,type='application/pdf'){const url=URL.createObjectURL(new Blob([bytes],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
