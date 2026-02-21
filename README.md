### 适用于 Workers 和 Pages 的反向代理

1. 第一步

2. 在`main.js`中找到`domain_mappings`
```js
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
```
按需求修改

3. 部署到workers或pages 
 #### 确认你的访问域名能够正常解析到这个Worker上

4. 愉快的享用 
