import fs from 'node:fs';
fs.writeFileSync('app/page.tsx',`import Studio from "./studio";\nexport default function Home() { return <Studio/>; }\n`);
fs.writeFileSync('app/layout.tsx',`import "../src/style.css";
export const metadata={title:"Folio Book Studio",description:"Prepare, review, and preserve your personal book edition."};
export default function Layout({children}:{children:React.ReactNode}) {return <html lang="en"><body>{children}</body></html>;}
`);
let s=fs.readFileSync('src/main.jsx','utf8');
s=s.replace("import {createRoot} from 'react-dom/client';",'').replace('function App(){','export default function App(){').replace("createRoot(document.getElementById('root')).render(<App/>);",'');
fs.writeFileSync('src/main.jsx',s);
fs.appendFileSync('.gitignore','\n.sites-runtime/\n.wrangler/\n.vinext/\n.next/\n.dev.vars\n');
