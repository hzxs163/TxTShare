// ================================================================
//  通用分享处理器 - 同时支持 /view.html?id=xxx 和 /xxx
// ================================================================

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const pathname = url.pathname;

  // ================================================================
  //  第一步：获取 ID（支持两种格式）
  // ================================================================
  let id = url.searchParams.get('id');

  // 如果查询参数没有 id，尝试从路径中提取
  if (!id) {
    // 匹配 /xxxxxxxx（8位字母数字）
    const match = pathname.match(/^\/([a-zA-Z0-9]{8})$/);
    if (match) {
      id = match[1];
    }
  }

  // ================================================================
  //  第二步：如果还是没有 ID，说明是其他请求，直接放行
  // ================================================================
  if (!id) {
    // 让请求继续走正常流程（由 Pages 静态托管处理）
    return new Response(null, { status: 404 });
  }

  // ================================================================
  //  第三步：验证 ID 格式
  // ================================================================
  if (!/^[a-zA-Z0-9]{8}$/.test(id)) {
    return new Response(JSON.stringify({ success: false, message: '无效的分享ID' }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      status: 400
    });
  }

  // ================================================================
  //  第四步：从 KV 获取数据
  // ================================================================
  try {
    const dataStr = await env.TEXT_SHARE_KV.get(`share:${id}`);
    if (!dataStr) {
      return new Response(JSON.stringify({ success: false, message: '分享不存在或已过期' }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        status: 404
      });
    }

    const data = JSON.parse(dataStr);
    const now = Date.now();

    if (data.expiresAt < now) {
      await env.TEXT_SHARE_KV.delete(`share:${id}`);
      return new Response(JSON.stringify({ success: false, message: '分享已过期' }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        status: 404
      });
    }

    // ================================================================
    //  第五步：访问统计
    // ================================================================
    if (!data.burnAfterRead || !data.viewed) {
      data.viewCount = (data.viewCount || 0) + 1;
      await env.TEXT_SHARE_KV.put(`share:${id}`, JSON.stringify(data));
    }

    // ================================================================
    //  第六步：阅后即焚处理
    // ================================================================
    let isRead = false;
    if (data.burnAfterRead && !data.viewed) {
      data.viewed = true;
      await env.TEXT_SHARE_KV.put(`share:${id}`, JSON.stringify(data));
      await env.TEXT_SHARE_KV.delete(`share:${id}`);
      isRead = true;
    }

    // ================================================================
    //  第七步：计算剩余时间
    // ================================================================
    let expireTime = '';
    const diff = data.expiresAt - now;
    if (diff < 3600 * 1000) {
      expireTime = Math.floor(diff / 60000) + '分钟';
    } else if (diff < 86400 * 1000) {
      expireTime = Math.floor(diff / 3600000) + '小时';
    } else {
      expireTime = Math.floor(diff / 86400000) + '天';
    }

    // ================================================================
    //  第八步：返回数据
    // ================================================================
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
