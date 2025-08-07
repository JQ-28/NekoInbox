// Cloudflare Pages Function - Middleware
// 这个函数会拦截所有指向您网站的请求。
// 它的核心作用是，在将 HTML 文件发送给用户浏览器之前，
// 动态地将您在 Cloudflare Pages 控制面板设置的环境变量注入进去。

export async function onRequest(context) {
  // 首先，让 Pages 正常去获取它应该提供的静态文件（比如 index.html）。
  const response = await context.next();

  // 检查一下这个文件是不是 HTML 文件。我们只修改 HTML。
  const contentType = response.headers.get("Content-Type");
  if (contentType && contentType.startsWith("text/html")) {
    
    // 如果是 HTML，我们就使用 HTMLRewriter API 来“重写”它的内容。
    return new HTMLRewriter()
      .on("head", {
        // 当找到 <head> 标签时，执行 element 方法。
        element(element) {
          // 从 Pages 的环境变量中获取 API_BASE_URL 的值。
          const apiUrl = context.env.API_BASE_URL;
          
          // 如果这个环境变量存在，我们就在 <head> 标签的最前面
          // 插入一个新的 <script> 标签。
          if (apiUrl) {
            const script = `<script>window.API_BASE_URL = "${apiUrl}";</script>`;
            // { html: true } 告诉 rewriter 我们插入的是 HTML 代码。
            element.prepend(script, { html: true });
          }
        },
      })
      .transform(response); // 应用转换并返回修改后的响应。
  }

  // 如果请求的不是 HTML 文件（比如是 CSS, JS, 图片等），就直接返回，不做任何修改。
  return response;
}