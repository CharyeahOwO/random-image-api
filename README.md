# Nyaovo Random Image API

[中文](./README.md) | [English](./README_en.md)

![Node](https://img.shields.io/badge/Node.js-43853D.svg?logo=node.js&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-ready-2496ED?logo=docker&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-yellow)
![Tests](https://img.shields.io/badge/Tests-passing-brightgreen)

一个自托管的随机图片 API，带管理后台。基于 Node.js + Express，无需数据库，图片存在本地文件系统。适合个人图床、壁纸站等场景。

## 功能

- 多图库管理，支持 `pc`（横屏）和 `mobile`（竖屏）分类
- 随机图 API，默认 302 跳转到图片文件，并支持返回图片本体或 JSON
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

随机返回一张图片。默认 302 跳转到真实图片文件，适合 CDN 缓存 `/image/images/...` 下的图片资源；随机入口本身不应被缓存。支持参数组合，灵活适配不同场景。

| 参数 | 可选值 | 默认值 | 说明 |
|------|--------|--------|------|
| `gallery` | 图库名 | 全部 | 指定图库 |
| `device` | `pc` / `mobile` / `all` | `all` | 设备类型 |
| `type` | `image` / `json` / `redirect` | `redirect` | 返回格式 |

**返回格式说明：**

| type | 返回内容 | Content-Type |
|------|----------|-------------|
| `image` | 图片二进制流 | `image/*` |
| `json` | 图片元数据 JSON | `application/json` |
| `redirect` | 302 跳转到图片 URL | - |

默认访问 `/image/api/random` 等价于 `/image/api/random?type=redirect`。如需直接返回图片本体，可使用 `?type=image`；如需 JSON，可使用 `?type=json`；如需显式跳转，可使用 `?type=redirect`。

**JSON 响应示例：**

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

### API 调用示例

| 接口 | 适用场景 |
|------|----------|
| `GET /image/api/random` | 默认 302 跳转到真实图片文件，适合 CDN 缓存图片路径 |
| `GET /image/api/random?gallery=anime` | 指定图库随机出图，适合分类壁纸轮播 |
| `GET /image/api/random?gallery=anime&device=pc` | 指定图库 + 横屏，适合桌面端背景 |
| `GET /image/api/random?gallery=anime&device=mobile` | 指定图库 + 竖屏，适合手机端背景 |
| `GET /image/api/random?type=json` | 获取图片元数据，适合前端自行渲染 |
| `GET /image/api/random?type=image` | 直接返回图片本体，适合不需要 CDN 跳转缓存的场景 |
| `GET /image/api/random?type=redirect` | 302 跳转，适合 `<img src>` 直接引用 |
| `GET /image/api/:gallery` | 图库快捷接口，等同于 `?gallery=xxx` |
| `GET /image/api/galleries` | 获取所有图库统计，适合管理面板展示 |
| `GET /image/api/list?limit=100` | 分页获取图片列表，适合后台管理 |
| `GET /image/api/stats` | 全局统计信息，适合监控面板 |
| `GET /image/health` | 健康检查，适合 Docker/K8s 探针 |

### 图片管理

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
