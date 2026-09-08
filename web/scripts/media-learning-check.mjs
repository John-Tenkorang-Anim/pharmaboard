import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch();const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
const me='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',lessonId='bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',mediaId='cccccccc-cccc-4ccc-cccc-cccccccccccc';
const person={id:me,display_name:'Ama Mensah',account_kind:'student',verification_state:'unverified'};
let completed=false,cover='',posted='';
const lesson=()=>({id:lessonId,owner_id:me,kind:'learning',title:'Clinical reasoning',description:'An introduction to clinical reasoning.',category:'Clinical pharmacy',organization:'Learning faculty',url:'https://www.youtube.com/watch?v=abcdefghijk',completed,saved:true});
await page.addInitScript(()=>localStorage.setItem('pharmaboard.access_token','local-preview-only'));
await page.route('https://www.youtube-nocookie.com/**',r=>r.fulfill({contentType:'text/html',body:'<p>Embedded player test fixture</p>'}));
await page.route('**/v1/**',async route=>{
 const request=route.request(),u=new URL(request.url());let body={items:[],count:0,has_more:false,entries:[],learning:[]};
 if(u.pathname.endsWith('/auth/me'))body=person;
 else if(u.pathname.endsWith('/auth/cover')&&request.method()==='PUT'){cover='data:image/jpeg;base64,'+request.postDataJSON().image;body={image:cover};}
 else if(u.pathname.endsWith('/cover'))body={image:cover};
 else if(u.pathname.endsWith('/photo'))body={image:''};
 else if(u.pathname.endsWith('/media/'))body={id:mediaId,mime_type:'image/jpeg'};
 else if(u.pathname.endsWith('/media/'+mediaId)){await route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j9UQAAAAASUVORK5CYII=','base64')});return;}
 else if(u.pathname.endsWith('/workspace'))body={items:[lesson()],has_more:false};
 else if(u.pathname.endsWith('/saved')){completed=request.postDataJSON().completed;body={};}
 else if(u.pathname.endsWith('/community/people/'+me))body={profile:person,stats:{posts:0,followers:0,following:0},viewer_follows:false,is_self:true,posts:[]};
 else if(u.pathname.replace(/\/$/,'').endsWith('/community/feed')&&request.method()==='POST'){posted=request.postDataJSON().body;body={id:'new-post'};}
 await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
});
await page.goto('http://127.0.0.1:5174/learning');await page.getByRole('button',{name:'Start learning',exact:true}).click();await page.getByRole('heading',{name:'Clinical reasoning',exact:true}).waitFor();assert.equal(await page.locator('iframe').getAttribute('src'),'https://www.youtube-nocookie.com/embed/abcdefghijk?playsinline=1&rel=0');assert.equal(await page.getByRole('link',{name:'Open in YouTube'}).count(),0);await page.getByRole('button',{name:'Mark complete',exact:true}).click();await page.getByRole('button',{name:'Mark incomplete',exact:true}).waitFor();await page.screenshot({path:'/tmp/pharmaboard-learning-room.png'});
await page.goto('http://127.0.0.1:5174/notices/compose');await page.getByLabel('Notice body').fill('Important update');await page.getByLabel('Notice body').selectText();await page.getByRole('button',{name:'Bold',exact:true}).click();assert.equal(await page.getByLabel('Notice body').inputValue(),'**Important update**');await page.getByRole('button',{name:'Preview',exact:true}).click();assert.equal(await page.locator('strong').filter({hasText:'Important update'}).count(),1);
await page.goto('http://127.0.0.1:5174/home');
const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=32;c.height=32;const ctx=c.getContext('2d');ctx.fillStyle='blue';ctx.fillRect(0,0,32,32);return c.toDataURL('image/png').split(',')[1];});
await page.getByLabel('Attach photo or video').setInputFiles({name:'preview.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});await page.getByRole('button',{name:'Remove attachment from draft'}).waitFor();await page.getByRole('button',{name:'Publish post'}).click();await page.getByRole('button',{name:'Publish post'}).waitFor({state:'hidden'});assert(posted.includes('[media:'+mediaId+']'));
await page.goto('http://127.0.0.1:5174/people/'+me);await page.getByLabel('Choose profile cover').setInputFiles({name:'cover.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});await page.getByAltText('Profile cover').waitFor();assert(cover.startsWith('data:image/jpeg;base64,'));await page.reload();await page.getByAltText('Profile cover').waitFor();await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
assert.deepEqual(errors,[]);await browser.close();console.log('PASS embedded learning, completion control, formatting preview, media-only post, cover upload/reload and mobile sizing (mocked API)');
