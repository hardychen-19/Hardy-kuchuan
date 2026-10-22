#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const { api, sync, validateEndpoint, safeDirectory } = require('./sync.cjs');
const root = process.env.INBOX_CONFIG_DIR || path.join(os.homedir(), '.config', 'knowledge-inbox');
const configPath = path.join(root, 'config.json');
const SERVICE = 'knowledge-inbox.device';
function argsOf(args) {
  const result = { command: args.shift() || 'status' };
  while (args.length) {
    const key = args.shift(); if (!key.startsWith('--') || !args.length) throw new Error('参数格式：--参数 值');
    result[key.slice(2)] = args.shift();
  }
  return result;
}
function load() { if (!fs.existsSync(configPath)) throw new Error('尚未绑定。请先执行 bind'); return JSON.parse(fs.readFileSync(configPath, 'utf8')); }
function store(config) {
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  const tmp = configPath + '.tmp-' + process.pid;
  fs.writeFileSync(tmp, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(tmp, configPath);
}
function keychainAccount(endpoint) { return new URL(endpoint).host + ':' + require('node:crypto').createHash('sha256').update(endpoint).digest('hex').slice(0,16); }
function keychainWrite(account, token) {
  if (process.platform !== 'darwin') throw new Error('此MVP的凭据绑定先支持Mac');
  // security interactive stdin keeps the token out of argv, process listings and shell history.
  if (!/^[a-f0-9]{64}$/.test(token) || !/^[a-zA-Z0-9.:[\]-]+:[a-f0-9]{16}$/.test(account)) throw new Error('凭据格式错误');
  execFileSync('/usr/bin/security', ['-i'], {
    input: `add-generic-password -U -s "${SERVICE}" -a "${account}" -w "${token}"\n`,
    stdio: ['pipe','pipe','pipe'], timeout: 30000
  });
  const stored = keychainRead(account);
  if (stored !== token) throw new Error('钥匙串保存失败，未记录绑定配置');
}
function keychainRead(account) {
  return execFileSync('/usr/bin/security', ['find-generic-password', '-s', SERVICE, '-a', account, '-w'], { encoding: 'utf8', stdio: ['ignore','pipe','pipe'], timeout: 30000 }).trim();
}
function repairLock(config, remove = false) {
  const { dir } = safeDirectory(config.vault, config.subdir);
  const file = path.join(dir, '.inbox-sync.lock');
  if (!fs.existsSync(file)) return { lock: 'none' };
  const st = fs.lstatSync(file); if (!st.isFile() || st.isSymbolicLink()) throw new Error('同步锁不是普通文件，需人工检查');
  let info; try { info = JSON.parse(fs.readFileSync(file,'utf8')); } catch { throw new Error('同步锁内容损坏，需人工检查'); }
  if (!Number.isSafeInteger(info.pid) || info.pid < 1) throw new Error('同步锁PID无效');
  try { process.kill(info.pid, 0); return { lock: 'running', pid: info.pid }; }
  catch (e) {
    if (e.code !== 'ESRCH') throw new Error('无法确认同步进程是否存活，保留锁文件');
    if (remove) { fs.unlinkSync(file); return { lock: 'stale-removed' }; }
    return { lock: 'stale', recovery: 'doctor --repair-lock yes' };
  }
}
async function main(args = process.argv.slice(2)) {
  const a = argsOf(args);
  if (a.command === 'bind') {
    const endpoint = validateEndpoint(a.endpoint || '');
    const vault = fs.realpathSync(a.vault || '');
    const subdir = a.subdir || '00-Inbox/库传'; safeDirectory(vault, subdir);
    if (fs.existsSync(configPath) && a.replace !== 'yes') throw new Error('已有绑定配置；重新绑定请明确添加 --replace yes，旧设备需在小程序解除');
    const r = await api(endpoint, 'pair.start', { deviceName: a.name || os.hostname() });
    const code = r.userCode;
    console.log(JSON.stringify({ step: 'confirm-in-mini-program', userCode: code, expiresAt: r.expiresAt, message: '请打开库传小程序，填入此绑定码，核对设备后确认。' }));
    while (Date.now() < r.expiresAt) {
      const status = await api(endpoint, 'pair.status', {}, r.deviceToken);
      if (status.status === 'approved') {
        const account = keychainAccount(endpoint);
        keychainWrite(account, r.deviceToken);
        store({ version: 1, endpoint, vault, subdir, keychainAccount: account });
        console.log(JSON.stringify({ bound: true, vault, contentStatus: 'links-and-pending-tasks' })); return;
      }
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    throw new Error('绑定码已过期，请重新执行 bind');
  }
  const config = load();
  if (a.command === 'logout') {
    execFileSync('/usr/bin/security', ['delete-generic-password', '-s', SERVICE, '-a', config.keychainAccount], { stdio: ['ignore','pipe','pipe'] });
    fs.renameSync(configPath, configPath + '.signed-out-' + Date.now());
    console.log(JSON.stringify({ signedOut: true, message: '本机凭据已移除，请在小程序中解除旧设备。' })); return;
  }
  if (a.command === 'doctor') {
    const lock = repairLock(config, a['repair-lock'] === 'yes');
    const health = await api(config.endpoint, 'health');
    const device = await api(config.endpoint, 'device.status', {}, keychainRead(config.keychainAccount));
    console.log(JSON.stringify({ ok: true, vault: config.vault, health, device, ...lock })); return;
  }
  const token = keychainRead(config.keychainAccount);
  if (a.command === 'status') console.log(JSON.stringify({ ...(await api(config.endpoint, 'device.status', {}, token)), vault: config.vault, subdir: config.subdir }));
  else if (a.command === 'sync') console.log(JSON.stringify(await sync({ ...config, token })));
  else throw new Error('支持 bind、sync、status、doctor、logout');
}
if (require.main === module) main().catch(e => {
  // Never print a stack, child-process error or request options; these can contain credentials.
  const message = e.code === 'ENOTFOUND' || e.name === 'TimeoutError' || e.message === 'fetch failed'
    ? '后端未连接或请求超时，请检查网络与服务地址'
    : e.code === 'UNAUTHORIZED' ? '设备授权已失效，请在小程序重新绑定'
    : e.message.startsWith('Command failed:') ? '系统钥匙串操作失败，请在Mac上完成授权后重试'
    : e.message;
  console.error(JSON.stringify({ ok: false, error: message, ...(e.partial ? { partial: e.partial } : {}) })); process.exitCode = 1;
});
module.exports = { main, argsOf, keychainAccount };
