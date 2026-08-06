// 1. 绑定 KV 命名空间（部署时需配置绑定，名称：TEXT_SHARE_KV）
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // 跨域配置
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    // 处理 OPTIONS 预检请求
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // 路由分发
    try {
      if (path === "/api/create" && request.method === "POST") {
        return await handleCreate(request, env);
      } else if (path.startsWith("/api/view")) {
        return await handleView(request, env);
      } else if (path === "/api/cleanup" && request.method === "GET") {
        return await handleCleanup(env);
      } else {
        return new Response("Not Found", { status: 404 });
      }
    } catch (error) {
      return new Response(JSON.stringify({
        success: false,
        message: error.message
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500
      });
    }
  },
};

// 生成8位唯一ID
function generateUniqueId() {
  const characters = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}

// 处理创建分享
async function handleCreate(request, env) {
  try {
    // ✅ 修复：解析 JSON 格式请求体（与前端匹配）
    const body = await request.json();
    const title = (body.title || '').trim();
    const content = (body.content || '').trim();
    const expireDays = parseInt(body.expiresIn / 86400) || 7; // 从秒数换算为天数
    const burnAfterRead = body.burnAfterRead || false;

    // 验证内容
    if (!content) {
      return new Response(JSON.stringify({
        success: false,
        message: '内容不能为空'
      }), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      });
    }

    // 生成唯一ID（确保不重复）
    let id;
    let attempts = 0;
    do {
      id = generateUniqueId();
      attempts++;
      const existing = await env.TEXT_SHARE_KV.get(`share:${id}`);
      if (!existing) break;
      if (attempts > 10) {
        return new Response(JSON.stringify({
          success: false,
          message: '生成ID失败，请重试'
        }), {
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        });
      }
    } while (true);

    // 计算过期时间
    const createdAt = Date.now();
    const expiresAt = createdAt + (expireDays * 24 * 60 * 60 * 1000);

    // 保存数据到KV
    const data = {
      id,
      title,
      content,
      createdAt,
      expiresAt,
      burnAfterRead,
      viewed: false
    };
    await env.TEXT_SHARE_KV.put(`share:${id}`, JSON.stringify(data), {
      expirationTtl: expireDays * 24 * 60 * 60 // KV 自动过期（秒）
    });

    // ✅ 修复：使用 request.url 正确解析域名
    const protocol = request.url.startsWith('https') ? 'https' : 'http';
    const host = new URL(request.url).host;
    const shareUrl = `${protocol}://${host}/view.html?id=${id}`;

    // 返回响应
    return new Response(JSON.stringify({
      success: true,
      id,
      shareUrl,
      burnAfterRead
    }), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    });
  } catch (error) {
    console.error('创建分享错误:', error);
    return new Response(JSON.stringify({
      success: false,
      message: '服务器处理失败: ' + error.message
    }), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
      status: 500
    });
  }
}

// 处理查看分享
async function handleView(request, env) {
  const url = new URL(request.url);
  const id = url.searchParams.get('id');

  // 验证ID
  if (!id || !/^[a-zA-Z0-9]{8}$/.test(id)) {
    return new Response(JSON.stringify({
      success: false,
      message: '无效的分享ID'
    }), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
      status: 400
    });
  }

  try {
    // 从KV获取数据
    const dataStr = await env.TEXT_SHARE_KV.get(`share:${id}`);
    if (!dataStr) {
      return new Response(JSON.stringify({
        success: false,
        message: '分享内容不存在或已过期'
      }), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        },
        status: 404
      });
    }

    const data = JSON.parse(dataStr);
    const now = Date.now();

    // 检查过期
    if (data.expiresAt < now) {
      await env.TEXT_SHARE_KV.delete(`share:${id}`);
      return new Response(JSON.stringify({
        success: false,
        message: '分享内容已过期'
      }), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        },
        status: 404
      });
    }

    // 处理阅后即焚
    let isRead = false;
    if (data.burnAfterRead && !data.viewed) {
      data.viewed = true;
      await env.TEXT_SHARE_KV.put(`share:${id}`, JSON.stringify(data));
      await env.TEXT_SHARE_KV.delete(`share:${id}`); // 立即删除
      isRead = true;
    }

    // 计算过期时间字符串
    let expireTime = '';
    const diff = data.expiresAt - now;
    if (diff < 3600 * 1000) {
      expireTime = Math.floor(diff / 60000) + '分钟';
    } else if (diff < 86400 * 1000) {
      expireTime = Math.floor(diff / 3600000) + '小时';
    } else {
      expireTime = Math.floor(diff / 86400000) + '天';
    }

    // 返回分享数据
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
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    });
  } catch (error) {
    console.error('查看分享错误:', error);
    return new Response(JSON.stringify({
      success: false,
      message: '读取分享失败: ' + error.message
    }), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
      status: 500
    });
  }
}

// 处理清理过期内容
async function handleCleanup(env) {
  const now = Date.now();
  let deletedCount = 0;

  try {
    const list = await env.TEXT_SHARE_KV.list({ prefix: 'share:' });
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
    console.error('清理错误:', error);
  }

  return new Response(JSON.stringify({
    success: true,
    deletedCount
  }), {
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    }
  });
}
