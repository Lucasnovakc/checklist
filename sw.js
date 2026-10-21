// Guarda os arquivos do app para abrir mesmo sem internet. Rede primeiro (pega a versão nova); cache se cair.
// Ao publicar mudança grande, subir o número da versão.
const CACHE = 'checklist-v2';
const ARQUIVOS = ['./', 'index.html', 'style.css', 'config.js', 'regras.js', 'fila.js', 'nuvem.js', 'app.js', 'login.js', 'hoje.js',
  'acompanhar.js', 'historico.js', 'cadastro.js', 'imprimir.js', 'vendor/supabase.js', 'logo.png', 'icone-192.png', 'icone-512.png', 'manifest.webmanifest'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARQUIVOS)));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // Supabase e fontes passam direto
  e.respondWith(fetch(e.request)
    .then(r => { const copia = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copia)); return r; })
    .catch(() => caches.match(e.request).then(r => r || caches.match('index.html'))));
});
