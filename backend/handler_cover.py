#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""封面系统 Mixin：B 站封面抓取、data URI 本地化、图片代理、书籍封面上传、视频封面刷新。"""

import re
import json
import time
import base64
import urllib.parse
import urllib.request

from backend.config import VAULT_ROOT
from backend.vault import parse_frontmatter
from backend.templates import _build_frontmatter

# 封面抓取缓存（单线程 HTTPServer，无需加锁）
COVER_CACHE = {}


class CoverMixin:
    """封面抓取/本地化/代理。依赖宿主类提供 _send_json / _read_body / send_* / wfile。"""

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
            self._send_error('Missing url', 400)
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

    def _handle_book_cover_deprecated(self):
        self._send_json({'ok': False, 'error': '请使用本地上传功能'})

    # ── 书籍封面上传（存为 base64 data URI 到 frontmatter） ──
    def _handle_book_cover_upload(self):
        length = int(self.headers.get('Content-Length', 0))
        if length == 0:
            self._send_error('Empty body', 400)
            return
        try:
            raw = self.rfile.read(length)
            data = json.loads(raw.decode('utf-8'))
        except Exception:
            self._send_error('Bad JSON', 400)
            return
        book_path = (data.get('path') or '').strip()
        content = data.get('content') or ''
        if not book_path or not content:
            self._send_error('Missing path or content', 400)
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
            self._send_error('Invalid base64', 400)
            return
        if len(raw_bytes) > 2 * 1024 * 1024:  # 解码后不超过 2MB
            self._send_error('图片太大（最大2MB）', 400)
            return
        fp = VAULT_ROOT / book_path
        if not fp.exists():
            self._send_error('Book file not found', 404)
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
            self._send_error('写入文件失败: ' + str(e), 500)
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
            self._send_error('Missing path', 400)
            return
        filepath = VAULT_ROOT / fp
        if not filepath.exists() or not filepath.is_file():
            self._send_error('File not found', 404)
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
