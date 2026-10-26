// Service worker do PWA Caderno.
// - index.html/raiz: network-first, com limite de 2,5 s; passou disso, serve o
//   cache e deixa a resposta da rede atualizá-lo quando chegar.
// - js/css/ícones: cache-first
// - requisições ao Supabase e URLs com ?code= ou ?error= nunca são cacheadas
// - o login é por e-mail + código (OTP), não por link

// Ao publicar mudanças nos arquivos, suba a versão (v8, v9…).
const VERSAO = 'dcaf3a5';
const LIMITE_REDE = 2500;
const CACHE = `tarefas-${VERSAO}`;

const ESTATICOS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/app.js',
  './js/config.js',
  './js/dados.js',
  './js/logica.js',
  './js/parser.js',
  './js/ui/ajustes.js',
  './js/ui/feitas.js',
  './js/ui/detalhes.js',
  './js/ui/dom.js',
  './js/ui/icones.js',
  './js/ui/lista.js',
  './js/ui/notas.js',
  './js/ui/nova.js',
  './fonts/fraunces.woff2',
  './fonts/fraunces-italico.woff2',
  './icons/icone.svg',
  './icons/icone-192.png',
  './icons/icone-512.png',
  './icons/maskable-512.png',
  './vendor/supabase.js',
];

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // Um arquivo ausente não impede a instalação dos demais.
      await Promise.allSettled(
        ESTATICOS.map((url) => cache.add(new Request(url, { cache: 'reload' }))),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    (async () => {
      const chaves = await caches.keys();
      await Promise.all(
        chaves
          .filter((chave) => chave.startsWith('tarefas-') && chave !== CACHE)
          .map((chave) => caches.delete(chave)),
      );
      await self.clients.claim();
    })(),
  );
});

function naoCacheavel(url) {
  if (url.origin !== self.location.origin) return true;
  if (url.pathname.endsWith('/sw.js')) return true;
  if (url.searchParams.has('code') || url.searchParams.has('error')) return true;
  if (url.searchParams.has('error_description')) return true;
  if (/\/auth\/v1\//.test(url.pathname) || /\/rest\/v1\//.test(url.pathname)) {
    return true;
  }
  return false;
}

async function cacheFirst(requisicao) {
  const cache = await caches.open(CACHE);
  const guardado = await cache.match(requisicao);
  if (guardado) return guardado;
  try {
    const resposta = await fetch(requisicao);
    if (resposta && resposta.ok) cache.put(requisicao, resposta.clone());
    return resposta;
  } catch {
    return guardado || Response.error();
  }
}

async function networkFirst(requisicao, evento) {
  const cache = await caches.open(CACHE);
  const daRede = fetch(requisicao).then((resposta) => {
    if (resposta && resposta.ok) cache.put(requisicao, resposta.clone());
    return resposta;
  });
  let timer = null;
  const limite = new Promise((ok) => {
    timer = setTimeout(() => ok(null), LIMITE_REDE);
  });
  const resposta = await Promise.race([daRede.catch(() => null), limite]);
  clearTimeout(timer);
  if (resposta) return resposta;

  const guardado =
    (await cache.match(requisicao)) ||
    (await cache.match('./index.html')) ||
    (await cache.match('./'));
  // Sem limite: a rede continua e atualiza o cache para a próxima abertura.
  if (evento && typeof evento.waitUntil === 'function') {
    evento.waitUntil(daRede.then(() => {}).catch(() => {}));
  }
  if (guardado) return guardado;
  // Primeira visita sem cache: ainda vale esperar a rede.
  try {
    return await daRede;
  } catch {
    return Response.error();
  }
}

self.addEventListener('fetch', (evento) => {
  const requisicao = evento.request;
  if (requisicao.method !== 'GET') return;
  const url = new URL(requisicao.url);
  if (naoCacheavel(url)) return;

  const navegacao =
    requisicao.mode === 'navigate' ||
    (requisicao.headers.get('accept') || '').includes('text/html');

  evento.respondWith(
    navegacao ? networkFirst(requisicao, evento) : cacheFirst(requisicao),
  );
});

self.addEventListener('message', (evento) => {
  if (evento.data === 'pular-espera') self.skipWaiting();
});
