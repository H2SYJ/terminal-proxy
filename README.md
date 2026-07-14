# terminal-proxy

## 介绍

终端代理用于在 zTools 中快速连接终端服务并执行命令。客户端通过 WebSocket 与 Spring Boot 服务通讯，默认服务地址为 `ws://192.168.3.33:2330/terminal`。

## 启动后端

1. 克隆项目：`git clone https://github.com/H2SYJ/terminal-proxy.git`
2. 使用 Java 17 执行 `mvn clean package`
3. 运行 `target/terminal-proxy-0.0.1-SNAPSHOT.jar`

服务默认监听 `2330` 端口，WebSocket 路径为 `/terminal`。使用 Docker 时命令会在容器中执行，因此通常建议直接在宿主机运行。

## ZTools 插件

ZTools 版位于 `terminal-proxy-ztools`，使用 Vue 3、TypeScript 和 Vite 开发。

```bash
cd terminal-proxy-ztools
npm install
npm run dev
```

开发模式下，保持 Vite 服务运行，并在 ZTools 中加载 `terminal-proxy-ztools/plugin.dev.json`。生产构建执行：

```bash
npm test
npm run build
```

构建完成后，在 ZTools 中加载 `terminal-proxy-ztools/dist/plugin.json` 或打包整个 `dist` 目录。生产清单不依赖 Vite 开发服务器。插件内可修改 WebSocket 服务地址，设置会保存在 ZTools 插件存储中。

## 添加动态快捷指令

插件提供可视化的动态快捷指令管理。打开插件右上角的“设置”，切换到“快捷指令”页签，即可查看、新建、编辑、删除和刷新指令。添加完成后，用户可以直接在 ZTools 主搜索框中输入关键词或符合正则表达式的内容，由插件自动连接终端代理服务并执行对应命令。

### 添加固定命令

例如，希望输入 `download` 或“下载脚本”时执行：

```bash
sh download.sh
```

在“设置 → 快捷指令”中点击“添加指令”，填写：

- 指令标识：`download`
- 执行命令：`sh download.sh`
- 触发关键词：每行分别填写 `download` 和“下载脚本”

保存后，输入 `download` 或“下载脚本”并选择该功能，插件就会执行 `sh download.sh`。

### 匹配 HTTPS 网址并作为参数执行

如果希望用户在 ZTools 搜索框中输入 HTTPS 网址后执行：

```bash
sh download.sh ${url}
```

在“设置 → 快捷指令”中点击“添加指令”，填写：

- 指令标识：`download-url`
- 执行命令：`sh download.sh`
- 启用正则匹配：是
- 搜索结果名称：`下载 HTTPS 网址`
- 正则表达式：`/^https:\/\/[^\s]+$/i`
- 最小长度：`8`
- 最大长度：`2048`

保存后，在 ZTools 搜索框输入：

```text
https://example.com/file.zip
```

搜索结果中会出现“下载 HTTPS 网址”。选择后，插件实际发送到终端代理服务的命令为：

```bash
sh download.sh https://example.com/file.zip
```

### JSON 兼容入口

原有的搜索框 JSON 添加方式继续保留，可用于快速导入或管理 UI 无法无损表达的高级 Feature。添加固定命令时，在 ZTools 主搜索框粘贴下面这一整行并选择“添加指令”：

```json
{"code":"download","explain":"sh download.sh","cmds":["download","下载脚本"]}
```

添加 HTTPS 正则指令时使用：

```json
{"code":"download-url","explain":"sh download.sh","cmds":[{"type":"regex","label":"下载 HTTPS 网址","match":"/^https:\\/\\/[^\\s]+$/i","minLength":8,"maxLength":2048}]}
```

动态指令配置字段说明：

- `code`：动态指令的唯一标识。重复添加相同 `code` 时会更新原有指令。
- `explain`：固定命令或命令前缀。对于正则指令，用户输入会追加到该字段末尾。
- `cmds`：ZTools 的触发规则列表，可以包含普通关键词或正则匹配对象。
- `type: "regex"`：表示使用正则表达式匹配用户输入。
- `label`：匹配成功后在 ZTools 搜索结果中显示的名称。
- `match`：正则表达式字符串。示例仅接受以 `https://` 开头且不包含空白字符的网址。
- `minLength`、`maxLength`：允许匹配的输入内容长度范围。

JSON 字符串中的反斜杠需要转义，因此正则表达式中的 `\/` 和 `\s` 在 JSON 里分别写成 `\\/` 和 `\\s`。ZTools 解析 JSON 后，实际使用的正则表达式为：

```regex
/^https:\/\/[^\s]+$/i
```

### 命令拼接与发送流程

ZTools 匹配动态正则指令后，会把用户在搜索框输入的完整内容放入 `launch.payload`。插件按下面的规则生成命令：

```ts
if (launch.type === 'regex') {
  return `${feature.explain} ${payload}`.trim()
}
```

以上面的下载指令为例：

```text
feature.explain = sh download.sh
payload = https://example.com/file.zip
```

最终生成：

```bash
sh download.sh https://example.com/file.zip
```

生成的命令会先进入当前终端会话的待发送队列。WebSocket 连接成功后，插件通过 `socket.send(command)` 将完整命令发送到后端。后端仍按空格拆分命令和参数，因此网址本身不应包含未编码的空格。
