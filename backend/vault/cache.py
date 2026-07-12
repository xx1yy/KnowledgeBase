#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""全库 frontmatter 索引缓存（惰性，按 mtime 失效）。

从原 backend/vault.py 拆分出来。一次仪表盘加载会触发多次全库遍历
（_handle_tags / _handle_domains / _handle_get_item / _handle_tag_update /
_count_tags / _count_domains），每个都重复「读文件 + 解析 frontmatter」。
此缓存以 (path, mtime) 为键记忆解析结果：文件未变动则直接复用，避免重复解析；
写文件后 mtime 变化会自动失效，无需手动维护失效逻辑。
"""

from .parser import parse_frontmatter, extract_wikilinks


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
