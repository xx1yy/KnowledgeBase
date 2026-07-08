#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""配置常量与通用工具"""

import time
from pathlib import Path

PORT = 16000
VAULT_ROOT = Path(__file__).parent.parent / "个人知识库"
FRONTEND_FILE = Path(__file__).parent.parent / "frontend" / "dashboard.html"

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
