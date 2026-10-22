#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const { safeDirectory, validateEndpoint } = require('./sync.cjs');

function powershell(script, input = '') {
  const exe = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  try {
    return execFileSync(exe, ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], {
      input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, timeout: 15000
    }).trim();
  } catch { throw new Error('无法查询 Windows 本地文档目录或磁盘，请检查系统 PowerShell'); }
}
function defaultVault() {
  const documents = process.platform === 'win32'
    ? powershell("[Console]::OutputEncoding = [Text.UTF8Encoding]::new(); [Console]::Out.Write([Environment]::GetFolderPath('MyDocuments'))")
    : path.join(os.homedir(), 'Documents');
  if (!documents || !path.isAbsolute(documents)) throw new Error('系统未提供文档目录，请指定 --vault 绝对路径');
  return path.join(documents, '库传收件箱');
}
function entryInfo(file, now = Date.now()) {
  const info = JSON.parse(fs.readFileSync(file, 'utf8'));
  const expires = Date.parse(info.validBefore);
  const available = Number.isFinite(expires) && now < expires && fs.existsSync(path.resolve(path.dirname(file), info.qrFile));
  return { appId: info.appId, stage: info.stage, validBefore: info.validBefore,
    qrStatus: available ? 'available' : 'expired-or-missing',
    qrPath: available ? path.resolve(path.dirname(file), info.qrFile) : null,
    membershipRequired: info.membershipRequired, updateUrl: info.updateUrl };
}
function setup({ prepare = false, vault, configRoot = process.env.INBOX_CONFIG_DIR || path.join(os.homedir(), '.config', 'knowledge-inbox'), platform = process.platform } = {}) {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 22 || (major === 22 && minor < 13)) throw new Error('需要 Node.js 22.13 或以上版本');
  if (!['darwin', 'win32'].includes(platform)) throw new Error('请使用原生 Windows 或 macOS；WSL/Linux 暂不支持');
  const configPath = path.join(configRoot, 'config.json');
  const hasConfig = fs.existsSync(configPath);
  const config = hasConfig ? JSON.parse(fs.readFileSync(configPath, 'utf8')) : null;
  // Existing settings always win. Do not expose credential identifiers or secrets.
  const target = config ? config.vault : vault || defaultVault();
  const subdir = config ? config.subdir : '00-Inbox/库传';
  if (typeof target !== 'string' || !path.isAbsolute(target)) throw new Error('收件根目录必须是绝对路径');
  if (typeof subdir !== 'string' || path.isAbsolute(subdir) || subdir.split(/[\\/]/).some(p => p === '..' || p === '.')) throw new Error('收件子目录配置无效');
  const service = JSON.parse(fs.readFileSync(path.join(__dirname, 'service.json'), 'utf8'));
  const endpoint = validateEndpoint(config ? config.endpoint : service.endpoint);
  if (!config && (service.mode !== 'cloud' || !endpoint.startsWith('https://'))) throw new Error('尚未配置真实 HTTPS 云服务');
  let inboxPath = path.join(target, subdir);
  if (prepare && !hasConfig) {
    if (platform === 'win32') {
      if (!/^[A-Za-z]:[\\/]/.test(target)) throw new Error('请选择本机 NTFS 目录，不使用网络共享目录');
      const kind = powershell("$ErrorActionPreference='Stop'; [Console]::InputEncoding=[Text.UTF8Encoding]::new(); $p=[Console]::In.ReadToEnd(); $d=[IO.DriveInfo]::new([IO.Path]::GetPathRoot($p)); [Console]::Out.Write($d.DriveFormat + ':' + $d.DriveType)", target);
      if (kind !== 'NTFS:Fixed') throw new Error('默认收件目录不在本机固定 NTFS 磁盘，请指定本地目录');
    }
    fs.mkdirSync(target, { recursive: true, mode: 0o700 });
    inboxPath = safeDirectory(target, subdir).dir;
    const probe = fs.mkdtempSync(path.join(inboxPath, '.kuchuan-check-'));
    try {
      fs.writeFileSync(path.join(probe, 'a'), 'probe', { flag: 'wx', mode: 0o600 });
      fs.linkSync(path.join(probe, 'a'), path.join(probe, 'b'));
    } finally { fs.rmSync(probe, { recursive: true, force: true }); }
  }
  return { platform, node: process.versions.node, hasConfig, next: hasConfig ? 'status' : 'bind',
    vault: target, subdir, inboxPath, endpoint,
    bindArgs: hasConfig ? null : [path.join(__dirname, 'inbox.cjs'), 'bind', '--endpoint', endpoint, '--vault', target],
    entry: entryInfo(path.join(__dirname, '../assets/mini-program.json')) };
}
if (require.main === module) {
  try {
    const args = process.argv.slice(2); let prepare = false, vault;
    while (args.length) {
      const a = args.shift();
      if (a === '--prepare') prepare = true;
      else if (a === '--vault' && args.length) vault = args.shift();
      else throw new Error('用法：setup.cjs [--prepare] [--vault 绝对路径]');
    }
    console.log(JSON.stringify(setup({ prepare, vault })));
  } catch (e) { console.error(JSON.stringify({ ok: false, error: e.message })); process.exitCode = 1; }
}
module.exports = { setup, entryInfo };
