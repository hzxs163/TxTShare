// ================================================================
//  Service Worker - 带版本号管理
// ================================================================

const CACHE_VERSION = 'v5';
const CACHE_NAME = `textshare-${CACHE_VERSION}`;

// 预缓存资源列表
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/view.html',
  '/css/style.css',
  '/js/app.js',
  '/manifest.json',
  '/favicon.ico'
];

// ================================================================
//  安装事件 - 预缓存核心资源
// ================================================================
self.addEventListener('install', (event) => {
  console.log('[SW] 安装中...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        return Promise.allSettled(
          STATIC_ASSETS.map(url => 
            cache.add(url).catch(err => console.warn(`[SW] 缓存失败: ${url}`, err))
          )
        );
      })
      .then(() => self.skipWaiting())
  );
});

// ================================================================
//  激活事件 - 清理旧版本缓存
// ================================================================
self.addEventListener('activate', (event) => {
  console.log('[SW] 激活中...');
  event.waitUntil(
    caches.keys()
      .then((keys) => {
        return Promise.all(
          keys
            .filter(key => key !== CACHE_NAME && key.startsWith('textshare-'))
            .map(key => {
              console.log('[SW] 删除旧缓存:', key);
              return caches.delete(key);
            })
        );
      })
      .then(() => self.clients.claim())
  );
});

// ================================================================
//  拦截请求 - 核心策略
// ================================================================
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // ================================================================
  //  规则0：特殊路径不拦截
  // ================================================================
  // manifest.json 不拦截
  if (url.pathname === '/manifest.json') {
    return;
  }
  // 短链接不拦截（8位字母数字）
  if (url.pathname.match(/^\/[a-zA-Z0-9]{8}$/)) {
    return;
  }
  // ✅ API 请求不拦截（包括 /api/view 和 /api/create）
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // ================================================================
  //  规则1：跳过非 GET 请求
  // ================================================================
  if (request.method !== 'GET') {
    return;
  }

  // ================================================================
  //  规则2：只处理同源请求
  // ================================================================
  if (url.origin !== self.location.origin) {
    return;
  }

  // ================================================================
  //  规则3：静态资源 - Cache First
  // ================================================================
  const isStatic = 
    request.destination === 'style' ||
    request.destination === 'script' ||
    request.destination === 'font' ||
    request.destination === 'image' ||
    url.pathname.match(/\.(css|js|woff2|woff|ttf|svg|png|ico|json)$/i);

  if (isStatic && url.pathname !== '/manifest.json') {
    event.respondWith(
      caches.match(request)
        .then((cached) => {
          if (cached) {
            event.waitUntil(
              fetch(request)
                .then((fresh) => {
                  if (fresh.ok) {
                    caches.open(CACHE_NAME).then(cache => cache.put(request, fresh));
                  }
                })
                .catch(() => {})
            );
            return cached;
          }
          return fetch(request)
            .then((response) => {
              if (response.ok) {
                const clone = response.clone();
                caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
              }
              return response;
            })
            .catch(() => {
              return new Response('资源加载失败', { status: 503 });
            });
        })
    );
    return;
  }

  // ================================================================
  //  规则4：HTML 页面 - Network First
  // ================================================================
  if (request.destination === 'document' || url.pathname.endsWith('.html')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => {
          return caches.match(request)
            .then((cached) => {
              if (cached) return cached;
              return new Response('离线状态，请检查网络连接', { status: 503 });
            });
        })
    );
    return;
  }

  // ================================================================
  //  规则5：其他请求 - 直接放行
  // ================================================================
});
