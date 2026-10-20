import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {PDFDocument} from 'pdf-lib';
import {generateProof,generateCover,generateFullCover} from '../src/generation.js';
import {newProject} from '../src/model.js';
const originalFetch=globalThis.fetch;
globalThis.fetch=async url=>typeof url==='string'&&url.startsWith('/fonts/')?new Response(await fs.readFile(new URL('../public'+url,import.meta.url))):originalFetch(url);
test('PDF reordering preserves dimensions and remaps warning links',async()=>{
 const source=await PDFDocument.create();source.addPage([396,612]);source.addPage([612,396]);source.addPage([396,612]);
 const project={...newProject(),source:{type:'pdf',bytes:await source.save(),warnings:[{text:'Landscape',page:2}]},pageOrder:[2,0,1]};
 const proof=await generateProof(project);const doc=await PDFDocument.load(proof.bytes);
 assert.equal(doc.getPageCount(),3);assert.equal(doc.getPage(2).getWidth(),612);assert.equal(proof.warnings[0].page,3);
});
test('front and full cover dimensions include verified bleed and spine',async()=>{
 const p={...newProject(),title:'An edition',author:'Test author',description:'A short description.',printProfile:{binding:'paperback',width:396,height:612,bleed:9}};
 const front=await generateCover(p),frontDoc=await PDFDocument.load(front);
 assert.deepEqual(frontDoc.getPage(0).getSize(),{width:396,height:612});
 const full=await generateFullCover(p,{width:'830',height:'630',unit:'pt'},front);
 assert.equal(full.spine,20);assert.deepEqual((await PDFDocument.load(full.bytes)).getPage(0).getSize(),{width:830,height:630});
 await assert.rejects(generateFullCover(p,{width:'830',height:'620',unit:'pt'},front),/geometry/);
 assert.deepEqual(await generateCover(p),front,'unchanged cover bytes must be deterministic for approval');
});
test('EPUB print editions receive even page counts and recto chapter starts',async()=>{
 const p={...newProject(),printProfile:{id:'fixture'},source:{type:'epub',warnings:[],chapters:[{title:'One',blocks:[{type:'heading',text:'One'},{type:'text',text:'A short paragraph.'}]},{title:'Two',blocks:[{type:'heading',text:'Two'},{type:'text',text:'An emphasized paragraph.',runs:[{text:'An ',bold:false},{text:'emphasized',bold:true,italic:true},{text:' paragraph.'}]}]}]}};
 const proof=await generateProof(p);assert.equal(proof.count%2,0);assert(proof.chapterPages.every(c=>c.page%2===1));
});
