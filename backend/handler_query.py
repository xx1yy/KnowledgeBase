#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""查询与统计 Mixin：仪表盘、条目列表、标签、领域、单条目、图谱、搜索、标签重命名。"""

import re
import time
import traceback
import urllib.parse

from backend.config import VAULT_ROOT, TYPE_DIR, DIR_TYPE, log
from backend.vault import (
    parse_frontmatter, extract_wikilinks, list_md_files,
    item_from_file, search_items, get_graph_data,
)
from backend.templates import _build_frontmatter


class QueryMixin:
    """只读查询/统计 + 标签批量重命名。依赖宿主类提供 _send_json / _read_body / self.params。"""

    def _handle_graph(self):
        self._send_json(get_graph_data())

    def _handle_search(self):
        q = self.params.get('q', [''])[0]
        if not q:
            self._send_json([])
            return
        self._send_json(search_items(q))

    def _handle_dashboard(self):
        counts = {}
        recent_all = []
        for d, t in DIR_TYPE.items():
            files = list_md_files(d)
            # 书籍目录下，只统计枢纽页（type=book），文学笔记不单独计数
            if t == 'book':
                hub_files = []
                note_count = 0
                for f in files:
                    try:
                        fm, _, _ = parse_frontmatter(f.read_text(encoding='utf-8'))
                        ftype = fm.get('type', 'book')
                        if ftype == 'book':
                            hub_files.append(f)
                        elif ftype == 'book-notes':
                            note_count += 1
                    except Exception:
                        hub_files.append(f)
                files = hub_files
                counts['book-notes'] = note_count
            # 视频目录下，同样只统计枢纽页（type=video），视频笔记不单独计数
            if t == 'video':
                hub_files = []
                note_count = 0
                for f in files:
                    try:
                        fm, _, _ = parse_frontmatter(f.read_text(encoding='utf-8'))
                        ftype = fm.get('type', 'video')
                        if ftype == 'video':
                            hub_files.append(f)
                        elif ftype == 'video-notes':
                            note_count += 1
                    except Exception:
                        hub_files.append(f)
                files = hub_files
                counts['video-notes'] = note_count
            # 帖子目录下，只统计枢纽页（type=post），帖子笔记不单独计数
            if t == 'post':
                hub_files = []
                note_count = 0
                for f in files:
                    try:
                        fm, _, _ = parse_frontmatter(f.read_text(encoding='utf-8'))
                        ftype = fm.get('type', 'post')
                        if ftype == 'post':
                            hub_files.append(f)
                        elif ftype == 'post-notes':
                            note_count += 1
                    except Exception:
                        hub_files.append(f)
                files = hub_files
                counts['post-notes'] = note_count
            counts[t] = len(files)
            for f in files:
                try:
                    item = item_from_file(f)
                    recent_all.append(item)
                except Exception as e2:
                    log(f"ERROR reading {f}: {e2}")
                    traceback.print_exc()
        # 统计标签总数
        all_tags = set()
        for d in DIR_TYPE:
            for f in list_md_files(d):
                try:
                    fm, _, _ = parse_frontmatter(f.read_text(encoding='utf-8'))
                    tags = fm.get('tags', [])
                    if not isinstance(tags, list):
                        if isinstance(tags, str) and tags:
                            tags = [t.strip() for t in re.split(r'[,，、]', tags) if t.strip()]
                        else:
                            tags = []
                    for tg in tags:
                        if tg:
                            all_tags.add(tg)
                except Exception:
                    pass
        counts['tagCount'] = len(all_tags)
        # 统计领域总数
        all_domains = set()
        for d in DIR_TYPE:
            for f in list_md_files(d):
                try:
                    fm, _, _ = parse_frontmatter(f.read_text(encoding='utf-8'))
                    dom = fm.get('domain', '')
                    if isinstance(dom, str) and dom:
                        for dn in re.split(r'[,，、]', dom):
                            dn = dn.strip()
                            if dn:
                                all_domains.add(dn)
                except Exception:
                    pass
        counts['domainCount'] = len(all_domains)
        recent_all.sort(key=lambda x: x['mtime'], reverse=True)
        self._send_json({
            'counts': counts,
            'recent': recent_all[:12],
            'total': sum(counts.values()),
        })

    def _handle_items(self, params):
        item_type = params.get('type', [''])[0]
        if not item_type or item_type not in TYPE_DIR:
            self._send_json({'error': 'Invalid type'}, 400)
            return
        d = TYPE_DIR[item_type]
        items = [item_from_file(f) for f in list_md_files(d)]
        # 书籍、视频列表只显示枢纽页，笔记类型只显示笔记
        if item_type in ('book', 'video', 'book-notes', 'video-notes'):
            items = [it for it in items if it['type'] == item_type]
        items.sort(key=lambda x: x['mtime'], reverse=True)
        self._send_json(items)

    def _handle_tags(self):
        """扫描全部条目，统计每个标签的使用次数与关联文件路径。"""
        tags = {}
        for d in DIR_TYPE:
            for f in list_md_files(d):
                try:
                    item = item_from_file(f)
                except Exception:
                    continue
                for tg in (item.get('tags') or []):
                    if not isinstance(tg, str) or not tg.strip():
                        continue
                    tg = tg.strip()
                    if tg not in tags:
                        tags[tg] = {'name': tg, 'count': 0, 'paths': []}
                    tags[tg]['count'] += 1
                    tags[tg]['paths'].append(item['path'])
        result = sorted(tags.values(), key=lambda x: (-x['count'], x['name']))
        self._send_json(result)

    def _handle_domains(self):
        """扫描全部条目，统计每个领域的使用次数、关联路径与类型分布。

        domain 字段为自由文本，支持以逗号/、分隔的多个领域（如 "行为经济学, 自控方法"）。
        """
        domains = {}
        for d in DIR_TYPE:
            for f in list_md_files(d):
                try:
                    item = item_from_file(f)
                except Exception:
                    continue
                dom = item.get('domain')
                if not dom or not isinstance(dom, str):
                    continue
                for dn in re.split(r'[,，、]', dom):
                    dn = dn.strip()
                    if not dn:
                        continue
                    if dn not in domains:
                        domains[dn] = {'name': dn, 'count': 0, 'paths': [], 'types': {}}
                    domains[dn]['count'] += 1
                    domains[dn]['paths'].append(item['path'])
                    t = item.get('type', 'unknown')
                    domains[dn]['types'][t] = domains[dn]['types'].get(t, 0) + 1
        result = sorted(domains.values(), key=lambda x: (-x['count'], x['name']))
        self._send_json(result)

    def _handle_get_item(self, params):
        file_path = urllib.parse.unquote(params.get('path', [''])[0])
        if not file_path:
            self._send_json({'error': 'Missing path'}, 400)
            return
        fp = VAULT_ROOT / file_path
        if not fp.exists() or not fp.is_file():
            self._send_json({'error': 'File not found'}, 404)
            return
        item = item_from_file(fp)
        # 获取反向链接
        backlinks = []
        item_id = fp.stem
        for d in DIR_TYPE:
            for f in list_md_files(d):
                if f.stem == item_id:
                    continue
                links = extract_wikilinks(f.read_text(encoding='utf-8'))
                if any(item_id in l for l in links):
                    bl = item_from_file(f)
                    backlinks.append({'id': bl['id'], 'title': bl['title'],
                                      'type': bl['type'], 'path': bl['path']})
        item['backlinks'] = backlinks
        self._send_json(item)

    def _handle_tag_update(self):
        """重命名 / 删除标签：跨所有文件更新 frontmatter 的 tags 列表。

        body: {"from": "旧标签", "to": "新标签"}  —— to 为空则删除该标签。
        """
        data = self._read_body()
        old = (data.get('from') or '').strip()
        new = (data.get('to') or '').strip()
        if not old:
            self._send_json({'error': 'Missing from'}, 400)
            return
        if old == new:
            self._send_json({'changed': 0})
            return
        changed = 0
        for d in DIR_TYPE:
            for f in list_md_files(d):
                try:
                    old_text = f.read_text(encoding='utf-8')
                except Exception:
                    continue
                try:
                    fm, content, _ = parse_frontmatter(old_text)
                except Exception:
                    continue
                tags = fm.get('tags', [])
                if not isinstance(tags, list):
                    if isinstance(tags, str) and tags:
                        tags = [t.strip() for t in re.split(r'[,，、]', tags) if t.strip()]
                    else:
                        tags = []
                if old not in tags:
                    continue
                tags = [t for t in tags if t != old]
                if new and new not in tags:
                    tags.append(new)
                fm['tags'] = tags
                fm['updated'] = time.strftime('%Y-%m-%d %H:%M')
                new_text = f'---\n{_build_frontmatter(fm)}\n---\n{content}'
                try:
                    f.write_text(new_text, encoding='utf-8')
                except Exception:
                    continue
                changed += 1
        self._send_json({'changed': changed})
