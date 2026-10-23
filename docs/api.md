# HTTP 接口

HTTP 接口供浏览器交互组件及外部客户端查询图库、管理内容和记录交互。下文按调用流程说明请求与响应，最后列出管理接口供查阅。所有路径相对于实例根地址；示例使用本机开发服务。

## 请求与响应约定

JSON 请求使用 `Content-Type: application/json`；上传使用 multipart。JSON 成功响应把数据直接放在顶层：

```json
{"ok":true,"message":"查询成功","items":[],"page":1,"limit":24,"total":0}
```

业务错误使用 HTTP 错误状态，并返回可供程序判断的 `code`：

```json
{"ok":false,"error":"未登录","code":"UNAUTHORIZED"}
```

图片、下载流和 CSV 是二进制或文本响应。媒体路径的 404 返回空正文。JSON 时间字段使用 ISO 8601；每日统计和随机池按 UTC 日期划分。

分页的 `page` 从 1 开始，`limit` 为正整数。输入整数范围为 1–2,147,483,647；缺失、负数、非整数或超出该范围时使用默认值，例如 `page=2147483648` 使用第 1 页。合法范围内的 `limit` 再取后台配置上限，`page` 则按最终 `limit` 限制最大查询偏移。不同列表分别使用 `listLimit`、`reviewPageLimit`、`managePageLimit`、`tagPageLimit` 或 `logPageLimit`。

带 `Origin` 的写请求要求其主机名和端口与 `Host` 相同，跨来源请求返回 403 `INVALID_ORIGIN`。命令行调用可以省略 `Origin`。匿名 API 请求共享每 IP 每分钟 120 次额度；超限返回 429，`Retry-After` 是剩余秒数。登录、上传和交互另有各自额度。

## 登录并管理会话

管理员身份使用 `admin_session` Cookie。登录响应签发 Cookie，之后的管理请求发送同一 Cookie。生产 Cookie 具有 `Secure` 属性，生产调用使用 HTTPS；开发模式可使用下面的 HTTP 示例。

```bash
base='http://localhost:3000'
admin_cookies=$(mktemp)

curl -i -c "$admin_cookies" \
  -H 'Content-Type: application/json' \
  -d '{"user":"admin","pass":"自己的管理员密码"}' \
  "$base/api/admin/login"

curl -b "$admin_cookies" "$base/api/admin/session"
```

登录成功返回 `{"ok":true,"message":"登录成功"}` 及 `Set-Cookie`。会话查询成功返回：

```json
{"ok":true,"message":"查询成功","authed":true}
```

未登录时，会话查询仍返回 HTTP 200，`authed` 为 `false`；需要管理员权限的业务接口返回 401。登录默认每 IP 在 24 小时窗口内最多尝试 3 次，窗口从第一次有效格式请求开始，成功登录清除窗口。前两次凭据错误返回 401 `INVALID_CREDENTIALS`，第三次错误及窗口内后续请求返回 429 `LOGIN_COOLDOWN`。后台可调整窗口长度。

修改密码时把响应中的新 Cookie 保存回同一文件：

```bash
curl -b "$admin_cookies" -c "$admin_cookies" \
  -H 'Content-Type: application/json' \
  -d '{"newPass":"新的管理员密码","confirmPass":"新的管理员密码"}' \
  "$base/api/admin/password"
```

新密码长度为 4–64 个字符，两次输入一致。成功响应为 `{"ok":true,"message":"修改成功"}`，原有会话全部撤销，响应签发当前会话的新令牌。完成管理操作后，调用 `POST /api/admin/logout` 退出，撤销当前服务器会话并清除 Cookie：

```bash
curl -X POST -b "$admin_cookies" -c "$admin_cookies" \
  "$base/api/admin/logout"
rm "$admin_cookies"
```

## 查询公开图库

`GET /api/memes?page=1&limit=12` 返回已发布图片，按创建时间、内部 ID 倒序排列。图片对象如下：

