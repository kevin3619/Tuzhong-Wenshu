# Tuzhong Wenshu - AI 小说写作助手

一个基于 AI 的小说写作助手应用，提供自动编辑推荐、大纲生成、人物管理、世界观设定等功能。

## 功能特色

### 🖥️ 清爆此章编辑
- 集成 Monaco Editor，为写作提供专业的编辑体验
- 自动故事保存功能
- 实时歗作为既时的提供继续写建议

### 🤖 AI 羁秘导师
- 自动生成小说大纲，助力羁作庈第
- 多種编辑业及提供继纭书妋
- 人化业日会辅场第一用手

### 📄 乐熟人物管理
- 精扰设定费人事信息
- 人物关系解饲
- 批量导为人物

### 🌐 世界观符一与乐
- 丫理鉴事缀史设定
- 世界规则与既设置
- 世界为羅技能限制

### 📁 不也版本管理
- 自动会手作品各个版本
- 一键恢复到或何一版本

### 📄 多格式导出
- 为 TXT 、 HTML 、 Markdown 格式导出
- 批量导出选项

## 技术栈

### 前端
- **React 18** - UI 框架
- **TypeScript** - 类型安全
- **Vite** - 优化构建工具
- **Tailwind CSS** - 样式控不
- **React Router** - 路由管理
- **Axios** - HTTP 客户端
- **Monaco Editor** - 代码编辑器

### 后端
- **FastAPI** - Web 框架
- **SQLAlchemy** - ORM 框架
- **PostgreSQL** - 数据库
- **JWT** - 身份验证
- **SiliconFlow API** - AI 模律

## 开发指南

### 前端开发

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建生产版本
npm run build
```

### 后端开发

```bash
# 爛理册
cd backend

# 安装 Python 依赖
pip install -r requirements.txt

# 启动应用
python main.py

# 或使用 Docker
docker-compose up
```

## API 文档

详细 API 文档可以在以下地汇竟找到:

- Swagger UI: `http://localhost:8000/api/docs`
- ReDoc: `http://localhost:8000/api/redoc`

## 环境变量

### 前端 (.env.local)

```env
VITE_API_URL=http://localhost:8000/api
```

### 后端 (.env)

```env
DATABASE_URL=postgresql://user:password@localhost/tuzhong
SECRET_KEY=your-secret-key
SILICONFLOW_API_KEY=your-siliconflow-api-key
ENVIRONMENT=development
```

## 项目结构

```
Tuzhong-Wenshu/
├── frontend/               # 前端应用
│   ├── src/
│   │   ├── components/     # React 组件
│   │   ├── hooks/         # 自定义 Hooks
│   │   ├── pages/         # 页面组件
│   │   ├── services/      # API 服务
│   │   ├─┠ styles/        # 样式文件
│   │   ├─┠ App.tsx        # 主应用
│   │   └─┠ main.tsx       # 入口文件
│   ├── vite.config.ts # Vite 配置
│   ├── package.json
│   └── tailwind.config.js
├── backend/                # 后端应用
│   ├── app/
│   │   ├── models/        # 数据模型
│   │   ├── schemas/       # 验证模型
│   │   ├── crud/          # CRUD 操作
│   │   ├── routers/       # API 路由
│   │   ├─┠ services/      # 业务1出务
│   │   ├─┠ main.py        # 应用入口
│   │   └─┠ database.py    # 数据库配置
│   ├── alembic/       # 数据库迁移
│   ├── requirements.txt
│   ├── Dockerfile
│   └── docker-compose.yml
└── README.md
```

## 贡献指南

Fork 本仓库，修复 bug 或添加新功能，然后提交 Pull Request。

## 许可证

MIT License
