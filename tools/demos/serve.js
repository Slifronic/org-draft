// Static server that mimics vercel.json rewrites + cleanUrls for local testing.
const http=require('http'),fs=require('fs'),path=require('path');
const root=path.resolve(process.argv[2]), port=+process.argv[3]||4317;
const cfg=JSON.parse(fs.readFileSync(path.join(root,'vercel.json'),'utf8'));
const rw={};(cfg.rewrites||[]).forEach(r=>rw[r.source]=r.destination);
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.mp4':'video/mp4','.gif':'image/gif','.json':'application/json','.webmanifest':'application/manifest+json'};
http.createServer((q,s)=>{
  let p=decodeURIComponent(q.url.split('?')[0]);
  if(rw[p])p=rw[p];
  let f=path.join(root,p);
  if(!f.startsWith(root)){s.writeHead(403);return s.end()}
  if(fs.existsSync(f)&&fs.statSync(f).isDirectory())f=path.join(f,'index.html');
  if(!fs.existsSync(f)&&fs.existsSync(f+'.html'))f+='.html';
  if(!fs.existsSync(f)){s.writeHead(404);return s.end('404')}
  s.writeHead(200,{'Content-Type':types[path.extname(f)]||'application/octet-stream','Cache-Control':'no-store'});
  fs.createReadStream(f).pipe(s);
}).listen(port,()=>console.log('serving '+root+' on http://localhost:'+port));