```json
{
  "id":"meme-id",
  "title":"可爱",
  "type":"STATIC",
  "mediaUrl":"/memes/original/example.png",
  "thumbUrl":"/memes/thumb/example.jpg",
  "copies":2,
  "downloads":1,
  "isFeatured":false,
  "createdAt":"2026-10-23T00:00:00.000Z",
  "tags":["可爱","像素"]
}
```

`title` 可以为 `null`，`type` 为 `STATIC` 或 `ANIMATED`，标签是字符串数组。`mediaUrl` 与 `thumbUrl` 已进行 URL 编码，客户端直接使用返回值。`isFeatured` 是保留的数据字段，公开查询按发布状态取图。

| 查询 | 参数 | 响应数据字段 |
| --- | --- | --- |
| `GET /api/memes` | `page`, `limit` | `items, page, limit, total` |
| `GET /api/search` | `q`, `page`, `limit` | `items, page, limit, total, q` |
| `GET /api/memes/hot` | `mode=latest\|hot\|random`, `limit` | `items, mode, limit` |

搜索按空白分词，每个词都要匹配标题或至少一个标签。保留查询中的标点和 emoji；空查询返回空列表。热门接口默认 `latest`；`hot` 按复制与下载之和倒序，再按创建时间和 ID 倒序；`random` 从已发布图库随机取图。其他 `mode` 值按最新查询，响应 `mode` 仍保留传入值。

```bash
curl "$base/api/memes?page=1&limit=12"
curl --get --data-urlencode 'q=可爱 像素' "$base/api/search"
curl "$base/api/memes/hot?mode=hot&limit=12"
```

列表、非空搜索和热门接口的 `latest`、`hot` 模式默认允许共享缓存 30 秒，后台可调整。热门 `random` 模式使用 `no-store`。公开接口只返回已发布记录；管理列表另包含隐藏记录。

## 从上传到发布

上传接收一个名为 `file` 的文件，可附 `title` 和 `tags` 文本。支持 PNG、JPEG、GIF、WebP，默认单图上限 10 MiB；服务端会解码并核对文件内容。非空标题去除首尾空白后，若与任意现有图片标题完全相同，返回 409 `DUPLICATE_MEME`。

```bash
curl -F 'file=@/absolute/path/example.png' \
  -F 'title=可爱像素图' -F 'tags=可爱 像素' \
  "$base/api/upload"
```

成功只返回提交结果：

```json
{"ok":true,"message":"已提交，等待审核"}
```

记录状态为 `PENDING`。管理员使用前文的登录步骤建立 Cookie 文件，再读取审核队列取得记录 ID：

```bash
curl -b "$admin_cookies" "$base/api/review?page=1&limit=12"
```

```json
{
  "ok":true,"message":"查询成功",
  "items":[{
    "id":"meme-id","title":"可爱像素图","type":"STATIC",
    "mediaUrl":"/uploads/example.png","thumbUrl":"/uploads/example.png",
    "status":"PENDING","tags":["可爱","像素"]
  }],
  "page":1,"limit":12,"total":1
}
```

将 `meme_id` 替换为返回的 ID，提交审核结果：

```bash
meme_id='meme-id'
curl -X PATCH -b "$admin_cookies" \
  -H 'Content-Type: application/json' \
  -d '{"title":"可爱像素图","tags":["可爱","像素"],"status":"PUBLISHED"}' \
  "$base/api/review/$meme_id"
```

成功返回 `ok, message, item`。`item` 包含 `id, title, type, mediaUrl, thumbUrl, status, createdAt, tags`；发布后两条媒体 URL 指向正式图库。`status: "HIDDEN"` 也会把图片转入正式图库，随后由管理接口访问。省略 `status` 则只保存标题和标签，图片继续留在审核队列。审核接口只处理待审上传；对已经转入正式图库的记录再次审核返回 400 `INVALID_STATE`。

正式图库使用 `PATCH /api/manage/:id` 编辑，接受相同的 `title`、`tags`、`status` 字段。省略标题或标签表示保持原值；空标题保存为 `null`，`tags: []` 或空标签字符串清空关联。标签文本以空白、逗号、顿号或分号分隔，转小写，保留字母、数字、下划线和基本汉字，再按后台规则截断、去重。

