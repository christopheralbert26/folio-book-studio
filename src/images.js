export async function imageFromBytes(bytes,mime) {
 const url=URL.createObjectURL(new Blob([bytes],{type:mime}));
 try { const img=new Image(); img.src=url; await img.decode(); return img; } finally { URL.revokeObjectURL(url); }
}
export async function importImage(file) {
 if(file.size>20*1024*1024)throw Error('Choose an image smaller than 20 MB.');
 const original=new Uint8Array(await file.arrayBuffer());let mime=file.type, bytes=original;
 if(/\.tiff?$/i.test(file.name)) { const {default:UTIF}=await import('utif');const pages=UTIF.decode(original.buffer);if(!pages.length)throw Error('This TIFF could not be decoded. Export it as PNG.');UTIF.decodeImage(original.buffer,pages[0]);const p=pages[0];if(p.width*p.height>40000000)throw Error('Image is too large. Export an image under 40 megapixels.');const canvas=document.createElement('canvas');canvas.width=p.width;canvas.height=p.height;canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(UTIF.toRGBA8(p)),p.width,p.height),0,0);bytes=new Uint8Array(await (await new Promise(r=>canvas.toBlob(r,'image/png'))).arrayBuffer());mime='image/png'; }
 if(!['image/png','image/jpeg','image/webp'].includes(mime))throw Error('Choose JPG, PNG, WebP, or TIFF.');
 const img=await imageFromBytes(bytes,mime);if(img.width*img.height>40000000)throw Error('Choose an image under 40 megapixels.');
 return {id:crypto.randomUUID(),name:file.name,original,bytes,mime,width:img.width,height:img.height,gray:true,rotation:0,scale:1,x:0,y:0,crop:0,caption:'',after:1};
}
export async function transformedImage(item) {
 const img=await imageFromBytes(item.bytes,item.mime);const crop=item.crop/100;const sw=img.width*(1-crop*2),sh=img.height*(1-crop*2);
 const canvas=document.createElement('canvas'); const rotated=item.rotation%180!==0;canvas.width=rotated?sh:sw;canvas.height=rotated?sw:sh;
 const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.translate(canvas.width/2,canvas.height/2);ctx.rotate(item.rotation*Math.PI/180);ctx.drawImage(img,img.width*crop,img.height*crop,sw,sh,-sw/2,-sh/2,sw,sh);
 const data=ctx.getImageData(0,0,canvas.width,canvas.height);let sum=0,squares=0;
 for(let i=0;i<data.data.length;i+=4){const g=Math.round(.2126*data.data[i]+.7152*data.data[i+1]+.0722*data.data[i+2]);if(item.gray)data.data[i]=data.data[i+1]=data.data[i+2]=g;sum+=g;squares+=g*g;}
 if(item.gray)ctx.putImageData(data,0,0);const n=canvas.width*canvas.height;
 const blob=await new Promise(r=>canvas.toBlob(r,'image/png'));
 return {bytes:new Uint8Array(await blob.arrayBuffer()),width:canvas.width,height:canvas.height,contrast:Math.sqrt(squares/n-(sum/n)**2)};
}
