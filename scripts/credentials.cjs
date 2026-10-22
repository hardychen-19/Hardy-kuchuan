'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const SERVICE = 'knowledge-inbox.device';
const TOKEN = /^[a-f0-9]{64}$/;
const ACCOUNT = /^[a-zA-Z0-9.:[\]-]+:[a-f0-9]{16}$/;
// The command contains no secrets. JSON payloads travel over stdin, never argv.
const DPAPI = `
$ErrorActionPreference = 'Stop'
try {
  Add-Type -AssemblyName System.Security
  $p = [Console]::In.ReadToEnd() | ConvertFrom-Json
  $entropy = [Text.Encoding]::UTF8.GetBytes($p.entropy)
  $scope = [Security.Cryptography.DataProtectionScope]::CurrentUser
  if ($p.action -eq 'protect') {
    $bytes = [Text.Encoding]::UTF8.GetBytes($p.value)
    $cipher = [Security.Cryptography.ProtectedData]::Protect($bytes, $entropy, $scope)
    [Console]::Out.Write([Convert]::ToBase64String($cipher))
  } elseif ($p.action -eq 'unprotect') {
    $bytes = [Convert]::FromBase64String($p.value)
    $plain = [Security.Cryptography.ProtectedData]::Unprotect($bytes, $entropy, $scope)
    [Console]::Out.Write([Text.Encoding]::UTF8.GetString($plain))
  } else { exit 1 }
} catch { [Console]::Error.Write('DPAPI operation failed'); exit 1 }
`;
function credentialStore(root, platform = process.platform) {
  function supported() {
    if (!['darwin','win32'].includes(platform)) throw new Error('请使用原生 Windows 或 macOS；WSL/Linux 暂不支持设备凭据保存');
  }
  function check(account) { supported(); if (!ACCOUNT.test(account)) throw new Error('凭据条目格式错误'); }
  function filename(account) { check(account); return path.join(root, 'device-' + crypto.createHash('sha256').update(account).digest('hex') + '.dpapi'); }
  function protect(action, account, value) {
    check(account);
    const exe = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    try {
      return execFileSync(exe, ['-NoLogo','-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(DPAPI,'utf16le').toString('base64')], {
        input: JSON.stringify({ action, entropy: SERVICE + ':' + account, value }), encoding:'utf8',
        stdio:['pipe','pipe','pipe'], windowsHide:true, timeout:30000, maxBuffer:65536
      }).trim();
    } catch { throw new Error('Windows 凭据加密/解密失败；请使用原来绑定的 Windows 登录用户，并检查系统 PowerShell 是否可用'); }
  }
  function read(account) {
    check(account);
    let token;
    if (platform === 'darwin') {
      try { token = execFileSync('/usr/bin/security',['find-generic-password','-s',SERVICE,'-a',account,'-w'],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:30000}).trim(); }
      catch { throw new Error('Mac 钥匙串读取失败，请检查授权或重新绑定'); }
    } else {
      const file = filename(account);
      if (!fs.existsSync(file)) throw new Error('本机加密凭据不存在，请重新绑定');
      const st = fs.lstatSync(file);
      if (!st.isFile() || st.isSymbolicLink() || st.size > 16384) throw new Error('本机凭据文件无效');
      token = protect('unprotect', account, fs.readFileSync(file,'utf8'));
    }
    if (!TOKEN.test(token)) throw new Error('本机凭据内容无效，请重新绑定');
    return token;
  }
  function write(account, token) {
    check(account); if (!TOKEN.test(token)) throw new Error('凭据格式错误');
    if (platform === 'darwin') {
      try { execFileSync('/usr/bin/security',['-i'],{input:`add-generic-password -U -s "${SERVICE}" -a "${account}" -w "${token}"\n`,stdio:['pipe','pipe','pipe'],timeout:30000}); }
      catch { throw new Error('Mac 钥匙串保存失败，请完成系统授权后重试'); }
    } else {
      const encrypted = protect('protect',account,token);
      if (!/^[A-Za-z0-9+/]+=*$/.test(encrypted) || encrypted.length < 64 || encrypted.length > 16384) throw new Error('Windows 凭据加密输出无效');
      fs.mkdirSync(root,{recursive:true,mode:0o700});
      const file = filename(account), tmp = file + '.' + crypto.randomBytes(8).toString('hex') + '.tmp';
      try {
        fs.writeFileSync(tmp,encrypted,{flag:'wx',mode:0o600});
        fs.renameSync(tmp,file);
      } finally { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); }
    }
    if (read(account) !== token) throw new Error('凭据保存校验失败，未记录绑定配置');
  }
  function remove(account) {
    check(account);
    if (platform === 'darwin') {
      try { execFileSync('/usr/bin/security',['delete-generic-password','-s',SERVICE,'-a',account],{stdio:['ignore','pipe','pipe'],timeout:30000}); }
      catch { throw new Error('Mac 钥匙串删除失败，请检查系统授权'); }
    } else {
      const file = filename(account);
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
  }
  function preflight(account) {
    check(account);
    if (platform === 'win32') {
      const probe = crypto.randomBytes(32).toString('hex');
      if (protect('unprotect',account,protect('protect',account,probe)) !== probe) throw new Error('Windows 凭据自检失败');
    }
  }
  return { read, write, remove, preflight, kind: platform === 'win32' ? 'windows-dpapi' : 'macos-keychain' };
}
module.exports = { credentialStore };
