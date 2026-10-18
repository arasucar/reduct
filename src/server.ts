import http from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Store } from './store.js';
import { inspectBrief, summarizeWork } from './workflow.js';
import { anchor, messages, Problem } from './model.js';

export async function serve(store: Store, port = 4310) {
  const token = randomBytes(32).toString('hex');
  const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');
  const json = (res: http.ServerResponse, status: number, value: unknown) => {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(value));
  };
  const server = http.createServer(async (req, res) => {
    try {
      const address = server.address(); const actualPort = typeof address === 'object' && address ? address.port : port;
      const hosts = [`127.0.0.1:${actualPort}`, `localhost:${actualPort}`];
      if (!hosts.includes(req.headers.host ?? '')) throw new Problem('Invalid local host', 403);
      const allowedOrigins = hosts.map(h => `http://${h}`);
      if (req.headers.origin && !allowedOrigins.includes(req.headers.origin)) throw new Problem('Cross-origin requests are not permitted', 403);
      if (req.headers['sec-fetch-site'] === 'cross-site') throw new Problem('Cross-site requests are not permitted', 403);
      const url = new URL(req.url ?? '/', `http://127.0.0.1:${actualPort}`);
      if(url.pathname==='/api/compare' && req.method==='GET') return json(res,200,await store.compare(url.searchParams.get('id')??'',url.searchParams.get('revision')??''));
      if(url.pathname==='/api/briefing' && req.method==='GET') return json(res,200,await (url.searchParams.get('format')==='short'?store.shortBriefing.bind(store):store.briefing.bind(store))(url.searchParams.get('id')??'',url.searchParams.get('hash')??undefined));
      if (url.pathname === '/api/workspace' && req.method === 'GET') {
        const state = await store.load();
        const threads = state.docs.filter(d => d.meta.type === 'review').map(d => {
          const target = state.docs.find(t => t.meta.id === d.meta.target_id);
          return { ...d, messages: messages(d), anchor: target ? anchor(target,d) : { state: 'outdated' } };
        });
        const workOverviews=Object.fromEntries(state.docs.filter(d=>['work','bug'].includes(d.meta.type)).map(d=>[d.meta.id,summarizeWork(d,state.docs)]));
        const briefStates=Object.fromEntries(state.docs.filter(d=>d.meta.type==='implementation').map(d=>[d.meta.id,inspectBrief(d,state.docs)]));
        return json(res, 200, { ...state, workOverviews, briefStates, threads, identity: store.gitIdentity(), repo: store.repo, role:'reader', token });
      }
      if (url.pathname.startsWith('/api/') && req.method === 'POST') {
        if (req.headers['x-reduct-token'] !== token) throw new Problem('Invalid write session', 403);
        if (!req.headers['content-type']?.startsWith('application/json')) throw new Problem('Expected JSON', 415);
        let body = ''; for await (const part of req) { body += part; if (Buffer.byteLength(body) > 300000) throw new Problem('Request is too large', 413); }
        let input; try { input = JSON.parse(body); } catch { throw new Problem('Invalid JSON'); }
        if(!['/api/comment','/api/reply'].includes(url.pathname))throw new Problem('The reader interface can write clarification comments only. Use agent commands for document and lifecycle updates.',403);
        if (!input || typeof input.id !== 'string' || typeof input.hash !== 'string') throw new Problem('Missing record ID or hash');
        let result;
        if(url.pathname==='/api/comment')result=await store.comment(input.id,input.hash,input.body,input.quote??'',store.gitIdentity()??input.author,'human',undefined,input.selection);
        else {
          if(input.kind!==undefined&&input.kind!=='reply')throw new Problem('Readers can follow up on clarification; agents address and resolve threads.',403);
          result=await store.followUp(input.id,input.hash,input.body,store.gitIdentity()??input.author);
        }
        return json(res,200,result);
      }
      if (url.pathname.startsWith('/api/')) throw new Problem('Unknown endpoint',404);
      if (req.method !== 'GET') throw new Problem('Method not allowed',405);
      const relative = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname).replace(/^\/+/, '');
      const target = path.resolve(dist, relative);
      if (!target.startsWith(dist + path.sep)) throw new Problem('Invalid asset path',403);
      let bytes;
      try { bytes = await fs.readFile(target); } catch { throw new Problem('Asset not found. Run npm run build first.',404); }
      const mime: Record<string,string> = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml' };
      res.writeHead(200, { 'Content-Type': mime[path.extname(target)] ?? 'application/octet-stream', 'X-Content-Type-Options':'nosniff', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'" }); res.end(bytes);
    } catch (e) { json(res, e instanceof Problem ? e.status : 500, { error: (e as Error).message }); }
  });
  await new Promise<void>((resolve,reject) => { server.once('error',reject); server.listen(port,'127.0.0.1',resolve); });
  return server;
}
