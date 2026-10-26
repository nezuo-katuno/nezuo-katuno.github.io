// Service worker da Agenda Escolar.
// Estratégia:
//  - Arquivos do próprio site: tenta a internet primeiro (assim as atualizações
//    chegam sozinhas) e só usa o cache quando estiver sem conexão.
//  - Fontes e bibliotecas do Firebase (versões fixas): cache primeiro, para abrir rápido.
//  - Dados (Firestore) e login (Authentication) NÃO passam por aqui: o Firebase cuida deles.
//
// Se um dia o app parecer "preso" numa versão antiga, aumente o número abaixo (v1 -> v2).
const VERSAO = 'agenda-v2';

const ARQUIVOS_BASE = [
  './',
  'index.html',
  'style.css',
  'app.js',
  'social.js',
  'firebase-config.js',
  'config-admin.js',
  'manifest.json',
  'icon-192.png',
  'icon-512.png'
];

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches.open(VERSAO)
      .then((cache) => cache.addAll(ARQUIVOS_BASE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys()
      .then((nomes) => Promise.all(nomes.filter((n) => n !== VERSAO).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

function ehRecursoEstatico(url) {
  return url.hostname === 'www.gstatic.com'          // SDK do Firebase (versão fixa)
      || url.hostname === 'fonts.googleapis.com'     // CSS das fontes
      || url.hostname === 'fonts.gstatic.com';       // arquivos das fontes
}

self.addEventListener('fetch', (evento) => {
  const pedido = evento.request;
  if (pedido.method !== 'GET') return;

  const url = new URL(pedido.url);

  // Recursos externos estáticos: cache primeiro.
  if (ehRecursoEstatico(url)) {
    evento.respondWith(
      caches.match(pedido).then((guardado) => {
        if (guardado) return guardado;
        return fetch(pedido).then((resposta) => {
          if (resposta.ok || resposta.type === 'opaque') {
            const copia = resposta.clone();
            caches.open(VERSAO).then((cache) => cache.put(pedido, copia));
          }
          return resposta;
        });
      })
    );
    return;
  }

  // Arquivos do próprio site: rede primeiro, cache como reserva.
  if (url.origin === self.location.origin) {
    evento.respondWith(
      fetch(pedido)
        .then((resposta) => {
          if (resposta.ok) {
            const copia = resposta.clone();
            caches.open(VERSAO).then((cache) => cache.put(pedido, copia));
          }
          return resposta;
        })
        .catch(() =>
          caches.match(pedido).then((guardado) => guardado || caches.match('index.html'))
        )
    );
  }
  // Qualquer outra coisa (Firestore, login do Firebase...) segue direto para a rede.
});