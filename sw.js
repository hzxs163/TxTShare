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
  
  // ✅ 短链接不拦截（8位字母数字）
  if (url.pathname.match(/^\/[a-zA-Z0-9]{8}$/)) {
    return;
  }

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
    return;
  }

  // ================================================================
  //  规则3：API 请求 - Network Only
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
  //  规则4：静态资源 - Cache First（排除 manifest.json）
  // ================================================================
  const isStatic = 
    request.destination === 'style' ||
    request.destination === 'script' ||
    request.destination === 'font' ||
    request.destination === 'image' ||
    url.pathname.match(/\.(css|js|woff2|woff|ttf|svg|png|ico|json)$/i);

  // 只有是静态资源且不是 manifest.json 才处理
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
  //  规则5：HTML 页面 - Network First
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
  //  规则6：其他请求 - 直接放行
  // ================================================================
  // 不处理，浏览器直接请求网络
});
