// ============================================================
//  Service Worker - 文本分享工具
//  功能：离线缓存、静态资源加速、API请求拦截
// ============================================================

const CACHE_VERSION = 'v2';
const CACHE_NAME = `textshare-${CACHE_VERSION}`;

// ============================================================
//  需要缓存的静态资源列表
// ============================================================
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/view.html',
  '/favicon.ico',
  '/css/tailwind.min.css',
  '/css/font-awesome.min.css',
  '/css/fonts.css',
  '/css/style.css',
  '/js/app.js',
  '/js/view.js',
  '/js/qrcode.min.js',
  '/fonts/inter/Inter-Variable.woff2',
  '/fonts/fontawesome-webfont.woff2'
];

// ============================================================
//  安装事件 - 预缓存所有静态资源
// ============================================================
self.addEventListener('install', (event) => {
  console.log('[SW] 📦 安装中...');

  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] 缓存静态资源...');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => {
        console.log('[SW] ✅ 安装完成！');
        // 跳过等待，立即激活
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('[SW] ❌ 缓存失败:', error);
      })
  );
});

// ============================================================
//  激活事件 - 清理旧版本缓存
// ============================================================
self.addEventListener('activate', (event) => {
  console.log('[SW] 🚀 激活中...');

  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => {
              // 删除不是当前版本的缓存
              return name !== CACHE_NAME && name.startsWith('textshare-');
            })
            .map((name) => {
              console.log('[SW] 🗑️ 删除旧缓存:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => {
        console.log('[SW] ✅ 激活完成！');
        // 立即控制所有页面
        return self.clients.claim();
      })
  );
});

// ============================================================
//  拦截请求 - 缓存策略
// ============================================================
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // ============================================================
  //  策略1：API 请求 - Network Only（不缓存，保证数据实时性）
  // ============================================================
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // 返回响应，并克隆一份用于缓存（可选）
          return response;
        })
        .catch((error) => {
          console.error('[SW] API请求失败:', error);
          // 返回离线提示
          return new Response(
            JSON.stringify({
              success: false,
              message: '网络连接失败，请检查网络后重试'
            }),
            {
              status: 503,
              headers: { 'Content-Type': 'application/json' }
            }
          );
        })
    );
    return;
  }

  // ============================================================
  //  策略2：静态资源（CSS/JS/字体）- Cache First（缓存优先）
  // ============================================================
  if (
    request.destination === 'style' ||
    request.destination === 'script' ||
    request.destination === 'font' ||
    request.destination === 'image'
  ) {
    event.respondWith(
      caches.match(request)
        .then((cachedResponse) => {
          if (cachedResponse) {
            // 缓存命中，返回缓存
            // 同时后台更新缓存（Stale-While-Revalidate）
            event.waitUntil(
              fetch(request)
                .then((networkResponse) => {
                  return caches.open(CACHE_NAME)
                    .then((cache) => {
                      cache.put(request, networkResponse.clone());
                      return networkResponse;
                    });
                })
                .catch(() => {
                  // 网络更新失败，忽略
                })
            );
            return cachedResponse;
          }

          // 缓存未命中，去网络获取
          return fetch(request)
            .then((networkResponse) => {
              // 存入缓存供下次使用
              return caches.open(CACHE_NAME)
                .then((cache) => {
                  cache.put(request, networkResponse.clone());
                  return networkResponse;
                });
            })
            .catch(() => {
              // 网络请求失败，返回离线页面（如果有）
              if (request.destination === 'document') {
                return caches.match('/offline.html');
              }
              // 返回一个空响应
              return new Response('资源加载失败', { status: 503 });
            });
        })
    );
    return;
  }

  // ============================================================
  //  策略3：HTML 页面 - Network First（网络优先，保障最新）
  // ============================================================
  if (request.destination === 'document') {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          // 克隆响应，存入缓存
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME)
            .then((cache) => {
              cache.put(request, responseClone);
            });
          return networkResponse;
        })
        .catch(() => {
          // 网络失败，从缓存获取
          return caches.match(request)
            .then((cachedResponse) => {
              if (cachedResponse) {
                return cachedResponse;
              }
              // 连缓存都没有，返回离线页面
              return caches.match('/offline.html')
                .then((offlinePage) => {
                  return offlinePage || new Response('离线状态，请连接网络', { status: 503 });
                });
            });
        })
    );
    return;
  }

  // ============================================================
  //  策略4：其他请求 - Cache First（默认缓存优先）
  // ============================================================
  event.respondWith(
    caches.match(request)
      .then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(request)
          .then((networkResponse) => {
            // 只缓存成功响应
            if (networkResponse.status === 200) {
              const clone = networkResponse.clone();
              caches.open(CACHE_NAME)
                .then((cache) => {
                  cache.put(request, clone);
                });
            }
            return networkResponse;
          })
          .catch(() => {
            // 返回备用响应
            return new Response('资源不可用', { status: 503 });
          });
      })
  );
});

// ============================================================
//  消息处理 - 页面与 SW 通信
// ============================================================
self.addEventListener('message', (event) => {
  const data = event.data;

  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.delete(CACHE_NAME)
        .then(() => {
          console.log('[SW] 🗑️ 缓存已清除');
          // 通知页面清除成功
          event.ports[0].postMessage({ success: true });
        })
        .catch((error) => {
          event.ports[0].postMessage({ success: false, error: error.message });
        })
    );
  }

  if (data.type === 'GET_CACHE_SIZE') {
    event.waitUntil(
      caches.open(CACHE_NAME)
        .then((cache) => {
          return cache.keys();
        })
        .then((keys) => {
          let totalSize = 0;
          const promises = keys.map((request) => {
            return cache.match(request)
              .then((response) => {
                if (response) {
                  return response.clone().text()
                    .then((text) => {
                      totalSize += text.length;
                    })
                    .catch(() => {});
                }
              });
          });
          return Promise.all(promises)
            .then(() => {
              const sizeInKB = Math.round(totalSize / 1024);
              event.ports[0].postMessage({ 
                success: true, 
                size: sizeInKB,
                count: keys.length 
              });
            });
        })
        .catch((error) => {
          event.ports[0].postMessage({ success: false, error: error.message });
        })
    );
  }
});

// ============================================================
//  推送通知（可选）
// ============================================================
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || '文本分享工具';
  const options = {
    body: data.body || '您有新的分享通知',
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    vibrate: [200, 100, 200],
    data: {
      url: data.url || '/'
    }
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// ============================================================
//  通知点击
// ============================================================
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const url = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window' })
      .then((windowClients) => {
        // 如果已有打开的窗口，聚焦到该窗口
        for (const client of windowClients) {
          if (client.url === url && 'focus' in client) {
            return client.focus();
          }
        }
        // 否则打开新窗口
        if (clients.openWindow) {
          return clients.openWindow(url);
        }
      })
  );
});

// ============================================================
//  监听在线状态变化（可选）
// ============================================================
self.addEventListener('online', () => {
  console.log('[SW] 🌐 网络已恢复');
  // 可以通知页面刷新缓存
});

self.addEventListener('offline', () => {
  console.log('[SW] 📴 网络已断开');
});

console.log('[SW] 👋 Service Worker 已加载');