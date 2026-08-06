export async function onRequest(context) {
  const { request, env } = context;
  
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ success: false, message: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  try {
    const body = await request.json();
    const title = (body.title || '').trim();
    const content = (body.content || '').trim();
    const expiresIn = body.expiresIn || 7 * 86400;
    const burnAfterRead = body.burnAfterRead || false;

    if (!content) {
      return new Response(JSON.stringify({ success: false, message: '内容不能为空' }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    // 生成8位ID
    const chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let id = '';
    for (let i = 0; i < 8; i++) {
      id += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    // 检查ID是否已存在（简单防冲突）
    const existing = await env.TEXT_SHARE_KV.get(`share:${id}`);
    if (existing) {
      return new Response(JSON.stringify({ success: false, message: 'ID冲突，请重试' }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

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
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ success: false, message: error.message }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      status: 500
    });
  }
}
