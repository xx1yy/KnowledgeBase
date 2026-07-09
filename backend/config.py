#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""配置常量与通用工具"""

import os, secrets, time
from pathlib import Path

PORT = 16000
VAULT_ROOT = Path(__file__).parent.parent / "个人知识库"
FRONTEND_FILE = Path(__file__).parent.parent / "frontend" / "dashboard.html"
TOKEN_FILE = Path(__file__).parent.parent / ".kb_token"


def get_auth_token():
    """读取或生成 API 认证 token（持久化到 .kb_token 文件）"""
    if TOKEN_FILE.exists():
        try:
            return TOKEN_FILE.read_text(encoding='utf-8').strip()
        except Exception:
            pass
    token = secrets.token_hex(24)  # 48 字符，足够安全
    try:
        TOKEN_FILE.write_text(token, encoding='utf-8')
    except Exception:
        pass
    return token


# 启动时立即加载 token（全局单例）
AUTH_TOKEN = get_auth_token()

# 目录名 → 类型映射
DIR_TYPE = {
    "1-收件箱": "quicknote",
    "2-输入/书籍": "book",
    "2-输入/视频": "video",
    "3-概念": "concept",
    "4-反思": "reflection",
    "5-问题": "problem",
    "6-计划": "plan",
}

TYPE_LABELS = {
    "book": "书籍", "video": "视频", "concept": "概念",
    "reflection": "反思", "problem": "问题", "plan": "计划",
    "quicknote": "闪念笔记", "book-notes": "文学笔记",
    "video-notes": "视频笔记",
}

TYPE_DIR = {
    "book": "2-输入/书籍", "video": "2-输入/视频",
    "concept": "3-概念", "reflection": "4-反思",
    "problem": "5-问题", "plan": "6-计划",
    "quicknote": "1-收件箱",
    "book-notes": "2-输入/书籍",
    "video-notes": "2-输入/视频",
}


def log(msg):
    now = time.strftime('%H:%M:%S')
    try:
        print(f"[{now}] {msg}", flush=True)
    except Exception:
        pass
