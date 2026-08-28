"""Static server for the repository root with caching disabled.

    python3 examples/serve.py 8000

Element modules change on every style round; `Cache-Control: no-store`
keeps the browser from showing the previous one.
"""
import http.server
import os
import sys

os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def log_message(self, format, *args):  # noqa: A002 - matches the base signature
        pass


port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
http.server.ThreadingHTTPServer(('127.0.0.1', port), Handler).serve_forever()
