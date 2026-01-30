//映射表
const domain_mappings = {
  'www.example.com':{ //访问域名
    origin: 'origin.example.com', //源站 ip/端口/域名
    host: 'host.example.com', //访问源站时使用的 Host 头（默认与origin相同）
    https: true //是否使用 HTTPS 访问源站
  }
}

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  const url = new URL(request.url);
  const current_host = url.host;

  // 强制使用 HTTPS
  if (url.protocol === 'http:') {
    url.protocol = 'https:';
    return Response.redirect(url.href, 301);
  }

  const host_config = getProxyPrefix(current_host);
  if (!host_config) {
    return new Response('Proxy prefix not matched', { status: 404 });
  }

  let target_host = host_config.origin;

  if (!target_host) {
    return new Response('No matching target host for prefix', { status: 404 });
  }

  const new_url = new URL(request.url);
  new_url.protocol = host_config.https ? 'https:' : 'http:';
  new_url.host = target_host;

  const new_headers = new Headers(request.headers);
  new_headers.set('Host', host_config.host || target_host);
  new_headers.set('Referer', new_url.href);
  new_headers.set('X-Forwarded-Host', current_host);

  try {
    const response = await fetch(new_url.href, {
      method: request.method,
      headers: new_headers,
      body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
      redirect: 'manual'
    });

    const response_headers = new Headers(response.headers);
    response_headers.set('access-control-allow-origin', '*');
    response_headers.set('access-control-allow-credentials', 'true');
    response_headers.set('cache-control', 'public, max-age=600');
    response_headers.delete('content-security-policy');
    response_headers.delete('content-security-policy-report-only');

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: response_headers
    });
  } catch (err) {
    return new Response(`Proxy Error: ${err.message}`, { status: 502 });
  }
}

function getProxyPrefix(hostname) {
  for (const [prefix, config] of Object.entries(domain_mappings)) {
    if (hostname == prefix) {
      return config;
    } else if(prefix.endsWith('.') && hostname.startsWith(prefix)) {
      return config;
    }
  }
  return null;
}