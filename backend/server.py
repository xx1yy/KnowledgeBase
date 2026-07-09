#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
个人知识库服务端 — 入口
零外部依赖，纯 Python 标准库。
启动: python server.py
访问: http://localhost:16000
"""

import os
from pathlib import Path

from backend import config
from backend.handler import KBServer, Handler


def main():
    os.chdir(str(Path(__file__).parent.parent))
    config.log("个人知识库服务启动")
    config.log(f"  Vault: {config.VAULT_ROOT}")
    config.log(f"  Token: {config.AUTH_TOKEN}")

    # Auto-select free port
    actual_port = None
    for try_port in range(config.PORT, config.PORT + 20):
        try:
            server = KBServer(('127.0.0.1', try_port), Handler)
            actual_port = try_port
            break
        except OSError:
            config.log(f"  Port {try_port} in use, trying {try_port+1}...")
            continue
    if actual_port is None:
        config.log("ERROR: No free port found!")
        return
    config.PORT = actual_port

    # Write port to file for .bat script
    Path('server_port.txt').write_text(str(config.PORT), encoding='utf-8')

    config.log(f"  地址:  http://localhost:{config.PORT}")
    config.log("  Ctrl+C 停止\n")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        config.log("已停止")
        server.server_close()


if __name__ == '__main__':
    main()
