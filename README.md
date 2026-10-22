# Hardy-kuchuan

**库传微信小程序的 Mac / Codex 配套 Skill。**

在手机上收下链接，或记下想交给 AI 的任务；回到电脑后，让 Codex 把收件拉到本地。文字先作为待办保存，明确确认后再处理。

## 能做什么

- 绑定你的电脑与库传微信账号。
- 将链接保存为 Markdown 来源笔记，保留原始 URL。
- 将多行文字保存为待确认待办，保留原文。
- 增量同步、重复内容去重、断线重试时保留已存在的本地文件。
- 查看同步状态、诊断连接、解除本机绑定。

链接尚不提取正文。Skill 不常驻、不自动轮询，也不自动执行待办；未接 QMD 或内容生成。本仓库是电脑端技能，不含小程序与云端服务源码。

## 使用前提

- Mac 和 Node.js **22.13 或以上**。
- 支持本地 Skill 与脚本执行的 Codex。
- 能访问配套的「库传」微信小程序。当前仍处于预览联调，安装 Skill 不会自动获得小程序访问权限。
- 首次同步需联网，设备凭据由 macOS 钥匙串保存。

## 安装

下载本仓库 ZIP 并解压，将包含 `SKILL.md` 的文件夹命名为 `hardy-kuchuan`，放到你的 Codex 技能目录，例如：

```text
~/.codex/skills/hardy-kuchuan/
├── SKILL.md
├── agents/openai.yaml
└── scripts/
    ├── inbox.cjs
    ├── sync.cjs
    └── service.json
```

重新打开 Codex 会话，然后说：

> 使用 $hardy-kuchuan，帮我绑定库传。我的本地接收目录是「填写你的绝对路径」。

Codex 会生成一次性绑定码。在库传小程序的“管理”里输入该码，核对电脑名称并确认。之后说：

> 使用 $hardy-kuchuan，同步库传，并列出待确认的任务。

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

本版本凭据管理面向 Mac。Windows、全文提取、自动任务执行和公开运营功能不在当前版本内。
