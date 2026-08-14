// ================================================================
//  _worker.js - 安全版本
//  只处理 API 和短链接，其他全部交给静态托管
// ================================================================

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // ================================================================
    //  1. 先处理 API 请求
    // ================================================================
    if (pathname.startsWith('/api/')) {
      // 跨域配置
      const corsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      };

      // 处理 OPTIONS 预检
      if (request.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
      }

      // 路由：创建分享
      if (pathname === "/api/create" && request.method === "POST") {
        return await handleCreate(request, env);
      }

      // 路由：查看分享
      if (pathname.startsWith("/api/view")) {
        return await handleView(request, env);
      }

      // 其他 API 请求返回 404
      return new Response(JSON.stringify({ success: false, message: 'API Not Found' }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // ================================================================
    //  2. 处理短链接 ( /xxxxxxxx ) - 8位字母数字
    // ================================================================
    const shortIdMatch = pathname.match(/^\/([a-zA-Z0-9]{8})$/);
    if (shortIdMatch) {
      const id = shortIdMatch[1];
      const redirectUrl = new URL(`/view.html?id=${id}`, request.url).toString();
      return Response.redirect(redirectUrl, 302);
    }

    // ================================================================
    //  3. 处理 /view 重定向到 /view.html
    // ================================================================
    if (pathname === '/view') {
      const redirectUrl = new URL(`/view.html${url.search}`, request.url).toString();
      return Response.redirect(redirectUrl, 301);
    }

    // ================================================================
    //  4. 所有其他请求（如 /view.html, /css/xxx.css）
    //     安全地交给静态托管，不再经过 Worker
    // ================================================================
    return env.ASSETS.fetch(request);
  },
};

// ================================================================
//  SHA-256 哈希函数
// ================================================================
async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// ================================================================
//  handleCreate - 创建分享
// ================================================================
async function handleCreate(request, env) {
  try {
    const body = await request.json();
    const title = (body.title || '').trim();
    const content = (body.content || '').trim();
    // 如果 expiresIn === 0，表示永不过期，设置一个很大的值（100年）
    let expiresIn = body.expiresIn;
    if (expiresIn === 0) {
        expiresIn = 100 * 365 * 86400; // 100年
    }
    const burnAfterRead = body.burnAfterRead || false;
    const password = body.password || '';

    if (!content) {
      return new Response(JSON.stringify({ success: false, message: '内容不能为空' }), {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    }

    // 生成8位ID
    const chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let id = '';
    for (let i = 0; i < 8; i++) {
      id += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    const existing = await env.TEXT_SHARE_KV.get(`share:${id}`);
    if (existing) {
      return new Response(JSON.stringify({ success: false, message: 'ID冲突，请重试' }), {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    }

    const createdAt = Date.now();
    const expireDays = Math.ceil(expiresIn / 86400);
    const expiresAt = createdAt + (expiresIn * 1000);

    let passwordHash = '';
    if (password && password.length > 0) {
      passwordHash = await hashPassword(password);
    }

    const data = { 
      id, title, content, createdAt, expiresAt, 
      burnAfterRead, viewed: false, viewCount: 0,
      password: passwordHash
    };
    
    await env.TEXT_SHARE_KV.put(`share:${id}`, JSON.stringify(data), {
      expirationTtl: expireDays * 24 * 60 * 60
    });

    const protocol = request.url.startsWith('https') ? 'https' : 'http';
    const host = new URL(request.url).host;
    const shareUrl = `${protocol}://${host}/${id}`;

    return new Response(JSON.stringify({ 
      success: true, id, shareUrl, burnAfterRead 
    }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  } catch (error) {
    return new Response(JSON.stringify({ success: false, message: error.message }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      status: 500
    });
  }
}

// ================================================================
//  handleView - 查看分享（返回 JSON）
// ================================================================
async function handleView(request, env) {
  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  const userPassword = url.searchParams.get('password') || '';

  if (!id || !/^[a-zA-Z0-9]{8}$/.test(id)) {
    return new Response(JSON.stringify({ success: false, message: '无效的分享ID' }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      status: 400
    });
  }

  try {
    const dataStr = await env.TEXT_SHARE_KV.get(`share:${id}`);
    if (!dataStr) {
      return new Response(JSON.stringify({ success: false, message: '分享不存在或已过期' }), {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        status: 404
      });
    }

    const data = JSON.parse(dataStr);
    const now = Date.now();

    if (data.expiresAt < now) {
      await env.TEXT_SHARE_KV.delete(`share:${id}`);
      return new Response(JSON.stringify({ success: false, message: '分享已过期' }), {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        status: 404
      });
    }

    // ================================================================
    //  密码验证
    // ================================================================
    if (data.password && data.password.length > 0) {
      if (!userPassword) {
        return new Response(JSON.stringify({
          success: false,
          message: '需要密码',
          needPassword: true
        }), {
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
          status: 401
        });
      }

      const hashedUserPassword = await hashPassword(userPassword);
      if (data.password !== hashedUserPassword) {
        return new Response(JSON.stringify({
          success: false,
          message: '密码错误，请重试',
          needPassword: true
        }), {
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
          status: 401
        });
      }
    }

    // 访问统计
    if (!data.burnAfterRead || !data.viewed) {
      data.viewCount = (data.viewCount || 0) + 1;
      await env.TEXT_SHARE_KV.put(`share:${id}`, JSON.stringify(data));
    }

    // 阅后即焚
    let isRead = false;
    if (data.burnAfterRead && !data.viewed) {
      data.viewed = true;
      await env.TEXT_SHARE_KV.put(`share:${id}`, JSON.stringify(data));
      await env.TEXT_SHARE_KV.delete(`share:${id}`);
      isRead = true;
    }

    // 计算剩余时间
    let expireTime = '';
    const diff = data.expiresAt - now;
    if (diff < 3600 * 1000) {
      expireTime = Math.floor(diff / 60000) + '分钟';
    } else if (diff < 86400 * 1000) {
      expireTime = Math.floor(diff / 3600000) + '小时';
    } else {
      expireTime = Math.floor(diff / 86400000) + '天';
    }

    return new Response(JSON.stringify({
      success: true,
      data: {
        title: data.title,
        content: data.content,
        createdAt: new Date(data.createdAt).toLocaleString('zh-CN'),
        expireTime,
        expiresAtTimestamp: data.expiresAt,
        shareUrl: `${new URL(request.url).origin}/${id}`,
        burnAfterRead: data.burnAfterRead,
        isRead,
        viewCount: data.viewCount || 0
      }
    }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  } catch (error) {
    return new Response(JSON.stringify({ success: false, message: error.message }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      status: 500
    });
  }
}
