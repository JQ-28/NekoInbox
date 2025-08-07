// --- Cloudflare Worker 后端核心 (D1 版本) ---
// 这是整个应用的“大脑”，一个跑在 Cloudflare 全球节点上的 Serverless 服务。
// 它负责处理所有 API 请求，和 D1 数据库打交道，进行权限验证等等。

// --- 安全第一：CORS 配置 ---
// 允许的源站地址从环境变量 FRONTEND_URL 中读取，支持多个地址用逗号分隔。
// 这样做更安全、更灵活，符合部署要求。

// --- 工具函数：给响应头加上 CORS ---
// 每次返回响应前，都用这个函数“盖个章”，确保浏览器不会因为跨域问题报错。
function handleCorsAndRespond(request, response, env) {
  const origin = request.headers.get('Origin');
  
  // 从环境变量中读取允许的源，支持逗号分隔的多个 URL
  const frontendUrl = env.FRONTEND_URL || '';
  const allowedOrigins = frontendUrl.split(',').map(url => url.trim()).filter(Boolean);

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

// --- Worker 的主入口 ---
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // 浏览器会先发个 OPTIONS 预检请求来“投石问路”，咱们得热情回应。
    if (request.method === 'OPTIONS') {
      return handleOptions(request, env);
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

    // 从环境变量中读取允许的源，支持逗号分隔的多个 URL
    const frontendUrl = env.FRONTEND_URL || '';
    const allowedOrigins = frontendUrl.split(',').map(url => url.trim()).filter(Boolean);

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

// --- API 处理器：获取消息列表 (D1 版本) ---
// 性能提升的核心！所有复杂逻辑都交给 SQL 处理。
async function getMessages(request, env) {
    const url = new URL(request.url);
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
    const limit = Math.max(1, parseInt(url.searchParams.get('limit') || '10', 10));
    const searchTerm = url.searchParams.get('search')?.toLowerCase().trim();
    const filterByTag = url.searchParams.get('filterByTag');
    const sortBy = url.searchParams.get('sortBy') || 'likes';

    try {
        let conditions = [];
        const params = [];

        if (searchTerm) {
            conditions.push(`(m.content LIKE ?1 OR m.user_name LIKE ?1)`);
            params.push(`%${searchTerm}%`);
        }

        if (filterByTag && filterByTag !== 'all') {
            conditions.push(`m.tag = ?${params.length + 1}`);
            params.push(filterByTag);
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        // 构建获取总数和获取消息列表的 SQL
        const countQuery = `SELECT COUNT(*) as total FROM messages m ${whereClause}`;
        
        let messagesQuery = `
            SELECT m.*, (SELECT COUNT(*) FROM replies r WHERE r.message_id = m.id) as replies_count
            FROM messages m
            ${whereClause}
        `;

        switch (sortBy) {
            case 'replies':
                messagesQuery += ' ORDER BY replies_count DESC';
                break;
            case 'date':
                messagesQuery += ' ORDER BY m.timestamp DESC';
                break;
            default: // 'likes'
                messagesQuery += ' ORDER BY m.likes DESC, m.timestamp DESC';
                break;
        }

        messagesQuery += ` LIMIT ?${params.length + 1} OFFSET ?${params.length + 2}`;
        const messagesParams = [...params, limit, (page - 1) * limit];

        // 使用 D1 的 batch API 一次性执行两个查询
        const [totalResult, messagesResult] = await env.DB.batch([
            env.DB.prepare(countQuery).bind(...params),
            env.DB.prepare(messagesQuery).bind(...messagesParams),
        ]);

        const totalMessages = totalResult.results[0].total;
        const messages = messagesResult.results;

        // 获取所有相关消息的回复
        const messageIds = messages.map(m => m.id);
        let repliesByMessageId = {};

        if (messageIds.length > 0) {
            const repliesQuery = `SELECT * FROM replies WHERE message_id IN (${messageIds.map(() => '?').join(',')}) ORDER BY timestamp ASC`;
            const repliesResult = await env.DB.prepare(repliesQuery).bind(...messageIds).all();
            
            repliesResult.results.forEach(reply => {
                if (!repliesByMessageId[reply.message_id]) {
                    repliesByMessageId[reply.message_id] = [];
                }
                repliesByMessageId[reply.message_id].push(reply);
            });
        }
        
        // 将回复附加到消息对象上
        messages.forEach(message => {
            message.replies = repliesByMessageId[message.id] || [];
            delete message.replies_count; // 这个字段只用于排序，不需要返回给前端
        });

        const totalPages = Math.ceil(totalMessages / limit);

        const responsePayload = {
            messages,
            totalMessages,
            totalPages,
            currentPage: page,
        };

        const response = new Response(JSON.stringify(responsePayload), { headers: { 'Content-Type': 'application/json' } });
        return handleCorsAndRespond(request, response, env);

    } catch (e) {
        console.error("获取消息列表时翻车了 (D1):", e);
        const errorResponse = new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
        return handleCorsAndRespond(request, errorResponse, env);
    }
}


// --- API 处理器：提交新消息 (D1 版本) ---
async function postMessage(request, env) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '');
  if (token !== env.API_TOKEN) {
    return new Response('暗号不对，军情小本本上没有你！', { status: 401 });
  }

  try {
    const newMessageData = await request.json();
    if (!newMessageData.type || !newMessageData.user_name || !newMessageData.user_id || !newMessageData.content) {
      return new Response('我说，你是不是忘了点啥？（缺少字段）', { status: 400 });
    }

    const newMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      ...newMessageData,
    };

    const ps = env.DB.prepare(
      'INSERT INTO messages (id, type, user_name, user_id, content) VALUES (?1, ?2, ?3, ?4, ?5)'
    );
    await ps.bind(newMessage.id, newMessage.type, newMessage.user_name, newMessage.user_id, newMessage.content).run();

    const response = new Response(JSON.stringify({ success: true, message: newMessage }), { status: 201, headers: { 'Content-Type': 'application/json' } });
    return handleCorsAndRespond(request, response, env);

  } catch (e) {
    console.error("提交新消息时翻车了 (D1):", e);
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
    if (!isValid) return null;
    
    const decodedPayload = JSON.parse(textDecoder.decode(new Uint8Array(atob(payload.replace(/-/g, '+').replace(/_/g, '/')).split('').map(c => c.charCodeAt(0)))));
    if (decodedPayload.exp < Math.floor(Date.now() / 1000)) return null;
    
    return decodedPayload;
  } catch (e) {
    return null;
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

// --- API 处理器：管理员回复 (D1 版本) ---
async function handleReply(request, env) {
  try {
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

    const newReply = {
      id: `reply-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      content: replyContent,
    };

    const ps = env.DB.prepare(
      'INSERT INTO replies (id, message_id, content, timestamp) VALUES (?1, ?2, ?3, ?4)'
    );
    await ps.bind(newReply.id, messageId, newReply.content, newReply.timestamp).run();

    const response = new Response(JSON.stringify({ success: true, reply: newReply }), { headers: { 'Content-Type': 'application/json' } });
    return handleCorsAndRespond(request, response, env);

  } catch (e) {
    console.error("回复时翻车了 (D1):", e);
    const errorResponse = new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    return handleCorsAndRespond(request, errorResponse, env);
  }
}

// --- API 处理器：处理投票（点赞/点踩） (D1 版本) ---
async function handleVote(request, env) {
  try {
    const { messageId, voteType, 'cf-turnstile-response': turnstileToken } = await request.json();

    const ip = request.headers.get('CF-Connecting-IP');
    const turnstileResult = await validateTurnstileToken(turnstileToken, ip, env);
    if (!turnstileResult.success) {
      return new Response('机器人，站住！不许投票！', { status: 403 });
    }

    if (!messageId || !['like', 'dislike'].includes(voteType)) {
      return new Response('你想干啥？（缺少 messageId 或 voteType 无效）', { status: 400 });
    }

    const field = voteType === 'like' ? 'likes' : 'dislikes';
    const ps = env.DB.prepare(
      `UPDATE messages SET ${field} = ${field} + 1 WHERE id = ?1 RETURNING *`
    );
    const { results } = await ps.bind(messageId).all();

    if (results.length === 0) {
      return new Response('没找着这条消息啊。', { status: 404 });
    }

    const response = new Response(JSON.stringify({ success: true, message: results[0] }), { headers: { 'Content-Type': 'application/json' } });
    return handleCorsAndRespond(request, response, env);

  } catch (e) {
    console.error("投票时翻车了 (D1):", e);
    const errorResponse = new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    return handleCorsAndRespond(request, errorResponse, env);
  }
}

// --- API 处理器：删除消息 (D1 版本) ---
async function deleteMessage(request, env) {
  try {
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

    const ps = env.DB.prepare('DELETE FROM messages WHERE id = ?1');
    const { success } = await ps.bind(messageId).run();

    if (!success) {
        return new Response('删除失败，可能消息不存在。', { status: 404 });
    }

    const response = new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
    return handleCorsAndRespond(request, response, env);

  } catch (e) {
    console.error("删除时翻车了 (D1):", e);
    const errorResponse = new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    return handleCorsAndRespond(request, errorResponse, env);
  }
}

// --- API 处理器：处理举报 (D1 版本) ---
async function handleReport(request, env) {
  try {
    const { messageId, 'cf-turnstile-response': turnstileToken } = await request.json();

    const ip = request.headers.get('CF-Connecting-IP');
    const turnstileResult = await validateTurnstileToken(turnstileToken, ip, env);
    if (!turnstileResult.success) {
      return new Response('机器人，站住！不许举报！', { status: 403 });
    }
    
    if (!messageId) {
      return new Response('你要举报哪条？说清楚点儿。', { status: 400 });
    }

    const ps = env.DB.prepare('UPDATE messages SET reports = reports + 1 WHERE id = ?1 RETURNING *');
    const { results } = await ps.bind(messageId).all();

    if (results.length === 0) {
      return new Response('没找着这条消息啊。', { status: 404 });
    }
    
    const message = results[0];

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

    const response = new Response(JSON.stringify({ success: true, message }), { headers: { 'Content-Type': 'application/json' } });
    return handleCorsAndRespond(request, response, env);

  } catch (e) {
    console.error("处理举报时发生严重错误 (D1):", e.stack);
    const errorResponse = new Response(JSON.stringify({ error: '处理举报时发生未知错误，请联系管理员。' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    return handleCorsAndRespond(request, errorResponse, env);
  }
}

// --- API 处理器：设置消息标签 (D1 版本) ---
async function handleTag(request, env) {
  try {
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

    const ps = env.DB.prepare('UPDATE messages SET tag = ?1 WHERE id = ?2 RETURNING *');
    const { results } = await ps.bind(tag, messageId).all();
    
    if (results.length === 0) {
      return new Response('没找着这条消息啊。', { status: 404 });
    }

    const response = new Response(JSON.stringify({ success: true, message: results[0] }), { headers: { 'Content-Type': 'application/json' } });
    return handleCorsAndRespond(request, response, env);

  } catch (e) {
    console.error("设置标签时翻车了 (D1):", e);
    const errorResponse = new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    return handleCorsAndRespond(request, errorResponse, env);
  }
}

// --- API 处理器：获取前端公共配置 ---
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