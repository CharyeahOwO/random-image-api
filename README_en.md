# Nyaovo Random Image API

[中文](./README.md) | [English](./README_en.md)

![Node](https://img.shields.io/badge/Node.js-43853D.svg?logo=node.js&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-ready-2496ED?logo=docker&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-yellow)
![Tests](https://img.shields.io/badge/Tests-passing-brightgreen)

A self-hosted random image API with an admin panel. Built on Node.js + Express, no database required. Images are stored on the local filesystem. Suitable for personal image hosting and wallpaper sites.

## Features

- Multi-gallery management with `pc` (landscape) and `mobile` (portrait) categories
- Random image API returning raw image or JSON
- Admin panel: upload, preview, filter, sort, batch delete
- File header validation on upload, rejects dangerous file types
- Cookie Session, CSRF, Helmet, Rate Limiting, CORS

## Routing

The app is mounted under the `/image` subpath:

| Path | Purpose |
|------|---------|
| `/image` | Home |
| `/image/admin` | Admin panel |
| `/image/images/...` | Static image access |
| `/image/api/...` | API endpoints |

## Deployment

### Docker Hub Image (Recommended)

Image: `docker.io/charyeahowo/nyaovo-random-image-api:latest`

Auto-built and pushed via GitHub Actions on every push to `main`.

<details>
<summary><b>docker compose (click to expand)</b></summary>

Create `docker-compose.yml`, copy the content below, and change `ADMIN_PASSWORD` and `SESSION_SECRET`:

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
      ADMIN_PASSWORD: changeme          # ← must change
      SESSION_SECRET: please-change-this # ← must change
      ADMIN_PATH: /image/admin
      MAX_FILE_SIZE_MB: 10
      MAX_UPLOAD_FILES: 20
      CORS_ORIGIN: "*"
    restart: unless-stopped
```

```bash
docker compose up -d
```

> The container auto-fixes `./images` directory permissions on startup. No manual chown needed.

Access at `http://localhost:3400/image`, admin at `http://localhost:3400/image/admin`.

</details>

<details>
<summary><b>docker run (click to expand)</b></summary>

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

> The `images` volume must be writable. Do not use `:ro`.

</details>

<details>
<summary><b>Local build (click to expand)</b></summary>

```bash
git clone https://github.com/charyeahowo/nyaovo-random-image-api.git
cd nyaovo-random-image-api

cp .env.example .env
# Edit .env, at minimum change ADMIN_PASSWORD and SESSION_SECRET

docker compose up -d --build
```

To use local build instead of remote image, replace the `image` line in `docker-compose.yml` with:

```yaml
build:
  context: .
  dockerfile: Dockerfile
```

</details>

<details>
<summary><b>1Panel (click to expand)</b></summary>

1. Create a Docker Compose stack, upload project or clone via Git
2. Use the included `docker-compose.yml`, create `.env` file with your variables
3. After starting, configure a reverse proxy in OpenResty / Nginx to bind your domain

</details>

### Local

```bash
npm install
cp .env.example .env   # edit config
npm start               # or npm run dev for hot reload
```

Default credentials: `admin` / `changeme`.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Internal server port |
| `PUBLIC_BASE_URL` | `http://localhost:3000` | URL prefix for JSON responses |
| `IMAGE_ROOT` | `public/images` | Image storage directory |
| `CACHE_TTL_SECONDS` | `60` | Cache refresh interval (seconds) |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Rate limit window (ms) |
| `RATE_LIMIT_MAX` | `120` | Max requests per window |
| `ADMIN_USERNAME` | `admin` | Admin username |
| `ADMIN_PASSWORD` | `changeme` | Admin password |
| `SESSION_SECRET` | `please-change-this` | Session secret key |
| `ADMIN_PATH` | `/image/admin` | Admin panel path |
| `MAX_FILE_SIZE_MB` | `10` | Max file size per upload (MB) |
| `MAX_UPLOAD_FILES` | `20` | Max files per batch upload |
| `CORS_ORIGIN` | `*` | Allowed CORS origins |

## Project Structure

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
│   ├── images/           # Image storage
│   │   └── {gallery}/
│   │       ├── pc/
│   │       └── mobile/
│   └── assets/           # CSS, JS
├── views/                # HTML templates
├── Dockerfile
├── docker-compose.yml
└── package.json
```

## API

### `GET /image/api/random`

Returns a random image. Supports flexible parameter combinations for different use cases.

| Parameter | Values | Default | Description |
|-----------|--------|---------|-------------|
| `gallery` | Gallery name | All | Target gallery |
| `device` | `pc` / `mobile` / `all` | `all` | Device type |
| `type` | `image` / `json` / `redirect` | `image` | Response format |

**Response format details:**

| type | Response | Content-Type |
|------|----------|-------------|
| `image` | Raw image binary | `image/*` |
| `json` | Image metadata JSON | `application/json` |
| `redirect` | 302 redirect to image URL | - |

**JSON response example:**

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

### API Examples

| Endpoint | Use Case |
|----------|----------|
| `GET /image/api/random` | Random image from any gallery, ideal for site-wide random backgrounds |
| `GET /image/api/random?gallery=anime` | Random image from a specific gallery, ideal for category-based wallpaper rotation |
| `GET /image/api/random?gallery=anime&device=pc` | Gallery + landscape, ideal for desktop backgrounds |
| `GET /image/api/random?gallery=anime&device=mobile` | Gallery + portrait, ideal for mobile backgrounds |
| `GET /image/api/random?type=json` | Image metadata for custom frontend rendering |
| `GET /image/api/random?type=redirect` | 302 redirect, ideal for `<img src>` direct embedding |
| `GET /image/api/:gallery` | Gallery shortcut, equivalent to `?gallery=xxx` |
| `GET /image/api/galleries` | All gallery statistics, ideal for admin dashboards |
| `GET /image/api/list?limit=100` | Paginated image list, ideal for backend management |
| `GET /image/api/stats` | Global statistics, ideal for monitoring dashboards |
| `GET /image/health` | Health check, ideal for Docker/K8s probes |

### Image Management

- Supported formats: jpg, jpeg, png, webp, gif, avif
- Real file format is detected on upload; wrong extensions are corrected
- Gallery names: lowercase letters, numbers, underscores, hyphens only
- You can also drop images into `public/images/{gallery}/pc` or `mobile` directly; the app will pick them up automatically

## Security

- Change `ADMIN_PASSWORD` and `SESSION_SECRET` before deploying
- Consider using a custom `ADMIN_PATH` that is hard to guess
- Add IP whitelist or Basic Auth for the admin path in your reverse proxy
- Do not host unauthorized images for public access

## License

[MIT License](./LICENSE)
