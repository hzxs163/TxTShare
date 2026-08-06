export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // ================================================================
    //  静态资源安全处理
    // ================================================================
    // 1. 优先处理 API 和短链接
    if (pathname.startsWith('/api/') || pathname.match(/^\/[a-zA-Z0-9]{8}$/)) {
      // ... 这里放你处理 API 和短链接的逻辑
      // 注意：如果短链接要重定向到 /view.html，这个重定向也会被 Worker 再次捕获，
      // 所以建议让 view.html 直接处理短链接（如之前的方案），或在这里直接返回 HTML 内容。
      // 为了快速修复，我们先让所有非 API 请求都走静态资源。
    }

    // 2. 所有其他请求（包括 /view.html），安全地返回静态资源
    return env.ASSETS.fetch(request);
  },
};
