#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""知识库数据操作层（原单文件 vault.py 的包入口）。

vault.py 已拆分为 parser / cache / graph 三个职责模块。为兼容既有
`from backend.vault import X` 调用（handler_*.py、templates.py 等），
此处统一重新导出全部公共 API。新代码建议直接 `from backend.vault.parser import ...`
等精确导入。
"""

from backend.vault.parser import (
    parse_frontmatter,
    extract_wikilinks,
    _parse_concept_sections,
    VaultItem,
    _normalize_list,
    _link_target_name,
    _normalize_relations,
)
from backend.vault.cache import (
    _FM_CACHE,
    _read_parsed,
    get_frontmatter,
    get_links,
    invalidate_frontmatter,
)
from backend.vault.graph import (
    list_md_files,
    get_file_type,
    item_from_file,
    search_items,
    _snippet,
    get_graph_data,
    sanitize_filename,
)

__all__ = [
    'parse_frontmatter', 'extract_wikilinks', '_parse_concept_sections',
    'VaultItem', '_normalize_list', '_link_target_name', '_normalize_relations',
    '_FM_CACHE', '_read_parsed', 'get_frontmatter', 'get_links',
    'invalidate_frontmatter', 'list_md_files', 'get_file_type',
    'item_from_file', 'search_items', '_snippet', 'get_graph_data',
    'sanitize_filename',
]
