import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const API=process.env.PHARMABOARD_API_BASE||'http://localhost:8081/v1';
const WEB=process.env.PHARMABOARD_WEB_BASE_URL||'http://127.0.0.1:5174';
const suffix=Date.now();
async function req(path,method='GET',body,token){const r=await fetch(API+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:body===undefined?undefined:JSON.stringify(body)});const text=await r.text();return {status:r.status,data:text?JSON.parse(text):undefined};}
async function account(name,n){const phone='+2332'+String(suffix+n).slice(-8);const register=await req('/auth/register','POST',{account_kind:'pharmacist',display_name:name,phone_e164:phone});assert.equal(register.status,201);const otp=await req('/auth/otp/request','POST',{channel:'phone',contact:phone});const login=await req('/auth/otp/verify','POST',{channel:'phone',contact:phone,code:otp.data.dev_only_code});assert.equal(login.status,200);const token=login.data.access_token;const me=await req('/auth/me','GET',undefined,token);return {token,id:me.data.id};}
const author=await account('Workspace QA Author',0),other=await account('Workspace QA Colleague',1),third=await account('Workspace QA Observer',2);
const resourceIds=[];
const browser=await chromium.launch();const page=await browser.newPage({viewport:{width:1440,height:1050}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
fs.mkdirSync('/tmp/pharmaboard-workspace-qa',{recursive:true});
try{
 assert.equal((await req('/workspace?kind=jobs')).status,401);
 const id=crypto.randomUUID();resourceIds.push(id);const resource={kind:'jobs',title:`QA opportunity ${suffix}`,description:'Temporary end-to-end test opportunity. Removed after verification.',category:'Full-time',organization:'QA organization',location:'Accra',url:'https://example.com/jobs'};
 assert.equal((await req(`/workspace/${id}`,'PUT',resource,author.token)).status,200);
 assert.equal((await req(`/workspace/${id}`,'PUT',resource,author.token)).status,200);
 assert.equal((await req(`/workspace/${id}`,'PUT',{...resource,title:'Unauthorized overwrite'},other.token)).status,403);
 assert.equal((await req(`/workspace/${id}`,'DELETE',undefined,other.token)).status,404);
 assert.equal((await req(`/workspace/${crypto.randomUUID()}`,'PUT',{...resource,url:'javascript:alert(1)'},author.token)).status,400);
 assert.equal((await req(`/workspace/${id}/saved`,'PUT',{saved:true,completed:false},other.token)).status,204);
 const saved=await req('/workspace?kind=jobs&saved=true','GET',undefined,other.token);assert(saved.data.items.some(v=>v.id===id));
 assert(!(await req('/workspace?kind=jobs&saved=true','GET',undefined,author.token)).data.items.some(v=>v.id===id));
 console.log('PASS authentication, ownership, URL validation, idempotent publish, isolated saved state');
 await page.addInitScript(token=>localStorage.setItem('pharmaboard.access_token',token),author.token);
 await page.goto(WEB+'/home');await page.getByRole('heading',{name:'A stronger profession, together.'}).waitFor();await page.screenshot({path:'/tmp/pharmaboard-workspace-qa/overview.png',fullPage:true});
 await page.goto(WEB+'/sessions');await page.getByRole('button',{name:'Schedule a session',exact:true}).first().click();
 const dialog=page.getByRole('dialog');await dialog.getByLabel('Title',{exact:true}).fill(`QA journal club ${suffix}`);await dialog.getByLabel('Organization / host').fill('QA learning group');await dialog.getByLabel('Start time (your local time)').fill('2026-10-01T16:00');await dialog.getByLabel('Description',{exact:true}).fill('Temporary session for browser verification.');
 assert.equal(await dialog.locator('input[name="url"]').count(),0);
 await dialog.getByRole('button',{name:'Publish',exact:true}).click();await dialog.waitFor({state:'hidden'});
 const session=(await req('/workspace?kind=sessions&q='+suffix,'GET',undefined,author.token)).data.items[0];assert(session);resourceIds.push(session.id);assert(session.url.startsWith('https://meet.jit.si/PharmaBoard-'));

 const code=session.id.replaceAll('-','').slice(-12).toUpperCase().match(/.{4}/g).join('-');
 assert.equal((await req('/workspace/join/'+code)).status,401);
 assert.equal((await req('/workspace/join/INVALID','GET',undefined,other.token)).status,400);
 assert.equal((await req('/workspace/join/AB12-CD34-EF56','GET',undefined,other.token)).status,404);
 assert.equal((await req('/workspace/join/'+code.toLowerCase(),'GET',undefined,other.token)).data.id,session.id);
 await page.getByRole('button',{name:'Join with code',exact:true}).click();await dialog.getByLabel('Meeting code',{exact:true}).fill('FFFF-FFFF-FFFF');await dialog.getByRole('button',{name:'Find meeting',exact:true}).click();await dialog.getByText('No meeting matches that code.',{exact:false}).waitFor();await dialog.getByLabel('Meeting code',{exact:true}).fill(code);await dialog.getByRole('button',{name:'Find meeting',exact:true}).click();await dialog.getByText(code,{exact:true}).waitFor();await page.keyboard.press('Escape');
 console.log('PASS authenticated code lookup, cross-member joining, invalid/unknown codes and join form');
 await page.getByRole('button',{name:session.title,exact:true}).click();await page.getByRole('button',{name:'Join in PharmaBoard'}).click();await page.getByRole('heading',{name:'Ready when you are.'}).waitFor();await page.screenshot({path:'/tmp/pharmaboard-workspace-qa/collaboration.png',fullPage:true});
 // Check embed creation without joining a live third-party room or using the camera.
 await page.route('https://meet.jit.si/**',route=>route.fulfill({contentType:'text/html',body:'<p>Test media provider frame</p>'}));await page.getByRole('button',{name:'Enter meeting'}).click();assert.equal(await page.locator('iframe[allow*="display-capture"]').count(),1);await page.getByRole('button',{name:'Leave',exact:true}).click();
 console.log('PASS session form, automatic room creation, in-app prejoin and media permissions');
 await page.goto(WEB+'/learning');await page.getByRole('button',{name:'Share a lesson',exact:true}).first().click();await dialog.getByLabel('Title',{exact:true}).fill(`QA learning resource ${suffix}`);await dialog.getByLabel('Educator / channel').fill('QA educator');await dialog.getByLabel('YouTube video link').fill('https://www.youtube.com/watch?v=abcdefghijk');await dialog.getByLabel('Overview and chapters').fill('00:00 Introduction\n01:00 Discussion');await dialog.getByRole('button',{name:'Publish',exact:true}).click();await dialog.waitFor({state:'hidden'});
 const lesson=(await req('/workspace?kind=learning&q='+suffix,'GET',undefined,author.token)).data.items[0];resourceIds.push(lesson.id);
 await page.route('https://www.youtube-nocookie.com/**',route=>route.fulfill({contentType:'text/html',body:'<p>Test learning player</p>'}));await page.getByRole('button',{name:lesson.title,exact:true}).click();await dialog.getByRole('button',{name:'Mark complete',exact:true}).click();await dialog.getByRole('button',{name:'Mark incomplete',exact:true}).waitFor();await page.reload();assert((await req('/workspace?kind=learning&saved=true','GET',undefined,author.token)).data.items.some(v=>v.id===lesson.id&&v.completed));
 console.log('PASS lesson publication and persistent per-user learning completion');
 const conv=await req('/messaging/conversations','POST',{participant_ids:[other.id,third.id],title:`QA study team ${suffix}`},author.token);assert.equal(conv.status,201);const cid=conv.data.id;
 const view=await req(`/messaging/conversations/${cid}`,'GET',undefined,author.token);assert.equal(view.data.members.length,3);
 await page.goto(WEB+`/messaging/${cid}`);await page.getByRole('button',{name:'Video call',exact:true}).click();await page.getByRole('heading',{name:'Ready when you are.'}).waitFor();await page.getByRole('button',{name:'Leave',exact:true}).click();
 await page.getByLabel('Message',{exact:true}).fill('QA resource https://example.com/research');await page.getByRole('button',{name:'Send message',exact:true}).click();
 await page.getByText('QA resource https://example.com/research',{exact:true}).waitFor({timeout:15000});await page.getByRole('button',{name:'Shared links',exact:true}).click();await page.getByRole('link',{name:'https://example.com/research',exact:true}).waitFor();
 console.log('PASS named conversation members, video call start, persistent messages and shared links');
 await page.setViewportSize({width:390,height:844});await page.goto(WEB+'/home');await page.getByRole('heading',{name:'A stronger profession, together.'}).waitFor();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));await page.screenshot({path:'/tmp/pharmaboard-workspace-qa/mobile-overview.png',fullPage:true});
 await page.getByRole('button',{name:'Open navigation'}).click();await page.getByRole('navigation',{name:'Main navigation'}).getByRole('link',{name:'Careers',exact:true}).click();await page.getByRole('heading',{name:'Your next chapter starts here.'}).waitFor();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
 await page.goto(WEB+`/messaging/${cid}`);await page.getByLabel('Message',{exact:true}).waitFor();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));await page.screenshot({path:'/tmp/pharmaboard-workspace-qa/mobile-conversation.png',fullPage:true});
 assert.deepEqual(errors,[]);console.log('PASS mobile navigation, responsive overflow, no JavaScript exceptions');
} finally {for(const id of resourceIds)await req(`/workspace/${id}`,'DELETE',undefined,author.token);await browser.close();}
