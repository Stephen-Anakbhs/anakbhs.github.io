import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';

const origin = 'http://127.0.0.1:5188';
const reports = [];
const page = new URL('../docs/liquid-dom-runtime.html', import.meta.url);
const assetTypes = { '.js': 'application/javascript', '.css': 'text/css', '.jpg': 'image/jpeg', '.webp': 'image/webp' };

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, origin);
    if (request.method === 'GET' && url.pathname === '/') {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end(await readFile(page));
    } else if (request.method === 'GET' && url.pathname === '/report') {
      response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify(reports));
    } else if (request.method === 'POST' && url.pathname === '/report' && request.headers.origin === origin) {
      let body = '';
      for await (const chunk of request) {
        body += chunk;
        if (body.length > 16384) { response.writeHead(413).end(); return; }
      }
      const event = JSON.parse(body);
      reports.push(event);
      if (reports.length > 60) reports.shift();
      console.log(JSON.stringify(event));
      response.writeHead(204).end();
    } else if (request.method === 'GET' && /^\/assets\/[\w.% -]+$/.test(url.pathname) && assetTypes[extname(url.pathname)]) {
      const asset = new URL(`../docs/liquid-dom-assets/${url.pathname.slice('/assets/'.length)}`, import.meta.url);
      const bytes = await readFile(asset);
      response.writeHead(200, { 'Content-Type': assetTypes[extname(url.pathname)], 'Cache-Control': 'public, max-age=3600' });
      response.end(bytes);
    } else response.writeHead(404).end();
  } catch (error) {
    console.error(error.message);
    if (!response.headersSent) response.writeHead(502);
    response.end('Unable to load the preview resource.');
  }
});

server.listen(5188, '127.0.0.1', () => console.log(`Liquid DOM runtime check: ${origin}`));
