const CACHE_NAME = 'sheiko-app-v4.4'; // ATENÇÃO: Mudei o nome para forçar a limpeza do cache antigo

// App shell local (essencial): se algum falhar, a instalação deve falhar.
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './Outfit/Outfit-VariableFont_wght.ttf',
];

// Recursos de CDN (externos): cacheados individualmente; falhas não
// devem impedir a instalação do Service Worker (offline parcial).
// URLs das libs alinhadas com as versões fixadas no index.html.
const CDN_ASSETS = [
  'https://cdn.tailwindcss.com',
  'https://unpkg.com/react@18.3.1/umd/react.production.min.js',
  'https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js',
  'https://unpkg.com/@babel/standalone/babel.min.js',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js',
  'https://cdn.jsdelivr.net/npm/chartjs-plugin-datalabels@2.2.0',
];

// 1. Instalação: Baixa os arquivos para o cache
self.addEventListener('install', (event) => {
  // Força o novo Service Worker a assumir o controle imediatamente, sem esperar o usuário fechar o app
  self.skipWaiting();

  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Caching app shell and content');
      // App shell local: atômico (addAll). Recursos de CDN: tolerantes a falha.
      return Promise.all([
        cache.addAll(CORE_ASSETS),
        ...CDN_ASSETS.map((url) =>
          cache.add(url).catch((err) =>
            console.warn('[Service Worker] Falha ao cachear CDN:', url, err)
          )
        ),
      ]);
    })
  );
});

// 2. Ativação: Limpa caches antigos (Zumbis)
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(
        keyList.map((key) => {
          // Se o nome do cache for diferente da versão atual, apaga ele
          if (key !== CACHE_NAME) {
            console.log('[Service Worker] Removing old cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => {
      // Garante que o SW controle todas as abas/janelas abertas agora
      return self.clients.claim();
    })
  );
});

// 3. Interceptação:
//    - HTML (navegação): NETWORK FIRST — sempre pega a versão mais nova quando
//      online; cai para o cache só quando offline. Evita servir UI desatualizada.
//    - Demais recursos (libs, ícones): CACHE FIRST — rápido e estável.
self.addEventListener('fetch', (event) => {
  const request = event.request;

  // É uma navegação de página (carregar o index.html)?
  const isHTML =
    request.mode === 'navigate' ||
    (request.method === 'GET' &&
      request.headers.get('accept')?.includes('text/html'));

  if (isHTML) {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          // Atualiza o cache com a versão fresca
          const copy = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return networkResponse;
        })
        .catch(() =>
          // Offline: usa o cache (index.html) como fallback
          caches.match(request).then((r) => r || caches.match('./index.html'))
        )
    );
    return;
  }

  // Cache first para o resto — ao buscar da rede, salva no cache para a próxima vez
  event.respondWith(
    caches.match(request).then((response) => {
      if (response) return response;
      return fetch(request).then((networkResponse) => {
        const copy = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        return networkResponse;
      }).catch(() => {
        console.log('Falha ao buscar recurso e sem cache:', request.url);
      });
    })
  );
});