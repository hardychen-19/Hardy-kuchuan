#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const [major,minor]=process.versions.node.split('.').map(Number);
if(major<22||(major===22&&minor<13))throw new Error('需要 Node.js 22.13 或以上版本');
if(!['darwin','win32'].includes(process.platform))throw new Error('请在原生 Windows 或 macOS 安装；WSL/Linux 暂不支持');
const files=['SKILL.md','agents/openai.yaml','scripts/inbox.cjs','scripts/sync.cjs','scripts/credentials.cjs','scripts/service.json','scripts/setup.cjs','references/onboarding.md','assets/mini-program.json','assets/mini-program-trial.png'];
const parent=path.join(process.env.CODEX_HOME||path.join(os.homedir(),'.codex'),'skills');
const dest=path.join(parent,'hardy-kuchuan');
if(fs.existsSync(dest))throw new Error('同名技能已经存在，未覆盖。请让 Codex 检查后更新技能文件；无需重新绑定或复制凭据。');
for(const f of files)if(!fs.statSync(path.join(__dirname,f)).isFile())throw new Error('安装包缺少文件：'+f);
fs.mkdirSync(parent,{recursive:true});
const staging=fs.mkdtempSync(path.join(parent,'.kuchuan-install-'));
try{
 for(const f of files){const target=path.join(staging,f);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(__dirname,f),target);}
 fs.renameSync(staging,dest);
}catch(e){fs.rmSync(staging,{recursive:true,force:true});throw e;}
console.log(JSON.stringify({installed:dest,next:'安装已完成。Agent 请读取已安装的 SKILL.md 并继续首次使用引导；用户也可说“开始使用库传”。已有配置会保留。'}));
