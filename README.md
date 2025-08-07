# NekoInbox - 用户反馈与建议插件

[![](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![](https://img.shields.io/badge/Powered%20by-Cloudflare-orange.svg)](https://www.cloudflare.com/)
[![](https://img.shields.io/badge/Made%20with-Love-red.svg)](https://github.com/JQ-28/NekoInbox)

这是一个全栈项目，旨在通过 NoneBot2 机器人收集用户的反馈与建议，并将其展示在一个美观、交互性强的网页上。网页由 Cloudflare Pages 和 Workers 驱动，实现了数据的展示、排序、管理等功能。

## 🌐 在线体验

您可以访问以下地址在线体验NekoInbox：

**[https://input.nekodayo.top](https://input.nekodayo.top)**

## ✨ 项目特色

- **前后端分离**: NoneBot2 插件作为数据入口，Cloudflare Worker 作为后端 API，网页作为前端展示，架构清晰。
- **功能完善**: 支持建议/反馈提交、**点赞/点踩**、**举报**、管理员**回复/删除/设置标签**等。
- **丰富的前端交互**: 实现了基于 **CSS Grid** 的瀑布流布局、无限滚动、图片懒加载、实时搜索、排序和标签过滤、**自定义下拉菜单**、**Toast 通知**、**长文阅读弹窗**和**回到顶部**功能。
- **精美的 UI**: 拥有一个支持**亮色/暗色模式**切换的、带有流畅动画的现代化界面，暗色模式下还有**动态星空背景**。初始加载时使用**骨架屏**优化用户感知速度。
- **性能优化**: 对滚动等高频事件进行**节流(Throttle)**处理，减少不必要的计算，保证页面流畅运行。
- **安全可靠**: 使用 JWT (JSON Web Tokens) 进行管理员权限验证，并集成了 **Cloudflare Turnstile** 人机验证，保护公开接口，有效防止滥用。
- **邮件提醒**: 当有用户举报消息时，可配置通过 [Resend](https://resend.com/) 服务向管理员发送邮件提醒。

## 🖼️ 效果预览

![浅色模式截图](./assets/浅色.jpg)
![深色模式截图](./assets/深色.jpg)

## 🚀 技术栈

- **机器人端**: NoneBot2, httpx
- **后端**: Cloudflare Workers, Cloudflare KV, Cloudflare Turnstile, Resend
- **前端**: 原生 HTML5 / CSS3 / JavaScript (ES6+), CSS Grid Layout

---

## 🛠️ 部署指南

本指南将带你从零开始，一步步部署完整的 NekoInbox 系统。

### 1. 准备工作

在开始之前，请确保你拥有：
- 一个 [Cloudflare](https://www.cloudflare.com/) 账户（需要绑定域名）
- 一个 [GitHub](https://github.com/) 账户。
- [Node.js](https://nodejs.org/en/) (v16.13.0 或更高版本) 和 [npm](https://www.npmjs.com/)。
- [Python](https://www.python.org/) (3.8 或更高版本) 和 [pip](https://pip.pypa.io/en/stable/)。

### 2. Fork & 克隆项目

首先，Fork 本项目到你的 GitHub 账户，然后将它克隆到你的本地电脑：
```bash
git clone https://github.com/JQ-28/NekoInbox.git
cd NekoInbox
```

### 3. 部署后端 (Cloudflare Worker)

后端服务是整个系统的核心，负责处理数据和逻辑。

#### 步骤 1: 安装 Wrangler CLI

Wrangler 是 Cloudflare 的官方命令行工具，用于管理 Workers。
```bash
npm install -g wrangler
```
登录到你的 Cloudflare 账户：
```bash
wrangler login
```

#### 步骤 2: 创建 KV 数据库

我们需要一个 KV 命名空间来存储所有的反馈数据。
```bash
wrangler kv namespace create "FEEDBACK_KV"
```
如果没出问题那么命令行会输出类似于下面的效果
```bash
 ⛅️ wrangler 4.27.0 (update available 4.28.0)
─────────────────────────────────────────────
Resource location: remote
🌀 Creating namespace with title "FEEDBACK_KV"
✨ Success!
Add the following to your configuration file in your kv_namespaces array:
{
  "kv_namespaces": [
    {
      "binding": "FEEDBACK_KV",
      "id": "你的KV数据库id"
    }
  ]
}
```


#### 步骤 3: 配置 `wrangler.toml`

打开 `api/wrangler.toml` 文件，进行如下修改：
1.  将上一步中输出的生产环境 `id` 填入 `[[kv_namespaces]]` 部分的 `id` 字段。
2.  (可选) 修改 `name` 字段为你喜欢的 Worker 名称。

#### 步骤 4: 创建 Turnstile 小组件

为了防止机器人滥用，我们需要配置人机验证。
1.  访问 Cloudflare 仪表盘 -> `Turnstile`。
2.  创建一个新的小组件，小组件模式选择“托管”，获取 **Site Key** 和 **Secret Key**。

#### 步骤 5: 设置密钥并发布 Worker

**这是最重要的一步。** 为了安全，所有敏感信息都必须通过 `secret` 命令设置，**不要直接写入 `.toml` 文件**。

在项目根目录的终端中，依次执行以下命令，并根据提示输入你准备好的值：

```bash
# 进入 api 目录
cd api

# 1. Turnstile 密钥 (从上一步获取)
wrangler secret put TURNSTILE_SECRET_KEY
```

> **💡 提示**
> 当你第一次执行 `wrangler secret put` 时，如果 Worker 服务还不存在，`wrangler` 会智能地询问你是否要现在创建一个。请输入 `y` 并回车确认，它会自动帮你完成 Worker 的初始化创建。

接下来，继续设置其他的密钥：

```bash
# 2. 前端页面公开的 Site Key
wrangler secret put TURNSTILE_SITE_KEY
# 注意：虽然此 Key 是公开的，但为了统一管理，也建议用 secret 设置

# 3. 管理员密码 (用于登录网页后台)
wrangler secret put ADMIN_PASSWORD

# 4. JWT 密钥 (用于签发管理员登录凭证，输入一个长而随机的字符串)
wrangler secret put JWT_SECRET

# 5. API 访问令牌 (用于 NoneBot 插件与后端通信，输入一个长而随机的字符串)
wrangler secret put API_TOKEN

# 6. (可选) Resend 邮件提醒，用于接收举报通知
# wrangler secret put RESEND_API_KEY
# wrangler secret put SENDER_EMAIL
# wrangler secret put RECIPIENT_EMAIL
```

#### 步骤 6: 部署 Worker

所有密钥都设置好后，执行部署命令，将你的代码上传到 Cloudflare。

```bash
wrangler deploy
```

部署成功后，你的后端服务就正式上线了！后续对 `worker.js` 的任何修改，都需要重新执行 `wrangler deploy` 来使其生效。

### 4. 部署前端 (Cloudflare Pages)

前端页面用于展示和管理所有反馈。

1.  访问 Cloudflare 仪表盘 -> `Workers & Pages` -> `Create application` -> `Pages` -> `Connect to Git`。
2.  选择你 Fork 的 `NekoInbox` 仓库。
3.  在 **Build settings** 中：
    - **Framework preset**: 选择 `None`。
    - **Build command**: (留空)
    - **Build output directory**: 填入 `web`。
4.  点击 `Save and Deploy`。
5.  部署完成后，Cloudflare 会为你提供一个前端页面的 URL (例如 `https://your-project.pages.dev`)。

### 5. 关联 Worker 到 Pages (关键一步)

为了让前端页面能够安全、高效地调用后端 API，我们需要利用 Cloudflare Pages 的 **函数集成 (Functions integration)** 功能。

1.  在你刚刚创建的 Pages 项目设置页面，找到 `Settings` -> `Functions`。
2.  在 **Functions** 页面，向下滚动到 **Worker integration** 部分。
3.  点击 `Add integration`。
4.  在 **Service** 下拉菜单中，选择你**第 3 步**部署的 Worker 服务。
5.  在 **Route** 字段中，输入 `/api/*`。这会将所有以 `/api/` 开头的请求，从你的 Pages 域名直接转发到你的 Worker，无需暴露 Worker 的真实地址，也无需处理 CORS。
6.  点击 `Save`。

![Pages Functions Integration](./assets/functions-integration.png)

完成这一步后，你的前端和后端就无缝连接了！

### 6. 配置机器人插件 (NoneBot2)

最后，让你的 NoneBot 机器人能够将收集到的消息发送到后端。

1.  将 `nonebot_plugin_nekoinbox` 文件夹放入你的机器人 `plugins` 目录。
2.  在你的机器人项目的 `.env` 或 `.env.prod*` 配置文件中，添加以下三行：

```dotenv
# 你的 Worker URL (从后端部署第 6 步获取)
CF_WORKER_URL="https://nekoinbox-worker.your-username.workers.dev"

# 你的 API 访问令牌 (与后端部署第 5 步中设置的 API_TOKEN 保持一致)
CF_API_TOKEN="your_super_secret_api_token"

# 你的前端页面 URL (从前端部署第 5 步获取)
NEKOINBOX_FRONTEND_URL="https://your-project.pages.dev"
```

3.  重启你的 NoneBot 实例。

至此，整个 NekoInbox 系统已经部署完成！现在你可以通过向机器人发送 `投信 [内容]` 来测试了。

## 📁 项目结构说明

```
.
├── .gitignore                # Git 忽略文件配置
├── CONTRIBUTING.md           # 贡献指南
├── LICENSE                   # MIT 许可证
├── README.md                 # 项目主说明文档
├── api/
│   ├── worker.js             # Cloudflare Worker 的核心后端逻辑
│   └── wrangler.toml         # Worker 配置文件 (服务名称, KV绑定等)
├── assets/                   # README 中使用的图片资源
│   ├── 浅色.jpg
│   └── 深色.jpg
├── nonebot_plugin_nekoinbox/
│   └── __init__.py           # NoneBot2 插件入口及逻辑
└── web/
    ├── index.html            # 前端主页面
    ├── neko.webp             # 网站图标
    ├── css/
    │   └── style.css         # 页面所有样式
    └── js/
        ├── api.js            # 封装与后端 API 的所有通信
        ├── constants.js      # 存放项目中的常量 (如本地存储键名)
        ├── events.js         # 统一管理页面所有的事件监听器
        ├── main.js           # 页面主逻辑入口，负责初始化和加载
        └── ui.js             # 负责所有 UI 相关的操作 (如渲染消息, 显示/隐藏加载动画)
```

## 📞 联系我

- QQ: 480352716
- 如果您有任何问题或建议，欢迎提交 [Issue](https://github.com/JQ-28/NekoInbox/issues)。

## 🤝 贡献

欢迎为这个项目做出贡献！如果您有任何想法、建议或发现了 Bug，请随时提交 [Issues](https://github.com/JQ-28/NekoInbox/issues)。

如果您想贡献代码，我们推荐您先阅读详细的 [**贡献指南 (CONTRIBUTING.md)**](./CONTRIBUTING.md)，它将帮助您更顺利地参与到项目中。

基本流程如下：
1.  Fork 本仓库
2.  创建您的特性分支 (`git checkout -b feature/AmazingFeature`)
3.  提交您的更改 (`git commit -m 'Add some AmazingFeature'`)
4.  将代码推送到您的分支 (`git push origin feature/AmazingFeature`)
5.  提交一个 Pull Request

## 📄 许可证
本项目采用 MIT 许可证。

### 使用限制

作者衷心希望本项目能够帮助到更多的人，并鼓励大家在此基础上进行学习和二次创作。但请注意，作者不希望本项目的任何部分被直接用于商业销售行为。希望得到大家的尊重和理解。

## 📝 TODO List

未来计划增加以下功能，欢迎有兴趣的开发者一起贡献！

- **R2 存储集成**:
  - [ ] **机器人端**: 支持用户在发送反馈时附带图片，插件将图片上传到 Cloudflare R2 并记录 URL。
  - [ ] **网站端**: 支持登录用户在发表反馈时直接上传图片到 R2。
  - [ ] **后端**: 开发与 R2 交互的接口（上传、删除），并在消息体中存储图片地址。
  - [ ] **前端**: 在消息卡片中展示用户上传的图片。
- **网站端用户系统**:
  - [ ] **用户认证**: 引入 OAuth (如 GitHub, QQ) 或邮箱验证码登录机制。
  - [ ] **用户提交**: 允许登录用户直接在网页上发布新的反馈/建议（包括文字和图片）。
  - [ ] **用户中心**: 创建用户个人页面，用于查看和管理自己提交的所有历史记录。
- **功能优化与增强**:
  - [ ] **管理员仪表盘**: 增加一个数据统计面板，用于可视化展示反馈数量、趋势、热门词云等。
  - [ ] **消息通知**: 当用户的反馈被回复或状态变更时，通过机器人私聊或邮件向用户发送通知。
