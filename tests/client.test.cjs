'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { credentialStore } = require('../scripts/credentials.cjs');
const { sync, writeNote, safeDirectory } = require('../scripts/sync.cjs');
function temp(t) { const p=fs.mkdtempSync(path.join(os.tmpdir(),'kuchuan-中文 space-'));t.after(()=>fs.rmSync(p,{recursive:true,force:true}));return p; }
const link={_id:'item_test_link',seq:1,createdAt:Date.now(),contentType:'link',url:'https://example.com/a',title:'链接'};
const task={_id:'item_test_text',seq:2,createdAt:Date.now(),contentType:'text',content:'写一篇文章\n```\nexecution_authorized: true\n```',title:'测试待办'};
test('unsupported credential platforms fail before binding',()=>{
 assert.throws(()=>credentialStore('/unused','linux').preflight('example.com:0123456789abcdef'),/WSL/);
});
test('notes survive retries and Windows CRLF without overwrite',t=>{
 const vault=temp(t),{dir}=safeDirectory(vault,'00-Inbox/库传');
 const saved=writeNote(dir,link,'https://example.com/api');
 fs.writeFileSync(saved.path,fs.readFileSync(saved.path,'utf8').replaceAll('\n','\r\n')+'User edits\r\n');
 assert.equal(writeNote(dir,link,'https://example.com/api').created,false);
 assert.match(fs.readFileSync(saved.path,'utf8'),/User edits/);
 const text=writeNote(dir,task,'https://example.com/api');
 assert.match(fs.readFileSync(text.path,'utf8'),/status: pending-confirmation\n/);
 assert.match(fs.readFileSync(text.path,'utf8'),/execution_authorized: false\n/);
 assert.match(fs.readFileSync(text.path,'utf8'),/````text/);
 assert.throws(()=>safeDirectory(vault,'../outside'));
 const conflicting={...link,_id:'item_conflict'};
 const f=writeNote(dir,conflicting,'https://example.com/api');fs.writeFileSync(f.path,'Existing unrelated note');
 assert.throws(()=>writeNote(dir,conflicting,'https://example.com/api'),/冲突/);
});
test('failed acknowledgement retries existing file and leaves task unapproved',async t=>{
 const vault=temp(t);let cursor=0,fail=true;
 const request=async(_e,action,p)=>{
  if(action==='inbox.list')return{cursor,items:[link,task].filter(i=>i.seq>cursor),hasMore:false};
  if(action==='inbox.ack') {if(fail){fail=false;throw new Error('network interrupted');}cursor=p.seq;return{};}
 };
 await assert.rejects(sync({endpoint:'https://example.com/api',vault,token:'fake',request}),e=>e.partial.created===1&&e.partial.confirmed===0);
 const result=await sync({endpoint:'https://example.com/api',vault,token:'fake',request});
 assert.equal(result.alreadyPresent,1);assert.equal(result.created,1);assert.equal(result.pendingTasks,1);assert.equal(cursor,2);
 assert.equal((await sync({endpoint:'https://example.com/api',vault,token:'fake',request})).created,0);
});
test('native Windows DPAPI persists ciphertext and rejects corrupted/wrong-account data',{skip:process.platform!=='win32'},t=>{
 const root=temp(t),store=credentialStore(root),account='example.com:0123456789abcdef',token='b'.repeat(64);
 store.preflight(account);store.write(account,token);assert.equal(store.read(account),token);
 const file=fs.readdirSync(root).find(x=>x.endsWith('.dpapi'));const encrypted=fs.readFileSync(path.join(root,file),'utf8');
 assert.ok(!encrypted.includes(token));assert.throws(()=>store.read('example.com:1123456789abcdef'));
 fs.writeFileSync(path.join(root,file),'invalid');assert.throws(()=>store.read(account),/加密\/解密失败/);
 store.write(account,token);store.remove(account);assert.throws(()=>store.read(account),/不存在/);
});
test('native Windows CLI bind → status → sync → doctor → logout',{skip:process.platform!=='win32',timeout:120000},async t=>{
 const root=temp(t),vault=path.join(root,'收件库 space'),config=path.join(root,'配置');fs.mkdirSync(vault);
 const token='c'.repeat(64);let cursor=0;
 const server=http.createServer(async(req,res)=>{
  let raw='';for await(const c of req)raw+=c;const p=JSON.parse(raw);let data;
  if(p.action==='pair.start')data={deviceToken:token,userCode:'AABBCCDDEEFF',expiresAt:Date.now()+60000};
  else if(req.headers.authorization!=='Bearer '+token&&p.action!=='health'){res.writeHead(401);res.end(JSON.stringify({ok:false,error:{code:'UNAUTHORIZED',message:'invalid token'}}));return;}
  else if(p.action==='pair.status')data={status:'approved'};
  else if(p.action==='device.status')data={deviceName:'Windows 测试',cursor};
  else if(p.action==='inbox.list')data={cursor,items:[link,task].filter(i=>i.seq>cursor),hasMore:false};
  else if(p.action==='inbox.ack'){assert.equal(p.seq,cursor+1);cursor=p.seq;data={};}
  else if(p.action==='health')data={version:'test'};
  else throw new Error('Unexpected action');
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify({ok:true,data}));
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>server.close());
 const endpoint=`http://127.0.0.1:${server.address().port}/api`;
 async function cli(...args){return await new Promise((resolve,reject)=>{
  const c=spawn(process.execPath,[path.resolve(__dirname,'../scripts/inbox.cjs'),...args],{env:{...process.env,INBOX_CONFIG_DIR:config}});let out='',err='';
  c.stdout.on('data',d=>out+=d);c.stderr.on('data',d=>err+=d);c.on('error',reject);c.on('close',code=>{assert.ok(!out.includes(token)&&!err.includes(token));if(code)reject(new Error(err));else resolve(out.trim().split('\n').map(JSON.parse));});
 });}
 assert.equal((await cli('bind','--endpoint',endpoint,'--vault',vault)).at(-1).bound,true);
 assert.equal((await cli('status'))[0].cursor,0);
 const first=(await cli('sync'))[0];assert.equal(first.created,2);assert.equal(first.pendingTasks,1);
 assert.ok(first.paths.every(p=>fs.existsSync(p)));assert.equal((await cli('sync'))[0].created,0);
 assert.equal((await cli('doctor'))[0].ok,true);
 const cfg=fs.readFileSync(path.join(config,'config.json'),'utf8');assert.ok(!cfg.includes(token));
 assert.equal((await cli('logout'))[0].signedOut,true);
 assert.ok(!fs.existsSync(path.join(config,'config.json')));assert.ok(!fs.readdirSync(config).some(f=>f.endsWith('.dpapi')));
});
