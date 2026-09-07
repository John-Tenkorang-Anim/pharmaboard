// Writes a reusable build configuration; never changes the active deployment.
import {writeFileSync, mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
const args=process.argv.slice(2);const value=key=>{const i=args.indexOf(key);return i<0?undefined:args[i+1];};
const field=value('--field');const output=value('--output');const api=value('--api');
if(!field || !output || !api)throw new Error('Usage: node scripts/configure-platform.mjs --field "Computer Engineering" --api https://your-api.example/v1 --output /path/to/config');
if(!/^[\p{L}\p{N} &().-]{2,100}$/u.test(field))throw new Error('Use a plain discipline name (2–100 characters).');
const url=new URL(api);if(url.protocol!=='https:' && !(url.protocol==='http:' && ['localhost','127.0.0.1'].includes(url.hostname)))throw new Error('Provide HTTPS, or a localhost API for development.');
if(url.username || url.password || url.search || url.hash)throw new Error('The API URL must not contain credentials, query parameters or fragments.');
const dir=resolve(output);mkdirSync(dir,{recursive:true});
const name=field.toLowerCase()==='pharmacy'?'PharmaBoard':`${field} Board`;
writeFileSync(resolve(dir,'.env.production'),`VITE_PLATFORM_DISCIPLINE=${field}\nVITE_PLATFORM_NAME=${name}\nVITE_API_BASE_URL=${url.href}\n`,{flag:'wx'});
writeFileSync(resolve(dir,'README.md'),`# ${name}\n\nCopy .env.production into the web directory of a separate deployment, then run npm run build. Branding, signup defaults, forum title and learning topics adapt to ${field}.\n\nProvision a separate PostgreSQL database and API for this deployment and apply the repository migrations once. Do not point independent schools at the pharmacy API: this application does not yet implement multi-tenant isolation. No accounts, credentials or hosting are created by this configuration generator.\n`,{flag:'wx'});
console.log(`Created ${name} build configuration in ${dir}. The active pharmacy deployment is unchanged.`);
