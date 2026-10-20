import { PDFDocument, rgb, degrees, pushGraphicsState, popGraphicsState, translate } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { transformedImage } from './images.js';
import { imagePpi } from './model.js';
const fonts={};
async function addFont(doc,name='NotoSerif',style='Regular') { const key=`${name}-${style}`;fonts[key] ||= new Uint8Array(await (await fetch(`/fonts/${key}.ttf`)).arrayBuffer());doc.registerFontkit(fontkit);return doc.embedFont(fonts[key],{subset:true}); }
export function wrapRuns(runs,variants,size,width){
 const lines=[];let line=[],used=0;
 const flush=()=>{lines.push({runs:line,width:used});line=[];used=0;};
 for(const run of runs){
  const font=variants[run.bold?(run.italic?'BoldItalic':'Bold'):(run.italic?'Italic':'Regular')];
  for(let token of run.text.split(/(\n|[^\S\n]+|[^\s]+)/).filter(Boolean)){
   if(token==='\n'){flush();continue;}
   if(!used&&!token.trim())continue;
   let w=font.widthOfTextAtSize(token,size);
   if(used+w>width&&used){flush();if(!token.trim())continue;}
   if(w>width){for(const c of token){const cw=font.widthOfTextAtSize(c,size);if(used+cw>width&&used)flush();line.push({text:c,font,width:cw});used+=cw;}continue;}
   line.push({text:token,font,width:w});used+=w;
  }
 }if(line.length)flush();return lines;
}
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
 let chapterPages=[];let warnings=[...(source?.warnings||[])].map(w=>({...w}));
 if(!source)throw Error('Add a manuscript first.');
 if(source.type==='pdf') { const original=await PDFDocument.load(source.bytes);const order=project.pageOrder||original.getPageIndices();const pages=await doc.copyPages(original,order);pages.forEach(p=>doc.addPage(p)); }
 else {
  let page,y;const {width,height,size,line,margin,gutter}=layout;
  const variants={Regular:font};for(const style of ['Bold','Italic','BoldItalic'])variants[style]=await addFont(doc,layout.font||'NotoSerif',style);
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
    const indent=block.quote?18:0,available=textWidth-indent*2;
    const runs=block.runs?.length?block.runs:[{text:block.text,bold:block.type==='heading'}];
    for(const row of wrapRuns(runs,variants,s,available)){
     if(y-s*line<margin)newPage();
     let px=x()+indent+(block.align==='center'?(available-row.width)/2:block.align==='right'?available-row.width:0);
     for(const part of row.runs){page.drawText(part.text,{x:px,y:y-s,size:s,font:part.font,color:gray(.13)});px+=part.width;}
     y-=s*line;
    }
    y-=size*.7;
   }
  }
 }
 const basePages=doc.getPages();
 const originalParity=new Map(basePages.map((p,i)=>[p,i%2]));
 const chapterAnchors=chapterPages.map(c=>({...c,basePage:c.page,anchor:basePages[c.page-1]}));
 const sourceOrder=project.pageOrder||basePages.map((_,i)=>i);
 warnings=warnings.map(w=>({...w,anchor:source.type==='pdf'?basePages[Math.max(0,sourceOrder.indexOf(w.page-1))]:basePages[(w.page||1)-1]}));
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
  if(ppi<300)warnings.push({text:`${im.name}: approximately ${Math.round(ppi)} PPI at this size; may appear soft.`,anchor:page});
  if(prepared.contrast<25)warnings.push({text:`${im.name}: low contrast; inspect the grayscale result.`,anchor:page});
  if(!im.gray)warnings.push({text:`${im.name}: color is enabled. Switch to grayscale for a black-and-white interior.`,anchor:page});
  if(px<36||py<36||px+w>width-36||py+h>height-36)warnings.push({text:`${im.name}: image extends into the page safety margin.`,anchor:page});
 }
 if(source.type==='epub'){
  if(layout.chapterRecto)for(const chapter of chapterAnchors){const i=doc.getPages().indexOf(chapter.anchor);if(i%2===1)doc.insertPage(i,[layout.width,layout.height]);}
  for(const p of basePages){const old=originalParity.get(p),current=doc.getPages().indexOf(p)%2;if(old!==current)p.translateContent(current===0?layout.gutter:-layout.gutter,0);}
 }
 if(project.printProfile&&doc.getPageCount()%2===1)doc.addPage([layout.width,layout.height]);
 chapterPages=chapterAnchors.map(({anchor,...c})=>({...c,page:doc.getPages().indexOf(anchor)+1}));
 warnings=warnings.map(({anchor,...w})=>({...w,page:Math.max(1,doc.getPages().indexOf(anchor)+1)}));
 if(source.type==='epub'&&layout.numbering)doc.getPages().forEach((p,i)=>p.drawText(String(i+1),{x:p.getWidth()/2-3,y:24,size:9,font,color:gray(.4)}));
 doc.setTitle(project.title);doc.setAuthor(project.author);doc.setSubject(`Folio digital proof • revision ${project.revision}. Not printer certified.`);
 const bytes=await doc.save();const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(b=>b.toString(16).padStart(2,'0')).join('');
 return {bytes,hash,count:doc.getPageCount(),baseCount,warnings,chapterPages,revision:project.revision};
}
export async function generateCover(project,bleed=0) {
 const doc=await PDFDocument.create();const {width,height}=project.layout;const p=doc.addPage([width+2*bleed,height+2*bleed]);
 p.pushOperators(pushGraphicsState(),translate(bleed,bleed));
 doc.setCreationDate(new Date('2026-01-01T00:00:00Z'));doc.setModificationDate(new Date('2026-01-01T00:00:00Z'));
 // Uploaded artwork keeps the book text, but omits template borders and ornaments.
 if(project.coverArt){const img=await doc.embedPng((await transformedImage({...project.coverArt,gray:false,crop:0,rotation:0})).bytes);const s=Math.max((width+2*bleed)/img.width,(height+2*bleed)/img.height);p.drawImage(img,{x:(width-img.width*s)/2,y:(height-img.height*s)/2,width:img.width*s,height:img.height*s});}
 const font=await addFont(doc);
 const c=project.color.match(/\w\w/g).map(v=>parseInt(v,16)/255);const ink=rgb(.91,.87,.73);
 if(project.coverArt)p.drawRectangle({x:-bleed,y:-bleed,width:width+2*bleed,height:height+2*bleed,color:rgb(...c),opacity:.5});
 if(!project.coverArt){p.drawRectangle({x:-bleed,y:-bleed,width:width+2*bleed,height:height+2*bleed,color:rgb(...c)});p.drawRectangle({x:20,y:20,width:width-40,height:height-40,borderWidth:.7,borderColor:ink});}
 const centered=(text,size,y)=>{checkGlyphs(text,font);const lines=wrapText(text,font,size,width-70);lines.forEach((t,i)=>p.drawText(t,{x:(width-font.widthOfTextAtSize(t,size))/2,y:y-i*size*1.3,size,font,color:ink}));};
 centered(project.series?`${project.series}${project.volume?' · '+project.volume:''}`:'A PERSONAL EDITION',9,height-65);
 centered(project.title,30,height-135);if(project.subtitle)centered(project.subtitle,11,height-235);
 if(!project.coverArt){if(project.coverStyle==='botanical') {
  for(let i=0;i<12;i++){const y=height*.2+i*11;const a=i%2?1:-1;p.drawLine({start:{x:width/2,y},end:{x:width/2+a*(42-i*2),y:y+27},thickness:.8,color:ink});p.drawEllipse({x:width/2+a*(30-i*1.3),y:y+19,xScale:12,yScale:3,rotate:{type:'degrees',angle:a*30},color:ink,opacity:.7});}
  p.drawLine({start:{x:width/2,y:height*.2-15},end:{x:width/2,y:height*.2+145},color:ink,thickness:.8});
 }else{p.drawCircle({x:width/2,y:height*.38,size:55,borderColor:ink,borderWidth:.8});p.drawCircle({x:width/2,y:height*.38,size:40,borderColor:ink,borderWidth:.8});}}
 centered(project.author||'AUTHOR NAME',11,55);p.pushOperators(popGraphicsState());return doc.save();
}
export async function generateFullCover(project,dimensions,frontBytes){
 const profile=project.printProfile;
 if(!profile||profile.binding!=='paperback')throw Error('Select a verified paperback format first');
 const width=Number(dimensions.width),height=Number(dimensions.height),bleed=profile.bleed;
 const spine=width-2*profile.width-2*bleed;
 if(dimensions.unit!=='pt'||!Number.isFinite(spine)||spine<=0||Math.abs(height-profile.height-2*bleed)>.5)throw Error('Unsupported cover geometry. A verified paperback template is required.');
 const doc=await PDFDocument.create();doc.setCreationDate(new Date('2026-01-01T00:00:00Z'));doc.setModificationDate(new Date('2026-01-01T00:00:00Z'));
 const p=doc.addPage([width,height]),font=await addFont(doc);
 const color=rgb(...project.color.match(/\w\w/g).map(v=>parseInt(v,16)/255)),ink=rgb(.91,.87,.73);
 p.drawRectangle({x:0,y:0,width,height,color});
 const [front]=await doc.embedPdf(await generateCover(project,bleed));
 // Extend artwork through bleed. The full production spread is reviewed separately.
 p.drawPage(front,{x:profile.width+spine,y:0,width:profile.width+2*bleed,height:profile.height+2*bleed});
 const backText=wrapText(project.description||'',font,11,profile.width-80);
 if(backText.length*17>profile.height-190)throw Error('Back-cover description is too long for this format');
 backText.forEach((line,i)=>p.drawText(line,{x:bleed+40,y:height-bleed-75-i*17,size:11,font,color:ink}));
 if(spine>=22){
  const title=project.title;const size=Math.min(12,spine-12,(profile.height-100)/Math.max(1,font.widthOfTextAtSize(title,1)));
  p.drawText(title,{x:bleed+profile.width+spine/2+size/3,y:bleed+50,size,font,color:ink,rotate:degrees(90)});
 }
 if(profile.barcodeReserve){const b=profile.barcodeReserve;p.drawRectangle({x:bleed+b.x,y:bleed+b.y,width:b.width,height:b.height,color:rgb(1,1,1)});}
 return {bytes:await doc.save(),spine,width,height};
}
export function download(bytes,name,type='application/pdf'){const url=URL.createObjectURL(new Blob([bytes],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
