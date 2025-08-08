# NekoInbox - 用户反馈与建议插件

[![](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![](https://img.shields.io/badge/Powered%20by-Cloudflare-orange.svg)](https://www.cloudflare.com/)
[![](https://img.shields.io/badge/Made%20with-Love-red.svg)](https://github.com/JQ-28/NekoInbox)

这是一个全栈项目，旨在通过 NoneBot2 机器人收集用户的反馈与建议，并将其展示在一个美观、交互性强的网页上。网页由 Cloudflare Pages 和 Workers 驱动，数据存储在 **Cloudflare D1** 数据库中，实现了高性能的数据展示、排序、管理等功能。

## 🌐 在线体验

您可以访问以下地址在线体验NekoInbox：
**[https://input.nekodayo.top](https://input.nekodayo.top)**

## ✨ 项目特色

- **前后端分离**: NoneBot2 插件作为数据入口，Cloudflare Worker 作为后端 API，网页作为前端展示，架构清晰。
- **高性能数据库**: 使用 **Cloudflare D1 (SQLite-based)** 作为数据存储，支持复杂的 SQL 查询，从根本上保证了搜索和排序的性能。
- **功能完善**: 支持建议/反馈提交、**点赞/点踩**、**举报**、管理员**回复/删除/设置标签**等。
- **安全可靠**: 使用 JWT 进行管理员权限验证，并集成了 **Cloudflare Turnstile** 人机验证。

---

## 🛠️ 部署指南

本指南将提供一个以**命令行 (CLI)** 为主的部署流程，请严格按照步骤操作。

### 第 1 部分：本地准备

**目标**: 准备好所有账户、工具和代码。

1.  **账户与环境**:
    - 准备一个 **Cloudflare** 账户 (并绑定好您自己的域名)。
    - 准备一个 **GitHub** 账户。
    - 确保您的电脑已安装 **Node.js** (v16+) 和 **Python** (v3.8+)。
2.  **获取代码**:
    - **Fork** 本项目到您的 GitHub 账户。
    - **克隆**您 Fork 的仓库到本地：
      ```bash
      git clone https://github.com/JQ-28/NekoInbox.git
      cd NekoInbox
      ```
3.  **安装并授权命令行工具**:
    ```bash
    # 安装 Cloudflare Wrangler
    npm install wrangler
    # 登录并授权 Wrangler
    wrangler login
    ```

### 第 2 部分：后端部署 (纯命令行)

**目标**: 使用 `wrangler` CLI 创建、配置并部署所有后端服务。

1.  **创建 D1 数据库**:
    ```bash
    wrangler d1 create neko-inbox-db
    ```
    运行后，终端会输出一段 `[[d1_databases]]` 配置块。**请复制这段配置**。

2.  **配置本地 `wrangler.toml`**:
    - 打开项目根目录下的 `wrangler.toml` 文件。
    - 将上一步复制的 `[[d1_databases]]` 配置块**粘贴到文件末尾**。
    - **注意**: 这一步是为了让后续的 `wrangler` 命令能识别您的数据库。我们已将 `wrangler.toml` 的敏感部分注释，您本地的修改不会影响仓库中的模板。

3.  **初始化数据库表**:
    使用 `--remote` 参数，直接在 Cloudflare 云端的数据库上执行初始化。
    ```bash
    wrangler d1 execute neko-inbox-db --remote --file=schema.sql
    ```
4.  **部署 Worker**:
    此命令会将 `worker.js` 中的代码部署到 Cloudflare，并根据 `wrangler.toml` 中的配置自动绑定 D1 数据库。
    ```bash
    wrangler deploy
    ```

> ✅ **后端服务已就绪**。它已通过命令行成功部署并连接到数据库。

### 第 3 部分：前端部署 (GitOps)

**目标**: 创建并部署前端静态页面。

1.  **创建 Pages 项目**:
    - 访问 [Cloudflare 仪表盘](https://dash.cloudflare.com/) → `Workers & Pages` → `Create application` → `Pages` → `Connect to Git`。
    - 选择您 Fork 的 `NekoInbox` 仓库。
2.  **配置并部署**:
    - **Framework preset**: `None`
    - **Build command**: (留空)
    - **Build output directory**: `web`
    - 点击 `Save and Deploy`。

> ✅ **前端页面已就緒**。您可以访问 `*.pages.dev` 默认地址，但它还无法工作。

### 第 4 部分：最终配置：连接一切

**目标**: 配置域名、安全密钥和环境变量，将前后端安全地连接起来。

1.  **绑定前端自定义域名**:
    - 进入**第 3 部分**创建的 Pages 项目 → `Custom domains` → `Set up a domain`。
    - 将您的**自定义域名** (例如 `feedback.yourdomain.com`) 绑定到此项目。
2.  **创建 Turnstile 安全密钥**:
    - 访问 [Cloudflare 仪表盘](https://dash.cloudflare.com/) → `Turnstile` → `Add site`。
    - **Domain**: **必须**填入您上一步绑定的**自定义域名**。
    - 创建后，分别**复制**并临时保存好 **Site Key** 和 **Secret Key**。
3.  **配置后端环境变量 (命令行)**:
    - 回到您的本地项目终端。
    - 逐一执行以下命令，将 `<...>` 部分替换为您自己的值。`wrangler` 会自动加密这些密钥并上传。
      ```bash
      # 您的前端自定义域名
      wrangler secret put FRONTEND_URL
      # 从 Turnstile 获取的 Secret Key
      wrangler secret put TURNSTILE_SECRET_KEY
      # 从 Turnstile 获取的 Site Key
      wrangler secret put TURNSTILE_SITE_KEY
      # 您自定义的管理员密码
      wrangler secret put ADMIN_PASSWORD
      # 自定义的、长而随机的字符串
      wrangler secret put JWT_SECRET
      # 自定义的、长而随机的字符串 (用于机器人)
      wrangler secret put API_TOKEN
      # (可选) Resend 服务的 API Key
      wrangler secret put RESEND_API_KEY
      # (可选) 发送邮件的地址
      wrangler secret put SENDER_EMAIL
      # (可选) 接收邮件的地址
      wrangler secret put RECIPIENT_EMAIL
      ```
4.  **配置前端环境变量**:
    - 回到**第 3 部分**创建的 Pages 项目 → `Settings` → `Environment variables`。
    - 点击 `Add variable`。
    - **Variable name**: `API_BASE_URL`
    - **Variable value**: 填入**第 2 部分**部署的 Worker 的 URL (例如: `https://nekoinbox-api.your-username.workers.dev`)。

> ✅ **Web 服务完全配置成功**！

### 第 5 部分：机器人配置

**目标**: 让机器人能将消息发送到后端。

1.  将 `nonebot_plugin_nekoinbox` 文件夹放入您的 NoneBot `plugins` 目录。
2.  在您的机器人 `.env` 文件中，添加以下配置：
    ```dotenv
    # 你的 Worker URL (从第 2 部分获取)
    CF_WORKER_URL="https://nekoinbox-api.your-username.workers.dev"
    # 你的 API 访问令牌 (与第 4 部分中设置的 API_TOKEN 保持一致)
    CF_API_TOKEN="your_super_secret_api_token"
    # 你的前端页面 URL (从第 4 部分获取的自定义域名)
    NEKOINBOX_FRONTEND_URL="https://feedback.yourdomain.com"
    ```
3.  重启您的 NoneBot 实例。

**恭喜！整个系统现已部署完毕。**

## 📞 联系与贡献

- **联系我**: QQ: 480352716 / [提交 Issue](https://github.com/JQ-28/NekoInbox/issues)
- **贡献**: 欢迎提交 PR！我们推荐您先阅读 [**贡献指南 (CONTRIBUTING.md)**](./CONTRIBUTING.md)。

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