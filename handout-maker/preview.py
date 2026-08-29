#!/usr/bin/env python3
"""Run the Handout Maker with automatic Markdown and image refresh."""

from __future__ import annotations

import argparse
import json
import mimetypes
from pathlib import Path
import re
import threading
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote, urlparse
import webbrowser


APP_DIR = Path(__file__).resolve().parent


class HandoutHandler(SimpleHTTPRequestHandler):
    markdown_path: Path

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(APP_DIR), **kwargs)

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_GET(self) -> None:  # noqa: N802 - HTTP handler API
        route = urlparse(self.path).path
        if route == "/api/source":
            self.send_source()
            return
        if route.startswith("/handout-assets/"):
            self.send_handout_asset(route.removeprefix("/handout-assets/"))
            return
        super().do_GET()

    def send_source(self) -> None:
        try:
            stat = self.markdown_path.stat()
            content = self.markdown_path.read_text(encoding="utf-8")
            asset_versions = []
            for match in re.finditer(r"!\[[^\]]*\]\(([^)\s]+)", content):
                asset_path = (self.markdown_path.parent / unquote(match.group(1))).resolve()
                try:
                    asset_path.relative_to(self.markdown_path.parent.resolve())
                    asset_stat = asset_path.stat()
                    asset_versions.append(f"{asset_stat.st_mtime_ns}:{asset_stat.st_size}")
                except (OSError, ValueError):
                    continue
            payload = {
                "content": content,
                "name": self.markdown_path.name,
                "version": ":".join([f"{stat.st_mtime_ns}:{stat.st_size}", *asset_versions]),
            }
            body = json.dumps(payload).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except (OSError, UnicodeError) as error:
            self.send_error(500, f"Could not read Markdown: {error}")

    def send_handout_asset(self, encoded_path: str) -> None:
        relative = Path(unquote(encoded_path))
        root = self.markdown_path.parent.resolve()
        requested = (root / relative).resolve()
        try:
            requested.relative_to(root)
        except ValueError:
            self.send_error(403, "Asset is outside the handout folder")
            return
        if not requested.is_file():
            self.send_error(404, "Handout asset not found")
            return
        content_type = mimetypes.guess_type(requested.name)[0] or "application/octet-stream"
        try:
            body = requested.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except OSError as error:
            self.send_error(500, f"Could not read asset: {error}")

    def log_message(self, message: str, *args: object) -> None:
        print(f"[preview] {self.address_string()} - {message % args}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Preview a Markdown classroom handout with automatic refresh."
    )
    parser.add_argument("markdown", type=Path, help="Markdown file to preview")
    parser.add_argument("--port", type=int, default=8000, help="Local port (default: 8000)")
    parser.add_argument("--no-open", action="store_true", help="Do not open a browser")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    markdown_path = args.markdown.expanduser().resolve()
    if not markdown_path.is_file():
        raise SystemExit(f"Markdown file not found: {markdown_path}")
    if markdown_path.suffix.lower() not in {".md", ".markdown", ".mdown"}:
        raise SystemExit("The preview file must use .md, .markdown, or .mdown")
    if not 0 <= args.port <= 65535:
        raise SystemExit("Port must be between 0 and 65535")

    handler = type("ConfiguredHandoutHandler", (HandoutHandler,), {"markdown_path": markdown_path})
    try:
        server = ThreadingHTTPServer(("127.0.0.1", args.port), handler)
    except OSError as error:
        raise SystemExit(f"Could not start preview server: {error}") from error

    port = server.server_address[1]
    url = f"http://127.0.0.1:{port}/"
    print(f"Previewing: {markdown_path}")
    print(f"Open:       {url}")
    print("Save the Markdown file to update the browser. Press Ctrl+C to stop.")

    if not args.no_open:
        threading.Thread(target=lambda: (time.sleep(0.35), webbrowser.open(url)), daemon=True).start()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping preview server.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
