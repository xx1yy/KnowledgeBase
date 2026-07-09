#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Markdown 模板生成"""

import json
import re
import time


def generate_md(item_type, data):
    """根据类型和表单数据生成 Markdown 内容"""
    now = time.strftime('%Y-%m-%d %H:%M')
    date = time.strftime('%Y-%m-%d')
    title = data.get('title', '未命名')
    tags = data.get('tags', [])
    if isinstance(tags, str):
        tags = [t.strip() for t in re.split(r'[,，、]', tags) if t.strip()]
    tag_str = json.dumps(tags, ensure_ascii=False) if tags else '[]'

    templates = {
        'book': f"""---
type: book
title: "{title}"
author: "{data.get('author', '')}"
status: {data.get('status', '在读')}
rating: {data.get('rating', 0)}
start_date: {date}
finish_date: ""
tags: {tag_str}
created: "{now}"
updated: "{now}"
---

# {title}

**作者**：{data.get('author', '')}
**状态**：{data.get('status', '在读')}
**开始于**：{date}

---

## 全书总结

（读完本书后填写：这本书讲了什么？核心论点是什么？）

## 关键概念

> 从本书提炼的概念卡片，用 `[[3-概念/概念名]]` 链接

## 对我的改变

这本书让我...

## 后续行动

- [ ] 

---

## 相关文件

- 📝 [[{title}-文学笔记]] — 逐章摘录、金句、随手笔记
""",
        'book-notes': f"""---
type: book-notes
title: "{title}"
parent: "[[{data.get('parent', title)}]]"
chapter: "{data.get('chapter', '')}"
created: "{now}"
updated: "{now}"
---

# {title}

> 原始摘录、逐章内容、金句、随手笔记。
> 枢纽页在 [[{data.get('parent', title)}]]

---

{data.get('content', '')}

---

## 金句收藏

> 

---

## 随手笔记

- 
""",
        'video': f"""---
type: video
title: "{title}"
source: "{data.get('source', '')}"
url: "{data.get('url', '')}"
status: {data.get('status', '已看')}
rating: {data.get('rating', 0)}
watch_date: {date}
tags: {tag_str}
concepts: []
created: "{now}"
updated: "{now}"
---

# {title}

**来源**：{data.get('source', '')}
**链接**：{data.get('url', '')}

## 核心内容
{data.get('content', '')}

## 关键点

## 提炼概念

> 从本视频提炼的概念，用 `[[3-概念/概念名]]` 链接

## 我的思考

---

## 相关文件

- 📝 [[{title}-视频笔记]] — 逐段摘录、金句、随手笔记
""",
        'video-notes': f"""---
type: video-notes
title: "{title}"
parent: "[[{data.get('parent', title)}]]"
created: "{now}"
updated: "{now}"
---

# {title}

> 原始摘录、逐段内容、金句、随手笔记。
> 枢纽页在 [[{data.get('parent', title)}]]

---

{data.get('content', '')}

---

## 金句收藏

> 

---

## 随手笔记

- 
""",
        'concept': f"""---
type: concept
title: "{title}"
aliases: []
tags: {tag_str}
source: "[[{data.get('source', '')}]]"
domain: "{data.get('domain', '')}"
created: "{now}"
updated: "{now}"
---

# {title}

> {data.get('definition', '一句话定义')}

## 来源
- [[{data.get('source', '')}]]

## 原文摘录
{data.get('excerpt', '')}

## 核心解释
{data.get('content', '')}

## 怎么用
{data.get('how_to_use', '')}

## 关联概念
""",
        'reflection': f"""---
type: reflection
title: "{title}"
mood: {data.get('mood', '😌 平静')}
period: weekly
tags: {tag_str}
created: "{now}"
updated: "{now}"
---

# {title}

**心情**：{data.get('mood', '😌 平静')}

## 关键收获

{data.get('content', '')}

## 启发我的内容

## 做对了什么

## 需要改进

## 下一步行动
""",
        'problem': f"""---
type: problem
title: "{title}"
status: {data.get('status', '待解决')}
priority: {data.get('priority', '中')}
domain: "{data.get('domain', '')}"
tags: {tag_str}
created: "{now}"
updated: "{now}"
---

# {title}

**状态**：{data.get('status', '待解决')}
**优先级**：{data.get('priority', '中')}

## 问题描述
{data.get('content', '')}

## 背景

## 可能的方案

## 关联行动
""",
        'plan': f"""---
type: plan
title: "{title}"
status: {data.get('status', '待开始')}
priority: {data.get('priority', '中')}
progress: {data.get('progress', 0)}
start_date: {date}
due_date: {data.get('due_date', '')}
tags: {tag_str}
created: "{now}"
updated: "{now}"
---

# {title}

**状态**：{data.get('status', '待开始')}
**优先级**：{data.get('priority', '中')}
**进度**：{data.get('progress', 0)}%

## 为什么做

## 目标

{data.get('content', '')}

## 执行步骤

- [ ] 
""",
        'quicknote': f"""---
type: quicknote
title: "{title}"
tags: {tag_str}
created: "{now}"
---

# {title}

{data.get('content', '')}
""",
    }
    return templates.get(item_type, templates['quicknote'])


def _build_frontmatter(fm):
    """将 frontmatter 字典序列化为 YAML 格式字符串"""
    lines = []
    for k, v in fm.items():
        if isinstance(v, list):
            if not v:
                lines.append(f'{k}: []')
            else:
                items = ', '.join(f'"{item}"' for item in v)
                lines.append(f'{k}: [{items}]')
        elif isinstance(v, bool):
            lines.append(f'{k}: {"true" if v else "false"}')
        elif v is None:
            lines.append(f'{k}:')
        elif isinstance(v, str):
            lines.append(f'{k}: "{v}"')
        else:
            lines.append(f'{k}: {v}')
    return '\n'.join(lines)


def concept_display_body(title, definition, source, excerpt, content, how_to_use):
    """按模板格式生成概念正文（definition/excerpt/how_to_use/content 为正文唯一来源）"""
    return (
        f"# {title}\n\n"
        f"> {definition}\n\n"
        f"## 来源\n- [[{source}]]\n\n"
        f"## 原文摘录\n{excerpt}\n\n"
        f"## 核心解释\n{content}\n\n"
        f"## 怎么用\n{how_to_use}\n\n"
        f"## 关联概念\n"
    )
