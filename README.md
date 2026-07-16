# Rewrite (智谱清痕)

基于 LangGraph Agent 的智能文档改写工具，支持去 AI 痕迹、检索增强改写、可解释思考流。

## 功能

- **Agent 改写引擎**：分析文档领域和文风 → 检索人类写作特征 → 逐轮改写优化
- **可解释思考流**：实时展示 Agent 的思考过程、检索策略、自评得分
- **文档上传**：支持 `.txt` 和 `.docx` 文件
- **快速粘贴**：可拖拽悬浮窗，粘贴文字即刻处理
- **历史持久化**：处理记录自动保存，支持回溯查看

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React + TypeScript + Vite + TailwindCSS |
| 后端 | Python Flask (端口 8765) |
| Agent | LangGraph + DuckDuckGo Search |
| 模型 | GLM-4.5-Flash (智谱 BigModel API) |

## 快速开始

### 1. 克隆

```bash
git clone https://github.com/Theodorus-tan/Rewrite.git
cd Rewrite
```

### 2. 安装依赖

```bash
# 创建虚拟环境
python3 -m venv .venv
source .venv/bin/activate

# 安装 Python 依赖
pip install -r requirements.txt

# 安装前端依赖并构建
cd app && npm install && npm run build
```

### 3. 启动

```bash
# 在项目根目录
.venv/bin/python scripts/web_app.py
```

打开 `http://127.0.0.1:8765`

### 4. 配置 API Key

在左侧配置面板填入智谱 BigModel API Key：
- Base URL: `https://open.bigmodel.cn/api/paas/v4`
- Model: `glm-4.5-flash`
- 点击「测试连通性」确认配置正确

## 打包为 DMG

```bash
bash scripts/build_app.sh
```

DMG 将生成在 `/tmp/智谱清痕.dmg`。

## 项目结构

```
Rewrite/
├── app/                  # 前端 (React + Vite + TailwindCSS)
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
├── requirements.txt      # Python 依赖
└── LICENSE
```

## License

MIT
