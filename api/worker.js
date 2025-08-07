// --- Cloudflare Worker 后端核心 ---
// 这是整个应用的“大脑”，一个跑在 Cloudflare 全球节点上的 Serverless 服务。
// 它负责处理所有 API 请求，和 KV 数据库打交道，进行权限验证等等。

// 一个小小的全局锁，确保数据迁移只会在 Worker 启动时跑一次。
let migrationEnsured = false;

// --- 工具函数：给响应头加上 CORS ---
// 每次返回响应前，都用这个函数“盖个章”，确保浏览器不会因为跨域问题报错。
function handleCorsAndRespond(request, response, env) {
  const origin = request.headers.get('Origin');
  
  // 从环境变量读取允许的前端地址，并为本地开发保留一个默认值。
  const allowedOrigins = [env.FRONTEND_URL, 'http://127.0.0.1:5500'].filter(Boolean);

  // 检查一下请求者是不是“自己人”
  if (allowedOrigins.includes(origin)) {
    response.headers.set('Access-Control-Allow-Origin', origin);
  }
  
  return response;
}

// --- 工具函数：验证 Cloudflare Turnstile (人机验证) ---
// 这是个“电子保镖”，用来防机器人刷点赞、举报之类的接口。
async function validateTurnstileToken(token, ip, env) {
  const secretKey = env.TURNSTILE_SECRET_KEY;
  if (!secretKey) {
    // 如果没配置密钥，就先放行，但会在后台嚷嚷一声。开发时很方便。
    console.warn("Turnstile 密钥没配，验证已跳过！");
    return { success: true };
  }

  const formData = new FormData();
  formData.append('secret', secretKey);
  formData.append('response', token);
  formData.append('remoteip', ip);

  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: formData,
    });
    const result = await response.json();
    console.log("人机验证结果:", result); // 留个日志，方便查问题
    return result;
  } catch (error) {
    console.error("调用人机验证 API 失败了:", error);
    return { success: false, 'error-codes': ['turnstile-api-error'] };
  }
}

