#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""查询与统计 Mixin：仪表盘、条目列表、标签、领域、单条目、图谱、搜索、标签重命名。"""

import re
import time
import traceback
import urllib.parse

from backend.config import VAULT_ROOT, TYPE_DIR, DIR_TYPE, log
from backend.vault import (
    parse_frontmatter, list_md_files,
    item_from_file, search_items, get_graph_data,
    get_frontmatter, get_links, invalidate_frontmatter, _link_target_name,
)
from backend.templates import _build_frontmatter


def _in_domains(domain_str, dset):
    """判断 domain_str（逗号/、/；分隔的多领域）是否与 dset 任一相交。
    dset 为空 / None 视为「不过滤」，直接放行。"""
    if not dset:
        return True
    if not domain_str:
        return False
    toks = {t.strip() for t in re.split(r'[,，、;；]', domain_str) if t.strip()}
    return bool(toks & dset)


class QueryMixin:
    """只读查询/统计 + 标签批量重命名。依赖宿主类提供 _send_json / _read_body / self.params。"""

    def _domain_set(self):
        """从 self.params 解析 ?domain=a,b,c（多选 OR）为集合；空则返回 None（不过滤）。"""
        raw = self.params.get('domain', [''])[0] if self.params else ''
        if not raw:
            return None
        s = {t.strip() for t in re.split(r'[,，、;；]', raw) if t.strip()}
        return s or None

    def _handle_graph(self):
        data = get_graph_data()
        dset = self._domain_set()
        if dset:
            nodes = [n for n in data['nodes'] if _in_domains(n.get('domain', ''), dset)]
            ids = {n['id'] for n in nodes}
            edges = [e for e in data['edges'] if e['source'] in ids and e['target'] in ids]
            data = {'nodes': nodes, 'edges': edges}
        self._send_json(data)

    def _handle_search(self):
        q = self.params.get('q', [''])[0]
        if not q:
            self._send_json([])
            return
        results = search_items(q)
        dset = self._domain_set()
        if dset:
            results = [r for r in results if _in_domains(r.get('domain', ''), dset)]
        self._send_json(results)

    def _compute_type_counts(self, dset=None):
        """扫描各类型目录，返回 (counts, recent_all)。
        书籍/视频/帖子目录只计枢纽页，配套笔记数量单独统计。
        dset 非空时仅统计命中任一领域的条目（枢纽页与配套笔记分别判定）。"""
        counts = {}
        recent_all = []
        for d, t in DIR_TYPE.items():
            files = list_md_files(d)
            # 书籍/视频/帖子目录下，只统计枢纽页（type=t），笔记不单独计数
            if t in ('book', 'video', 'post'):
                hub_files = []
                note_count = 0
                note_type = t + '-notes'
                for f in files:
                    try:
                        fm, _ = get_frontmatter(f)
                    except Exception:
                        fm = {}
                    ftype = fm.get('type', t)
                    if ftype == t:
                        if dset and not _in_domains(fm.get('domain', ''), dset):
                            continue
                        hub_files.append(f)
                    elif ftype == note_type:
                        if dset and not _in_domains(fm.get('domain', ''), dset):
                            continue
                        note_count += 1
                files = hub_files
                counts[note_type] = note_count
            else:
                if dset:
                    filtered = []
                    for f in files:
                        try:
                            fm, _ = get_frontmatter(f)
                        except Exception:
                            fm = {}
                        if _in_domains(fm.get('domain', ''), dset):
                            filtered.append(f)
                    files = filtered
            counts[t] = len(files)
            for f in files:
                try:
                    item = item_from_file(f)
                    recent_all.append(item)
                except Exception as e2:
                    log(f"ERROR reading {f}: {e2}")
                    traceback.print_exc()
        return counts, recent_all

    def _count_tags(self):
        """统计全库标签去重总数"""
        all_tags = set()
        for d in DIR_TYPE:
            for f in list_md_files(d):
                try:
                    fm, _ = get_frontmatter(f)
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
        return len(all_tags)

    def _count_domains(self):
        """统计全库领域去重总数"""
        all_domains = set()
        for d in DIR_TYPE:
            for f in list_md_files(d):
                try:
                    fm, _ = get_frontmatter(f)
                    dom = fm.get('domain', '')
                    if isinstance(dom, str) and dom:
                        for dn in re.split(r'[,，、]', dom):
                            dn = dn.strip()
                            if dn:
                                all_domains.add(dn)
                except Exception:
                    pass
        return len(all_domains)

    def _handle_dashboard(self):
        dset = self._domain_set()
        counts, recent_all = self._compute_type_counts(dset)
        counts['tagCount'] = self._count_tags()
        counts['domainCount'] = self._count_domains()
        recent_all.sort(key=lambda x: x['mtime'], reverse=True)
        self._send_json({
            'counts': counts,
            'recent': recent_all[:12],
            'total': sum(counts.values()),
        })

    def _handle_items(self, params):
        item_type = params.get('type', [''])[0]
        if not item_type or item_type not in TYPE_DIR:
            self._send_error('Invalid type', 400)
            return
        d = TYPE_DIR[item_type]
        items = [item_from_file(f) for f in list_md_files(d)]
        # 书籍、视频列表只显示枢纽页，笔记类型只显示笔记
        if item_type in ('book', 'video', 'book-notes', 'video-notes'):
            items = [it for it in items if it['type'] == item_type]
        dset = self._domain_set()
        if dset:
            items = [it for it in items if _in_domains(it.get('domain', ''), dset)]
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
            self._send_error('Missing path', 400)
            return
        fp = VAULT_ROOT / file_path
        if not fp.exists() or not fp.is_file():
            self._send_error('File not found', 404)
            return
        item = item_from_file(fp)
        # 获取反向链接（含正文 wikilink 与结构化 relations，relations 带类型）
        backlinks = []
        item_id = fp.stem
        for d in DIR_TYPE:
            for f in list_md_files(d):
                if f.stem == item_id:
                    continue
                other = item_from_file(f)
                hit = None
                if any(item_id in l for l in other.get('links', [])):
                    hit = {'relation': '相关', 'relationNote': ''}
                for rel in other.get('relations', []):
                    if _link_target_name(rel.get('to', '')) == item_id:
                        hit = {'relation': rel.get('type', '相关'),
                               'relationNote': rel.get('note', '')}
                if hit:
                    backlinks.append({'id': other['id'], 'title': other['title'],
                                      'type': other['type'], 'path': other['path'],
                                      'relation': hit['relation'],
                                      'relationNote': hit['relationNote']})
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
            self._send_error('Missing from', 400)
            return
        if old == new:
            self._send_json({'changed': 0})
            return
        changed = 0
        for d in DIR_TYPE:
            for f in list_md_files(d):
                try:
                    fm, content = get_frontmatter(f)
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
                invalidate_frontmatter(f)
                changed += 1
        self._send_json({'changed': changed})
