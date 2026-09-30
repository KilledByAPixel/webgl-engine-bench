// Minimal static server for the repo root. `node tools/serve.mjs [port]`
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.json': 'application/json', '.png': 'image/png', '.css': 'text/css' };

export function startServer(port = 8121) {
  const server = createServer(async (req, res) => {
    try {
      const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([\/])+/, '');
      if (path.startsWith('..')) return res.writeHead(403).end();
      const body = await readFile(join(root, path || 'index.html'));
      res.writeHead(200, { 'content-type': types[extname(path || '.html')] || 'application/octet-stream',
        'cache-control': 'no-store' });
      res.end(body);
    } catch (e) {
      const bad = e instanceof URIError;
      res.writeHead(bad ? 400 : 404).end(bad ? 'bad request' : 'not found');
    }
  });
  return new Promise(ok => server.listen(port, '127.0.0.1', () => ok(server)));
}

if (process.argv[1]?.endsWith('serve.mjs'))
  startServer(+process.argv[2] || 8121).then(s => console.log('serving on http://localhost:' + s.address().port));
