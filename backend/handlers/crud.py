#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""增删改 Mixin：条目创建/更新/删除、图片上传、习惯打卡。"""

import re
import time
import shutil
import base64
import urllib.parse

from backend.config import VAULT_ROOT, TYPE_DIR
from backend.vault import (
    parse_frontmatter, item_from_file, sanitize_filename, _parse_concept_sections,
)
from backend.templates import generate_md, _build_frontmatter


# 自动生成笔记的后缀映射（book→文学笔记, video→视频笔记, post→帖子笔记）
_NOTE_SUFFIX = {
    'book': '文学笔记',
    'video': '视频笔记',
    'post': '帖子笔记',
}


def _replace_concept_section(body, heading, new_text):
    """就地替换正文中 `## heading` 章节的内容，其余正文逐字保留；章节不存在则追加到文末。"""
    pat = re.compile(r'(##\s*' + re.escape(heading) + r'[ \t]*\n)(.*?)(?=\n##\s|\Z)', re.DOTALL)
    new_sec = (new_text or '').strip() + '\n'
    if pat.search(body):
        return pat.sub(lambda m: m.group(1) + new_sec, body, count=1)
    return body.rstrip() + '\n\n## ' + heading + '\n' + new_sec


def _replace_concept_definition(body, new_def):
    """就地替换 `# 标题` 之后紧跟的 `> 定义` 行；若正文没有定义行则插入到标题后。"""
    new_def = (new_def or '').strip()
    if re.search(r'#\s+.+\n\s*>\s*[^\n]*', body):
        return re.sub(r'(#\s+.+\n)\s*>\s*[^\n]*', lambda m: m.group(1) + '> ' + new_def, body, count=1)
    return re.sub(r'(#\s+.+\n)', lambda m: m.group(1) + '> ' + new_def + '\n', body, count=1)


def _update_concept_body(old_body, data):
    """概念保存：只替换 data 中提供的章节，绝不整体重写正文。

    早期实现用 concept_display_body 整体重建 6 段固定模板，会把未落在 5 个标准
    插槽里的内容（如写在 `## 关联概念` 下的手写备注、没有 `## 核心解释` 头的自由正文）
    在「改任意一栏」时被整体清空。改为就地替换后，编辑 怎么用 / 定义 等互不影响。
    """
    body = old_body
    if 'definition' in data:
        body = _replace_concept_definition(body, data['definition'])
    if 'source' in data:
        body = _replace_concept_section(body, '来源', '- [[' + (data.get('source') or '') + ']]')
    if 'excerpt' in data:
        body = _replace_concept_section(body, '原文摘录', data['excerpt'])
    if 'content' in data:
        body = _replace_concept_section(body, '核心解释', data['content'])
    if 'how_to_use' in data:
        body = _replace_concept_section(body, '怎么用', data['how_to_use'])
    return body


