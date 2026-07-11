#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Markdown 模板生成

模板正文已外置到 backend/templates/*.md（占位符用 {{key}}），
本模块负责加载、缓存与占位符替换。generate_md / concept_display_body /
_build_frontmatter 的对外签名保持不变。
"""

import json
import re
import time
from pathlib import Path

_TEMPLATES_DIR = Path(__file__).parent / 'templates'

# 每种模板（按文件名）在占位符缺失时使用的默认值，
# 与原文 f-string 中 data.get(key, default) 保持一致。
_TEMPLATE_DEFAULTS = {
    'book': {'status': '在读', 'rating': 0, 'author': ''},
    'book-notes': {'chapter': '', 'content': ''},
    'video': {'status': '已看', 'rating': 0, 'source': '', 'url': '', 'content': ''},
    'video-notes': {'content': ''},
    'post': {'status': '已读', 'source': '', 'url': '', 'platform': '', 'content': ''},
    'post-notes': {'content': ''},
    'concept': {'domain': '', 'source': '', 'definition': '一句话定义',
                'excerpt': '', 'how_to_use': '', 'content': ''},
    'reflection': {'mood': '😌 平静', 'content': ''},
    'problem': {'status': '待解决', 'priority': '中', 'domain': '', 'content': ''},
    'plan-action': {'status': '待开始', 'priority': '中', 'progress': 0,
                    'due_date': '', 'source_concept': ''},
    'plan-habit': {'status': '活跃', 'frequency': 'daily', 'source_concept': ''},
    'quicknote': {'content': ''},
}

_template_cache = {}

_PLACEHOLDER_RE = re.compile(r'\{\{(\w+)\}\}')


def _load_template(name):
    """加载并缓存模板文件；缺失时抛出清晰错误（fail-fast）"""
    if name not in _template_cache:
        p = _TEMPLATES_DIR / f'{name}.md'
        if not p.exists():
            raise FileNotFoundError(
                f'模板文件缺失：{p}（请确认 backend/templates/ 下存在 {name}.md）'
            )
        _template_cache[name] = p.read_text(encoding='utf-8')
    return _template_cache[name]


def _substitute(tpl, ctx):
    """将 {{key}} 替换为 ctx 中对应值；未提供则为空串。

    不使用 str.format，避免用户内容中的花括号（如代码片段）导致异常。
    """
    return _PLACEHOLDER_RE.sub(lambda m: str(ctx.get(m.group(1), '')), tpl)


def generate_md(item_type, data):
    """根据类型和表单数据生成 Markdown 内容（模板来自 backend/templates/*.md）"""
    now = time.strftime('%Y-%m-%d %H:%M')
    date = time.strftime('%Y-%m-%d')
    title = data.get('title', '未命名')
    tags = data.get('tags', [])
    if isinstance(tags, str):
        tags = [t.strip() for t in re.split(r'[,，、]', tags) if t.strip()]
    tag_str = json.dumps(tags, ensure_ascii=False) if tags else '[]'

    # 基础上下文（所有模板共享）
    ctx = {
        'title': title,
        'now': now,
        'date': date,
        'tag_str': tag_str,
        'parent': data.get('parent', title),
    }
    # 解析模板文件名：plan 按 plan_type 选择 action / habit 变体
    if item_type == 'plan':
        fname = f"plan-{data.get('plan_type', 'action')}"
    else:
        fname = item_type
    if not (_TEMPLATES_DIR / f'{fname}.md').exists():
        fname = 'quicknote'
    # 合并：实际数据优先，其次为类型默认值
    defaults = _TEMPLATE_DEFAULTS.get(fname, {})
    for k in set(defaults) | set(data):
        if k not in ctx:
            ctx[k] = data.get(k, defaults.get(k, ''))
    return _substitute(_load_template(fname), ctx)


def concept_display_body(title, definition, source, excerpt, content, how_to_use):
    """按模板格式生成概念正文（definition/excerpt/how_to_use/content 为正文唯一来源）"""
    ctx = {
        'title': title,
        'definition': definition,
        'source': source,
        'excerpt': excerpt,
        'content': content,
        'how_to_use': how_to_use,
    }
    return _substitute(_load_template('concept-body'), ctx)


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


# 模块加载时预读所有模板：缺失文件立即暴露，避免运行时才报错
for _name in list(_TEMPLATE_DEFAULTS) + ['concept-body']:
    _load_template(_name)
