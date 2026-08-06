// ================================================================
//  Service Worker - 优化版
//  策略：静态资源 Cache First，API 请求 Network Only
//  拦截范围：仅拦截 /api/、静态资源、HTML 页面
// ================================================================

const CACHE_VERSION = 'v3';
const CACHE_NAME = `textshare-${CACHE_VERSION}`;

// 需要预缓存的静态资源列表（部署时更新）
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
        // 只缓存存在的资源，避免单个失败导致整体失败
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
//  激活事件 - 清理旧缓存
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
  //  规则1：跳过非 GET 请求
  // ================================================================
  if (request.method !== 'GET') {
    return;
  }

  // ================================================================
  //  规则2：只处理同源请求（不处理外部 CDN）
  // ================================================================
  if (url.origin !== self.location.origin) {
    // 外部资源直接走网络，不经过 SW 缓存
    return;
  }

  // ================================================================
  //  规则3：API 请求 - Network Only（不缓存，保证实时性）
  // ================================================================
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .catch(() => {
          return new Response(
            JSON.stringify({ success: false, message: '网络连接失败' }),
            { status: 503, headers: { 'Content-Type': 'application/json' } }
          );
        })
    );
    return;
  }

  // ================================================================
  //  规则4：静态资源（CSS/JS/字体/图标）- Cache First
  //  ================================================================
  const isStatic = 
    request.destination === 'style' ||
    request.destination === 'script' ||
    request.destination === 'font' ||
    request.destination === 'image' ||
    url.pathname.match(/\.(css|js|woff2|woff|ttf|svg|png|ico|json)$/i);

  if (isStatic) {
    event.respondWith(
      caches.match(request)
        .then((cached) => {
          if (cached) {
            // 缓存命中：直接返回，同时后台静默更新
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
          // 缓存未命中：去网络获取并缓存
          return fetch(request)
            .then((response) => {
              if (response.ok) {
                const clone = response.clone();
                caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
              }
              return response;
            })
            .catch(() => {
              // 网络失败返回简单的错误响应
              return new Response('资源加载失败', { status: 503 });
            });
        })
    );
    return;
  }

  // ================================================================
  //  规则5：HTML 页面 - Network First（保证内容最新）
  // ================================================================
  if (request.destination === 'document' || url.pathname.endsWith('.html')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // 克隆响应存入缓存
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => {
          // 网络失败：从缓存获取
          return caches.match(request)
            .then((cached) => {
              if (cached) return cached;
              // 连缓存都没有，返回离线提示
              return new Response('离线状态，请检查网络连接', { status: 503 });
            });
        })
    );
    return;
  }

  // ================================================================
  //  规则6：其他请求 - 直接放行（不拦截）
  // ================================================================
  // 不处理，浏览器直接请求网络
});