class CrudMixin:
    """条目 CRUD / 上传 / 打卡。依赖宿主类提供 _send_json / _read_body / self.headers / self.rfile。
    注意：_handle_create_item 会调用 self._embed_bilibili_cover_datauri（由 CoverMixin 提供，运行时经 self 解析）。"""

    @staticmethod
    def _unique_filepath(directory, base_title):
        """在 directory 下生成不重名的 <base_title>.md 路径（已存在则追加时间戳）"""
        fname = sanitize_filename(base_title) + '.md'
        fp = directory / fname
        if fp.exists():
            fp = directory / f'{sanitize_filename(base_title)}_{int(time.time())}.md'
        return fp

    def _create_parent_with_notes(self, item_type, data):
        """book/video/post：建同名子目录→写枢纽页→自动建笔记，返回枢纽页路径。

        幂等保护：若同名子目录内已存在同类型枢纽页（如双提交/重复点击导致二次
        创建），直接复用该枢纽页，不再写入第二份，避免同一文件夹出现两个条目。"""
        title = sanitize_filename(data.get('title', '未命名'))
        sub_dir = VAULT_ROOT / TYPE_DIR[item_type] / title
        sub_dir.mkdir(parents=True, exist_ok=True)
        # 防重复：子目录内已存在同类型枢纽页则复用，不写第二份
        existing_hub = None
        for f in sub_dir.glob('*.md'):
            try:
                ffm, _, _ = parse_frontmatter(f.read_text(encoding='utf-8'))
            except Exception:
                continue
            if ffm.get('type') == item_type:
                existing_hub = f
                break
        if existing_hub:
            hub_fp = existing_hub
        else:
            hub_fp = self._unique_filepath(sub_dir, title)
            hub_fp.write_text(generate_md(item_type, data), encoding='utf-8')
        # 自动生成配套笔记（文学/视频/帖子笔记）
        suffix = _NOTE_SUFFIX[item_type]
        notes_title = f'{title}-{suffix}'
        notes_fp = sub_dir / f'{notes_title}.md'
        if not notes_fp.exists():
            note_data = dict(data)
            note_data['title'] = notes_title
            note_data['parent'] = title
            notes_fp.write_text(generate_md(item_type + '-notes', note_data), encoding='utf-8')
        # 视频：抓取并本地化 B 站封面（仅外网可达时；失败则留空）
        if item_type == 'video':
            self._embed_bilibili_cover_datauri(hub_fp)
        return hub_fp

    def _create_note_under_parent(self, item_type, data):
        """book-notes/video-notes/post-notes：在 parent 子目录下写笔记，返回路径"""
        parent = data.get('parent', '')
        note_title = data.get('title', '未命名笔记')
        if parent:
            sub_dir = VAULT_ROOT / TYPE_DIR[item_type] / sanitize_filename(parent)
            sub_dir.mkdir(parents=True, exist_ok=True)
        else:
            sub_dir = VAULT_ROOT / TYPE_DIR[item_type]
        fp = self._unique_filepath(sub_dir, note_title)
        fp.write_text(generate_md(item_type, data), encoding='utf-8')
        return fp

    def _handle_create_item(self):
        data = self._read_body()
        item_type = data.get('type', 'quicknote')
        if item_type not in TYPE_DIR:
            self._send_error('Invalid type', 400)
            return
        if item_type in ('book', 'video', 'post'):
            filepath = self._create_parent_with_notes(item_type, data)
        elif item_type in ('book-notes', 'video-notes', 'post-notes'):
            filepath = self._create_note_under_parent(item_type, data)
        else:
            target_dir = VAULT_ROOT / TYPE_DIR[item_type]
            target_dir.mkdir(parents=True, exist_ok=True)
            filepath = self._unique_filepath(target_dir, data.get('title', '未命名'))
            filepath.write_text(generate_md(item_type, data), encoding='utf-8')
            # 概念：模板正文承载结构化字段，relations 需写回 frontmatter
            # （模板不含 relations 占位，避免与正文字段冲突）。否则创建即丢失关系。
            if item_type == 'concept' and data.get('relations'):
                txt = filepath.read_text(encoding='utf-8')
                fm, content, _ = parse_frontmatter(txt)
                fm['relations'] = data['relations']
                filepath.write_text(
                    f'---\n{_build_frontmatter(fm)}\n---\n{content}', encoding='utf-8')
        item = item_from_file(filepath)
        self._send_json(item, 201)

    def _handle_update_item(self):
        data = self._read_body()
        file_path = urllib.parse.unquote(data.get('path', ''))
        if not file_path:
            self._send_error('Missing path', 400)
            return
        fp = VAULT_ROOT / file_path
        if not fp.exists():
            self._send_error('File not found', 404)
            return
        old_text = fp.read_text(encoding='utf-8')
        fm, content, raw_fm = parse_frontmatter(old_text)
        updatable = ['status', 'priority', 'rating', 'progress', 'start_date',
                     'mood', 'finish_date', 'watch_date', 'due_date',
                     'tags', 'title', 'author', 'source', 'url', 'domain',
                     'concepts', 'chapter', 'order', 'definition', 'how_to_use', 'excerpt',
                     'plan_type', 'frequency', 'streak', 'best_streak', 'last_checkin', 'source_concept',
                     'cover', 'relations']

        # 概念：结构化字段以正文为唯一来源。
        # 仅就地替换 data 中提供的章节，保留其余正文（避免整体重建丢失非标准内容，
        # 例如写在 ## 关联概念 下的手写备注、或没有 ## 核心解释 头的自由正文）。
        if fm.get('type') == 'concept':
            for key in updatable:
                if key in data:
                    fm[key] = data[key]
            # 剔除正文专属键，避免多行内容写入 frontmatter 破坏 YAML
            for k in ('content', 'definition', 'excerpt', 'how_to_use'):
                fm.pop(k, None)
            fm['updated'] = time.strftime('%Y-%m-%d %H:%M')
            new_body = _update_concept_body(content, data)
            new_fm = _build_frontmatter(fm)
            new_text = f'---\n{new_fm}\n---\n{new_body}'
            fp.write_text(new_text, encoding='utf-8')
            item = item_from_file(fp)
            self._send_json(item)
            return

        for key in updatable:
            if key in data:
                fm[key] = data[key]
        # 支持更新正文内容（文学笔记等需要编辑正文的场景）
        if 'content' in data:
            content = '\n' + data['content'].strip() + '\n'
        fm['updated'] = time.strftime('%Y-%m-%d %H:%M')
        new_fm = _build_frontmatter(fm)
        new_text = f'---\n{new_fm}\n---\n{content}'
        fp.write_text(new_text, encoding='utf-8')
        item = item_from_file(fp)
        self._send_json(item)

    def _handle_delete_item(self, params):
        file_path = urllib.parse.unquote(params.get('path', [''])[0])
        if not file_path:
            self._send_error('Missing path', 400)
            return
        fp = VAULT_ROOT / file_path
        if not fp.exists():
            self._send_error('File not found', 404)
            return
        trash = VAULT_ROOT / '.trash'
        trash.mkdir(exist_ok=True)
        try:
            fm, _, _ = parse_frontmatter(fp.read_text(encoding='utf-8'))
        except Exception:
            fm = {}
        if fm.get('type') in ('book', 'video') and fp.parent != VAULT_ROOT / TYPE_DIR.get(fm.get('type', '')):
            dest = trash / fp.parent.name
            shutil.move(str(fp.parent), str(dest))
            self._send_json({'deleted': True, 'path': file_path, 'folder': True})
        else:
            dest = trash / fp.name
            shutil.move(str(fp), str(dest))
            self._send_json({'deleted': True, 'path': file_path})

    # ── 图片上传（base64 JSON） ──────────────────────────
    def _handle_upload(self):
        length = int(self.headers.get('Content-Length', 0))
        if length == 0:
            self._send_error('Empty body', 400)
            return
        try:
            raw = self.rfile.read(length)
            import json as _json
            data = _json.loads(raw.decode('utf-8'))
        except Exception:
            self._send_error('Bad JSON', 400)
            return
        filename = (data.get('filename') or 'image.png').strip()
        content = data.get('content') or ''
        # 兼容 data:image/png;base64,xxxx 与纯 base64
        if ',' in content:
            content = content.split(',', 1)[1]
        try:
            raw_bytes = base64.b64decode(content)
        except Exception:
            self._send_error('Invalid base64', 400)
            return
        if not raw_bytes:
            self._send_error('Empty file', 400)
            return
        name = sanitize_filename(filename) or 'image.png'
        att_dir = VAULT_ROOT / '附件'
        att_dir.mkdir(parents=True, exist_ok=True)
        fp = att_dir / name
        if fp.exists():
            stem = fp.stem
            ext = fp.suffix or '.png'
            name = f"{stem}_{int(time.time())}{ext}"
            fp = att_dir / name
        try:
            fp.write_bytes(raw_bytes)
        except Exception as e:
            self._send_error('Write failed: ' + str(e), 500)
            return
        rel = f"附件/{name}"
        self._send_json({'url': '/api/file/' + urllib.parse.quote(rel), 'path': rel}, 201)

    # ── 习惯打卡 ────────────────────────────────────────
    def _handle_habit_checkin(self):
        data = self._read_body()
        file_path = urllib.parse.unquote(data.get('path', ''))
        if not file_path:
            return self._send_error('Missing path', 400)
        fp = VAULT_ROOT / file_path
        if not fp.exists():
            return self._send_error('File not found', 404)
        old_text = fp.read_text(encoding='utf-8')
        fm, content, raw_fm = parse_frontmatter(old_text)
        if fm.get('type') != 'plan' or fm.get('plan_type') != 'habit':
            return self._send_error('Not a habit item', 400)
        today = time.strftime('%Y-%m-%d')
        last_checkin = fm.get('last_checkin', '')
        if last_checkin == today:
            return self._send_json({'ok': True, 'message': '今日已打卡', 'streak': fm.get('streak', 0), 'best_streak': fm.get('best_streak', 0)})
        streak = int(fm.get('streak', 0) or 0) + 1
        best_streak = max(streak, int(fm.get('best_streak', 0) or 0))
        now = time.strftime('%Y-%m-%d %H:%M')
        fm['streak'] = streak
        fm['best_streak'] = best_streak
        fm['last_checkin'] = today
        fm['updated'] = now
        new_fm_str = _build_frontmatter(fm)
        # 稳健提取正文：优先匹配完整的「--- … ---」frontmatter 块；
        # 若文件因历史 bug 丢失了开头 fence（只剩结尾 ---），则取首个独立 --- 行之后的内容。
        # ⚠️ 必须重写带开头 fence 的完整 frontmatter，否则下次读取时 plan_type 会丢失，
        #    习惯打卡被判定为「普通行动」且无法再次打卡（曾出现的恶性 bug：每次打卡都重写掉开头 ---）。
        fm_block = re.match(r'^---\s*\n.*?\n---\s*\n?', old_text, re.DOTALL)
        if fm_block:
            rest = old_text[fm_block.end():]
        else:
            parts = re.split(r'\n---\s*\n?', old_text, maxsplit=1)
            rest = parts[1] if len(parts) > 1 else (content or '')
        new_text = '---\n' + new_fm_str + '\n---\n' + (rest or '')
        # 更新打卡记录表（追加到正文末尾的表格中）
        checkin_row = f"\n| {today} | 打卡 |"
        if '| 日期 |' in new_text:
            new_text = new_text.rstrip() + checkin_row
        try:
            fp.write_text(new_text, encoding='utf-8')
            self._send_json({'ok': True, 'streak': streak, 'best_streak': best_streak, 'last_checkin': today})
        except Exception as e:
            self._send_error('Write failed: ' + str(e), 500)
