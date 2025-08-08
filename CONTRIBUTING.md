# 💖 为 NekoInbox 做出贡献

首先，非常感谢您愿意花时间为 NekoInbox 做出贡献！我们欢迎任何形式的帮助，无论是报告 Bug、提出功能建议，还是直接贡献代码。

本指南将帮助您顺利地参与到项目中来。

## 🤝 行为准则

为了营造一个开放、友好的社区环境，我们希望所有参与者都能遵守我们的 [行为准则](CODE_OF_CONDUCT.md)。在参与贡献之前，请花一点时间阅读它。

## 💡 如何贡献

### 🐞 报告 Bug

如果您在使用的过程中发现了 Bug，请通过 [提交 Issue](https://github.com/JQ-28/NekoInbox/issues/new/choose) 来告诉我们。为了让我们能更快地定位和修复问题，请在您的 Issue 中包含以下信息：

- **清晰的标题**: 简要描述问题。
- **详细的描述**: 清晰地说明问题是什么。
- **复现步骤**: 一步步告诉我们如何能重现这个 Bug。
- **期望的行为**: 您认为在没有 Bug 的情况下应该发生什么。
- **截图或日志**: 如果可能，请附上相关的截图或错误日志。
- **您的环境**: 您使用的浏览器、操作系统、机器人版本等。

### ✨ 提交功能建议

如果您对项目有任何绝妙的想法，欢迎通过 [提交 Issue](https://github.com/JQ-28/NekoInbox/issues/new/choose) 与我们分享。请在建议中详细描述：

- **您想解决什么问题？**: 这个新功能要解决什么痛点？
- **您的设想是什么？**: 详细描述您建议的功能应该如何工作。
- **有没有替代方案？**: 您是否考虑过其他实现方式？

### 🚀 开发路线图 (Roadmap)

我们已经在项目的 `README.md` 文件中维护了一个公开的 [**TODO List**](./README.md#📝-todo-list)，其中列出了我们计划在未来版本中实现的新功能和改进点。

如果您正在寻找贡献代码的机会，这是一个绝佳的起点！您可以：

1.  **浏览** `TODO List`，看看有没有您感兴趣或擅长的任务。
2.  在开始开发前，建议您先**创建一个新的 Issue**，声明您打算认领哪个任务，这样可以避免与其他开发者重复工作。
3.  遵循下面的流程贡献您的代码。

我们尤其欢迎对 `TODO List` 中功能的贡献！

###  贡献代码

如果您希望直接通过代码来改进 NekoInbox，我们非常欢迎！请遵循以下 Pull Request (PR) 流程：

1.  **Fork 仓库**: 将本项目 [Fork](https://github.com/JQ-28/NekoInbox/fork) 到您自己的 GitHub 账户。

2.  **克隆您的 Fork**:
    ```bash
    git clone https://github.com/JQ-28/NekoInbox.git
    cd NekoInbox
    ```

3.  **创建新分支**: 从 `main` 分支创建一个清晰、有描述性的新分支。
    ```bash
    # 例如，修复一个登录按钮的 Bug
    git checkout -b fix/login-button-bug

    # 或者，添加一个新的主题功能
    git checkout -b feature/new-theme-support
    ```

4.  **进行修改**: 编写您的代码，并确保在本地测试通过。

5.  **提交您的更改**:
    - 请编写清晰、规范的 Commit Message。我们建议遵循 [Conventional Commits](https://www.conventionalcommits.org/) 规范。
    - 例如: `feat: Add dark mode toggle` 或 `fix: Prevent SQL injection in search API`。
    ```bash
    git add .
    git commit -m "feat: Add amazing new feature"
    ```

6.  **将代码推送到您的分支**:
    ```bash
    git push origin feature/new-theme-support
    ```

7.  **创建 Pull Request**:
    - 访问您 Fork 的 GitHub 仓库页面，点击 `Compare & pull request`。
    - 确保基础分支是 `JQ-28/NekoInbox` 的 `main` 分支。
    - 在 PR 描述中，清晰地说明您做了什么、解决了什么问题，并关联相关的 Issue (例如 `Closes #123`)。

8.  **代码审查**: 我们会尽快审查您的 PR，并可能提出一些修改建议。请保持关注并参与讨论。

一旦您的 PR 被合并，您的贡献将正式成为 NekoInbox 的一部分！再次感谢您的付出！