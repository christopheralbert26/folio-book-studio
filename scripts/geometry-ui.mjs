import fs from 'node:fs';
let s=fs.readFileSync('src/main.jsx','utf8');
s=s.replace("const [coverHash,setCoverHash]=useState('');", "const [coverHash,setCoverHash]=useState('');\n const [bookGeometry,setBookGeometry]=useState(null);");
s=s.replace(' const change=changes=>', ` useEffect(()=>{let cancel=false;setBookGeometry(null);if(project?.printProfile&&proof?.count)api('dimensions',{profileId:project.printProfile.id,count:proof.count}).then(d=>{if(!cancel&&d.unit==='pt')setBookGeometry({spine:Number(d.width)-2*project.printProfile.width-2*project.printProfile.bleed});}).catch(()=>{});return()=>{cancel=true;};},[project?.printProfile?.id,proof?.count]);
 const change=changes=>`);
s=s.replace("style={{'--book-color':project.color,transform:","style={{'--book-color':project.color,'--spine-width':bookGeometry?`${225*bookGeometry.spine/project.layout.width}px`:'30px',width:'225px',height:`${225*project.layout.height/project.layout.width}px`,transform:");
s=s.replace('Concept mockup · thickness is illustrative.<br/>Final spine width needs a printer specification.',"{bookGeometry?`Spine ${(bookGeometry.spine/72).toFixed(3)} in · printer dimensions`:'Concept mockup · thickness is illustrative.'}<br/>Inspect the full-cover PDF before approving production.");
fs.writeFileSync('src/main.jsx',s);
