#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""HTTP 请求处理"""

import http.server
import json
import time
import traceback
import urllib.parse
import urllib.request
import shutil
import re
import base64
from pathlib import Path

# 封面抓取缓存（单线程 HTTPServer，无需加锁）
COVER_CACHE = {}

from backend.config import VAULT_ROOT, FRONTEND_FILE, TYPE_DIR, DIR_TYPE, log, AUTH_TOKEN
from backend.vault import (
    parse_frontmatter, extract_wikilinks, list_md_files,
    item_from_file, search_items, get_graph_data, sanitize_filename,
    _parse_concept_sections,
)
from backend.templates import generate_md, _build_frontmatter, concept_display_body


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
            # 不再设置 Access-Control-Allow-Origin: *，仅允许同源请求
            self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
            self.send_header('Access-Control-Allow-Headers', 'Content-Type, X-Auth-Token')
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

    def _check_auth(self):
        """校验请求中的 token（query string 或 header），返回 True/False"""
        if not AUTH_TOKEN:
            return True  # 未启用认证时放行
        # 优先从 query 取 token（方便浏览器直接访问 URL）
        parsed = urllib.parse.urlparse(self.path)
        params = urllib.parse.parse_qs(parsed.query)
        qt = params.get('t', [None])[0]
        # 其次从 header 取
        ht = self.headers.get('X-Auth-Token', '')
        token = qt or ht
        import hmac
        return hmac.compare_digest(token or '', AUTH_TOKEN)

    def do_OPTIONS(self):
        self._send_json({}, 204)

    # ── GET 路由 ──────────────────────────────────────────
    def do_GET(self):
        try:
            parsed = urllib.parse.urlparse(self.path)
            path = parsed.path

            # 前端页面（不需要认证）
            if path == '/' or path == '/index.html':
                self._serve_frontend()
                return

            # 公开端点：返回认证 token（用于前端初始化）
            if path == '/api/token':
                self._send_json({'token': AUTH_TOKEN})
                return

            # API 路由需要认证（附件图片 /api/file/ 例外：浏览器 <img> 请求无法携带 token，且 _serve_file 已做目录穿越防护）
            if path.startswith('/api/') and not path.startswith('/api/file/') and not self._check_auth():
                self.send_error(401, 'Unauthorized')
                return

            params = urllib.parse.parse_qs(parsed.query)

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

            # API: 领域统计
            if path == '/api/domains':
                self._handle_domains()
                return

            # API: 获取单个文件
            if path == '/api/item':
                self._handle_get_item(params)
                return

            # API: 视频封面抓取（先支持 B 站，后续扩展其他平台）
            if path == '/api/cover':
                self._handle_cover(params)
                return

            # API: 书籍封面（已改为本地上传，此路由保留兼容但返回空）
            if path == '/api/book-cover':
                self._send_json({'ok': False, 'error': '请使用本地上传功能'})
                return

            # API: 图片代理（同源转发，避免 canvas 跨域污染导致无法导出）
            if path == '/api/img':
                self._handle_img_proxy(params)
                return

            # API: 附件图片服务（个人知识库 内的图片文件）
            if path.startswith('/api/file/'):
                self._serve_file(path[len('/api/file/'):])
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
        root = Path(__file__).parent.parent / "frontend"
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

    # ── 封面抓取 ───────────────────────────────────────
    def _resolve_bilibili_bvid(self, url):
        """从 B 站链接中提取 BV 号，支持 b23.tv 短链跳转"""
        m = re.search(r'(BV[0-9A-Za-z]{10,12})', url)
        if m:
            return m.group(1)
        # b23.tv 短链：跟随重定向拿真实 URL 再提取
        if 'b23.tv' in url:
            try:
                req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
                resp = urllib.request.urlopen(req, timeout=8)
                real = resp.geturl()
                m2 = re.search(r'(BV[0-9A-Za-z]{10,12})', real)
                if m2:
                    return m2.group(1)
            except Exception:
                pass
        return None

    def _fetch_bilibili_cover(self, url):
        try:
            bvid = self._resolve_bilibili_bvid(url)
            if not bvid:
                return {'ok': False, 'error': '未能从链接中识别 B 站视频 BV 号'}
            api = 'https://api.bilibili.com/x/web-interface/view?bvid=' + bvid
            req = urllib.request.Request(api, headers={
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': 'https://www.bilibili.com/'
            })
            resp = urllib.request.urlopen(req, timeout=10)
            data = json.loads(resp.read().decode('utf-8'))
            if data.get('code') != 0:
                return {'ok': False, 'error': 'B 站接口返回错误：' + str(data.get('message', data))}
            d = data['data']
            return {
                'ok': True,
                'platform': 'bilibili',
                'bvid': bvid,
                'cover': d.get('pic', ''),
                'title': d.get('title', ''),
                'author': d.get('owner', {}).get('name', ''),
                'views': d.get('stat', {}).get('view', 0),
                'source_url': url,
            }
        except Exception as e:
            return {'ok': False, 'error': 'B站请求失败: ' + str(e)}

    def _embed_bilibili_cover_datauri(self, filepath):
        """读取视频文件，抓取 B 站封面 → 下载图片 → 转 data URI 写入 frontmatter 的 cover 字段。
        这样封面只在外网可用时抓取一次，之后全部从本地文件读取，彻底避免每次查看都请求外网导致的渲染失败。
        BV 号优先从本文件 url+正文提取；找不到时扫描同目录（视频笔记子文件，B 站链接常粘贴于此）里的链接。"""
        try:
            text = filepath.read_text(encoding='utf-8')
            fm, body, _ = parse_frontmatter(text)
            merged = (fm.get('url', '') or '') + '\n' + (body or '')
            bvid = self._resolve_bilibili_bvid(merged)
            # 本文件没找到 → 扫描同目录其他 .md（如「xxx-视频笔记.md」）
            if not bvid:
                try:
                    for sib in filepath.parent.glob('*.md'):
                        if sib == filepath:
                            continue
                        bv2 = self._resolve_bilibili_bvid(sib.read_text(encoding='utf-8', errors='ignore'))
                        if bv2:
                            bvid = bv2
                            break
                except Exception:
                    pass
            if not bvid:
                return
            api = 'https://api.bilibili.com/x/web-interface/view?bvid=' + bvid
            req = urllib.request.Request(api, headers={
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': 'https://www.bilibili.com/'
            })
            resp = urllib.request.urlopen(req, timeout=10)
            data = json.loads(resp.read().decode('utf-8'))
            if data.get('code') != 0:
                return
            pic_url = data['data'].get('pic', '')
            if not pic_url:
                return
            img_req = urllib.request.Request(pic_url, headers={
                'User-Agent': 'Mozilla/5.0',
                'Referer': 'https://www.bilibili.com/'
            })
            img_data = urllib.request.urlopen(img_req, timeout=10).read()
            mime = 'image/png' if img_data[:8] == b'\x89PNG\r\n\x1a\n' else 'image/jpeg'
            b64 = base64.b64encode(img_data).decode('ascii')
            data_uri = 'data:%s;base64,%s' % (mime, b64)
            fm['cover'] = data_uri
            fm['updated'] = time.strftime('%Y-%m-%d %H:%M')
            filepath.write_text('---\n' + _build_frontmatter(fm) + '\n---\n' + body, encoding='utf-8')
        except Exception:
            pass

    def _handle_cover(self, params):
        url = urllib.parse.unquote(params.get('url', [''])[0]).strip()
        if not url:
            self._send_json({'error': 'Missing url'}, 400)
            return
        # 内存缓存，避免重复请求触发风控
        if url in COVER_CACHE:
            self._send_json(COVER_CACHE[url])
            return
        try:
            if 'bilibili.com' in url or 'b23.tv' in url or 'BV' in url:
                result = self._fetch_bilibili_cover(url)
            else:
                result = {'ok': False, 'error': '暂不支持该平台链接（当前仅支持 B 站）'}
            if result.get('ok'):
                COVER_CACHE[url] = result
            self._send_json(result)
        except Exception as e:
            self._send_json({'ok': False, 'error': '获取封面失败：' + str(e)})

    # ── 书籍封面上传（存为 base64 data URI 到 frontmatter） ──
    def _handle_book_cover_upload(self):
        length = int(self.headers.get('Content-Length', 0))
        if length == 0:
            self._send_json({'error': 'Empty body'}, 400)
            return
        try:
            raw = self.rfile.read(length)
            data = json.loads(raw.decode('utf-8'))
        except Exception:
            self._send_json({'error': 'Bad JSON'}, 400)
            return
        book_path = (data.get('path') or '').strip()
        content = data.get('content') or ''
        if not book_path or not content:
            self._send_json({'error': 'Missing path or content'}, 400)
            return
        # 兼容 data:image/png;base64,xxxx 与纯 base64
        if ',' in content:
            b64_part = content.split(',', 1)[1]
            mime_prefix = content.split(',', 1)[0]  # e.g. "data:image/png;base64"
        else:
            b64_part = content
            mime_prefix = 'data:image/jpeg;base64'
        try:
            raw_bytes = base64.b64decode(b64_part)
        except Exception:
            self._send_json({'error': 'Invalid base64'}, 400)
            return
        if len(raw_bytes) > 2 * 1024 * 1024:  # 解码后不超过 2MB
            self._send_json({'error': '图片太大（最大2MB）'}, 400)
            return
        fp = VAULT_ROOT / book_path
        if not fp.exists():
            self._send_json({'error': 'Book file not found'}, 404)
            return
        # 直接把完整 data URI 写入 frontmatter 的 cover 字段
        data_uri = mime_prefix + ',' + b64_part
        try:
            old_text = fp.read_text(encoding='utf-8')
            fm, body_content, _ = parse_frontmatter(old_text)
            fm['cover'] = data_uri
            fm['updated'] = time.strftime('%Y-%m-%d %H:%M')
            new_fm_str = _build_frontmatter(fm)
            new_text = f'---\n{new_fm_str}\n---\n{body_content}'
            fp.write_text(new_text, encoding='utf-8')
        except Exception as e:
            self._send_json({'error': '写入文件失败: ' + str(e)}, 500)
            return
        self._send_json({
            'ok': True,
            'size': len(raw_bytes),
            'message': '封面已保存',
        }, 201)

    def _handle_video_cover_refresh(self):
        """为已有视频重新抓取 B 站封面并本地化（写入 cover 字段），返回最新 cover"""
        data = self._read_body()
        fp = (data.get('path') or '').strip()
        if not fp:
            self._send_json({'error': 'Missing path'}, 400)
            return
        filepath = VAULT_ROOT / fp
        if not filepath.exists() or not filepath.is_file():
            self._send_json({'error': 'File not found'}, 404)
            return
        self._embed_bilibili_cover_datauri(filepath)
        try:
            fm, _, _ = parse_frontmatter(filepath.read_text(encoding='utf-8'))
        except Exception:
            fm = {}
        self._send_json({'ok': True, 'cover': fm.get('cover', '')})

    def _handle_img_proxy(self, params):
        """同源图片代理：转发外部图片字节，供前端 canvas 裁剪导出（避免跨域污染）"""
        url = urllib.parse.unquote(params.get('url', [''])[0]).strip()
        if not url or not url.startswith(('http://', 'https://')):
            self.send_error(400, 'Invalid url')
            return
        body = b''
        ctype = 'image/jpeg'
        try:
            host = urllib.parse.urlparse(url).netloc.lower()
            if 'bilibili' in host or 'hdslb' in host:
                referer = 'https://www.bilibili.com/'
            elif 'douban' in host:
                referer = 'https://book.douban.com/'
            else:
                referer = f"{urllib.parse.urlparse(url).scheme}://{host}/"
            req = urllib.request.Request(url, headers={
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': referer
            })
            resp = urllib.request.urlopen(req, timeout=10)
            ctype = resp.headers.get('Content-Type', 'image/jpeg')
            if not ctype.startswith('image/'):
                self.send_error(415, 'Not an image')
                return
            body = resp.read()
        except Exception as e:
            # 图片代理失败返回 1x1 透明 GIF 占位图，绝不抛异常崩掉服务
            body = b'\x47\x49\x46\x38\x39\x61\x01\x00\x01\x00\x80\x00\x00\xff\xff\xff\x00\x00\x00\x2c\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02\x44\x01\x00\x3b'
            ctype = 'image/gif'
        # 写入响应（独立 try 防止 wfile 已关闭时崩溃）
        try:
            self.send_response(200)
            self.send_header('Content-Type', ctype)
            self.send_header('Content-Length', str(len(body)))
            self.send_header('Cache-Control', 'public, max-age=86400')
            self.end_headers()
            self.wfile.write(body)
        except Exception:
            pass  # 连接已断开，静默忽略

    # ── POST 路由 ─────────────────────────────────────────
    def do_POST(self):
        try:
            if not self._check_auth():
                self.send_error(401, 'Unauthorized')
                return
            parsed = urllib.parse.urlparse(self.path)
            path = parsed.path
            if path == '/api/item':
                self._handle_create_item()
                return
            if path == '/api/upload':
                self._handle_upload()
                return
            if path == '/api/habit-checkin':
                self._handle_habit_checkin()
                return
            if path == '/api/book-cover-upload':
                self._handle_book_cover_upload()
                return
            if path == '/api/video-cover-refresh':
                self._handle_video_cover_refresh()
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

            # 自动抓取并本地化 B 站封面（仅在外网可达时；失败则留空，后续可手动上传/重新获取）
            self._embed_bilibili_cover_datauri(filepath)

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

        # 帖子特殊处理：创建子文件夹 + 自动生成帖子笔记
        elif item_type == 'post':
            post_title = sanitize_filename(data.get('title', '未命名'))
            post_dir = target_dir / post_title
            post_dir.mkdir(parents=True, exist_ok=True)
            filepath = post_dir / f'{post_title}.md'
            if filepath.exists():
                filepath = post_dir / f'{post_title}_{int(time.time())}.md'
            filepath.write_text(md_text, encoding='utf-8')

            # 自动创建帖子笔记文件
            notes_path = post_dir / f'{post_title}-帖子笔记.md'
            if not notes_path.exists():
                note_data = dict(data)
                note_data['title'] = f'{post_title}-帖子笔记'
                note_data['parent'] = post_title
                notes_md = generate_md('post-notes', note_data)
                notes_path.write_text(notes_md, encoding='utf-8')

        # 帖子笔记独立创建：放入指定帖子的子文件夹
        elif item_type == 'post-notes':
            parent_post = data.get('parent', '')
            note_title = data.get('title', '未命名笔记')
            if parent_post:
                post_dir_name = sanitize_filename(parent_post)
                post_dir = target_dir / post_dir_name
                post_dir.mkdir(parents=True, exist_ok=True)
            else:
                post_dir = target_dir
            fname = sanitize_filename(note_title) + '.md'
            filepath = post_dir / fname
            if filepath.exists():
                fname = f"{sanitize_filename(note_title)}_{int(time.time())}.md"
                filepath = post_dir / fname
            filepath.write_text(md_text, encoding='utf-8')
        else:
            filepath = target_dir / fname
            if filepath.exists():
                fname = f"{sanitize_filename(data.get('title', '未命名'))}_{int(time.time())}.md"
                filepath = target_dir / fname
            filepath.write_text(md_text, encoding='utf-8')

        item = item_from_file(filepath)
        self._send_json(item, 201)

    # ── 附件图片静态服务（仅限图片类型，防目录遍历） ──
    _IMG_MIME = {
        '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
        '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp',
        '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
    }
    def _serve_file(self, rel_path):
        rel = urllib.parse.unquote(rel_path)
        fp = (VAULT_ROOT / rel)
        try:
            fp = fp.resolve()
            root = VAULT_ROOT.resolve()
            if not (fp == root or fp.is_relative_to(root)):
                self.send_error(403, 'Forbidden')
                return
        except Exception:
            self.send_error(403, 'Forbidden')
            return
        if not fp.exists() or not fp.is_file():
            self.send_error(404, 'Not Found')
            return
        ext = fp.suffix.lower()
        mime = self._IMG_MIME.get(ext)
        if not mime:
            self.send_error(403, 'Forbidden type')
            return
        try:
            body = fp.read_bytes()
            self.send_response(200)
            self.send_header('Content-Type', mime)
            self.send_header('Content-Length', str(len(body)))
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Cache-Control', 'public, max-age=86400')
            self.end_headers()
            self.wfile.write(body)
        except Exception:
            self.send_error(500)

    # ── 图片上传（base64 JSON） ──────────────────────────
    def _handle_upload(self):
        length = int(self.headers.get('Content-Length', 0))
        if length == 0:
            self._send_json({'error': 'Empty body'}, 400)
            return
        try:
            raw = self.rfile.read(length)
            data = json.loads(raw.decode('utf-8'))
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
        import re as _re
        _fm_match = _re.match(r'^---\s*\n.*?\n---', old_text, _re.DOTALL)
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

    # ── PUT 路由 ──────────────────────────────────────────
    def do_PUT(self):
        try:
            if not self._check_auth():
                self.send_error(401, 'Unauthorized')
                return
            parsed = urllib.parse.urlparse(self.path)
            path = parsed.path
            if path == '/api/item':
                self._handle_update_item()
                return
            if path == '/api/tags':
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

    # ── DELETE 路由 ───────────────────────────────────────
    def do_DELETE(self):
        try:
            if not self._check_auth():
                self.send_error(401, 'Unauthorized')
                return
            parsed = urllib.parse.urlparse(self.path)
            params = urllib.parse.parse_qs(parsed.query)
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