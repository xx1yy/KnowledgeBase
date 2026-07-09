#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""知识库数据操作层：文件读写、Frontmatter 解析、搜索、图谱"""

import os
import re
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

def item_from_file(filepath):
    """从 .md 文件读条目数据"""
    text = filepath.read_text(encoding='utf-8')
    fm, content, _ = parse_frontmatter(text)
    links = extract_wikilinks(text)
    _type = fm.get('type', '') or get_file_type(filepath)
    stat = filepath.stat()
    tags = fm.get('tags', [])
    if not isinstance(tags, list):
        if isinstance(tags, str) and tags:
            tags = [t.strip() for t in re.split(r'[,，、]', tags) if t.strip()]
        else:
            tags = []
    concepts = fm.get('concepts', [])
    if not isinstance(concepts, list):
        if isinstance(concepts, str) and concepts:
            concepts = [concepts]
        else:
            concepts = []
    d = {
        'id': filepath.stem,
        'path': str(filepath.relative_to(VAULT_ROOT)).replace('\\', '/'),
        'type': _type,
        'title': fm.get('title', filepath.stem),
        'author': fm.get('author', ''),
        'source': fm.get('source', ''),
        'status': fm.get('status', ''),
        'priority': fm.get('priority', ''),
        'rating': fm.get('rating', 0),
        'progress': fm.get('progress', 0),
        'domain': fm.get('domain', ''),
        'chapter': fm.get('chapter', ''),
        'order': fm.get('order', None),
        'tags': tags,
        'concepts': concepts,
        'mood': fm.get('mood', ''),
        'start_date': fm.get('start_date', ''),
        'finish_date': fm.get('finish_date', ''),
        'watch_date': fm.get('watch_date', ''),
        'due_date': fm.get('due_date', ''),
        'url': fm.get('url', ''),
        'content': content.strip(),
        'definition': fm.get('definition', ''),
        'how_to_use': fm.get('how_to_use', ''),
        'excerpt': fm.get('excerpt', ''),
        'links': links,
        'created': fm.get('created', ''),
        'updated': fm.get('updated', ''),
        'mtime': stat.st_mtime * 1000,
        'size': stat.st_size,
    }
    # 概念：结构化字段优先从正文解析（模板把它们写在正文，frontmatter 可能为空）
    if _type == 'concept':
        d_def, d_exc, d_con, d_how = _parse_concept_sections(content)
        if d_def:
            d['definition'] = d_def
        if d_exc:
            d['excerpt'] = d_exc
        if d_con:
            d['content'] = d_con
        if d_how:
            d['how_to_use'] = d_how
    return d


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
