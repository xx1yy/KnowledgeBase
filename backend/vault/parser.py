#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Frontmatter 解析与条目数据模型。

从原 backend/vault.py 拆分出来，承载纯解析职责：
- parse_frontmatter：本项目自定义 YAML frontmatter 解析器
- extract_wikilinks：提取 [[wikilink]]
- VaultItem：API 返回的条目数据模型（30+ 字段）
- _normalize_*：frontmatter 列表 / 关系规范化
"""

import re
from dataclasses import dataclass, field, asdict


def parse_frontmatter(text):
    """解析 Markdown 文件中的 YAML frontmatter"""
    fm = {}
    m = re.match(r'^---\s*\n(.*?)\n---', text, re.DOTALL)
    if not m:
        return fm, text, text
    raw = m.group(1)
    current_key = None
    for line in raw.split('\n'):
        stripped = line.strip()
        if not stripped or stripped.startswith('#'):
            continue
        kv = re.match(r'^([\w_-]+)\s*:\s*(.*)', stripped)
        if kv:
            key, val = kv.group(1), kv.group(2).strip()
            if (val.startswith('"') and val.endswith('"')) or \
               (val.startswith("'") and val.endswith("'")):
                val = val[1:-1]
                quoted = True
            else:
                quoted = False
            # [[wikilink]] 不是数组，是字符串
            if val.startswith('[[') and val.endswith(']]'):
                fm[key] = val
            elif val.startswith('[') and val.endswith(']'):
                items = re.findall(r'"([^"]*)"', val)
                if not items:
                    items = [x.strip() for x in val[1:-1].split(',') if x.strip()]
                fm[key] = items
            elif val == 'true':
                fm[key] = True
            elif val == 'false':
                fm[key] = False
            elif val == 'null' or val == '':
                fm[key] = None
            elif quoted:
                # 显式带引号的值一律按字符串保留（如 "04" 不被 int() 成 4）
                fm[key] = val
            else:
                try:
                    fm[key] = int(val)
                except ValueError:
                    try:
                        fm[key] = float(val)
                    except ValueError:
                        fm[key] = val
            current_key = key
        elif current_key and stripped.startswith('-'):
            item = stripped[1:].strip()
            if item.startswith('"') and item.endswith('"'):
                item = item[1:-1]
            if current_key not in fm:
                fm[current_key] = []
            elif not isinstance(fm[current_key], list):
                fm[current_key] = [fm[current_key]]
            fm[current_key].append(item)
    content = text[m.end():]
    return fm, content, raw


def extract_wikilinks(text):
    """从文本中提取 [[wikilinks]]"""
    links = re.findall(r'\[\[([^\]|#]+)(?:[|#][^\]]+)?\]\]', text)
    return [l.strip() for l in links]


def _parse_concept_sections(body):
    """从概念正文解析结构化字段（兼容 frontmatter 未存这些字段的文件）"""
    definition = ''
    m = re.search(r'^>\s*(.+?)\s*$', body, re.MULTILINE)
    if m:
        definition = m.group(1).strip()
    def sec(name):
        pat = r'##\s*' + re.escape(name) + r'\s*\n(.*?)(?=\n##\s|\Z)'
        mm = re.search(pat, body, re.DOTALL)
        return mm.group(1).strip() if mm else ''
    excerpt = sec('原文摘录')
    content = sec('核心解释')
    how_to_use = sec('怎么用')
    return definition, excerpt, content, how_to_use


@dataclass
class VaultItem:
    """条目数据模型：item_from_file 的返回结构（同时也是 API 的 JSON 契约）。

    集中声明所有字段，使 30+ 字段的形状一目了然；item_from_file
    分步填充后通过 asdict() 返回普通 dict，保证前后端契约不变。
    """
    # 身份与路径
    id: str = ''
    path: str = ''
    type: str = ''
    title: str = ''
    # 通用元数据
    author: str = ''
    source: str = ''
    status: str = ''
    priority: str = ''
    rating: int = 0
    progress: int = 0
    domain: str = ''
    chapter: str = ''
    order: object = None
    tags: list = field(default_factory=list)
    concepts: list = field(default_factory=list)
    mood: str = ''
    # 日期
    start_date: str = ''
    finish_date: str = ''
    watch_date: str = ''
    due_date: str = ''
    # 链接与来源
    url: str = ''
    plan_type: str = ''
    frequency: str = ''
    streak: int = 0
    best_streak: int = 0
    last_checkin: str = ''
    source_concept: str = ''
    cover: str = ''
    # 正文与概念结构化字段
    content: str = ''
    definition: str = ''
    how_to_use: str = ''
    excerpt: str = ''
    links: list = field(default_factory=list)
    relations: list = field(default_factory=list)
    # 时间戳
    created: str = ''
    updated: str = ''
    mtime: float = 0.0
    size: int = 0


def _normalize_list(val):
    """把 frontmatter 中的 tags / concepts 规范为列表"""
    if isinstance(val, list):
        return val
    if isinstance(val, str) and val:
        return [t.strip() for t in re.split(r'[,，、]', val) if t.strip()]
    return []


def _link_target_name(raw):
    """从 wikilink 形式（'[[3-概念/涌现]]' 或 '3-概念/涌现'）取出节点名（最后一段）"""
    s = (raw or '').strip()
    if s.startswith('[[') and s.endswith(']]'):
        s = s[2:-2]
    return s.split('/')[-1]


def _normalize_relations(val):
    """把 frontmatter 的 relations 列表规范为 [{to, type, note}] 列表。

    存储格式：relations 为扁平字符串列表，每条 'to|type|note'（如
    '[[3-概念/涌现]]|前置|备注'）。采用扁平字符串是为了兼容本项目的自定义
    frontmatter 解析器（只支持标量/扁平列表，不支持嵌套映射）。type 缺省为 '相关'。
    若手写 YAML 用了嵌套映射（dict），也兼容处理。
    """
    if not isinstance(val, list):
        return []
    out = []
    for r in val:
        if isinstance(r, dict):
            to = str(r.get('to', '')).strip()
            if not to:
                continue
            out.append({
                'to': to,
                'type': str(r.get('type', '相关')).strip() or '相关',
                'note': str(r.get('note', '') or ''),
            })
        elif isinstance(r, str) and r.strip():
            parts = r.split('|', 2)
            to = parts[0].strip()
            if not to:
                continue
            t = parts[1].strip() if len(parts) > 1 else '相关'
            note = parts[2].strip() if len(parts) > 2 else ''
            out.append({'to': to, 'type': t or '相关', 'note': note})
    return out
