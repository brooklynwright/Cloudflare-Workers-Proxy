addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  try {
      const url = new URL(request.url);

      // 如果访问根目录，返回HTML
      if (url.pathname === "/") {
          return new Response(getRootHtml(), {
              headers: {
                  'Content-Type': 'text/html; charset=utf-8'
              }
          });
      }

      // 从请求路径中提取目标 URL
      let actualUrlStr = decodeURIComponent(url.pathname.replace("/", ""));

      // 判断用户输入的 URL 是否带有协议
      actualUrlStr = ensureProtocol(actualUrlStr, url.protocol);

      // 保留查询参数
      actualUrlStr += url.search;

      // 创建新 Headers 对象，排除以 'cf-' 开头的请求头
      const newHeaders = filterHeaders(request.headers, name => !name.startsWith('cf-'));

      // 创建一个新的请求以访问目标 URL
      const modifiedRequest = new Request(actualUrlStr, {
          headers: newHeaders,
          method: request.method,
          body: request.body,
          redirect: 'manual'
      });

      // 发起对目标 URL 的请求
      const response = await fetch(modifiedRequest);
      let body = response.body;

      // 处理重定向
      if ([301, 302, 303, 307, 308].includes(response.status)) {
          body = response.body;
          // 创建新的 Response 对象以修改 Location 头部
          return handleRedirect(response, body);
      } else if (response.headers.get("Content-Type")?.includes("text/html")) {
          body = await handleHtmlContent(response, url.protocol, url.host, actualUrlStr);
      }

      // 创建修改后的响应对象
      const modifiedResponse = new Response(body, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers
      });

      // 添加禁用缓存的头部
      setNoCacheHeaders(modifiedResponse.headers);

      // 添加 CORS 头部，允许跨域访问
      setCorsHeaders(modifiedResponse.headers);

      return modifiedResponse;
  } catch (error) {
      // 如果请求目标地址时出现错误，返回带有错误消息的响应和状态码 500（服务器错误）
      return jsonResponse({
          error: error.message
      }, 500);
  }
}

// 确保 URL 带有协议
function ensureProtocol(url, defaultProtocol) {
  return url.startsWith("http://") || url.startsWith("https://") ? url : defaultProtocol + "//" + url;
}

// 处理重定向
function handleRedirect(response, body) {
  const location = new URL(response.headers.get('location'));
  const modifiedLocation = `/${encodeURIComponent(location.toString())}`;
  return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: {
          ...response.headers,
          'Location': modifiedLocation
      }
  });
}

// 处理 HTML 内容中的相对路径
async function handleHtmlContent(response, protocol, host, actualUrlStr) {
  const originalText = await response.text();
  const regex = new RegExp('((href|src|action)=["\'])/(?!/)', 'g');
  let modifiedText = replaceRelativePaths(originalText, protocol, host, new URL(actualUrlStr).origin);

  return modifiedText;
}

// 替换 HTML 内容中的相对路径
function replaceRelativePaths(text, protocol, host, origin) {
  const regex = new RegExp('((href|src|action)=["\'])/(?!/)', 'g');
  return text.replace(regex, `$1${protocol}//${host}/${origin}/`);
}

// 返回 JSON 格式的响应
function jsonResponse(data, status) {
  return new Response(JSON.stringify(data), {
      status: status,
      headers: {
          'Content-Type': 'application/json; charset=utf-8'
      }
  });
}

// 过滤请求头
function filterHeaders(headers, filterFunc) {
  return new Headers([...headers].filter(([name]) => filterFunc(name)));
}

// 设置禁用缓存的头部
function setNoCacheHeaders(headers) {
  headers.set('Cache-Control', 'no-store');
}

// 设置 CORS 头部
function setCorsHeaders(headers) {
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
  headers.set('Access-Control-Allow-Headers', '*');
}

// 返回根目录的 HTML
function getRootHtml() {
    return `<!DOCTYPE html>
  <html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <link href="https://s4.zstatic.net/ajax/libs/materialize/1.0.0/css/materialize.min.css" rel="stylesheet">
    <title>Proxy Everything</title>
    <link rel="icon" type="image/png" href="https://s2.hdslb.com/bfs/openplatform/1682b11880f5c53171217a03c8adc9f2e2a27fcf.png@100w.webp">
    <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
    <style>
        body,html{height:100%;margin:0}
        .background{background-size:cover;background-position:center;height:100%;display:flex;align-items:center;justify-content:center}
        .card{background-color:rgba(255,255,255,.8);transition:background-color .3s ease,box-shadow .3s ease}
        .card:hover{background-color:rgba(255,255,255,1);box-shadow:0 8px 16px rgba(0,0,0,.3)}
        @media (prefers-color-scheme:dark){
          body,html{background:#121212;color:#e0e0e0}
          .card{background:rgba(33,33,33,.9);color:#fff}
          .card:hover{background:rgba(50,50,50,1)}
        }
    </style>
  </head>
  <body>
    <div class="background">
      <div class="container">
        <div class="row">
          <div class="col s12 m8 offset-m2 l6 offset-l3">
            <div class="card">
              <div class="card-content">
                <span class="card-title center-align">Proxy Everything</span>
                <form id="urlForm" onsubmit="redirectToProxy(event)">
                  <div class="input-field">
                    <input type="text" id="targetUrl" placeholder="在此输入目标地址" required>
                    <label for="targetUrl">目标地址</label>
                  </div>
                  <button type="submit" class="btn waves-effect waves-light teal darken-2 full-width">跳转</button>
                </form>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  
    <script src="https://s4.zstatic.net/ajax/libs/materialize/1.0.0/js/materialize.min.js"></script>
    <script>
      /* 自动设置 Bing 每日壁纸 */
      (async () => {
        const api = 'https://cn.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1&mkt=zh-CN';
        let bgUrl = 'https://cn.bing.com/th?id=OHR.PienzaItaly_ZH-CN6564335348_1920x1080.jpg';
        try {
          const res = await fetch(api);
          const data = await res.json();
          if (data.images?.[0]?.url) bgUrl = 'https://cn.bing.com' + data.images[0].url;
        } catch (e) {}
        document.querySelector('.background').style.backgroundImage = 'url(' + bgUrl + ')';
      })();
  
      function redirectToProxy(event) {
        event.preventDefault();
        const targetUrl = document.getElementById('targetUrl').value.trim();
        window.open(location.origin + '/' + encodeURIComponent(targetUrl), '_blank');
      }
    </script>
  </body>
  </html>`;
  }
