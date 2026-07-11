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
from backend.templates import generate_md, _build_frontmatter, concept_display_body


# 自动生成笔记的后缀映射（book→文学笔记, video→视频笔记, post→帖子笔记）
_NOTE_SUFFIX = {
    'book': '文学笔记',
    'video': '视频笔记',
    'post': '帖子笔记',
}


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
        """book/video/post：建同名子目录→写枢纽页→自动建笔记，返回枢纽页路径"""
        title = sanitize_filename(data.get('title', '未命名'))
        sub_dir = VAULT_ROOT / TYPE_DIR[item_type] / title
        sub_dir.mkdir(parents=True, exist_ok=True)
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
            self._send_json({'error': 'Invalid type'}, 400)
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
        item = item_from_file(filepath)
        self._send_json(item, 201)

    def _handle_update_item(self):
        data = self._read_body()
        file_path = urllib.parse.unquote(data.get('path', ''))
        if not file_path:
            self._send_json({'error': 'Missing path'}, 400)
            return
        fp = VAULT_ROOT / file_path
        if not fp.exists():
            self._send_json({'error': 'File not found'}, 404)
            return
        old_text = fp.read_text(encoding='utf-8')
        fm, content, raw_fm = parse_frontmatter(old_text)
        updatable = ['status', 'priority', 'rating', 'progress',
                     'mood', 'finish_date', 'watch_date', 'due_date',
                     'tags', 'title', 'author', 'source', 'url', 'domain',
                     'concepts', 'chapter', 'order', 'definition', 'how_to_use', 'excerpt',
                     'plan_type', 'frequency', 'streak', 'best_streak', 'last_checkin', 'source_concept',
                     'cover']

        # 概念：结构化字段以正文为唯一来源，重写正文而不是塞进 frontmatter
        if fm.get('type') == 'concept':
            for key in updatable:
                if key in data:
                    fm[key] = data[key]
            bd, be, bc, bh = _parse_concept_sections(content)
            c_def = data.get('definition', bd)
            c_exc = data.get('excerpt', be)
            c_con = data.get('content', bc)
            c_how = data.get('how_to_use', bh)
            c_src = fm.get('source', '')
            # 剔除正文专属键，避免多行内容写入 frontmatter 破坏 YAML
            for k in ('content', 'definition', 'excerpt', 'how_to_use'):
                fm.pop(k, None)
            fm['updated'] = time.strftime('%Y-%m-%d %H:%M')
            new_body = concept_display_body(fm.get('title', ''), c_def, c_src, c_exc, c_con, c_how)
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
            self._send_json({'error': 'Missing path'}, 400)
            return
        fp = VAULT_ROOT / file_path
        if not fp.exists():
            self._send_json({'error': 'File not found'}, 404)
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
            self._send_json({'error': 'Empty body'}, 400)
            return
        try:
            raw = self.rfile.read(length)
            import json as _json
            data = _json.loads(raw.decode('utf-8'))
        except Exception:
            self._send_json({'error': 'Bad JSON'}, 400)
            return
        filename = (data.get('filename') or 'image.png').strip()
        content = data.get('content') or ''
        # 兼容 data:image/png;base64,xxxx 与纯 base64
        if ',' in content:
            content = content.split(',', 1)[1]
        try:
            raw_bytes = base64.b64decode(content)
        except Exception:
            self._send_json({'error': 'Invalid base64'}, 400)
            return
        if not raw_bytes:
            self._send_json({'error': 'Empty file'}, 400)
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
            self._send_json({'error': 'Write failed: ' + str(e)}, 500)
            return
        rel = f"附件/{name}"
        self._send_json({'url': '/api/file/' + urllib.parse.quote(rel), 'path': rel}, 201)

    # ── 习惯打卡 ────────────────────────────────────────
    def _handle_habit_checkin(self):
        data = self._read_body()
        file_path = urllib.parse.unquote(data.get('path', ''))
        if not file_path:
            return self._send_json({'error': 'Missing path'}, 400)
        fp = VAULT_ROOT / file_path
        if not fp.exists():
            return self._send_json({'error': 'File not found'}, 404)
        old_text = fp.read_text(encoding='utf-8')
        fm, content, raw_fm = parse_frontmatter(old_text)
        if fm.get('type') != 'plan' or fm.get('plan_type') != 'habit':
            return self._send_json({'error': 'Not a habit item'}, 400)
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
        # 用正则定位第二个 --- 的结束位置（m.end()），确保不截断正文
        _fm_match = re.match(r'^---\s*\n.*?\n---', old_text, re.DOTALL)
        if _fm_match:
            body_start = _fm_match.end()
            rest = old_text[body_start:].lstrip('\n')
        else:
            rest = content or ''
        new_text = new_fm_str + '\n---\n' + (rest or '')
        # 更新打卡记录表（追加到正文末尾的表格中）
        checkin_row = f"\n| {today} | 打卡 |"
        if '| 日期 |' in new_text:
            new_text = new_text.rstrip() + checkin_row
        try:
            fp.write_text(new_text, encoding='utf-8')
            self._send_json({'ok': True, 'streak': streak, 'best_streak': best_streak, 'last_checkin': today})
        except Exception as e:
            self._send_json({'error': 'Write failed: ' + str(e)}, 500)
