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

