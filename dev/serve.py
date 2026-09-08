#!/usr/bin/env python3
"""Tiny static server for the local MRP panel harness.

Serves dev/panel-preview.html at "/" so the UI can be reviewed in a browser.
It touches nothing outside this repository and is not part of the userscript.
"""
import http.server, os, socketserver, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def translate_path(self, path):
        if path in ('/', '/index.html'):
            path = '/dev/panel-preview.html'
        return super().translate_path(path)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(('0.0.0.0', port), Handler) as httpd:
        print(f'MRP panel harness on http://0.0.0.0:{port}/')
        httpd.serve_forever()
