# 途中文枢 - AI 小说写作助手

一比一复刻妙笔生成，集成市面上所有的 AI 模型的全自动小说生成应用。

## 功能特性

### 🎨 编辑器功能
- ✨ **AI 智能续写** - 基于上文内容自动生成多个续写方案
- 📝 **富文本编辑** - 支持 Markdown 格式编辑
- 💾 **自动保存** - 实时保存你的创作内容
- 🔄 **多方案选择** - 生成多个续写方案供选择

### 📚 项目管理
- 📋 **项目列表** - 管理多个创作项目
- 📊 **统计信息** - 字数、章节等统计数据
- 🏷️ **标签分类** - 支持项目分类管理
- 📤 **导出功能** - 支持多种格式导出

### 🤖 模型管理
- 🔄 **多模型聚合** - 集成硅基流动、OpenAI 等多个模型
- 🔌 **API 密钥管理** - 轻松配置不同模型的 API 密钥
- ⚡ **快速切换** - 在不同模型间快速切换
- 📊 **用量统计** - 查看各模型的使用统计

### ✍️ 创作辅助
- 💡 **灵感库** - 获取标题、角色、情节等灵感建议
- 🎭 **人物设定** - 管理小说中的人物设定
- 🌍 **世界观配置** - 构建和管理小说的世界观
- 📖 **大纲生成** - 自动生成小说大纲

## 技术栈

### 前端
- **React 18** - UI 框架
- **TypeScript** - 类型检查
- **Vite** - 构建工具
- **Tailwind CSS** - 样式库
- **shadcn/ui** - UI 组件库
- **React Router** - 路由管理
- **Monaco Editor** - 代码编辑器
- **Zustand** - 状态管理
- **Axios** - HTTP 客户端

### 后端（待开发）
- **Python FastAPI** - Web 框架
- **PostgreSQL** - 数据库
- **Redis** - 缓存

## 快速开始

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
npm run dev
```

打开 [http://localhost:5173](http://localhost:5173) 查看应用。

### 构建生产版本

```bash
npm run build
```

### 预览生产构建

```bash
npm run preview
```

## 项目结构

```
src/
├── components/          # React 组件
│   ├── Editor/         # 编辑器组件
│   ├── ModelSelector/  # 模型选择器
│   ├── Project/        # 项目管理组件
│   ├── ui/            # 通用 UI 组件
│   ├── Header.tsx
│   ├── Sidebar.tsx
│   └── Layout.tsx
├── pages/             # 页面组件
├── hooks/             # 自定义 Hook
├── services/          # API 服务
│   └── api/
├── types/             # TypeScript 类型定义
├── styles/            # 全局样式
├── lib/               # 工具函数
├── App.tsx
└── main.tsx
```

## API 接口

### 项目管理
- `GET /api/novels` - 获取项目列表
- `GET /api/novels/:id` - 获取项目详情
- `POST /api/novels` - 创建新项目
- `PUT /api/novels/:id` - 更新项目
- `DELETE /api/novels/:id` - 删除项目

### AI 生成
- `POST /api/generate` - 生成文本内容
- `POST /api/generate/stream` - 流式生成文本
- `POST /api/novels/:id/suggestions` - 获取续写建议

### 模型管理
- `GET /api/models` - 获取可用模型列表
- `GET /api/models/:id` - 获取模型详情
- `POST /api/models/:id/test` - 测试模型连接

## 配置

### 环境变量

在项目根目录创建 `.env.local` 文件：

```
VITE_API_URL=http://localhost:8000/api
```

## 贡献

欢迎提交 Issue 和 Pull Request！

## 许可证

MIT
