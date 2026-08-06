// ===== KV 绑定：TEXT_SHARE_KV =====
console.log('✅ index.js 已加载');
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      if (path === "/api/create" && request.method === "POST") {
        return await handleCreate(request, env);
      } else if (path.startsWith("/api/view")) {
        return await handleView(request, env);
      } else if (path === "/api/cleanup" && request.method === "GET") {
        return await handleCleanup(env);
      } else {
        return new Response(JSON.stringify({ success: false, message: "Not Found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    } catch (error) {
      return new Response(JSON.stringify({ success: false, message: error.message }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500
      });
    }
  },
};

function generateUniqueId() {
  const chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

async function handleCreate(request, env) {
  try {
    const body = await request.json();
    const title = (body.title || '').trim();
    const content = (body.content || '').trim();
    const expiresIn = body.expiresIn || 7 * 86400;
    const burnAfterRead = body.burnAfterRead || false;

    if (!content) {
      return new Response(JSON.stringify({ success: false, message: '内容不能为空' }), {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    }

    let id;
    let attempts = 0;
    do {
      id = generateUniqueId();
      attempts++;
      const existing = await env.TEXT_SHARE_KV.get(`share:${id}`);
      if (!existing) break;
      if (attempts > 10) {
        return new Response(JSON.stringify({ success: false, message: '生成ID失败' }), {
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });
      }
    } while (true);

    const createdAt = Date.now();
    const expireDays = Math.ceil(expiresIn / 86400);
    const expiresAt = createdAt + (expiresIn * 1000);

    const data = { id, title, content, createdAt, expiresAt, burnAfterRead, viewed: false };
    await env.TEXT_SHARE_KV.put(`share:${id}`, JSON.stringify(data), {
      expirationTtl: expireDays * 24 * 60 * 60
    });

    const protocol = request.url.startsWith('https') ? 'https' : 'http';
    const host = new URL(request.url).host;
    const shareUrl = `${protocol}://${host}/view.html?id=${id}`;

    return new Response(JSON.stringify({ success: true, id, shareUrl, burnAfterRead }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  } catch (error) {
    return new Response(JSON.stringify({ success: false, message: error.message }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      status: 500
    });
  }
}

async function handleView(request, env) {
  const url = new URL(request.url);
  const id = url.searchParams.get('id');

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

    let isRead = false;
    if (data.burnAfterRead && !data.viewed) {
      data.viewed = true;
      await env.TEXT_SHARE_KV.put(`share:${id}`, JSON.stringify(data));
      await env.TEXT_SHARE_KV.delete(`share:${id}`);
      isRead = true;
    }

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
        shareUrl: `${new URL(request.url).origin}/view.html?id=${id}`,
        burnAfterRead: data.burnAfterRead,
        isRead
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

async function handleCleanup(env) {
  let deletedCount = 0;
  try {
    const list = await env.TEXT_SHARE_KV.list({ prefix: 'share:' });
    const now = Date.now();
    for (const key of list.keys) {
      const dataStr = await env.TEXT_SHARE_KV.get(key.name);
      if (dataStr) {
        const data = JSON.parse(dataStr);
        if (data.expiresAt < now) {
          await env.TEXT_SHARE_KV.delete(key.name);
          deletedCount++;
        }
      }
    }
  } catch (error) {
    console.error('Cleanup error:', error);
  }
  return new Response(JSON.stringify({ success: true, deletedCount }), {
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
  });
}
