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


def _unescape_str(s):
    """与 templates._esc_str 对称：还原转义的反斜杠与双引号。

    先还原 \\" → " 再还原 \\\\ → \\（顺序不可颠倒，否则会把已还原内容二次处理）。
    """
    return s.replace('\\"', '"').replace('\\\\', '\\')


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
                val = _unescape_str(val[1:-1])
                quoted = True
            else:
                quoted = False
            # [[wikilink]] 不是数组，是字符串
            if val.startswith('[[') and val.endswith(']]'):
                fm[key] = val
            elif val.startswith('[') and val.endswith(']'):
                # 支持转义双引号：\" 在值内表示一个字面 "，避免含引号的内容被截断
                items = re.findall(r'"((?:[^"\\]|\\.)*)"', val)
                items = [_unescape_str(it) for it in items]
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
    """从概念正文解析结构化字段（兼容 frontmatter 未存这些字段的文件）

    关键：章节边界只认「已知章节标题」（来源/原文摘录/核心解释/怎么用/关联概念），
    不能把用户正文里的任意 `## 子标题` 当成章节分隔——否则多段、带小标题的长内容
    会在读取时被截断，再次保存即永久丢失（曾出现的“字段过多内容丢失”恶性 bug）。
    """
    # 定义：紧跟标题 `# ...` 之后的引用块（> 一行）。锚定在标题后，避免误抓正文里的 `>` 引用。
    definition = ''
    m = re.search(r'^#.*\n+>\s*(.+?)\s*$', body, re.MULTILINE)
    if m:
        definition = m.group(1).strip()
    # 仅以已知章节标题作为边界
    _KNOWN = ['来源', '原文摘录', '核心解释', '怎么用', '关联概念']
    _known_alt = '|'.join(re.escape(h) for h in _KNOWN)
    def sec(name):
        # 边界前瞻：① 下一章节头前可有/可无空行（损坏文件常见「## A」紧跟「## B」无空行）；
        # ② 取所有匹配中内容最长的一段——损坏文件可能出现重复的「## 核心解释」，
        #    空的重头会被跳过，保留真正有内容的那一段。
        pat = (r'##\s*' + re.escape(name) + r'\s*\n'
               r'(.*?)(?=\n##\s*(?:' + _known_alt + r')\s*'
               r'|##\s*(?:' + _known_alt + r')\s*'   # 容忍紧接着的下一章节头（无空行）
               r'|\n#|\Z)')
        matches = re.findall(pat, body, re.DOTALL)
        if not matches:
            return ''
        return max(matches, key=lambda m: len(m.strip())).strip()
    excerpt = sec('原文摘录')
    content = sec('核心解释')
    how_to_use = sec('怎么用')
    return definition, excerpt, content, how_to_use


_CONCEPT_KNOWN = ['来源', '原文摘录', '核心解释', '怎么用', '关联概念']
_CONCEPT_KNOWN_ALT = '|'.join(re.escape(h) for h in _CONCEPT_KNOWN)


def _strip_concept_wrapper(body):
    """核心解释缺失时，从正文抽取「自由内容」：

    剥掉 ① 开头的 `# 标题` 行；② 紧跟的 `> 定义` 行；③ 所有已知章节块
    （`## 来源` / `## 原文摘录` / `## 核心解释` / `## 怎么用` / `## 关联概念`
    及其内容）。保留 `## 正题` 这类内容小节作为 content，且绝不让 `> 定义`
    行漏进 content 被 markdown 渲染成引用块。

    用于两类概念：早年损坏文件（章节头错乱）、以及直接以 `## 小节` 写内容、
    没有 `## 核心解释` 包裹的写法（如「感性确定性」）。
    """
    text = body
    # ① 剥掉开头的 # 标题 行
    text = re.sub(r'^\s*#\s+.+\n?', '', text, count=1)
    # ② 剥掉紧跟的 > 定义 行（及之间的空行）
    text = re.sub(r'^\s*>\s*[^\n]*\n?', '', text, count=1)
    # ③ 剥掉所有已知章节块（含其内容），直到下一个 ## 或文末
    text = re.sub(
        r'\n##\s*(?:' + _CONCEPT_KNOWN_ALT + r')\b[^\n]*\n.*?(?=\n##\s|\Z)',
        '', text, flags=re.DOTALL)
    return text.strip()


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
