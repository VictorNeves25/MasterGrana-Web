// Service worker do MasterGrana — cuida de notificações push, permite instalar como PWA,
// e guarda em cache o "esqueleto" do app (HTML/CSS/JS) pra abrir mesmo sem internet.

const CACHE_ESQUELETO = 'mastergrana-esqueleto-v1';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Estratégia: tenta a rede primeiro (pra sempre pegar a versão mais nova);
// se der erro (offline), cai pro que já estiver em cache. Nunca guarda em
// cache chamadas de API (/api/...) — essas sempre precisam de internet de verdade.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.pathname.startsWith('/api')) return;

  event.respondWith(
    fetch(event.request)
      .then((resposta) => {
        const copia = resposta.clone();
        caches.open(CACHE_ESQUELETO).then((cache) => cache.put(event.request, copia));
        return resposta;
      })
      .catch(() => caches.match(event.request).then((r) => r || caches.match('/')))
  );
});

self.addEventListener('push', (event) => {
  let dados = { titulo: 'MasterGrana', corpo: 'Você tem uma nova notificação.' };
  try {
    dados = event.data.json();
  } catch {
    // usa o padrão acima se não vier JSON
  }

  event.waitUntil(
    self.registration.showNotification(dados.titulo || 'MasterGrana', {
      body: dados.corpo,
      icon: '/icone-192.png',
      badge: '/icone-192.png',
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((janelas) => {
      if (janelas.length > 0) return janelas[0].focus();
      return self.clients.openWindow('/');
    })
  );
});