// --- 工具函数：一次性数据迁移脚本 ---
// 用来把旧的、存在单个 KV 值里的数据，迁移到新的“一个消息一个坑”的模式。
// 这大大提升了性能，老代码立功了！
async function handleMigration(env) {
  try {
    const oldData = await env.FEEDBACK_KV.get('messages', { type: 'json' });
    if (oldData && Array.isArray(oldData)) {
      console.log(`发现 ${oldData.length} 条旧数据，开始搬家...`);
      
      const messageIds = [];
      const tagIndexes = {}; // 按标签给消息 ID 分类建索引

      const putPromises = oldData.map(message => {
        if (!message.id) message.id = `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        if (!message.tag) message.tag = '待处理';
        
        messageIds.push(message.id);
        
        if (!tagIndexes[message.tag]) tagIndexes[message.tag] = [];
        tagIndexes[message.tag].push(message.id);

        return env.FEEDBACK_KV.put(`msg:${message.id}`, JSON.stringify(message));
      });

      await Promise.all(putPromises);
      
      // 创建新的主 ID 列表和标签索引
      await env.FEEDBACK_KV.put('message_ids', JSON.stringify(messageIds));
      const tagIndexPromises = Object.entries(tagIndexes).map(([tag, ids]) => {
        const tagIndexKey = `index_tag_${tag}`;
        console.log(`给标签 "${tag}" 创建索引，一共 ${ids.length} 条。`);
        return env.FEEDBACK_KV.put(tagIndexKey, JSON.stringify(ids.reverse()));
      });
      await Promise.all(tagIndexPromises);
      
      // 把旧数据改个名备份一下，防止下次还想不开要迁移
      await env.FEEDBACK_KV.put('messages_migrated_bak', JSON.stringify(oldData));
      await env.FEEDBACK_KV.delete('messages');

      console.log("数据搬家顺利完成！");
    }
  } catch (e) {
    console.error("数据搬家时出了点意外:", e);
    // 就算搬家失败，也不能耽误正常服务。
  }
}

// --- Worker 的主入口 ---
export default {
  async fetch(request, env, ctx) {
    // Worker 启动时，先检查下要不要数据迁移
    if (!migrationEnsured) {
      await handleMigration(env);
      migrationEnsured = true;
    }

    const url = new URL(request.url);

    // 浏览器会先发个 OPTIONS 预检请求来“投石问路”，咱们得热情回应。
    if (request.method === 'OPTIONS') {
      return handleOptions(request);
    }

    // 一个超级迷你的“路由器”，根据请求方法和路径，把它交给对应的处理函数。
    const routes = {
      'GET:/api/messages': getMessages,
      'POST:/api/messages': postMessage,
      'POST:/api/login': handleLogin,
      'POST:/api/reply': handleReply,
      'POST:/api/vote': handleVote,
      'POST:/api/report': handleReport,
      'DELETE:/api/messages': deleteMessage,
      'POST:/api/tag': handleTag,
      'GET:/api/config': getConfig,
    };

    const handler = routes[`${request.method}:${url.pathname}`];

    if (handler) {
      return handler(request, env);
    }

    // 如果没找到对应的路，就告诉他“你迷路了”。
    const notFoundResponse = new Response('Not Found', { status: 404 });
    return handleCorsAndRespond(request, notFoundResponse, env);
  },
};

// --- 预检请求处理器 ---
// 告诉浏览器我们支持哪些请求方法、请求头，以及这个“通行证”多久有效。
function handleOptions(request, env) {
  const headers = request.headers;
  if (
    headers.get('Origin') !== null &&
    headers.get('Access-Control-Request-Method') !== null &&
    headers.get('Access-Control-Request-Headers') !== null
  ) {
    const origin = headers.get('Origin');
    const respHeaders = {
      'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': headers.get('Access-control-request-headers'),
      'Access-Control-Max-Age': '86400', // 24小时，让浏览器别老是来问
    };
    
    // 从环境变量读取允许的前端地址，并为本地开发保留一个默认值。
    const allowedOrigins = [env.FRONTEND_URL, 'http://127.0.0.1:5500'].filter(Boolean);

    if (allowedOrigins.includes(origin)) {
      respHeaders['Access-Control-Allow-Origin'] = origin;
    }

    return new Response(null, { headers: respHeaders });
  } else {
    return new Response(null, {
      headers: { Allow: 'GET, POST, OPTIONS' },
    });
  }
}

// --- API 处理器：获取消息列表 ---
// 这是最复杂的一个函数，集分页、搜索、过滤、排序于一身。
async function getMessages(request, env) {
  const url = new URL(request.url);
  // 从 URL里把各种参数先抠出来，给好默认值，免得出错。
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
  const limit = Math.max(1, parseInt(url.searchParams.get('limit') || '10', 10));
  const searchTerm = url.searchParams.get('search')?.toLowerCase().trim();
  const filterByTag = url.search_params.get('filterByTag');
  const sortBy = url.searchParams.get('sortBy') || 'likes';

  try {
    let messageIds;
    // 第一步：先确定要展示哪些消息的 ID。
    // 如果按标签过滤，就从标签索引里拿；否则就从主列表里拿。
    if (filterByTag && filterByTag !== 'all') {
      const tagIndexKey = `index_tag_${filterByTag}`;
      messageIds = await env.FEEDBACK_KV.get(tagIndexKey, { type: 'json' }) || [];
    } else {
      messageIds = await env.FEEDBACK_KV.get('message_ids', { type: 'json' }) || [];
    }

    let allMessages;
    let paginatedMessages;
    let totalMessages = messageIds.length;

    // 第二步：智能选择不同的处理路径，这是性能优化的关键。
    // 如果需要搜索，或者按点赞/回复数排序，那就没办法，只能把所有消息都捞出来慢慢处理。
    const needsFullData = searchTerm || sortBy === 'likes' || sortBy === 'replies';

    if (needsFullData) {
      // --- “慢车道”：适用于搜索和复杂排序 ---
      const promises = messageIds.map(id => env.FEEDBACK_KV.get(`msg:${id}`, { type: 'json' }));
      allMessages = (await Promise.all(promises)).filter(Boolean); // 过滤掉可能已删除的

      if (searchTerm) {
        allMessages = allMessages.filter(msg =>
          msg.id.toLowerCase().includes(searchTerm) ||
          msg.user_name.toLowerCase().includes(searchTerm) ||
          msg.content.toLowerCase().includes(searchTerm)
        );
      }
      
      // 手动排序
      allMessages.sort((a, b) => {
        switch (sortBy) {
          case 'replies': return (b.replies?.length || 0) - (a.replies?.length || 0);
          case 'date': return new Date(b.timestamp) - new Date(a.timestamp);
          case 'likes':
          default: return (b.likes || 0) - (a.likes || 0);
        }
      });
      
      totalMessages = allMessages.length;
      const startIndex = (page - 1) * limit;
      paginatedMessages = allMessages.slice(startIndex, startIndex + limit);

    } else {
      // --- “快车道”：适用于默认的时间排序 ---
      // 因为 ID 列表本身就是按时间倒序的，所以我们只需要按需取出当前页的 ID，再去查数据就行了，超快！
      const startIndex = (page - 1) * limit;
      const paginatedIds = messageIds.slice(startIndex, startIndex + limit);
      
      if (paginatedIds.length > 0) {
        const promises = paginatedIds.map(id => env.FEEDBACK_KV.get(`msg:${id}`, { type: 'json' }));
        paginatedMessages = (await Promise.all(promises)).filter(Boolean);
      } else {
        paginatedMessages = [];
      }
    }

    const totalPages = Math.ceil(totalMessages / limit);

    const responsePayload = {
      messages: paginatedMessages,
      totalMessages,
      totalPages,
      currentPage: page,
    };

    const response = new Response(JSON.stringify(responsePayload), { headers: { 'Content-Type': 'application/json' } });
    return handleCorsAndRespond(request, response, env);
  } catch (e) {
    console.error("获取消息列表时翻车了:", e);
    const errorResponse = new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    return handleCorsAndRespond(request, errorResponse, env);
  }
}

// --- API 处理器：提交新消息 ---
// NoneBot 插件调用的就是这个接口。
async function postMessage(request, env) {
  // 先对暗号，看看是不是自己人。
  const token = request.headers.get('Authorization')?.replace('Bearer ', '');
  if (token !== env.API_TOKEN) {
    return new Response('暗号不对，军情小本本上没有你！', { status: 401 });
  }

  try {
    const newMessage = await request.json();
    if (!newMessage.type || !newMessage.user_name || !newMessage.user_id || !newMessage.content) {
      return new Response('我说，你是不是忘了点啥？（缺少字段）', { status: 400 });
    }

    // 服务器给新消息“盖章”，加上 ID、时间戳等信息。
    newMessage.id = `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    newMessage.timestamp = new Date().toISOString();
    newMessage.replies = [];
    newMessage.likes = 0;
    newMessage.dislikes = 0;
    newMessage.reports = 0;
    newMessage.tag = '待处理';

    // 把新消息存进 KV。
    await env.FEEDBACK_KV.put(`msg:${newMessage.id}`, JSON.stringify(newMessage));

    // 更新主 ID 列表和标签索引，让新消息能立刻被看到。
    const idListData = await env.FEEDBACK_KV.get('message_ids', { type: 'json' });
    const messageIds = idListData || [];
    messageIds.unshift(newMessage.id);
    await env.FEEDBACK_KV.put('message_ids', JSON.stringify(messageIds));

    const tagIndexKey = `index_tag_${newMessage.tag}`;
    const tagIndexData = await env.FEEDBACK_KV.get(tagIndexKey, { type: 'json' });
    const tagIndex = tagIndexData || [];
    tagIndex.unshift(newMessage.id);
    await env.FEEDBACK_KV.put(tagIndexKey, JSON.stringify(tagIndex));

    const response = new Response(JSON.stringify({ success: true, message: newMessage }), { status: 201, headers: { 'Content-Type': 'application/json' } });
    return handleCorsAndRespond(request, response, env);
  } catch (e) {
    const errorResponse = new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    return handleCorsAndRespond(request, errorResponse, env);
  }
}

// --- 安全模块：JWT (JSON Web Token) 的生成与验证 ---
// 用的是标准的 Web Crypto API，安全又可靠，用来给管理员签发“临时通行证”。
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

async function getCryptoKey(secret) {
  const keyData = textEncoder.encode(secret);
  return await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

async function generateJWT(secret, env) {
  const key = await getCryptoKey(secret);
  const header = { alg: 'HS256', typ: 'JWT' };
  // 通行证有效期，默认 8 小时，也可以在环境变量里配。
  const expirationSeconds = env && env.JWT_EXPIRATION_SECONDS ? parseInt(env.JWT_EXPIRATION_SECONDS, 10) : (8 * 60 * 60);
  const payload = { exp: Math.floor(Date.now() / 1000) + expirationSeconds };
  
  const encodedHeader = btoa(JSON.stringify(header)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const encodedPayload = btoa(JSON.stringify(payload)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  
  const data = textEncoder.encode(`${encodedHeader}.${encodedPayload}`);
  const signature = await crypto.subtle.sign('HMAC', key, data);
  
  const encodedSignature = btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  
  return `${encodedHeader}.${encodedPayload}.${encodedSignature}`;
}

async function verifyJWT(token, secret) {
  try {
    const key = await getCryptoKey(secret);
    const [header, payload, signature] = token.split('.');
    
    const data = textEncoder.encode(`${header}.${payload}`);
    const signatureData = new Uint8Array(atob(signature.replace(/-/g, '+').replace(/_/g, '/')).split('').map(c => c.charCodeAt(0)));
    
    const isValid = await crypto.subtle.verify('HMAC', key, signatureData, data);
    if (!isValid) return null; // 签名不对，是伪造的！
    
    const decodedPayload = JSON.parse(textDecoder.decode(new Uint8Array(atob(payload.replace(/-/g, '+').replace(/_/g, '/')).split('').map(c => c.charCodeAt(0)))));
    if (decodedPayload.exp < Math.floor(Date.now() / 1000)) return null; // 过期了！
    
    return decodedPayload;
  } catch (e) {
    return null; // 格式不对或者其他幺蛾子
  }
}

// --- API 处理器：管理员登录 ---
async function handleLogin(request, env) {
  try {
    const { password } = await request.json();
    if (password === env.ADMIN_PASSWORD) {
      const token = await generateJWT(env.JWT_SECRET, env);
      const response = new Response(JSON.stringify({ success: true, token }), { headers: { 'Content-Type': 'application/json' } });
      return handleCorsAndRespond(request, response, env);
    } else {
      const errorResponse = new Response(JSON.stringify({ success: false, error: '密码不对，再想想？' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
      return handleCorsAndRespond(request, errorResponse, env);
    }
  } catch (e) {
    const errorResponse = new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    return handleCorsAndRespond(request, errorResponse, env);
  }
}

// --- API 处理器：管理员回复 ---
async function handleReply(request, env) {
  try {
    // 先查岗，看看有没有带“临时通行证”(JWT)。
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response('没带通行证，禁止入内！', { status: 401 });
    }
    const token = authHeader.substring(7);
    const payload = await verifyJWT(token, env.JWT_SECRET);

    if (!payload) {
      return new Response('通行证无效或已过期，请重新登录。', { status: 401 });
    }

    const { messageId, replyContent } = await request.json();
    if (!messageId || !replyContent) {
      return new Response('要回复哪条？回复啥？说清楚点儿。', { status: 400 });
    }

    const message = await env.FEEDBACK_KV.get(`msg:${messageId}`, { type: 'json' });
    if (!message) {
      return new Response('没找着这条消息啊。', { status: 404 });
    }

    const newReply = {
      id: `reply-${Date.now()}`,
      timestamp: new Date().toISOString(),
      content: replyContent,
    };
    message.replies.push(newReply);

    await env.FEEDBACK_KV.put(`msg:${messageId}`, JSON.stringify(message));

    const response = new Response(JSON.stringify({ success: true, reply: newReply }), { headers: { 'Content-Type': 'application/json' } });
    return handleCorsAndRespond(request, response, env);

  } catch (e) {
    const errorResponse = new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    return handleCorsAndRespond(request, errorResponse, env);
  }
}

// --- API 处理器：处理投票（点赞/点踩） ---
async function handleVote(request, env) {
  try {
    const { messageId, voteType, 'cf-turnstile-response': turnstileToken } = await request.json();

    // 先让“电子保镖”检查一下，是不是真人在操作。
    const ip = request.headers.get('CF-Connecting-IP');
    const turnstileResult = await validateTurnstileToken(turnstileToken, ip, env);
    if (!turnstileResult.success) {
      return new Response('机器人，站住！不许投票！', { status: 403 });
    }

    if (!messageId || !['like', 'dislike'].includes(voteType)) {
      return new Response('你想干啥？（缺少 messageId 或 voteType 无效）', { status: 400 });
    }

    const message = await env.FEEDBACK_KV.get(`msg:${messageId}`, { type: 'json' });
    if (!message) {
      return new Response('没找着这条消息啊。', { status: 404 });
    }

    if (voteType === 'like') {
      message.likes = (message.likes || 0) + 1;
    } else if (voteType === 'dislike') {
      message.dislikes = (message.dislikes || 0) + 1;
    }

    await env.FEEDBACK_KV.put(`msg:${messageId}`, JSON.stringify(message));

    const response = new Response(JSON.stringify({ success: true, message: message }), { headers: { 'Content-Type': 'application/json' } });
    return handleCorsAndRespond(request, response, env);

  } catch (e) {
    const errorResponse = new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    return handleCorsAndRespond(request, errorResponse, env);
  }
}

// --- API 处理器：删除消息 ---
async function deleteMessage(request, env) {
  try {
    // 查岗，只有管理员才能删东西。
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response('没带通行证，禁止入内！', { status: 401 });
    }
    const token = authHeader.substring(7);
    const payload = await verifyJWT(token, env.JWT_SECRET);

    if (!payload) {
      return new Response('通行证无效或已过期，请重新登录。', { status: 401 });
    }

    const { messageId } = await request.json();
    if (!messageId) {
      return new Response('你要删哪条？说清楚点儿。', { status: 400 });
    }

    // 删除操作要谨慎，先读后删，一步步来。
    const message = await env.FEEDBACK_KV.get(`msg:${messageId}`, { type: 'json' });
    const idListData = await env.FEEDBACK_KV.get('message_ids', { type: 'json' });
    let messageIds = idListData || [];

    // 1. 从主 ID 列表里把它踢出去。
    const initialLength = messageIds.length;
    messageIds = messageIds.filter(id => id !== messageId);
    if (messageIds.length === initialLength) {
      console.warn(`想删的 ${messageId} 在主列表里没找到，但还是继续操作。`);
    }
    await env.FEEDBACK_KV.put('message_ids', JSON.stringify(messageIds));

    // 2. 如果它有标签，也要从对应的标签索引里把它除名。
    if (message && message.tag) {
        const tagIndexKey = `index_tag_${message.tag}`;
        const tagIndexData = await env.FEEDBACK_KV.get(tagIndexKey, { type: 'json' });
        if (tagIndexData) {
            const updatedIndex = tagIndexData.filter(id => id !== messageId);
            await env.FEEDBACK_KV.put(tagIndexKey, JSON.stringify(updatedIndex));
        }
    }

    // 3. 最后，把消息本体删掉，毁尸灭迹。
    await env.FEEDBACK_KV.delete(`msg:${messageId}`);

    const response = new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
    return handleCorsAndRespond(request, response, env);

  } catch (e) {
    const errorResponse = new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    return handleCorsAndRespond(request, errorResponse, env);
  }
}

// --- API 处理器：处理举报 ---
async function handleReport(request, env) {
  try {
    const { messageId, 'cf-turnstile-response': turnstileToken } = await request.json();

    // “电子保镖”再次出马。
    const ip = request.headers.get('CF-Connecting-IP');
    const turnstileResult = await validateTurnstileToken(turnstileToken, ip, env);
    if (!turnstileResult.success) {
      return new Response('机器人，站住！不许举报！', { status: 403 });
    }
    
    if (!messageId) {
      return new Response('你要举报哪条？说清楚点儿。', { status: 400 });
    }

    const message = await env.FEEDBACK_KV.get(`msg:${messageId}`, { type: 'json' });
    if (!message) {
      return new Response('没找着这条消息啊。', { status: 404 });
    }

    message.reports = (message.reports || 0) + 1;
    await env.FEEDBACK_KV.put(`msg:${messageId}`, JSON.stringify(message));
    
    // 如果配置了邮件服务，就发个邮件通知管理员。
    const htmlContent = `
        <h1>消息举报通知</h1>
        <p>一条消息被举报了，请及时处理：</p>
        <ul>
            <li><strong>ID:</strong> ${message.id}</li>
            <li><strong>用户:</strong> ${message.user_name}</li>
            <li><strong>内容:</strong> ${message.content}</li>
            <li><strong>时间:</strong> ${new Date(message.timestamp).toLocaleString()}</li>
        </ul>
        <a href="${new URL(request.url).origin}">点击此处查看详情</a>
    `;

    if (env.RESEND_API_KEY && env.SENDER_EMAIL && env.RECIPIENT_EMAIL) {
      try {
        console.log("准备发邮件提醒管理员...");
        await sendEmailViaResend({
          subject: `[举报通知] 消息 ${message.id} 被举报`,
          html: htmlContent,
          env: env,
        });
        console.log("邮件已成功请求发送。");
      } catch (error) {
        console.error("发邮件时出了点问题:", error.stack || error);
      }
    } else {
      console.error("邮件发送失败：没配好环境变量 (RESEND_API_KEY, SENDER_EMAIL, RECIPIENT_EMAIL)。");
    }

    const response = new Response(JSON.stringify({ success: true, message: message }), { headers: { 'Content-Type': 'application/json' } });
    return handleCorsAndRespond(request, response, env);

  } catch (e) {
    console.error("处理举报时发生严重错误:", e.stack);
    const errorResponse = new Response(JSON.stringify({ error: '处理举报时发生未知错误，请联系管理员。' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    return handleCorsAndRespond(request, errorResponse, env);
  }
}

// --- API 处理器：设置消息标签 ---
async function handleTag(request, env) {
  try {
    // 查岗，管理员专属功能。
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response('没带通行证，禁止入内！', { status: 401 });
    }
    const token = authHeader.substring(7);
    const payload = await verifyJWT(token, env.JWT_SECRET);

    if (!payload) {
      return new Response('通行证无效或已过期，请重新登录。', { status: 401 });
    }

    const { messageId, tag } = await request.json();
    if (!messageId || !tag) {
      return new Response('要给哪条消息设置啥标签？说清楚点儿。', { status: 400 });
    }

    const message = await env.FEEDBACK_KV.get(`msg:${messageId}`, { type: 'json' });
    if (!message) {
      return new Response('没找着这条消息啊。', { status: 404 });
    }

    const oldTag = message.tag;
    if (oldTag === tag) {
      // 标签没变，就别瞎忙活了。
      const response = new Response(JSON.stringify({ success: true, message: message }), { headers: { 'Content-Type': 'application/json' } });
      return handleCorsAndRespond(request, response);
    }

    // 更新消息里的标签。
    message.tag = tag;
    await env.FEEDBACK_KV.put(`msg:${messageId}`, JSON.stringify(message));

    // 更新索引，这是个细致活儿：先从旧标签的索引里删掉，再加到新标签的索引里。
    if (oldTag) {
        const oldTagIndexKey = `index_tag_${oldTag}`;
        const oldTagIndexData = await env.FEEDBACK_KV.get(oldTagIndexKey, { type: 'json' });
        if (oldTagIndexData) {
            const updatedOldIndex = oldTagIndexData.filter(id => id !== messageId);
            await env.FEEDBACK_KV.put(oldTagIndexKey, JSON.stringify(updatedOldIndex));
        }
    }
    const newTagIndexKey = `index_tag_${tag}`;
    const newTagIndexData = await env.FEEDBACK_KV.get(newTagIndexKey, { type: 'json' });
    const newTagIndex = newTagIndexData || [];
    newTagIndex.unshift(messageId);
    await env.FEEDBACK_KV.put(newTagIndexKey, JSON.stringify(newTagIndex));

    const response = new Response(JSON.stringify({ success: true, message: message }), { headers: { 'Content-Type': 'application/json' } });
    return handleCorsAndRespond(request, response, env);

  } catch (e) {
    const errorResponse = new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    return handleCorsAndRespond(request, errorResponse, env);
  }
}

// --- API 处理器：获取前端公共配置 ---
// 把一些需要公开给前端，但又可能变化的配置（比如 Turnstile 的 Site Key）放这里。
async function getConfig(request, env) {
  const config = {
    turnstileSiteKey: env.TURNSTILE_SITE_KEY,
  };
  const response = new Response(JSON.stringify(config), { headers: { 'Content-Type': 'application/json' } });
  return handleCorsAndRespond(request, response, env);
}

// --- 工具函数：通过 Resend 服务发邮件 ---
async function sendEmailViaResend(data) {
  const { subject, html, env } = data;
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      'from': env.SENDER_EMAIL,
      'to': env.RECIPIENT_EMAIL,
      'subject': subject,
      'html': html
    })
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Resend API 报错: ${response.status} - ${errorText}`);
  }
  return await response.json();
}