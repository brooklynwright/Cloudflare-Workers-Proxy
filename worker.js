addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

/* ---------- 工具函数 ---------- */
const BINARY_EXTENSIONS = [
  'tar.gz', 'zip', 'rar', '7z', 'gz', 'bz2', 'xz',
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'ico',
  'mp4', 'mp3', 'pdf', 'exe', 'dmg', 'deb', 'rpm'
];

function isBinaryResource(urlStr) {
  try {
    const pathname = new URL(urlStr).pathname.toLowerCase();
    return BINARY_EXTENSIONS.some(ext => pathname.endsWith('.' + ext));
  } catch {
    return false;
  }
}

function ensureProtocol(url, defaultProtocol) {
  return url.startsWith("http://") || url.startsWith("https://") ? url : defaultProtocol + "//" + url;
}

function filterHeaders(headers, filterFunc) {
  return new Headers([...headers].filter(([name]) => filterFunc(name)));
}

function setNoCacheHeaders(headers) {
  headers.set('Cache-Control', 'no-store');
}

function setCorsHeaders(headers) {
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
  headers.set('Access-Control-Allow-Headers', '*');
}

function jsonResponse(data, status) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}

function handleRedirect(response, body) {
  const location = new URL(response.headers.get('location'));
  const modifiedLocation = `/${encodeURIComponent(location.toString())}`;
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: { ...response.headers, 'Location': modifiedLocation }
  });
}

function replaceRelativePaths(text, protocol, host, origin) {
  const regex = /((href|src|action)=["'])\/(?!\/)/g;
  return text.replace(regex, `$1${protocol}//${host}/${origin}/`);
}

async function handleHtmlContent(response, protocol, host, actualUrlStr) {
  const originalText = await response.text();
  return replaceRelativePaths(originalText, protocol, host, new URL(actualUrlStr).origin);
}

/* ---------- 主入口 ---------- */
async function handleRequest(request) {
  try {
    const url = new URL(request.url);

    // 根路径返回主页
    if (url.pathname === "/") {
      return new Response(getRootHtml(), {
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    }

    // 提取目标地址
    let actualUrlStr = decodeURIComponent(url.pathname.slice(1));
    actualUrlStr = ensureProtocol(actualUrlStr, url.protocol);
    actualUrlStr += url.search;

    // 构造新请求头（去掉 cf- 开头）
    const newHeaders = filterHeaders(request.headers, name => !name.startsWith('cf-'));
    const modifiedRequest = new Request(actualUrlStr, {
      headers: newHeaders,
      method: request.method,
      body: request.body,
      redirect: 'manual'
    });

    const response = await fetch(modifiedRequest);

    /* ====== 二进制资源直接透传 ====== */
    if (isBinaryResource(actualUrlStr)) {
      const modifiedResponse = new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers
      });
      setNoCacheHeaders(modifiedResponse.headers);
      setCorsHeaders(modifiedResponse.headers);
      return modifiedResponse;
    }

    // 重定向处理
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      return handleRedirect(response, response.body);
    }

    // HTML 内容才做路径重写
    let body = response.body;
    if (response.headers.get("Content-Type")?.includes("text/html")) {
      body = await handleHtmlContent(response, url.protocol, url.host, actualUrlStr);
    }

    const modifiedResponse = new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers
    });
    setNoCacheHeaders(modifiedResponse.headers);
    setCorsHeaders(modifiedResponse.headers);
    return modifiedResponse;

  } catch (err) {
    return jsonResponse({ error: err.message }, 500);
  }
}

/* ---------- 主页 HTML ---------- */
function getRootHtml() {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <link href="https://cdnjs.cloudflare.com/ajax/libs/materialize/1.0.0/css/materialize.min.css" rel="stylesheet">
  <title>Proxy Everything</title>
  <link rel="icon" type="image/png" href="https://img.icons8.com/color/1000/kawaii-bread-1.png">
  <meta name="viewport" content="width=device-width,initial-scale=1.0,user-scalable=no">
  <style>
    body,html{height:100%;margin:0}
    .background{background:url(https://imgapi.cn/bing.php) center/cover;height:100%;display:flex;align-items:center;justify-content:center}
    .card{background:rgba(255,255,255,.8);transition:.3s}
    .card:hover{background:#fff;box-shadow:0 8px 16px rgba(0,0,0,.3)}
    .input-field input[type=text]:focus+label{color:#2c3e50!important}
    .input-field input[type=text]:focus{border-bottom:1px solid #2c3e50!important;box-shadow:0 1px 0 0 #2c3e50!important}
  </style>
</head>
<body>
  <div class="background">
    <div class="container">
      <div class="row">
        <div class="col s12 m8 offset-m2 l6 offset-l3">
          <div class="card">
            <div class="card-content">
              <span class="card-title center-align"><i class="material-icons left">link</i>Proxy Everything</span>
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
  <script src="https://cdnjs.cloudflare.com/ajax/libs/materialize/1.0.0/js/materialize.min.js"></script>
  <script>
    function redirectToProxy(e){
      e.preventDefault();
      const t=document.getElementById('targetUrl').value.trim();
      window.open(location.origin+'/'+encodeURIComponent(t),'_blank');
    }
  </script>
</body>
</html>`;
}
