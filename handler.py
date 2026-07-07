#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""HTTP 请求处理"""

import http.server
import json
import time
import traceback
import urllib.parse
import shutil
import re
from pathlib import Path

from config import VAULT_ROOT, FRONTEND_FILE, TYPE_DIR, DIR_TYPE, log
from vault import (
    parse_frontmatter, extract_wikilinks, list_md_files,
    item_from_file, search_items, get_graph_data, sanitize_filename,
)
from templates import generate_md, _build_frontmatter


class KBServer(http.server.HTTPServer):
    # Windows 上关闭 SO_REUSEADDR 以避免端口探测循环失效
    allow_reuse_address = False


class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        log(args[0])

    def _send_json(self, data, status=200):
        try:
            body = json.dumps(data, ensure_ascii=False, default=str).encode('utf-8')
            self.send_response(status)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
            self.send_header('Access-Control-Allow-Headers', 'Content-Type')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except Exception as e:
            log(f"_send_json error: {e}")

    def _read_body(self):
        length = int(self.headers.get('Content-Length', 0))
        if length == 0:
            return {}
        return json.loads(self.rfile.read(length).decode('utf-8'))

    def do_OPTIONS(self):
        self._send_json({}, 204)

    # ── GET 路由 ──────────────────────────────────────────
    def do_GET(self):
        try:
            parsed = urllib.parse.urlparse(self.path)
            path = parsed.path
            params = urllib.parse.parse_qs(parsed.query)

            # 前端页面
            if path == '/' or path == '/index.html':
                self._serve_frontend()
                return

            # API: ping
            if path == '/api/ping':
                self._send_json({'ok': True, 'time': time.time()})
                return

            # API: 仪表盘
            if path == '/api/dashboard':
                self._handle_dashboard()
                return

            # API: 图谱
            if path == '/api/graph':
                self._send_json(get_graph_data())
                return

            # API: 搜索
            if path == '/api/search':
                q = params.get('q', [''])[0]
                if not q:
                    self._send_json([])
                    return
                self._send_json(search_items(q))
                return

            # API: 获取某类型所有条目
            if path == '/api/items':
                self._handle_items(params)
                return

            # API: 标签统计
            if path == '/api/tags':
                self._handle_tags()
                return

            # API: 获取单个文件
            if path == '/api/item':
                self._handle_get_item(params)
                return

            # 静态文件（.css / .js / .png 等）
            if self._serve_static(path):
                return

            self.send_error(404, 'Not Found')
        except Exception as e:
            traceback.print_exc()
            try:
                self.send_error(500, str(e))
            except Exception:
                pass

    def _serve_static(self, path):
        """尝试从项目根目录提供静态文件。"""
        root = Path(__file__).parent
        # 防止目录遍历攻击
        clean_path = path.lstrip('/')
        if '..' in clean_path or '~' in clean_path:
            return False
        fp = root / clean_path
        if not fp.exists() or not fp.is_file():
            return False
        ext = fp.suffix.lower()
        mime_map = {
            '.css': 'text/css',
            '.js': 'application/javascript',
            '.html': 'text/html',
            '.json': 'application/json',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.svg': 'image/svg+xml',
            '.ico': 'image/x-icon',
        }
        content_type = mime_map.get(ext, 'application/octet-stream')
        try:
            body = fp.read_bytes()
            self.send_response(200)
            self.send_header('Content-Type', f'{content_type}; charset=utf-8' if ext in ('.css','.js','.html','.json','.svg') else content_type)
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return True
        except Exception:
            return False

    def _serve_frontend(self):
        try:
            html = FRONTEND_FILE.read_text(encoding='utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Content-Length', str(len(html.encode('utf-8'))))
            self.end_headers()
            self.wfile.write(html.encode('utf-8'))
        except FileNotFoundError:
            self.send_error(404, "Frontend not found")

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

    def _handle_get_item(self, params):
        file_path = params.get('path', [''])[0]
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

    # ── POST 路由 ─────────────────────────────────────────
    def do_POST(self):
        try:
            if self.path == '/api/item':
                self._handle_create_item()
                return
            self.send_error(404)
        except Exception as e:
            traceback.print_exc()
            try:
                self.send_error(500, str(e))
            except Exception:
                pass

    def _handle_create_item(self):
        data = self._read_body()
        item_type = data.get('type', 'quicknote')
        if item_type not in TYPE_DIR:
            self._send_json({'error': 'Invalid type'}, 400)
            return
        md_text = generate_md(item_type, data)
        fname = sanitize_filename(data.get('title', '未命名')) + '.md'
        target_dir = VAULT_ROOT / TYPE_DIR[item_type]
        target_dir.mkdir(parents=True, exist_ok=True)

        # 书籍特殊处理：创建子文件夹 + 自动生成文学笔记
        if item_type == 'book':
            book_title = sanitize_filename(data.get('title', '未命名'))
            book_dir = target_dir / book_title
            book_dir.mkdir(parents=True, exist_ok=True)
            filepath = book_dir / f'{book_title}.md'
            if filepath.exists():
                filepath = book_dir / f'{book_title}_{int(time.time())}.md'
            filepath.write_text(md_text, encoding='utf-8')

            # 自动创建文学笔记文件
            notes_path = book_dir / f'{book_title}-文学笔记.md'
            if not notes_path.exists():
                note_data = dict(data)
                note_data['title'] = f'{book_title}-文学笔记'
                note_data['parent'] = book_title
                notes_md = generate_md('book-notes', note_data)
                notes_path.write_text(notes_md, encoding='utf-8')

        # 视频特殊处理：创建子文件夹 + 自动生成视频笔记
        elif item_type == 'video':
            video_title = sanitize_filename(data.get('title', '未命名'))
            video_dir = target_dir / video_title
            video_dir.mkdir(parents=True, exist_ok=True)
            filepath = video_dir / f'{video_title}.md'
            if filepath.exists():
                filepath = video_dir / f'{video_title}_{int(time.time())}.md'
            filepath.write_text(md_text, encoding='utf-8')

            # 自动创建视频笔记文件
            notes_path = video_dir / f'{video_title}-视频笔记.md'
            if not notes_path.exists():
                note_data = dict(data)
                note_data['title'] = f'{video_title}-视频笔记'
                note_data['parent'] = video_title
                notes_md = generate_md('video-notes', note_data)
                notes_path.write_text(notes_md, encoding='utf-8')

        # 文学笔记独立创建：放入指定书籍的子文件夹
        elif item_type == 'book-notes':
            parent_book = data.get('parent', '')
            note_title = data.get('title', '未命名笔记')
            if parent_book:
                book_dir_name = sanitize_filename(parent_book)
                book_dir = target_dir / book_dir_name
                book_dir.mkdir(parents=True, exist_ok=True)
            else:
                book_dir = target_dir
            fname = sanitize_filename(note_title) + '.md'
            filepath = book_dir / fname
            if filepath.exists():
                fname = f"{sanitize_filename(note_title)}_{int(time.time())}.md"
                filepath = book_dir / fname
            filepath.write_text(md_text, encoding='utf-8')

        # 视频笔记独立创建：放入指定视频的子文件夹
        elif item_type == 'video-notes':
            parent_video = data.get('parent', '')
            note_title = data.get('title', '未命名笔记')
            if parent_video:
                video_dir_name = sanitize_filename(parent_video)
                video_dir = target_dir / video_dir_name
                video_dir.mkdir(parents=True, exist_ok=True)
            else:
                video_dir = target_dir
            fname = sanitize_filename(note_title) + '.md'
            filepath = video_dir / fname
            if filepath.exists():
                fname = f"{sanitize_filename(note_title)}_{int(time.time())}.md"
                filepath = video_dir / fname
            filepath.write_text(md_text, encoding='utf-8')
        else:
            filepath = target_dir / fname
            if filepath.exists():
                fname = f"{sanitize_filename(data.get('title', '未命名'))}_{int(time.time())}.md"
                filepath = target_dir / fname
            filepath.write_text(md_text, encoding='utf-8')

        item = item_from_file(filepath)
        self._send_json(item, 201)

    # ── PUT 路由 ──────────────────────────────────────────
    def do_PUT(self):
        try:
            if self.path == '/api/item':
                self._handle_update_item()
                return
            if self.path == '/api/tags':
                self._handle_tag_update()
                return
            self.send_error(404)
        except Exception as e:
            traceback.print_exc()
            try:
                self.send_error(500, str(e))
            except Exception:
                pass

    def _handle_update_item(self):
        data = self._read_body()
        file_path = data.get('path', '')
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
                     'concepts', 'chapter']
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

    # ── DELETE 路由 ───────────────────────────────────────
    def do_DELETE(self):
        try:
            parsed = urllib.parse.urlparse(self.path)
            params = urllib.parse.parse_qs(parsed.query)
            file_path = params.get('path', [''])[0]
            if not file_path:
                self._send_json({'error': 'Missing path'}, 400)
                return
            fp = VAULT_ROOT / file_path
            if not fp.exists():
                self._send_json({'error': 'File not found'}, 404)
                return
            trash = VAULT_ROOT / '.trash'
            trash.mkdir(exist_ok=True)

            # 书籍枢纽页：删除整个子文件夹
            try:
                fm, _, _ = parse_frontmatter(fp.read_text(encoding='utf-8'))
            except Exception:
                fm = {}
            if fm.get('type') in ('book', 'video') and fp.parent != VAULT_ROOT / TYPE_DIR.get(fm.get('type', '')):
                # 删除整个书籍文件夹
                dest = trash / fp.parent.name
                shutil.move(str(fp.parent), str(dest))
                self._send_json({'deleted': True, 'path': file_path, 'folder': True})
            else:
                dest = trash / fp.name
                shutil.move(str(fp), str(dest))
                self._send_json({'deleted': True, 'path': file_path})
            return
        except Exception as e:
            traceback.print_exc()
            try:
                self.send_error(500, str(e))
            except Exception:
                pass