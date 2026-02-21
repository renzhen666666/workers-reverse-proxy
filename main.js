//映射表
const domain_mappings = {
  'www.example.com':{ //访问域名
    origin: 'origin.example.com', //源站 ip/端口/域名
    host: 'host.example.com', //访问源站时使用的 Host 头（默认与origin相同）
    https: true, //是否使用 HTTPS 访问源站
    cache: true, //是否缓存响应，默认 false
    cacheTtl: 3600 //缓存时间，单位为秒，默认 3600（1小时）
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

  // 检查是否为可缓存请求
  const isCacheable = host_config.cache && 
                     request.method === 'GET' && 
                     !request.headers.get('Authorization') && 
                     !request.headers.get('Cookie');

  if (isCacheable) {
    // 尝试从缓存获取
    const cacheKey = new Request(request.url, request);
    const cache = caches.default;
    
    try {
      const cachedResponse = await cache.match(cacheKey);
      if (cachedResponse) {
        //console.log('Cache hit for:', request.url);
        // 添加缓存状态头部
        const headers = new Headers(cachedResponse.headers);
        headers.set('X-Cache-Status', 'HIT');
        return new Response(cachedResponse.body, {
          status: cachedResponse.status,
          statusText: cachedResponse.statusText,
          headers
        });
      }
    } catch (e) {
      console.warn('Cache error:', e);
      // 如果缓存出错，继续执行正常请求
    }
  }

  // 查找对应目标域名
  let target_host = host_config.origin;

  if (!target_host) {
    return new Response('No matching target host for prefix', { status: 404 });
  }

  // 构造目标 URL
  const new_url = new URL(request.url);
  new_url.protocol = host_config.https ? 'https:' : 'http:';
  new_url.host = target_host;

  // 创建新请求
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

    // 克隆响应以便可以多次读取
    const responseClone = response.clone();

    // 复制响应头并添加CORS
    const response_headers = new Headers(response.headers);
    response_headers.set('access-control-allow-origin', '*');
    response_headers.set('access-control-allow-credentials', 'true');
    response_headers.delete('content-security-policy');
    response_headers.delete('content-security-policy-report-only');

    // 设置缓存策略
    if (isCacheable) {
      const cacheTtl = host_config.cacheTtl || 3600; // 默认1小时
      response_headers.set('Cache-Control', `public, max-age=${cacheTtl}`);
      
      // 添加自定义缓存头部
      response_headers.set('X-Cache-Status', 'MISS');
      response_headers.set('X-Cache-TTL', cacheTtl.toString());
    }/* else {
      // 对于不可缓存的内容，设置不缓存
      response_headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      response_headers.set('Expires', 'Thu, 01 Jan 1970 00:00:00 GMT');
      response_headers.set('Pragma', 'no-cache');
    }*/

    const finalResponse = new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: response_headers
    });

    // 如果是可缓存的请求，保存到缓存
    if (isCacheable) {
      try {
        const cache = caches.default;
        const cacheKey = new Request(request.url, request);
        
        // 设置缓存过期时间
        await cache.put(cacheKey, finalResponse.clone());
        console.log('Cached response for:', request.url);
      } catch (e) {
        console.warn('Failed to cache response:', e);
      }
      
      // 返回原始响应而不是克隆的，避免重复读取错误
      return new Response(responseClone.body, {
        status: response.status,
        statusText: response.statusText,
        headers: response_headers
      });
    }

    return finalResponse;
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