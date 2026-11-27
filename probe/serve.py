import http.server, mimetypes, os, re, sys, urllib.parse, json

LOG = sys.argv[2]
SHOTS = sys.argv[3] if len(sys.argv) > 3 else os.path.dirname(LOG)
LAST = {'value': b'{}'}
CMD = {'id': 0, 'url': ''}  # where the page should go next (beacon.js polls /cmd)
mimetypes.add_type('video/mp4', '.mp4')
mimetypes.add_type('image/webp', '.webp')


class Handler(http.server.SimpleHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'

    def do_POST(self):
        if self.path.startswith('/shot?'):
            name = re.sub(r'[^\w.-]', '_', urllib.parse.unquote(self.path[6:]))
            data = self.rfile.read(int(self.headers.get('Content-Length') or 0))
            with open(os.path.join(SHOTS, os.environ.get('LABEL_FILE_PREFIX', '') + name + '.png'), 'wb') as f:
                f.write(data)
        self.send_response(204)
        self.send_header('Content-Length', '0')
        self.end_headers()

    def do_GET(self):
        if self.path.startswith('/log?'):
            text = urllib.parse.unquote(self.path[5:])
            with open(LOG, 'a') as f:
                f.write(text + '\n')
            if text.startswith('{'):
                LAST['value'] = text.encode()
            self.send_response(204)
            self.send_header('Content-Length', '0')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            return
        if self.path.startswith('/go?'):
            CMD['id'] += 1
            CMD['url'] = urllib.parse.unquote(self.path[4:])
            with open(LOG, 'a') as f:
                f.write('GO ' + CMD['url'] + chr(10))
            self.send_response(204)
            self.send_header('Content-Length', '0')
            self.end_headers()
            return
        if self.path.startswith('/cmd'):
            body = json.dumps(CMD).encode()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Cache-Control', 'no-store')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if self.path.startswith('/last'):
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(LAST['value'])))
            self.end_headers()
            self.wfile.write(LAST['value'])
            return
        path = self.translate_path(self.path)
        match = re.match(r'bytes=(\d+)-(\d*)', self.headers.get('Range') or '')
        if not match or not os.path.isfile(path):
            return super().do_GET()
        size = os.path.getsize(path)
        start = int(match.group(1))
        end = min(int(match.group(2)) if match.group(2) else size - 1, size - 1)
        self.send_response(206)
        self.send_header('Content-Type', self.guess_type(path))
        self.send_header('Accept-Ranges', 'bytes')
        self.send_header('Content-Range', f'bytes {start}-{end}/{size}')
        self.send_header('Content-Length', str(end - start + 1))
        self.end_headers()
        with open(path, 'rb') as f:
            f.seek(start)
            self.wfile.write(f.read(end - start + 1))

    def log_message(self, *args):
        pass


os.chdir(os.path.dirname(os.path.abspath(__file__)))
http.server.ThreadingHTTPServer(('127.0.0.1', int(sys.argv[1])), Handler).serve_forever()
