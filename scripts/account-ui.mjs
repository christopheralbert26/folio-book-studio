import fs from 'node:fs';
let s=fs.readFileSync('src/main.jsx','utf8');
s=s.replace('<span className="mode"><span/> Preview studio</span>',`<a className="account-link" href={signedIn?'/signout-with-chatgpt?return_to=/':'/signin-with-chatgpt?return_to=/'} target="_top">{signedIn?'Sign out':'Sign in with ChatGPT'}</a>`);
s=s.replace("<div className=\"project-grid\">",`{!signedIn&&<Notice><a href="/signin-with-chatgpt?return_to=/" target="_top">Sign in with ChatGPT</a> to access your private library.</Notice>}<div className="project-grid">`);
fs.writeFileSync('src/main.jsx',s);
