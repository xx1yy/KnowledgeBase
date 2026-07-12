#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""静态资源与文件服务 Mixin：前端页面、静态资源、附件图片、公开端点(token/ping)。"""

import time
import urllib.parse
from pathlib import Path

from backend.config import VAULT_ROOT, FRONTEND_FILE, AUTH_TOKEN

# 前端静态资源根目录（与 FRONTEND_FILE 同级）
_FRONTEND_ROOT = FRONTEND_FILE.parent


class StaticMixin:
    """静态/文件服务与公开端点。依赖宿主类提供 _send_json / send_* / wfile。"""

    # ── 公开端点 ──────────────────────────────────────
    def _send_token(self):
        self._send_json({'token': AUTH_TOKEN})

    def _handle_ping(self):
        self._send_json({'ok': True, 'time': time.time()})

    # ── 前端页面 ──────────────────────────────────────
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

    def _serve_static(self, path):
        """尝试从项目根目录提供静态文件。"""
        root = _FRONTEND_ROOT
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
