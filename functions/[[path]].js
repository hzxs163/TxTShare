// ================================================================
//  通用处理器 - 处理所有未被静态资源匹配的请求
// ================================================================

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const pathname = url.pathname;

  // 1. 先尝试从查询参数获取 id (?id=xxx)
  let id = url.searchParams.get('id');

  // 2. 如果查询参数没有，尝试从路径中提取短链接 (/xxxxxxxx)
  if (!id) {
    const match = pathname.match(/^\/([a-zA-Z0-9]{8})$/);
    if (match) {
      id = match[1];
    }
  }

  // 3. 如果还是没有 id，说明不是分享请求，直接返回 404
  if (!id) {
    return new Response('Not Found', { status: 404 });
  }

  // 4. 验证 id 格式
  if (!/^[a-zA-Z0-9]{8}$/.test(id)) {
    return new Response('Invalid ID', { status: 400 });
  }

  // 5. 从 KV 获取数据
  try {
    const dataStr = await env.TEXT_SHARE_KV.get(`share:${id}`);
    if (!dataStr) {
      return new Response('分享不存在或已过期', { status: 404 });
    }

    const data = JSON.parse(dataStr);
    const now = Date.now();

    // 检查过期
    if (data.expiresAt < now) {
      await env.TEXT_SHARE_KV.delete(`share:${id}`);
      return new Response('分享已过期', { status: 404 });
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

    // 返回 JSON 数据
    return new Response(JSON.stringify({
      success: true,
      data: {
        title: data.title,
        content: data.content,
        createdAt: new Date(data.createdAt).toLocaleString('zh-CN'),
        expireTime: expireTime,
        expiresAtTimestamp: data.expiresAt,
        shareUrl: `${new URL(request.url).origin}/${id}`,
        burnAfterRead: data.burnAfterRead,
        isRead: isRead,
        viewCount: data.viewCount || 0
      }
    }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });

  } catch (error) {
    return new Response(JSON.stringify({ success: false, message: error.message }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      status: 500
    });
  }
}
