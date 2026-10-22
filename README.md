# Hardy-kuchuan

**库传微信小程序的 Windows / Mac / Codex 配套 Skill。**

在手机上收下链接，或记下想交给 AI 的任务；回到电脑后，让 Codex 把收件拉到本地。文字先作为待办保存，明确确认后再处理。

## 能做什么

- 绑定你的电脑与库传微信账号。
- 将链接保存为 Markdown 来源笔记，保留原始 URL。
- 将多行文字保存为待确认待办，保留原文。
- 增量同步、重复内容去重、断线重试时保留已存在的本地文件。
- 查看同步状态、诊断连接、解除本机绑定。

链接尚不提取正文。Skill 不常驻、不自动轮询，也不自动执行待办；未接 QMD 或内容生成。本仓库是电脑端技能，不含小程序与云端服务源码。

## 使用前提

- 原生 Windows 10/11 或 Mac，Node.js **22.13 或以上**。
- Windows 使用系统 PowerShell 和 Windows 版 Node.js；WSL/Linux 暂不支持。接收文件夹放在本机 NTFS 磁盘，避免网络盘和 FAT/exFAT 移动盘。
- 支持本地 Skill 与脚本执行的 Codex。
- 能访问配套的「库传」微信小程序。当前仍处于体验版联调，安装 Skill 不会自动获得小程序访问权限。
- 首次同步需联网，Mac 凭据由系统钥匙串保存；Windows 凭据使用 DPAPI CurrentUser 加密保存。

## 用户只需这样做

把本仓库下载的 ZIP 或仓库地址交给 Codex，说：

> 安装这个 Skill，帮我开始使用库传。

Agent 会读取包内说明，检查运行环境、展示手机入口、准备默认接收目录、生成绑定码，并引导你在手机确认。你不必填写服务地址、自己创建文件夹或复制终端命令。默认接收位置是系统 Documents 下的 `库传收件箱/00-Inbox/库传/`；已有配置继续使用原目录。

之后说 **“收取库传”** 即可。Agent 会拉取内容，报告保存位置；首次收取或你问“在哪看”时会打开目录。文字只作为待确认待办保存。

当前包附带体验版二维码，注明有效期限；过期后 Agent 会提示获取最新入口。体验版需要管理员添加你的微信号，安装技能不会自动获得访问权限。手机确认设备绑定必须由本人完成。

Skill 是 Agent 的操作说明和程序包，文件下载本身不会主动运行。安装时 Agent 可以接着引导；宿主没有加载技能时，新开会话说“开始使用库传”。缺少 Node 等运行环境时，Agent 会协助处理，系统授权仍由本人完成。

## 给 Agent 的安装说明

用户交付本包即从 `SKILL.md` 开始。找到 Node.js 22.13+ 后，在解压目录执行 `node install.cjs`，安装器将完整技能安装至 CODEX_HOME 或 `~/.codex` 下的 `skills/hardy-kuchuan`。已有同名目录时停止，不覆盖用户文件或设备凭据。可直接从下载目录读取技能并继续引导，安装之后无需再向用户索取长提示词。

包内包括 `scripts/setup.cjs`（离线检查及目录准备）、同步/凭据脚本、手机入口资源及 `references/onboarding.md`（完整排错指引）。无需安装 npm 依赖。主流程见 [SKILL.md](SKILL.md)。

电脑关机时，小程序仍可向已运行的云端服务保存内容；本地文件要等电脑开机并执行同步才会增加。

## 收件与待办规则

- 完整单条 HTTP(S) URL 按链接收集。
- 其余文字，包括夹带网址的段落，都按待办收下。
- 链接笔记状态：`pending-extraction`。
- 文字待办状态：`pending-confirmation`，并标记 `execution_authorized: false`。
- “同步完成”仅表示已保存到电脑，不表示授权执行。请在 Codex 当前会话明确指定要执行的任务与范围。

新绑定默认接收子目录为 `00-Inbox/库传/`。升级原 knowledge-inbox 用户时保留旧接收目录、设备授权及本机配置，不自动移动文件或重新绑定。原本地配置目录与钥匙串服务名中的 knowledge-inbox 是兼容标识，未随展示名改动。

## 命令

在技能目录中运行：

```sh
node scripts/inbox.cjs status
node scripts/inbox.cjs sync
node scripts/inbox.cjs doctor
```

首次绑定由 Skill 根据 `scripts/service.json` 中的服务地址及你的接收目录组织命令。不要在聊天中提供设备令牌。解除本机凭据使用 `node scripts/inbox.cjs logout`，云端设备授权可在小程序撤销。

## 配套服务

`scripts/service.json` 配置库传的 HTTPS 服务入口。入口地址是公开服务地址，不是访问凭据；个人收件需通过微信账号和本人确认的设备绑定访问。本仓库不含任何用户收件、绑定令牌、账号密码或开发者后台凭据。

Windows 凭据文件仅保存密文，位于当前用户主目录下的 `.config/knowledge-inbox/`，不能复制到其他电脑或系统用户后继续使用。同一 Windows 用户下运行的软件仍可能访问它，这不是同一系统账号内的软件隔离机制。

Windows 自动测试覆盖 DPAPI 保存/读取/损坏拒绝及 CLI 绑定、状态、同步、诊断、解绑；真实微信账号与个人 Windows 电脑仍需按下方流程验收。全文提取、自动任务执行和公开运营功能不在当前版本内。

## 新用户测试（Windows＋另一个微信号）

1. 先获得库传体验版入口，并让管理员把自己的微信号加入体验成员。GitHub 技能仓库不提供小程序访问权限。
2. 将下载包或仓库地址交给 Codex，说“安装这个 Skill，帮我开始使用库传”。
3. Agent 检查原生 Windows 环境并准备默认目录；有自选目录时告诉 Agent 即可，不需要自己创建。
4. 用自己的微信进入库传“管理”，填写此次电脑生成的绑定码，核对电脑名并确认。不要使用别人电脑上的绑定码或凭据。
5. 手机先保存 `https://example.com/?kuchuan=windows-user-b`，再保存“Windows 新用户测试：帮我整理课程提纲，先待确认”。
6. 对 Codex 说：使用 `$hardy-kuchuan` 同步库传，给我文件路径并列出待确认任务，不执行。默认文件在所选目录的 `00-Inbox/库传/`。
7. 再同步一次应新增 0 条。对比原 Mac 账号：双方不应看到对方专属内容。测试相同 URL 时分别写不同备注，确认各自收到自己的备注。
8. 电脑关闭时手机再存一条内容；重新开机后手动同步，应收到这一条。

真实双账号验收前不能承诺“绝不串库”。手机保存成功只代表云端收到，本地文件需电脑执行同步才生成。

DPAPI 依据：[Microsoft ProtectedData](https://learn.microsoft.com/en-us/dotnet/api/system.security.cryptography.protecteddata)。