删除单条记录使用对应审核或管理路径发送 `{"action":"delete"}`，成功返回 `ok, message`。`POST /api/review/clear` 删除全部待审上传，返回 `count`。管理员上传时带上管理 Cookie，可跳过上传冷却；文件检查、重复标题检查和审核队列容量仍生效。

## 记录复制与下载

访客身份与管理员身份分开保存。首次正常访问首页，服务端设置 `molworld_visitor` Cookie；复制和下载请求都带此 Cookie。下面使用独立 Cookie 文件取得访客身份：

```bash
visitor_cookies=$(mktemp)
curl -c "$visitor_cookies" -o /dev/null "$base/"
```

每次操作先申请一次性凭据。凭据绑定访客、图片和操作种类，有效期 5 分钟；服务端只对已发布且原图存在的图片签发凭据。申请时消耗相应冷却额度：默认同一访客复制间隔 3 秒，下载间隔 10 秒；同 IP 每种操作在对应窗口内最多申请 10 次，窗口最短 1 秒。申请成功后取消操作，额度仍按原窗口到期。

### 复制：申请、写入剪贴板、确认

申请复制凭据：

```bash
curl -b "$visitor_cookies" -H 'Content-Type: application/json' \
  -d '{"action":"prepare"}' "$base/api/memes/$meme_id/copy"
```

```json
{
  "ok":true,"message":"可以复制","token":"64位十六进制令牌",
  "item":{
    "mediaUrl":"/memes/original/example.png",
    "thumbUrl":"/memes/thumb/example.jpg",
    "type":"STATIC","copies":2,"downloads":1
  }
}
```

客户端读取返回的媒体，完成剪贴板写入，再把 `token` 发回同一路径。Web 界面在剪贴板操作成功后执行这一确认；失败时保留原计数。确认请求为：

```http
POST /api/memes/meme-id/copy
Content-Type: application/json
Cookie: molworld_visitor=首页签发的访客令牌

{"token":"申请时返回的64位令牌"}
```

```json
{"ok":true,"message":"已记录复制","item":{"id":"meme-id","copies":3,"downloads":1}}
```

服务端在同一事务中消费凭据、增加图片计数和当日统计。同一凭据重复或并发确认只有一次成功，后续返回 409。复制次数表示客户端报告剪贴板操作成功并完成确认的次数。

### 下载：申请、完整读取附件

申请下载时发送 POST，正文为空：

```bash
curl -X POST -b "$visitor_cookies" "$base/api/memes/$meme_id/download"
```

```json
{"ok":true,"message":"可以下载","url":"/api/memes/meme-id/download?token=64位十六进制令牌"}
```

将返回的相对 `url` 与实例根地址拼接，使用同一访客 Cookie 读取附件：

```bash
download_path='/api/memes/meme-id/download?token=申请时返回的令牌'
curl --fail-with-body -b "$visitor_cookies" \
  -o example.png "$base$download_path"
```

GET 返回原图字节、对应的 `Content-Type`、附件文件名和 `Cache-Control: private, no-store`。申请 POST 不计数；服务端读完原图流后消费凭据并计数，随后关闭响应流。客户端以完整读完响应体作为成功条件；在原图流完整读出前取消，不进入完成计数。

已消费凭据在开始传输前返回 409。两个并发 GET 都可能先取得 200 响应头，最终只有一个能消费凭据，另一个的响应体读取以错误结束。下载统计记录站内附件流完成次数，直接读取公开媒体 URL 不增加下载计数。

## 读取媒体

`GET` 和 `HEAD` 可读取 `/memes/original/:file`、`/memes/thumb/:file` 和 `/uploads/:file`。正式媒体被至少一条已发布记录引用时公开；其余正式媒体和全部上传媒体需要管理员 Cookie，匿名请求返回 404。隐藏与删除后，后续读取按当前记录状态重新检查。

