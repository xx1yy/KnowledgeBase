# 个人知识库 — Personal Knowledge Base

零外部依赖的轻量级本地知识管理系统。纯 Python 标准库 + 单页 Web 应用，所有数据用 Markdown 文件存储，支持双向链接知识图谱。

## 功能

- **📚 七种内容类型**：书籍、视频、概念、反思、问题、计划、闪念笔记
- **🔗 双向链接**：通过 `[[wikilinks]]` 在笔记间建立关联，自动生成知识图谱
- **💡 概念提取**：从文学/视频笔记中提炼概念卡片（定义 → 核心解释 → 怎么用），主区左右分栏对比阅读
- **🖼 图片管理**：Obsidian 风格 `![[附件/图片.png]]` 本地附件，支持按钮上传 + Ctrl+V 粘贴截图自动插图
- **📝 文学/视频笔记**：按书籍/视频分文件夹管理，支持章节分组、多维度排序（时间/标题）、手动拖拽排序
- **🗂 快速记录**：侧边栏一键创建新条目，支持类型切换与动态表单
- **🔍 全文搜索**：跨所有 Markdown 文件实时全文检索
- **🕸 知识图谱**：基于力导向布局的可交互图谱，可视化知识关联
- **🏷️ 标签 & 领域**：标签云索引 + 领域（MOC）枢纽式聚合视图
- **🔒 Token 认证**：API 接口需携带认证 token，防止未授权访问
- **📊 仪表盘**：各类型条目统计与最近更新概览
- **🖱 可拖拽分栏**：概念提取/详情页面左右比例可手动调整，宽度记忆到 localStorage

## 快速开始

### 方式一：双击启动（推荐）

双击 `startKnowledgeBase.bat`，脚本会自动：
1. 打开后端服务
2. 等待服务就绪
3. 在浏览器中打开主界面

### 方式二：命令行启动

```bash
cd 项目根目录
python -m backend.server
```

然后访问控制台输出的地址（默认 `http://localhost:16000`）。

> 首次使用建议先创建一些笔记体验完整功能。

## 项目结构

```
.
├── backend/                    # Python 后端服务
│   ├── server.py               服务入口（端口探测、启动逻辑）
│   ├── config.py               配置常量（端口、路径、Token 认证）
│   ├── handler.py              HTTP 请求处理（API 路由分发 + 认证）
│   ├── vault.py                数据操作层（文件读写、解析、搜索、图谱）
│   └── templates.py            Markdown 模板生成（7 种类型模板 + 概念正文）
│
├── frontend/                   # 前端 Web 应用
│   ├── dashboard.html          前端 HTML 骨架（含 script 引入顺序）
│   ├── css/
│   │   └── styles.css          全局样式（含 callout / 表格 / 分栏拖拽等）
│   └── js/
│       ├── app.js              入口点（导航/右侧栏/搜索/折叠/事件委托/初始化）
│       ├── core/               # 🧱 基础设施层
│       │   ├── api.js          API 请求封装 + Token 自动附加
│       │   ├── utils.js        工具函数（ESC/FMT/TYPES/TYPE_MAP）
│       │   ├── router.js       路由系统（pushHistory/applyRoute/navigate）
│       │   ├── markdown.js     Markdown→HTML 渲染器（wikilink/callout/表格/图片）
│       │   └── modals.js       所有弹窗（编辑/快速记录/新建笔记工厂/删除）
│       ├── views/              # 📄 页面视图层
│       │   ├── dashboard.js    仪表盘统计卡片与列表页
│       │   ├── graph.js        知识图谱力导向 SVG 渲染
│       │   ├── tags.js         标签云索引页
│       │   └── domains.js      领域（MOC）枢纽聚合视图
│       └── notes/              # 📝 笔记核心层
│           ├── note.js         文学/视频笔记列表、章节、排序、拖拽、阅读编辑
│           ├── concept-detail.js 概念查看/编辑（主区分栏显示）
│           ├── extract-concept.js 提取概念流程 UI
│           └── image-upload.js  图片上传管线（按钮选图 + 粘贴截图）
│
├── startKnowledgeBase.bat      Windows 启动脚本
├── startKnowledgeBase.ps1      PowerShell 启动脚本
├── .gitignore
├── README.md
└── 个人知识库/                 # ⚡ 知识库数据目录（Markdown 仓库）
    ├── 附件/                   # 图片附件存储（![[引用]]）
    ├── 1-收件箱/               # 闪念笔记
    ├── 2-输入/书籍/            # 书籍 + 文学笔记
    ├── 2-输入/视频/            # 视频 + 视频笔记
    ├── 3-概念/                 # 概念卡片（结构化字段：定义/核心解释/怎么用/摘录）
    ├── 4-反思/                 # 周反思
    ├── 5-问题/                 # 问题追踪
    ├── 6-计划/                 # 行动计划
    ├── 7-模板/                 # Markdown 模板文件
    ├── 仪表盘.md               # 知识库仪表盘
    └── 工作流.md               # 使用工作流说明
```

## 模块分层

