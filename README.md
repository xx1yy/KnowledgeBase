# 个人知识库 — Personal Knowledge Base

零外部依赖的轻量级本地知识管理系统。纯 Python 标准库 + 单页 Web 应用，所有数据用 Markdown 文件存储，支持双向链接知识图谱。

## 功能

- **📚 七种内容类型**：书籍、视频、概念、反思、问题、计划、闪念笔记
- **🔗 双向链接**：通过 `[[wikilinks]]` 在笔记间建立关联，自动生成知识图谱
- **🗂 快速记录**：侧边栏一键创建新条目，支持类型切换与动态表单
- **🔍 全文搜索**：跨所有 Markdown 文件实时全文检索
- **🕸 知识图谱**：基于力导向布局的可交互图谱，可视化知识关联
- **📊 仪表盘**：各类型条目统计与最近更新概览

## 快速开始

### 方式一：双击启动（推荐）

双击 `startKnowledgeBase.bat`，脚本会自动：
1. 打开后端服务
2. 等待服务就绪
3. 在浏览器中打开主界面

### 方式二：命令行启动

```bash
python server.py
```

然后访问控制台输出的地址（默认 `http://localhost:16000`）。

> 首次使用建议先创建一些笔记体验完整功能。
>
> **注意**：如果之前运行过旧版本（前端未拆分的 `dashboard.html`），拆分后请在浏览器中执行一次**硬刷新**（Ctrl+F5 或 Cmd+Shift+R）确保加载新的外部资源。

## 项目结构

```
.
├── server.py              # 服务入口（启动用）
├── config.py              # 配置常量（端口、路径、类型映射）
├── vault.py               # 数据操作层（文件读写、解析、搜索、图谱）
├── templates.py           # Markdown 模板生成（7 种类型模板）
├── handler.py             # HTTP 请求处理（API 路由分发）
├── dashboard.html          # 前端 HTML 骨架（引用外部 CSS/JS）
├── styles.css              # 前端全部样式
├── api.js                  # 前端 API 请求封装
├── utils.js                # 前端工具函数（HTML 转义、日期格式化）
├── markdown.js             # 前端 Markdown → HTML 渲染器
├── dashboard.js            # 前端仪表盘视图逻辑
├── note.js                 # 前端笔记阅读与概念提取
├── graph.js                # 前端知识图谱 SVG 渲染
├── app.js                  # 前端导航、搜索、弹窗、初始化
├── startKnowledgeBase.bat  # Windows 启动脚本
├── startKnowledgeBase.ps1  # PowerShell 启动脚本
└── 个人知识库/            # ⚡ 知识库数据目录（Markdown 仓库）
    ├── 1-收件箱/          # 闪念笔记
    ├── 2-输入/书籍/       # 书籍笔记
    ├── 2-输入/视频/       # 视频笔记
    ├── 3-概念/            # 概念卡片
    ├── 4-反思/            # 周反思
    ├── 5-问题/            # 问题追踪
    ├── 6-计划/            # 行动计划
    ├── 7-模板/            # Markdown 模板文件
    ├── 仪表盘.md          # 知识库仪表盘
    └── 工作流.md          # 使用工作流说明
```

### 模块分层

| 模块 | 职责 | 依赖 |
|------|------|------|
| `server.py` | 服务入口，端口探测，启动逻辑 | 无 |
| `config.py` | PORT、VAULT_ROOT、类型映射常量、`log()` | 标准库 |
| `vault.py` | Frontmatter 解析、文件读写、搜索、图谱 | config |
| `templates.py` | 7 种 Markdown 模板生成 | 标准库 |
| `handler.py` | HTTP 路由分发（GET/POST/PUT/DELETE） | config, vault, templates |
| `dashboard.html` | 前端 HTML 骨架（~43 行） | 后端 API |
| `styles.css` | 前端全部样式（~175 行） | 无 |
| `api.js` | 前端 API 请求封装（GET/POST/PUT/DELETE） | 无 |
| `utils.js` | HTML 转义、日期格式化、类型映射常量 | 无 |
| `markdown.js` | Markdown → HTML 渲染（wikilink、粗体、引用等） | utils |
| `dashboard.js` | 仪表盘统计卡片与最近更新列表 | api, utils, markdown |
| `note.js` | 文学笔记/视频笔记阅读、编辑、概念提取 | api, utils, markdown |
| `graph.js` | 知识图谱力导向布局 SVG 渲染 | api |
| `app.js` | 导航栏、搜索、弹窗、CRUD 操作、应用初始化 | 以上所有模块 |

## API 接口

所有 API 路径以 `/api` 开头，返回 JSON。

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/ping` | 健康检查 |
| GET | `/api/dashboard` | 仪表盘统计与最近更新 |
| GET | `/api/graph` | 知识图谱数据（nodes + edges） |
| GET | `/api/search?q=关键词` | 全文搜索 |
| GET | `/api/items?type=book` | 获取某类型所有条目 |
| GET | `/api/item?path=xxx.md` | 获取单个文件详情（含反向链接） |
| POST | `/api/item` | 创建新条目 |
| PUT | `/api/item` | 更新条目字段 |
| DELETE | `/api/item?path=xxx.md` | 删除条目（移至回收站） |

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

## 读书笔记

...
```

- **双向链接**：使用 `[[笔记标题]]` 语法，图谱自动解析关联
- **删除安全**：删除的文件移至 `.trash` 回收站目录
- **无数据库**：所有数据即时读写文件，可直接用 Obsidian 等工具管理

## 自定义

- 修改默认端口：编辑 `config.py` 中的 `PORT` 变量
- 添加新类型：在 `config.py` 的 `DIR_TYPE`、`TYPE_DIR` 中添加映射，在 `templates.py` 中添加对应模板
- 修改前端：前端已拆分为模块化文件（`styles.css` + 7 个 `.js` 文件），按职责编辑对应模块即可，无需构建工具