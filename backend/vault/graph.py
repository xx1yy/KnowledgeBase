#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""文件列举、条目构建、搜索与知识图谱生成。

从原 backend/vault.py 拆分出来，依赖 parser（数据模型/规范化）与 cache（惰性解析）。
"""

import os
import re
from dataclasses import asdict
from pathlib import Path

from backend.config import VAULT_ROOT, DIR_TYPE
from .parser import (
    VaultItem, _normalize_list, _normalize_relations, _strip_concept_wrapper,
    _parse_concept_sections, _link_target_name,
)
from .cache import _read_parsed


# ── 排除的索引文件（不显示在条目列表中） ──
_EXCLUDE_FILES = {
    '书籍索引.md', '视频索引.md', '概念索引.md',
    '反思索引.md', '问题索引.md', '计划索引.md',
}


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
    item.relations = _normalize_relations(fm.get('relations'))
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
        else:
            # 核心解释缺失（早年损坏文件 / 无 ## 核心解释 头的写法，如「感性确定性」）：
            # 回退正文，但剥掉 # 标题、> 定义、以及已知章节块（来源/原文摘录/怎么用/关联概念），
            # 保留 ## 正题 这类内容小节作为内容，且绝不让 > 定义行漏进 content 渲染成引用块。
            item.content = _strip_concept_wrapper(content)
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
    """获取知识图谱数据 (nodes + edges)

    边来源（三种，均参与建边）：
      1. 正文 wikilink（links）        → 关系「相关」（占位，可被下方覆盖）
      2. 结构化关系（relations）        → 带类型（覆盖同对的「相关」边）
      3. 笔记 concepts 字段绑定概念     → 关系「来源」（「关联已有概念」写入处，
                                          之前图谱未读它，导致绑定后边不显示）

    文学笔记（book-notes）默认不进图谱以免纯文本笔记撑爆视图；
    但只要它参与了上述任意边，就作为节点入图（否则边没有源节点、画不出来）。
    """
    nodes = []
    edges = []
    node_ids = set()
    edge_map = {}  # (source, target) -> edge

    for d, _ in DIR_TYPE.items():
        for f in list_md_files(d):
            item = item_from_file(f)
            is_book_notes = item['type'] == 'book-notes'

            local_edges = []  # 本条目产生的所有边：(src, tgt, edge)

            # ① 普通 wikilink → 关系「相关」（占位，后续强关系可覆盖）
            for link in item['links']:
                link_name = _link_target_name(link)
                if not link_name:
                    continue
                local_edges.append((item['id'], link_name, {
                    'source': item['id'],
                    'target': link_name,
                    'sourceType': item['type'],
                    'relation': '相关',
                    'relationLabel': '相关',
                }))
            # ② 结构化关系 → 带类型
            for rel in item.get('relations', []):
                link_name = _link_target_name(rel.get('to', ''))
                if not link_name:
                    continue
                rtype = rel.get('type') or '相关'
                local_edges.append((item['id'], link_name, {
                    'source': item['id'],
                    'target': link_name,
                    'sourceType': item['type'],
                    'relation': rtype,
                    'relationLabel': rtype,
                }))
            # ③ 笔记 concepts 字段绑定的概念 → 关系「来源」
            for cn in item.get('concepts', []):
                link_name = _link_target_name(cn)
                if not link_name:
                    continue
                local_edges.append((item['id'], link_name, {
                    'source': item['id'],
                    'target': link_name,
                    'sourceType': item['type'],
                    'relation': '来源',
                    'relationLabel': '来源',
                }))

            # 文学笔记仅在其参与边时加入图谱（避免纯文本笔记撑爆图谱）
            if is_book_notes and not local_edges:
                continue

            if item['id'] not in node_ids:
                node_ids.add(item['id'])
                nodes.append({
                    'id': item['id'],
                    'label': item['title'],
                    'type': item['type'],
                    'status': item['status'],
                    'path': item['path'],
                    'domain': item.get('domain', ''),
                })

            # 合并边：强关系（非「相关」）覆盖「相关」占位，其余保留
            for src, tgt, e in local_edges:
                key = (src, tgt)
                if key not in edge_map:
                    edge_map[key] = e
                else:
                    existing = edge_map[key]
                    if existing.get('relation') == '相关' and e.get('relation') != '相关':
                        edge_map[key] = e
    edges = list(edge_map.values())
    return {'nodes': nodes, 'edges': edges}


def sanitize_filename(name):
    """生成安全的文件名"""
    name = re.sub(r'[\\/:*?"<>|]', '-', name)
    return name.strip()[:80]
