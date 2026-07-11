#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""知识库数据操作层：文件读写、Frontmatter 解析、搜索、图谱"""

import os
import re
from dataclasses import dataclass, field, asdict
from pathlib import Path

from backend.config import VAULT_ROOT, DIR_TYPE


# ── 排除的索引文件（不显示在条目列表中） ──
_EXCLUDE_FILES = {
    '书籍索引.md', '视频索引.md', '概念索引.md',
    '反思索引.md', '问题索引.md', '计划索引.md',
}


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


# ── 全库 frontmatter 索引缓存（惰性，按 mtime 失效） ──
# 一次仪表盘加载会触发多次全库遍历（_handle_tags / _handle_domains / _handle_get_item /
# _handle_tag_update / _count_tags / _count_domains），每个都重复「读文件 + 解析 frontmatter」。
# 此缓存以 (path, mtime) 为键记忆解析结果：文件未变动则直接复用，避免重复解析；
# 写文件后 mtime 变化会自动失效，无需手动维护失效逻辑。
_FM_CACHE = {}  # path_str -> (mtime, frontmatter, content, links)


def _read_parsed(filepath):
    """读取并解析文件，按 mtime 惰性缓存 (frontmatter, content, links)。"""
    p = str(filepath)
    try:
        mtime = filepath.stat().st_mtime
    except FileNotFoundError:
        _FM_CACHE.pop(p, None)
        raise
    cached = _FM_CACHE.get(p)
    if cached is not None and cached[0] == mtime:
        return cached[1], cached[2], cached[3]
    text = filepath.read_text(encoding='utf-8')
    fm, content, _ = parse_frontmatter(text)
    links = extract_wikilinks(text)
    _FM_CACHE[p] = (mtime, fm, content, links)
    return fm, content, links


def get_frontmatter(filepath):
    """返回缓存的 (frontmatter, content)，供只读查询免重复解析。"""
    fm, content, _ = _read_parsed(filepath)
    return fm, content


def get_links(filepath):
    """返回缓存的 wikilinks 列表，供反向链接查询复用。"""
    _, _, links = _read_parsed(filepath)
    return links


def invalidate_frontmatter(filepath):
    """写操作后主动失效该路径缓存（保险；mtime 变化也会自动失效）。"""
    _FM_CACHE.pop(str(filepath), None)


def list_md_files(directory):
    """列出指定目录下所有非排除的 .md 文件（递归扫描子文件夹）"""
    d = VAULT_ROOT / directory
    if not d.exists():
        return []
    result = []
    for f in d.rglob("*.md"):
        if f.name in _EXCLUDE_FILES:
            continue
        if '7-模板' in f.parts:
            continue
        if '.trash' in f.parts:
            continue
        result.append(f)
    return sorted(result)


def get_file_type(filepath):
    """根据文件路径推断类型"""
    rel = os.path.relpath(str(filepath), str(VAULT_ROOT)).replace('\\', '/')
    for d, t in DIR_TYPE.items():
        if rel.startswith(d):
            return t
    return 'unknown'


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


def item_from_file(filepath):
    """从 .md 文件读条目数据，返回 VaultItem 的 dict 形式（保持既有 API 契约）"""
    fm, content, links = _read_parsed(filepath)
    _type = fm.get('type', '') or get_file_type(filepath)
    stat = filepath.stat()

    # ① 身份与路径
    item = VaultItem(
        id=filepath.stem,
        path=str(filepath.relative_to(VAULT_ROOT)).replace('\\', '/'),
        type=_type,
        title=fm.get('title', filepath.stem),
    )
    # ② frontmatter 标量 / 列表字段
    item.author = fm.get('author', '')
    item.source = fm.get('source', '')
    item.status = fm.get('status', '')
    item.priority = fm.get('priority', '')
    item.rating = fm.get('rating', 0)
    item.progress = fm.get('progress', 0)
    item.domain = fm.get('domain', '')
    item.chapter = fm.get('chapter', '')
    item.order = fm.get('order', None)
    item.tags = _normalize_list(fm.get('tags'))
    item.concepts = _normalize_list(fm.get('concepts'))
    item.mood = fm.get('mood', '')
    item.start_date = fm.get('start_date', '')
    item.finish_date = fm.get('finish_date', '')
    item.watch_date = fm.get('watch_date', '')
    item.due_date = fm.get('due_date', '')
    item.url = fm.get('url', '')
    item.plan_type = fm.get('plan_type', '')
    item.frequency = fm.get('frequency', '')
    item.streak = fm.get('streak', 0)
    item.best_streak = fm.get('best_streak', 0)
    item.last_checkin = fm.get('last_checkin', '')
    item.source_concept = fm.get('source_concept', '')
    item.cover = fm.get('cover', '')
    # ③ 正文与结构化字段
    item.content = content.strip()
    item.definition = fm.get('definition', '')
    item.how_to_use = fm.get('how_to_use', '')
    item.excerpt = fm.get('excerpt', '')
    item.links = links
    # ④ 时间戳
    item.created = fm.get('created', '')
    item.updated = fm.get('updated', '')
    item.mtime = stat.st_mtime * 1000
    item.size = stat.st_size
    # ⑤ 概念：结构化字段优先从正文解析（模板把它们写在正文，frontmatter 可能为空）
    if _type == 'concept':
        d_def, d_exc, d_con, d_how = _parse_concept_sections(content)
        if d_def:
            item.definition = d_def
        if d_exc:
            item.excerpt = d_exc
        if d_con:
            item.content = d_con
        if d_how:
            item.how_to_use = d_how
    return asdict(item)


def search_items(query):
    """全文搜索"""
    q = query.lower()
    results = []
    for d, _ in DIR_TYPE.items():
        for f in list_md_files(d):
            text = f.read_text(encoding='utf-8').lower()
            if q in text:
                item = item_from_file(f)
                item['snippet'] = _snippet(text, q)
                results.append(item)
    results.sort(key=lambda x: x['mtime'], reverse=True)
    return results


def _snippet(text, query):
    """生成搜索结果片段"""
    idx = text.find(query)
    if idx < 0:
        return text[:200]
    start = max(0, idx - 60)
    end = min(len(text), idx + len(query) + 80)
    snip = text[start:end]
    if start > 0:
        snip = '…' + snip
    if end < len(text):
        snip += '…'
    return snip


def get_graph_data():
    """获取知识图谱数据 (nodes + edges)"""
    nodes = []
    edges = []
    node_ids = set()
    edge_set = set()

    for d, _ in DIR_TYPE.items():
        for f in list_md_files(d):
            item = item_from_file(f)
            # 知识图谱排除文学笔记，避免图谱过于复杂
            if item['type'] == 'book-notes':
                continue
            if item['id'] not in node_ids:
                node_ids.add(item['id'])
                nodes.append({
                    'id': item['id'],
                    'label': item['title'],
                    'type': item['type'],
                    'status': item['status'],
                    'path': item['path'],
                })
            for link in item['links']:
                link_name = link.split('/')[-1]
                edge_key = (item['id'], link_name)
                if edge_key not in edge_set:
                    edge_set.add(edge_key)
                    edges.append({
                        'source': item['id'],
                        'target': link_name,
                        'sourceType': item['type'],
                    })
    return {'nodes': nodes, 'edges': edges}


def sanitize_filename(name):
    """生成安全的文件名"""
    name = re.sub(r'[\\/:*?"<>|]', '-', name)
    return name.strip()[:80]
