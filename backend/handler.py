#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""HTTP 请求处理 —— 瘦核心。

职责边界：
  handler.py    仅含「传输层 + 认证 + 路由分发 + 路由表」
  handler_static.py  静态/文件服务（StaticMixin）
  handler_query.py   查询统计（QueryMixin）
  handler_cover.py   封面系统（CoverMixin）
  handler_crud.py    增删改/上传/打卡（CrudMixin）

所有业务方法都通过 Mixin 提供，由 Handler 组合。方法名、路由表、
self.xxx() 调用方式完全不变，行为零改变。
"""

import http.server
import json
import time
import traceback
import urllib.parse

from backend.config import VAULT_ROOT, TYPE_DIR, log, AUTH_TOKEN
from backend.handler_static import StaticMixin
from backend.handler_query import QueryMixin
from backend.handler_cover import CoverMixin
from backend.handler_crud import CrudMixin

# ── 路由表 ──────────────────────────────────────────────
# 每条路由：(pattern, kind, handler_attr, call_kind)
#   kind:      'exact'  精确路径匹配 | 'prefix' 路径前缀匹配
#   call_kind: 'params'   调用 handler(self.params)（查询参数）
#              'remainder' 调用 handler(path 去掉 prefix 后的剩余部分)
#              'none'      调用 handler()（无参）
# 新增接口只需在此追加一行，无需改动 do_GET/do_POST 分发逻辑。
GET_ROUTES = [
    ('/', 'exact', '_serve_frontend', 'none'),
    ('/index.html', 'exact', '_serve_frontend', 'none'),
    ('/api/token', 'exact', '_send_token', 'none'),
    ('/api/ping', 'exact', '_handle_ping', 'none'),
    ('/api/dashboard', 'exact', '_handle_dashboard', 'none'),
    ('/api/graph', 'exact', '_handle_graph', 'none'),
    ('/api/search', 'exact', '_handle_search', 'none'),
    ('/api/items', 'exact', '_handle_items', 'params'),
    ('/api/tags', 'exact', '_handle_tags', 'none'),
    ('/api/domains', 'exact', '_handle_domains', 'none'),
    ('/api/item', 'exact', '_handle_get_item', 'params'),
    ('/api/cover', 'exact', '_handle_cover', 'params'),
    ('/api/book-cover', 'exact', '_handle_book_cover_deprecated', 'none'),
    ('/api/img', 'exact', '_handle_img_proxy', 'params'),
    ('/api/file/', 'prefix', '_serve_file', 'remainder'),
]
POST_ROUTES = [
    ('/api/item', 'exact', '_handle_create_item', 'none'),
    ('/api/upload', 'exact', '_handle_upload', 'none'),
    ('/api/habit-checkin', 'exact', '_handle_habit_checkin', 'none'),
    ('/api/book-cover-upload', 'exact', '_handle_book_cover_upload', 'none'),
    ('/api/video-cover-refresh', 'exact', '_handle_video_cover_refresh', 'none'),
]
PUT_ROUTES = [
    ('/api/item', 'exact', '_handle_update_item', 'none'),
    ('/api/tags', 'exact', '_handle_tag_update', 'none'),
]
DELETE_ROUTES = [
    ('/api/item', 'exact', '_handle_delete_item', 'params'),
]


class KBServer(http.server.HTTPServer):
    # Windows 上关闭 SO_REUSEADDR 以避免端口探测循环失效
    allow_reuse_address = False


class Handler(StaticMixin, QueryMixin, CoverMixin, CrudMixin, http.server.BaseHTTPRequestHandler):
    """组合全部 Mixin 的请求处理器。"""

    def log_message(self, format, *args):
        log(args[0])

    # ── 路由分发（传输层） ──────────────────────────────
    def _dispatch(self, routes):
        """按路由表分发请求；命中返回 True，未命中返回 False。"""
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        self.params = urllib.parse.parse_qs(parsed.query)
        for pattern, kind, handler_attr, call_kind in routes:
            matched = (path == pattern) if kind == 'exact' else path.startswith(pattern)
            if matched:
                handler = getattr(self, handler_attr)
                if call_kind == 'params':
                    handler(self.params)
                elif call_kind == 'remainder':
                    handler(path[len(pattern):])
                else:
                    handler()
                return True
        return False

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

    # ── GET 路由（认证网关 + 分发） ─────────────────────
    def do_GET(self):
        try:
            parsed = urllib.parse.urlparse(self.path)
            path = parsed.path

            # 认证网关：除公开端点外，所有 /api/ 请求需认证
            # （/api/token 用于前端初始化；/api/file/ 为附件图片，浏览器 <img> 请求无法携带 token，且 _serve_file 已做目录穿越防护）
            if path.startswith('/api/') and path != '/api/token' and not path.startswith('/api/file/'):
                if not self._check_auth():
                    self.send_error(401, 'Unauthorized')
                    return

            if self._dispatch(GET_ROUTES):
                return

            # 静态文件兜底（.css / .js / .png 等）
            if self._serve_static(path):
                return

            self.send_error(404, 'Not Found')
        except Exception as e:
            traceback.print_exc()
            try:
                self.send_error(500, str(e))
            except Exception:
                pass

    # ── POST / PUT / DELETE 路由 ────────────────────────
    def do_POST(self):
        try:
            if not self._check_auth():
                self.send_error(401, 'Unauthorized')
                return
            if self._dispatch(POST_ROUTES):
                return
            self.send_error(404)
        except Exception as e:
            traceback.print_exc()
            try:
                self.send_error(500, str(e))
            except Exception:
                pass

    def do_PUT(self):
        try:
            if not self._check_auth():
                self.send_error(401, 'Unauthorized')
                return
            if self._dispatch(PUT_ROUTES):
                return
            self.send_error(404)
        except Exception as e:
            traceback.print_exc()
            try:
                self.send_error(500, str(e))
            except Exception:
                pass

    def do_DELETE(self):
        try:
            if not self._check_auth():
                self.send_error(401, 'Unauthorized')
                return
            if self._dispatch(DELETE_ROUTES):
                return
            self.send_error(404)
        except Exception as e:
            traceback.print_exc()
            try:
                self.send_error(500, str(e))
            except Exception:
                pass