媒体响应提供 `Content-Type`、`Content-Length`、`ETag` 和 `Last-Modified`。公开媒体使用 `public, max-age=0, must-revalidate`，匹配条件请求时返回 304；私有媒体使用 `private, no-store`。HEAD 仅返回响应头。`file` 使用接口提供的已编码 URL 段，包含中文、空格或 `#?%` 的文件名也按此方式访问。

## 管理接口参考

以下路径均使用管理员 Cookie。路由中的图片 `:id` 是内部 ID；标签的 `:id` 同时支持内部 ID 和数字编号。JSON 成功响应均包含 `ok` 和 `message`，表格列出附加数据字段。

### 图片与标签

| 方法和路径 | 输入与作用 | 响应数据字段 |
| --- | --- | --- |
| `GET /api/review` | `page, limit`；待审上传 | `items, page, limit, total` |
| `PATCH /api/review/:id` | `title, tags, status=PUBLISHED\|HIDDEN`，或 `action=delete` | 编辑返回 `item`；删除无附加字段 |
| `POST /api/review/clear` | 删除全部待审上传 | `count` |
| `GET /api/manage` | `page, limit, q`；正式图库中的已发布或隐藏记录 | `items, page, limit, total, q` |
| `PATCH /api/manage/:id` | `title, tags, status=PUBLISHED\|HIDDEN`，或 `action=delete` | 编辑返回 `item`；删除无附加字段 |
| `POST /api/manage/batch` | `ids` 和 `action=publish\|hide\|reset\|delete`；最多 50 个不同 ID | `success, failed, total, count`；删除还返回 `failedIds` |
| `GET /api/admin/tags` | `page, limit, q, sort` | `items, page, limit, total, q, sort` |
| `PATCH /api/admin/tags/:id` | `{"name":"新标签"}` | `item` |
| `DELETE /api/admin/tags/:id/delete` | 查询参数 `mode=unlink\|force`，默认 `unlink` | `deleted, unlinked, mode, tag` |
| `POST /api/admin/tags/merge` | `{"from":"来源标签","to":"目标标签"}` | `merged, added, item` |
| `GET /api/admin/tags/stats` | 统计全部标签及图片关联 | `totalTags, totalLinks` |

管理列表的图片包含 `id, title, type, mediaUrl, thumbUrl, status, copies, downloads, createdAt, updatedAt, tags`。管理搜索可使用 `状态:已发布`、`状态:已隐藏`、`类型:静态`、`类型:动图`；其余词按标题和标签匹配。批量操作中的 `success` 和 `failed` 分别是处理成功与失败的数量，`count` 等于 `success`；HTTP 200 表示批量处理结束，各条结果由这些字段说明。`reset` 同时清零选中图片的累计计数和每日交互历史，PV、UV 保持原值。

标签列表和编辑结果中的 `item` 为 `{id, numId, name, count}`，`count` 是关联图片数量；列表排序可为 `count_desc`、`count_asc`、`name_asc`、`name_desc`，默认 `count_desc`。删除的 `unlink` 模式清空关联并保留标签，`force` 同时删除标签。合并的来源和目标都需存在，可用名称、内部 ID 或数字编号定位；合并后删除来源标签。`merged` 是来源关联总数，`added` 是目标中新增加的关联数，重复关联只保留一份。

### 参数、日志、统计与资源

配置键的含义、取值范围和生效方式见[配置参考](configuration.md)。

| 方法和路径 | 输入与作用 | 响应数据字段 |
| --- | --- | --- |
| `GET /api/admin/params` | 读取生效配置 | `config` |
| `PATCH /api/admin/params` | `{"updates":{"listLimit":24}}`；整组校验并保存 | `config` |
| `GET /api/admin/logs` | `page, limit, q, range=3d\|7d\|30d\|all`，默认 7d | `items, page, limit, total, q` |
| `POST /api/admin/logs` | `{"range":"7d"}`；删除指定时间范围内的日志 | `count` |
| `GET /api/admin/logs/export` | `q, range`，范围同日志列表，默认 7d | CSV 文件 |
| `GET /api/admin/traffic` | `range=3d\|7d\|30d\|all`，默认 30d | `daily, top` |
| `POST /api/admin/heat/reset` | 清零全部图片累计计数及每日交互计数 | `count, stats` |
| `GET /api/admin/resources` | 检查正式媒体引用与文件 | `stats` |
| `POST /api/admin/resources` | `{"action":"cleanup"}`；永久删除无引用的正式媒体文件 | `removed, stats` |

