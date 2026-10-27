import http from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import handler from '../api/index.js';
import { build } from './vendor.mjs';
await mkdir('public/vendor', { recursive: true });
await build();
const root = path.resolve('public');
http
  .createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/api/')) {
      req.query = { route: url.pathname.slice(5) };
      res.status = (n) => {
        res.statusCode = n;
        return res;
      };
      res.json = (d) => {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(d));
      };
      return handler(req, res);
    }
    try {
      const file = path.resolve(
        root,
        '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname),
      );
      if (!file.startsWith(root + path.sep)) throw Error();
      const data = await readFile(file);
      res.setHeader(
        'Content-Type',
        {
          '.html': 'text/html; charset=utf-8',
          '.js': 'application/javascript',
          '.css': 'text/css',
        }[path.extname(file)] || 'text/plain',
      );
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end('Não encontrado');
    }
  })
  .listen(4174, '127.0.0.1', () => console.log('E-Tilt: http://127.0.0.1:4174'));
