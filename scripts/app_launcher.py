"""Launcher: starts the backend server and opens the browser."""
from __future__ import annotations

import subprocess
import sys
import time
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "scripts"


def wait_for_server(url: str, timeout: int = 15) -> bool:
    import urllib.request
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            urllib.request.urlopen(url, timeout=1)
            return True
        except Exception:
            time.sleep(0.3)
    return False


def main():
    server_url = "http://127.0.0.1:8765"

    # Start Flask in background
    proc = subprocess.Popen(
        [sys.executable, str(SCRIPTS / "web_app.py")],
        cwd=str(ROOT),
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    try:
        print("正在启动服务...")
        if wait_for_server(server_url):
            webbrowser.open(server_url)
            print(f"已打开浏览器: {server_url}")
        else:
            print("服务启动超时，请手动访问 http://127.0.0.1:8765")
            webbrowser.open(server_url)

        print("服务运行中，关闭此窗口可退出。")
        proc.wait()
    except KeyboardInterrupt:
        pass
    finally:
        proc.terminate()
        proc.wait(timeout=3)


if __name__ == "__main__":
    main()