日志查询的 `q` 按空白分词，每个词匹配动作、消息、目标 ID 或目标类型之一。列表项包含 `id, action, status, targetType, targetId, message, createdAt`。日志的 7d 表示当前时刻前 7 × 24 小时至今；删除 7d 会删除最近七天的日志。CSV 包含 UTF-8 BOM，列为时间、动作、状态、目标类型、目标 ID、消息；时间使用服务器本地时区，公式前缀会转义。导出开始后按时间与 ID 游标分批读取，每批最多 500 条。

流量统计按 UTC 自然日汇总。3d、7d、30d 包含当前 UTC 日期，范围内无记录的日期补零；`all` 返回有历史记录的日期。`daily` 的每项为 `{day, heat, cumulative, visits, visitors}`：`heat` 等于当日复制加下载次数；`cumulative` 从所选范围第一天起累加；`visits` 是首页访问次数，`visitors` 是当日按浏览器 Cookie 去重的访客数。正常首页 GET 计访问，预取请求不计；同一浏览器当天重复访问只增加访问次数；清除 Cookie 或更换浏览器会建立新身份。每日访客数相加表示访客日数。

`top` 最多 30 项，每项为 `{id, title, type, thumbUrl, heat}`，热度取所选范围内的交互之和，包含仍存在的已发布或隐藏图片。删除图片保留每日历史，因此日曲线和 Top 列表的总和可以不同。`heat/reset` 中 `count` 是图片记录数，`stats` 是每日图片统计记录数，PV 和 UV 保持原值。

资源检查的 `stats` 为 `{missing:{original,thumb}, orphans:{original,thumb}}`。缺失数量按记录的原图或预览引用计数，孤立数量按磁盘文件计数；扫描范围为 `data/memes/original/` 和 `data/memes/thumb/`，不含上传队列。清理响应的 `removed` 为 `{original,thumb}`，`stats` 是清理后的重新检查结果。

## 状态码与重试

| HTTP 状态 | 含义与典型 `code` |
| --- | --- |
| 400 | JSON、字段、操作或当前记录状态不符合要求，如 `INVALID_BODY`、`INVALID_FIELDS`、`INVALID_STATE`、`INVALID_CONFIG`；文件校验也可能返回此状态 |
| 401 | 管理员或访客身份缺失、过期，或登录凭据错误，如 `UNAUTHORIZED`、`INVALID_CREDENTIALS`、`INVALID_INTERACTION` |
| 403 | 写请求来源不符，或交互凭据不属于当前访客、图片、操作，或凭据过期；分别为 `INVALID_ORIGIN`、`INVALID_INTERACTION` |
| 404 | 图片或标签不存在；交互图片未发布、原图缺失，或匿名读取私有媒体 |
| 409 | 重复标题、审核队列已满、标签名已存在或交互凭据已消费，如 `DUPLICATE_MEME`、`QUEUE_FULL`、`TAG_EXISTS`、`INVALID_INTERACTION` |
| 413 | 接收上传请求体时超过字节上限，`FILE_TOO_LARGE` |
| 429 | 总 API、登录、上传或交互限流；按 `Retry-After` 的秒数等待 |
| 500 | 数据库写入、文件操作或导出发生错误；响应包含错误码，进程日志保留原因 |

交互接口的格式错误、身份不符、失效和重复消费均使用 `INVALID_INTERACTION`，通过 HTTP 状态区分。遇到 401 时重新建立相应会话；凭据过期后重新申请；429 按返回的等待时间重试。复制确认和下载完成会原子消费令牌，409 表示该令牌已经被记录。下载流已开始后发生的错误体现为响应体读取失败，调用方在读完正文后再报告完成。
