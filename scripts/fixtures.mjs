import {PDFDocument,StandardFonts} from 'pdf-lib';
import JSZip from 'jszip';
import fs from 'node:fs/promises';
await fs.mkdir('test-fixtures',{recursive:true});
const doc=await PDFDocument.create();const font=await doc.embedFont(StandardFonts.TimesRoman);doc.setTitle('A Test of Pages');doc.setAuthor('Folio QA');
for(let i=0;i<3;i++){const page=doc.addPage(i===2?[612,396]:[396,612]);page.drawText('Original page '+(i+1),{x:50,y:300,size:20,font});}
await fs.writeFile('test-fixtures/manuscript.pdf',await doc.save());
const zip=new JSZip();zip.file('mimetype','application/epub+zip');zip.file('META-INF/container.xml','<?xml version="1.0"?><container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/book.opf"/></rootfiles></container>');zip.file('OEBPS/book.opf','<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Across the Meadow</dc:title><dc:creator>Folio QA</dc:creator></metadata><manifest><item id="c1" href="chapter.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="c1"/></spine></package>');zip.file('OEBPS/chapter.xhtml','<html xmlns="http://www.w3.org/1999/xhtml"><body><h1>Across the meadow</h1>'+Array.from({length:20},()=>'<p>The path wandered through a quiet meadow. Beyond the trees, the river carried the afternoon light toward home.</p>').join('')+'</body></html>');await fs.writeFile('test-fixtures/manuscript.epub',await zip.generateAsync({type:'nodebuffer'}));await fs.writeFile('test-fixtures/corrupt.pdf','not a real PDF');
console.log('Created synthetic PDF, EPUB, and corrupt-file fixtures.');
