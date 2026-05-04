# Nyaovo Random Image API

[中文](./README.md) | [English](./README_en.md)

一个自托管的随机图片 API，带管理后台。基于 Node.js + Express，无需数据库，图片存在本地文件系统。适合个人图床、壁纸站等场景。

## 功能

- 多图库管理，支持 `pc`（横屏）和 `mobile`（竖屏）分类
- 随机图 API，支持返回图片本体或 JSON
- 管理后台：上传、预览、筛选、排序、批量删除
- 上传时校验真实文件头，拒绝危险文件类型
- Cookie Session、CSRF、Helmet、限流、CORS

## 路径约定

应用挂载在 `/image` 子路径下：

| 路径 | 用途 |
|------|------|
| `/image` | 首页 |
| `/image/admin` | 管理后台 |
| `/image/images/...` | 图片静态访问 |
| `/image/api/...` | API 接口 |

## 部署

### Docker Hub 镜像（推荐）

镜像地址：`docker.io/charyeahowo/nyaovo-random-image-api:latest`

每次 push 到 `main` 分支会通过 GitHub Actions 自动构建并推送。

<details>
<summary><b>docker compose 部署（点击展开）</b></summary>

创建 `docker-compose.yml`，复制以下内容，修改 `ADMIN_PASSWORD` 和 `SESSION_SECRET`：

```yaml
services:
  nyaovo-random-image-api:
    image: charyeahowo/nyaovo-random-image-api:latest
    container_name: nyaovo-random-image-api
    ports:
      - "3400:3000"
    volumes:
      - ./images:/app/public/images
    environment:
      PORT: 3000
      PUBLIC_BASE_URL: http://localhost:3400
      IMAGE_ROOT: public/images
      CACHE_TTL_SECONDS: 60
      RATE_LIMIT_WINDOW_MS: 60000
      RATE_LIMIT_MAX: 120
      ADMIN_USERNAME: admin
      ADMIN_PASSWORD: changeme          # ← 务必修改
      SESSION_SECRET: please-change-this # ← 务必修改
      ADMIN_PATH: /image/admin
      MAX_FILE_SIZE_MB: 10
      MAX_UPLOAD_FILES: 20
      CORS_ORIGIN: "*"
    restart: unless-stopped
```

```bash
docker compose up -d
```

> 容器启动时会自动修复 `./images` 目录权限，无需手动 chown。
> 如果是从旧版本升级，首次启动可能需要几秒完成权限修复。

访问 `http://localhost:3400/image`，后台 `http://localhost:3400/image/admin`。

</details>

<details>
<summary><b>docker run 部署（点击展开）</b></summary>

```bash
docker run -d \
  --name nyaovo \
  -p 3400:3000 \
  -v ./images:/app/public/images \
  -e ADMIN_PASSWORD=your-password \
  -e SESSION_SECRET=your-secret \
  -e PUBLIC_BASE_URL=http://localhost:3400 \
  --restart unless-stopped \
  charyeahowo/nyaovo-random-image-api:latest
```

> 挂载的 `images` 目录需要写权限，不要加 `:ro`。

</details>

<details>
<summary><b>本地构建部署（点击展开）</b></summary>

```bash
git clone https://github.com/charyeahowo/nyaovo-random-image-api.git
cd nyaovo-random-image-api

cp .env.example .env
# 编辑 .env，至少修改 ADMIN_PASSWORD 和 SESSION_SECRET

docker compose up -d --build
```

如需使用本地构建而非远程镜像，将 `docker-compose.yml` 中的 `image` 行替换为：

```yaml
build:
  context: .
  dockerfile: Dockerfile
```

</details>

<details>
<summary><b>1Panel 部署（点击展开）</b></summary>

1. 新建 Docker Compose 编排，上传项目或 Git 拉取
2. 使用项目自带 `docker-compose.yml`，创建 `.env` 文件填写环境变量
3. 启动后在 OpenResty / Nginx 配置反向代理绑定域名

</details>

### 本地运行

```bash
npm install
cp .env.example .env   # 编辑配置
npm start               # 或 npm run dev 热更新
```

默认账号 `admin`，默认密码 `changeme`。

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | `3000` | 容器内监听端口 |
| `PUBLIC_BASE_URL` | `http://localhost:3000` | JSON 返回的 URL 前缀 |
| `IMAGE_ROOT` | `public/images` | 图片存放目录 |
| `CACHE_TTL_SECONDS` | `60` | 缓存刷新间隔（秒） |
| `RATE_LIMIT_WINDOW_MS` | `60000` | 限流窗口（毫秒） |
| `RATE_LIMIT_MAX` | `120` | 窗口内最大请求数 |
| `ADMIN_USERNAME` | `admin` | 用户名 |
| `ADMIN_PASSWORD` | `changeme` | 密码 |
| `SESSION_SECRET` | `please-change-this` | Session 密钥 |
| `ADMIN_PATH` | `/image/admin` | 后台路径 |
| `MAX_FILE_SIZE_MB` | `10` | 单文件大小限制（MB） |
| `MAX_UPLOAD_FILES` | `20` | 单次批量上传数量 |
| `CORS_ORIGIN` | `*` | CORS 允许来源 |

## 目录结构

```text
.
├── src
│   ├── index.js
│   ├── config.js
│   ├── imageStore.js
│   ├── routes/
│   ├── middleware/
│   └── utils/
├── public
│   ├── images/           # 图片存储
│   │   └── {gallery}/
│   │       ├── pc/
│   │       └── mobile/
│   └── assets/           # CSS, JS
├── views/                # HTML 模板
├── Dockerfile
├── docker-compose.yml
└── package.json
```

## API

### `GET /image/api/random`

随机返回一张图片。

参数：
- `gallery` — 图库名
- `device` — `pc` / `mobile` / `all`
- `type` — `image`（默认）/ `json` / `redirect`

```
/image/api/random?gallery=anime&device=pc&type=json
```

JSON 响应：
```json
{
  "url": "https://example.com/image/images/anime/pc/001.webp",
  "gallery": "anime",
  "device": "pc",
  "filename": "001.webp",
  "size": 123456,
  "width": 1920,
  "height": 1080,
  "type": "webp",
  "total": 12
}
```

### 其他接口

| 接口 | 说明 |
|------|------|
| `GET /image/api/:gallery` | 指定图库快捷接口 |
| `GET /image/api/galleries` | 图库统计 |
| `GET /image/api/list` | 分页图片列表 |
| `GET /image/api/stats` | 全局统计 |
| `GET /image/health` | 健康检查 |

## 图片管理

- 支持格式：jpg, jpeg, png, webp, gif, avif
- 上传时自动识别真实格式，扩展名错误也会纠正
- 图库名仅支持小写字母、数字、下划线、短横线
- 也可直接把图片放入 `public/images/{gallery}/pc` 或 `mobile` 目录，程序会自动扫描

## 安全提醒

- 部署前务必修改 `ADMIN_PASSWORD` 和 `SESSION_SECRET`
- 建议修改 `ADMIN_PATH` 为不易猜到的路径
- 反代中可为后台路径添加 IP 白名单或 Basic Auth
- 请勿上传未授权图片用于公开服务

## 开源协议

[MIT License](./LICENSE)
