import React, {useEffect, useState} from 'react';
import {Leaf} from 'lucide-react';

export default function LibraryCover({project, onOpen}) {
 const art = project.coverArt;
 const [image, setImage] = useState(null);
 useEffect(() => {
  if (!art?.bytes) {
   setImage(null);
   return;
  }
  // Use the browser-readable bytes, including the PNG conversion for TIFFs.
  const url = URL.createObjectURL(new Blob([art.bytes], {type: art.mime}));
  setImage({art, url});
  return () => URL.revokeObjectURL(url);
 }, [art]);
 const showArt = image?.art === art && Boolean(image?.url);
 return <button
  className={'project-cover' + (showArt ? ' has-art' : '')}
  style={{background: project.color}}
  aria-label={`Open ${project.title}`}
  onClick={() => onOpen(project)}
 >
  {showArt
   ? <img src={image.url} alt={`Uploaded cover for ${project.title}`} onError={() => setImage(null)}/>
   : <><Leaf size={35}/><h2>{project.title}</h2><p>{project.author || 'Your personal edition'}</p></>}
 </button>;
}
