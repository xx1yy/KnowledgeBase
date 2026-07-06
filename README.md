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

## 项目结构

```
.
├── server.py              # 服务入口（启动用）
├── config.py              # 配置常量（端口、路径、类型映射）
├── vault.py               # 数据操作层（文件读写、解析、搜索、图谱）
├── templates.py           # Markdown 模板生成（7 种类型模板）
├── handler.py             # HTTP 请求处理（API 路由分发）
├── dashboard.html          # 前端单页应用（纯 HTML+CSS+JS）
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
| `dashboard.html` | 前端所有 UI 与交互逻辑 | 后端 API |

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
- 修改前端：直接编辑 `dashboard.html`，无需构建工具
