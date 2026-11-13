<details open>
<summary><b>English</b></summary>

# AutoWindow AI

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

MIT-licensed Chrome extension that chats with the page you are reading.

> Open a page, ask a question, and the model sees the main text on that page.

## What it does

AutoWindow adds a frosted-glass chat panel to the bottom of normal web pages. When you send a message it extracts the main text (up to 12,000 characters), plus any text you have selected outside the panel, and sends that with the conversation to an OpenAI-compatible chat API. The default endpoint is DeepSeek.

The panel does not read the page in the background before you ask. It reads it at send time, so a single-page app is re-read after you navigate.

## Install

1. Open `chrome://extensions/`.
2. Turn on Developer mode.
3. Choose **Load unpacked** and select this folder.

## Configure

1. Click the AutoWindow toolbar icon and open **完整设置**.
2. Paste an API key. DeepSeek keys come from [platform.deepseek.com/api_keys](https://platform.deepseek.com/api_keys).
3. Save. The default base URL is `https://api.deepseek.com` (no `/v1`, and do not include `/chat/completions`).

Built-in model ids:

| Model id | What you get |
| --- | --- |
| `deepseek-v4-pro` | DeepSeek-V4-Pro, the default |
| `deepseek-flash` | DeepSeek-V4.1-Flash, faster and cheaper |

Older configs that still say `deepseek-v4-flash` or `https://api.deepseek.com/v1` are migrated on read. DeepSeek still accepts the old flash id, but it now routes to V4.1 Flash.

Thinking mode is off by default. DeepSeek otherwise thinks before it answers, which is slower and used to look like a timeout because reasoning tokens were ignored. Turn it on in settings when you want the reasoning trace; it shows in a collapsible block above the answer.

Any other HTTPS endpoint that implements `POST /chat/completions` can be used. The first time you save a host that is not already granted, Chrome asks for that origin. Plain HTTP is limited to localhost. This client speaks the OpenAI chat format only, so a native Anthropic or Gemini URL will not work unless that host exposes an OpenAI-compatible route.

The API key is stored in `chrome.storage.sync` and therefore syncs with the Chrome profile.

## Use

- `Ctrl+Shift+K` toggles the panel (`Command+Shift+K` on Mac). Chrome may also list it under `chrome://extensions/shortcuts`.
- Minimize collapses the panel and shows the round button at the bottom-right. The panel does not collapse by itself.
- Close, or the shortcut, disables the panel on every page until you enable it again from the toolbar or the shortcut.
- Enter sends. Shift+Enter inserts a newline. Enter during IME composition does not send.
- The square button stops a response that is still streaming.
- The toolbar popup switches the model, clears the current page's conversation, and opens settings.

History sent to the model is capped (20 messages by default). Page text and the system prompt are added separately.

## Develop

No extra packages are required. Tests use the Node.js built-in runner:

```bash
npm test
```

`npm run smoke` loads the unpacked extension in local Chrome and checks the panel, shortcut, missing-key error, options defaults, and popup. CI runs `npm test` on pull requests.

## License

MIT. See [LICENSE](LICENSE).

</details>

<details>
<summary><b>中文</b></summary>

# AutoWindow AI

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

MIT 协议的 Chrome 扩展：对着当前网页提问，模型能看到这页的主要内容。

> 打开网页，直接提问。发送时，模型会带上这页的正文。

## 它做什么

AutoWindow 在普通网页底部放一个磨砂玻璃对话面板。你发送消息时，它提取页面主要内容（最多 12000 字），如果光标外有选中文字，也会一并附上，然后发给兼容 OpenAI Chat Completions 的接口。默认是 DeepSeek。

它不会在你提问之前后台读完整页，而是在每次发送时读取。所以单页应用跳转之后，下一次提问会看到新页面。

## 安装

1. 打开 `chrome://extensions/`。
2. 打开开发者模式。
3. 选择「加载已解压的扩展程序」，选中本仓库目录。

## 配置

1. 点击工具栏里的 AutoWindow 图标，打开「完整设置」。
2. 填入 API Key。DeepSeek 的 Key 在 [platform.deepseek.com/api_keys](https://platform.deepseek.com/api_keys)。
3. 保存。默认 Base URL 是 `https://api.deepseek.com`，不要写成带 `/v1` 或 `/chat/completions` 的地址。

内置模型 ID：

| 模型 ID | 说明 |
| --- | --- |
| `deepseek-v4-pro` | DeepSeek-V4-Pro，默认模型 |
| `deepseek-flash` | DeepSeek-V4.1-Flash，更快、更便宜 |

旧配置里的 `deepseek-v4-flash` 和 `https://api.deepseek.com/v1` 会在读取时迁移。旧的 flash ID 官方仍暂时接受，但实际由 V4.1 Flash 提供服务。

思考模式默认关闭。DeepSeek 现在不传该参数时会先思考再回答，旧版本又忽略了 `reasoning_content`，所以会像卡住甚至超时。需要推理过程时再在设置里打开，思考内容会折在回答上方。

也可以填写任何实现了 `POST /chat/completions` 的 HTTPS 地址。保存尚未授权的站点时，Chrome 会询问该来源的权限。HTTP 只允许本机 localhost。这个客户端只使用 OpenAI 聊天格式，Anthropic 或 Gemini 的原生地址不能直接用，除非对方提供了兼容端点。

API Key 存在 `chrome.storage.sync`，会随当前 Chrome 配置文件同步。

## 使用

- `Ctrl+Shift+K` 开关面板（Mac 上是 `Command+Shift+K`）。也可以在 `chrome://extensions/shortcuts` 里查看这个快捷键。
- 「折叠」会收起面板，并显示右下角的圆形按钮。面板不会自己折叠。
- 「关闭」或快捷键会在所有页面禁用面板，直到从工具栏或快捷键再次打开。
- Enter 发送，Shift+Enter 换行。中文输入法组字时的 Enter 不会发送。
- 生成过程中，发送按钮变成方块，用来停止。
- 工具栏弹窗可以切换模型、清除当前页的对话，并打开设置。

发给模型的历史默认保留最近 20 条。页面正文和系统提示词另外附上，不占这 20 条。

## 开发

不需要安装额外依赖，测试使用 Node.js 自带的测试运行器：

```bash
npm test
```

`npm run smoke` 会在本机 Chrome 里加载扩展，并检查面板、快捷键、未配置 Key 时的错误、设置页默认值和工具栏弹窗。Pull request 的 CI 会运行 `npm test`。

## 许可证

MIT，见 [LICENSE](LICENSE)。

</details>
