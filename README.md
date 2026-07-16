# Rewrite（智谱清痕）

欢迎同学们阅读和体验这个项目。

`Rewriter（清痕）` 是一个面向高校科研、课程作业与实验报告场景的智能文档改写工具，支持文档上传、快速粘贴、Agent 思考流展示、原文结果对比与导出。

如果你只是想直接下载使用，请先看下面的“下载安装”；如果你想进一步研究实现方式、Agent 工作流与前后端结构，可以继续阅读“技术文档”。

## 下载安装

### 项目地址

- 源代码仓库：[https://github.com/Theodorus-tan/Rewrite](https://github.com/Theodorus-tan/Rewrite)
- 安装包发布页：[https://github.com/Theodorus-tan/Rewrite/releases/tag/v1.0.0](https://github.com/Theodorus-tan/Rewrite/releases/tag/v1.0.0)

### 在哪里找 DMG

请进入上面的 `Release` 页面，在页面下方的 `Assets` 区域下载安装包。

当前发布页提供两个可下载文件：

- `Rewrite-macOS-v1.0.0.zip`
- `default.dmg`

推荐优先下载：

- `Rewrite-macOS-v1.0.0.zip`

下载后操作如下：

1. 下载 `Rewrite-macOS-v1.0.0.zip`
2. 解压得到 `DMG` 安装包
3. 双击安装并打开应用

如果你看到的是 `default.dmg`，也可以直接下载使用，它同样是本项目的 macOS 安装包。

## 功能概览

- **Agent 改写引擎**：分析文本领域和文风，再检索同领域表达策略，逐轮优化改写结果
- **可解释思考流**：实时展示 Agent 的分析、检索、改写、自评与收口过程
- **文档上传**：支持 `.txt` 和 `.docx`
- **快速粘贴**：支持可拖拽悬浮窗，适合短文本和简答题场景
- **历史持久化**：处理记录自动保存，支持回溯查看

## 文档入口

- 使用说明：`references/usage.md`
- 技术文档：`references/technical.md`

如果你是第一次接触这个项目，建议先看使用说明；如果你想了解 Agent 如何工作、后端如何持久化、前端如何展示思考流，建议继续阅读技术文档。

## 技术栈

| 层 | 技术 |
| --- | --- |
| 前端 | React + TypeScript + Vite + TailwindCSS |
| 后端 | Python Flask（端口 `8765`） |
| Agent | LangGraph + DuckDuckGo Search |
| 模型 | GLM-4.5-Flash（智谱 BigModel API） |

## 本地运行

如果你希望自己启动源码版，可以按下面步骤操作。

### 1. 克隆项目

```bash
git clone https://github.com/Theodorus-tan/Rewrite.git
cd Rewrite
```

### 2. 安装依赖

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

cd app
npm install
npm run build
```

### 3. 启动服务

```bash
.venv/bin/python scripts/web_app.py
```

启动后打开：

- `http://127.0.0.1:8765`

### 4. 配置 API Key

在左侧配置面板填写：

- Base URL：`https://open.bigmodel.cn/api/paas/v4`
- Model：`glm-4.5-flash`
- API Key：你自己的智谱开放平台密钥

建议先点击一次“测试连通性”确认配置正确。

## 本地打包

如果你希望自行重新打包 macOS 安装包，可以执行：

```bash
bash scripts/build_app.sh
```

生成文件默认位于：

- `/tmp/智谱清痕.dmg`

## 项目结构

```text
Rewrite/
├── app/                  # 前端（React + Vite + TailwindCSS）
│   ├── src/
│   │   ├── components/   # UI 组件
│   │   ├── hooks/        # React Hooks
│   │   ├── lib/          # API 客户端
│   │   └── types/        # TypeScript 类型
│   └── dist/             # 前端构建产物
├── scripts/              # Python 后端
│   ├── web_app.py        # Flask 主入口
│   ├── agent_pipeline.py # LangGraph Agent 流水线
│   ├── app_service.py    # 业务逻辑层
│   ├── llm_client.py     # LLM 调用客户端
│   ├── chunking.py       # 文档分段
│   └── build_app.sh      # macOS 打包脚本
├── references/           # 使用文档与技术文档
├── requirements.txt      # Python 依赖
└── LICENSE
```

## License

MIT