| 层 | 文件 | 职责 | 依赖 |
|----|------|------|------|
| **入口** | `js/app.js` | 导航渲染、右侧栏、搜索、侧栏折叠、分栏拖拽、事件委托、启动初始化 | 以上所有模块 |
| **Core** | `js/core/api.js` | GET/POST/PUT/DELETE 封装 + Token 自动附加 | 无 |
| | `js/core/utils.js` | ESC/FMT/TYPES/TYPE_MAP/statusColor | 无 |
| | `js/core/router.js` | 路由系统 pushHistory/applyRoute/popstate | 无 |
| | `js/core/markdown.js` | Markdown→HTML（wikilink/callout/GFM表格/图片） | utils |
| | `js/core/modals.js` | 编辑弹窗、快速记录、新建笔记(book/video统一工厂)、删除 | core 全部 |
| **Views** | `js/views/dashboard.js` | 仪表盘卡片 + 最近更新 + 类型列表 | api, utils, markdown |
| | `js/views/graph.js` | 力导向知识图谱 SVG | api |
| | `js/views/tags.js` | 标签云 + 复合动作辅助 | 无 |
| | `js/views/domains.js` | 领域 MOC 枢纽 + 弹窗展示 | 无 |
| **Notes** | `js/notes/note.js` | 书籍/视频笔记列表、章节栏、排序(3种)、拖拽排序、阅读/编辑模式 | api, utils, markdown |
| | `js/notes/concept-detail.js` | 概念查看(主区分栏)/编辑表单/保存/最近概念缓存/来源加载 | api, markdown |
| | `js/notes/extract-concept.js` | 提取概念 UI（输入框+保存+右栏操作） | api, markdown |
| | `js/notes/image-upload.js` | 图片上传管线（按钮选图 + 粘贴截图自动上传） | api |

**后端**：

| 文件 | 职责 | 依赖 |
|------|------|------|
| `backend/server.py` | 服务入口、端口探测、启动逻辑 | backend 各模块 |
| `backend/config.py` | PORT/VAULT_ROOT/DIR_TYPE/TYPE_DIR/AUTH_TOKEN | 标准库 |
| `backend/vault.py` | Frontmatter 解析、文件读写、搜索、图谱、概念正文解析 | config |
| `backend/templates.py` | 7 种 Markdown 模板 + concept_display_body() | 标准库 |
| `backend/handler.py` | HTTP 路由分发(GET/POST/PUT/DELETE) + Token 认证 + 文件上传/静态服务 | config, vault, templates |

## API 接口

所有 API 路径以 `/api` 开头，返回 JSON。除 `/api/token` 外均需携带认证 token（query param `?t=token` 或 header `X-Auth-Token`）。

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/token` | 🔓 获取认证 token（公开端点） |
| GET | `/api/ping` | 健康检查 |
| GET | `/api/dashboard` | 仪表盘统计与最近更新 |
| GET | `/api/graph` | 知识图谱数据（nodes + edges） |
| GET | `/api/search?q=关键词` | 全文搜索 |
| GET | `/api/items?type=book` | 获取某类型所有条目 |
| GET | `/api/item?path=xxx.md` | 获取单个文件详情（含反向链接） |
| POST | `/api/item` | 创建新条目 |
| PUT | `/api/item` | 更新条目字段（概念类型会重写正文） |
| DELETE | `/api/item?path=xxx.md` | 删除条目（移至回收站） |
| POST | `/api/upload` | 上传图片附件（base64 JSON） |
| GET | `/api/file/<path>` | 获取附件/静态文件 |
| GET | `/api/tags` | 标签统计 |
| GET | `/api/domains` | 领域统计 |

## 数据存储

所有数据以标准 Markdown 文件存储，每篇笔记包含 YAML frontmatter 元数据：

```markdown
---
type: book
title: "献给阿尔吉侬的花束"
author: "丹尼尔·凯斯"
status: 已读
rating: 5
tags: ["科幻", "心理学"]
created: "2026-07-04 15:30"
updated: "2026-07-04 15:30"
---

# 献给阿尔吉侬的花束

...
```

**特殊类型 — 概念卡片的正文结构**：

```markdown
---
type: concept
title: "感性确定性"
source: "精神现象学"
tags: ["哲学", "黑格尔"]
---

> 一句话定义
最具体的感官经验一旦被说出就沦为最抽象的共相。

## 原文摘录
（从原文笔记摘录的关键句）

## 核心解释
（用自己的话解释）

## 怎么用
（实际应用场景和方法）
```

- **双向链接**：使用 `[[笔记标题]]` 语法，图谱自动解析关联
- **图片引用**：`![[附件/图片.png]]` 存入 `附件/` 目录，跨笔记复用
- **删除安全**：删除的文件移至 `.trash` 回收站目录
- **无数据库**：所有数据即时读写文件，可直接用 Obsidian 等工具管理

## 自定义

- 修改默认端口：编辑 `backend/config.py` 中的 `PORT` 变量
- 添加新类型：在 `backend/config.py` 的 `DIR_TYPE`、`TYPE_DIR` 中添加映射，在 `backend/templates.py` 中添加对应模板
- 修改前端：前端已拆分为模块化文件（按 `core/views/notes` 三层组织），按职责编辑对应模块即可，无需构建工具
- 关闭 Token 认证：删除 `.kb_token` 文件即可（下次启动会重新提示）
