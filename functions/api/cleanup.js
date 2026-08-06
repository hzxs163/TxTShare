export async function onRequest(context) {
  const { env } = context;
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
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  });
}
