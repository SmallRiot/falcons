import http from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { openStore } from './store.mjs';

const store = openStore(process.env.ARCADE_DATA || fileURLToPath(new URL('./.local', import.meta.url)));
if (process.argv[2] === 'goal') {
  if (!process.argv[3]) throw Error('Укажи уникальный ID гола.');
  console.log(store.goal(process.argv[3]));
  store.close();
} else {
  const port = Number(process.env.ARCADE_PORT || 5192);
  const host = '127.0.0.1:' + port;
  const origin = 'http://' + host;
  const files = { '/': ['index.html','text/html'], '/game.js': ['game.js','text/javascript'], '/style.css': ['style.css','text/css'] };
  http.createServer(async (req,res) => {
    function json(status, value) { res.writeHead(status, {'Content-Type':'application/json'}); res.end(JSON.stringify(value)); }
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Content-Security-Policy',"default-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'none'");
    if (req.headers.host !== host) return json(403,{error:'Invalid host'});
    if (req.method === 'GET' && Object.hasOwn(files, req.url)) {
      const [name,type] = files[req.url];
      res.writeHead(200,{'Content-Type':type+'; charset=utf-8'});
      return res.end(readFileSync(new URL('./public/'+name,import.meta.url)));
    }
    if (req.method === 'GET' && req.url === '/state') return json(200,store.state());
    if (req.method !== 'POST' || !['/drop','/buy','/welcome','/collect'].includes(req.url)) return json(404,{error:'Not found'});
    if (req.headers.origin !== origin || req.headers['content-type'] !== 'application/json') return json(403,{error:'Invalid origin'});
    try {
      let body = '';
      for await (const chunk of req) { body += chunk; if (body.length > 2048) return json(413,{error:'Too large'}); }
      const input = JSON.parse(body);
      if (req.url === '/drop' && input.rows !== 16) return json(409,{error:'Обнови страницу: теперь на доске 16 рядов.'});
      let receipt;
      if (req.url === '/drop') receipt = store.drop(input.commitment,input.nonce,input.stake,input.source);
      else if (req.url === '/welcome') store.activate();
      else if (req.url === '/collect') store.collect();
      else store.buy(input.id);
      json(200,{state:store.state(),receipt});
    } catch (e) { json(400,{error:e.message}); }
  }).listen(port,'127.0.0.1',()=>console.log(origin));
}
