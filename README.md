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
- **丰富的前端交互**: 实现了基于 **CSS Grid** 的瀑布流布局、无限滚动、图片懒加载、实时搜索、排序和标签过滤、**自定义下拉菜单**、**Toast 通知**、**长文阅读弹窗**和**回到顶部**功能。
- **精美的 UI**: 拥有一个支持**亮色/暗色模式**切换的、带有流畅动画的现代化界面，暗色模式下还有**动态星空背景**。初始加载时使用**骨架屏**优化用户感知速度。
- **安全可靠**: 使用 JWT (JSON Web Tokens) 进行管理员权限验证，并集成了 **Cloudflare Turnstile** 人机验证，保护公开接口，有效防止滥用。
- **邮件提醒**: 当有用户举报消息时，可配置通过 [Resend](https://resend.com/) 服务向管理员发送邮件提醒。

## 🚀 技术栈与项目结构

- **机器人端**: NoneBot2, httpx
- **后端**: Cloudflare Workers, **Cloudflare D1**, Cloudflare Turnstile, Resend
- **前端**: 原生 HTML5 / CSS3 / JavaScript (ES6+), CSS Grid Layout

---

## 🛠️ 部署指南

本指南将提供一个清晰、有序的部署流程，请严格按照步骤操作。

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
    npm install
    # 登录并授权 Wrangler
    npx wrangler login
    ```

### 第 2 部分：后端部署

**目标**: 创建并部署所有后端服务 (数据库和 API)。

1.  **创建 D1 数据库**:
    ```bash
    npx wrangler d1 create neko-inbox-db
    ```
2.  **初始化数据库表 (在远程)**:
    使用 `--remote` 参数，直接在 Cloudflare 云端的数据库上执行初始化。
    ```bash
    npx wrangler d1 execute neko-inbox-db --remote --file=schema.sql
    ```
3.  **创建 Worker 服务**:
    - 访问 [Cloudflare 仪表盘](https://dash.cloudflare.com/) → `Workers & Pages` → `Create application` → `Create Worker`。
    - 为 Worker 命名 (例如 `nekoinbox-api`)，点击 **Deploy**。
4.  **关联 Worker 与 Git 仓库**:
    - 进入刚创建的 Worker → `Settings` → `Git Integrations`。
    - 连接到您 Fork 的 `NekoInbox` GitHub 仓库。
5.  **绑定 D1 到 Worker**:
    - 进入 Worker → `Settings` → `Variables` → **D1 Database Bindings**。
    - 点击 `Add binding`。
    - **Variable name**: **必须**填 `DB`。
    - **D1 database**: 选择 `neko-inbox-db`。
    - 点击 **Save**。

> ✅ **后端服务已就绪**。它已部署并连接到数据库，等待最终配置。

### 第 3 部分：前端部署

**目标**: 创建并部署前端静态页面。

1.  **创建 Pages 项目**:
    - 访问 [Cloudflare 仪表盘](https://dash.cloudflare.com/) → `Workers & Pages` → `Create application` → `Pages` → `Connect to Git`。
    - 选择您 Fork 的 `NekoInbox` 仓库。
2.  **配置并部署**:
    - **Framework preset**: `None`
    - **Build command**: (留空)
    - **Build output directory**: `web`
    - 点击 `Save and Deploy`。

> ✅ **前端页面已就绪**。您可以访问 `*.pages.dev` 默认地址，但它还无法工作。

### 第 4 部分：最终配置：连接一切

**目标**: 配置域名、安全密钥和环境变量，将前后端安全地连接起来。

> **⚠️ 重要提示**: 此步骤中的配置顺序至关重要。请确保严格遵循：**`1. 绑定前端自定义域名`** -> **`2. 创建 Turnstile 并使用该域名`** -> **`3. 在 Worker 环境变量中配置该域名`**。这三者必须完全一致，否则安全验证将失败。

1.  **绑定前端自定义域名**:
    - 进入**第 3 部分**创建的 Pages 项目 → `Custom domains` → `Set up a domain`。
    - 将您的**自定义域名** (例如 `feedback.yourdomain.com`) 绑定到此项目。
2.  **创建 Turnstile 安全密钥**:
    - 访问 [Cloudflare 仪表盘](https://dash.cloudflare.com/) → `Turnstile` → `Add site`。
    - **Domain**: **必须**填入您上一步绑定的**自定义域名**。
    - 创建后，分别**复制**并临时保存好 **Site Key** 和 **Secret Key**。
3.  **配置后端环境变量**:
    - 回到**第 2 部分**创建的 Worker → `Settings` → `Variables` → **Environment Variables**。
    - 点击 `Add variable`，**务必为每个变量点击 `Encrypt`**，添加下表中的所有密钥：

| 变量名                  | 值                                       | 来源/说明                                  |
| ----------------------- | ---------------------------------------- | ------------------------------------------ |
| `FRONTEND_URL`          | `https://feedback.yourdomain.com`        | **必须**是您在 4.1 步绑定的**自定义域名**。 |
| `TURNSTILE_SECRET_KEY`  | (从 4.2 步粘贴)                          | Turnstile 的 Secret Key。                  |
| `TURNSTILE_SITE_KEY`    | (从 4.2 步粘贴)                          | Turnstile 的 Site Key。                    |
| `ADMIN_PASSWORD`        | (自定义)                                 | 网页后台登录密码。                         |
| `JWT_SECRET`            | (自定义，长随机字符串)                   | JWT 签名密钥。                             |
| `API_TOKEN`             | (自定义，长随机字符串)                   | 机器人与后端通信的“暗号”。                 |
| `RESEND_API_KEY`        | (可选)                                   | [Resend](https://resend.com/) API Key。      |
| `SENDER_EMAIL`          | (可选, `noreply@yourdomain.com`)         | 邮件发送地址。                             |
| `RECIPIENT_EMAIL`       | (可选, 你的接收邮箱)                     | 举报通知接收邮箱。                         |

4.  **配置前端环境变量**:
    - 回到**第 3 部分**创建的 Pages 项目 → `Settings` → `Environment variables`。
    - 点击 `Add variable`。
    - **Variable name**: `API_BASE_URL`
    - **Variable value**: 填入**第 2 部分**部署的 Worker 的 URL (例如: `https://nekoinbox-api.your-username.workers.dev`)。

> ✅ **Web 服务完全配置成功**！现在访问您的自定义域名，网站应该可以正常工作了。

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
- [ ] **R2 图片上传**
- [ ] **网站端用户系统 (OAuth)**
- [ ] **管理员数据仪表盘**
- [ ] **消息变更实时通知**
