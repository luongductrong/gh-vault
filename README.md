# gh-vault

> **Serverless Image & Asset CDN Vault** - Turn GitHub Repositories into free, high-performance CDN storage buckets with client-side image compression, format conversion, and permanent edge caching.

[![SvelteKit](https://img.shields.io/badge/SvelteKit-2.x-FF3E00?logo=svelte)](https://kit.svelte.dev/)
[![Svelte](https://img.shields.io/badge/Svelte-5_Runes-FF3E00?logo=svelte)](https://svelte.dev/)
[![TailwindCSS](https://img.shields.io/badge/Tailwind_CSS-v4-06B6D4?logo=tailwindcss)](https://tailwindcss.com/)
[![Drizzle ORM](https://img.shields.io/badge/Drizzle_ORM-SQLite%2FTurso-C5F74F?logo=drizzle)](https://orm.drizzle.team/)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D24-339933?logo=node.js)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-%3E%3D11-F69220?logo=pnpm)](https://pnpm.io/)

---

## Table of Contents

- [Overview & Architecture](#overview--architecture)
- [Key Features](#key-features)
- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [GitHub Token & Account Types (Personal vs Organization)](#github-token--account-types)
- [Getting Started & Local Development](#getting-started--local-development)
- [Environment Variables (.env)](#environment-variables-env)
- [Database Management (Drizzle ORM)](#database-management-drizzle-orm)
- [API Reference](#api-reference)
- [Security & Authentication](#security--authentication)
- [Deployment (Netlify)](#deployment-netlify)
- [Important Caveats & Limitations](#important-caveats--limitations)
- [License](#license)

---

## Overview & Architecture

**gh-vault** allows developers and teams to manage media assets without paying for expensive S3-compatible cloud storage. It organizes storage repositories ("vaults") under personal GitHub profiles or GitHub Organizations, commits uploaded files via GitHub REST APIs, and serves them worldwide through jsDelivr CDN.

```
[ Browser / Client ]
       │
       ├─ (1) Client-side image preprocessing (Resize, WebP / JPG convert, quality slider)
       │
       ▼
[ SvelteKit Server (Backend Endpoints) ]
       │
       ├─ (2) Session verification (JWT HttpOnly Cookie) & Bucket quota checks
       ├─ (3) Commit file via GitHub Contents API
       ▼
[ GitHub Repository (Personal or Org Bucket) ]
       │
       ├─ (4) Retrieve commit SHA & construct immutable jsDelivr CDN URL
       ▼
[ LibSQL / Turso Database ]  <─── Store metadata (CDN URL, file size, commit SHA, mime type)
       │
       ▼
[ jsDelivr Global CDN ] ─── High-speed distribution via `cdn.jsdelivr.net/gh/:owner/:repo@:commitSha/:path`
```

---

## Key Features

- **Personal & Organization Support**: Host vaults under either your personal GitHub account (`GITHUB_OWNER_TYPE="P"`) or a GitHub Organization (`GITHUB_OWNER_TYPE="O"`).
- **Multi-Vault Architecture**: Create and isolate multiple buckets. Each vault corresponds to a dedicated public GitHub repository (`vault-<uuid>`) provisioned automatically via API.
- **Immutable CDN Delivery**: URLs pin the specific Git `commit_sha` (`:owner/:repo@:commitSha/:path`). Content is permanently cached on jsDelivr's global edge network without stale cache issues.
- **Client-Side Image Optimization**:
  - Convert image formats instantly to **WEBP** or **JPG**.
  - Interactive **Quality Slider** (10% to 100%).
  - Real-time **Image Resizing** (maintains original aspect ratio).
  - Side-by-side **Before & After preview** with immediate file size calculation before upload.
- **Secure Session Authentication**: Password-protected vault management with signed HMAC-SHA256 JWT sessions stored in `HttpOnly`, `SameSite=Strict`, `Secure` cookies.
- **Modern Reactive UI**:
  - Built with **Svelte 5 Runes** (`$state`, `$derived`, `$effect`, `$props`, snippets).
  - Powered by **TanStack Query v6** (`@tanstack/svelte-query`) for instant cache invalidation, pagination, and infinite scrolling.
  - Styled with **Tailwind CSS v4** and accessible components from **Bits UI / shadcn-svelte**.

---

## Tech Stack

| Component            | Technology                                                                                                    | Description                                                 |
| :------------------- | :------------------------------------------------------------------------------------------------------------ | :---------------------------------------------------------- |
| **Framework**        | [SvelteKit 2](https://kit.svelte.dev/) + [Svelte 5](https://svelte.dev/)                                      | Modern full-stack application with Svelte 5 Runes           |
| **Styling & UI**     | [Tailwind CSS v4](https://tailwindcss.com/), [Bits UI](https://bits-ui.com/), [Lucide](https://lucide.dev/)   | Clean, accessible, composable interface                     |
| **State & Cache**    | [TanStack Svelte Query v6](https://tanstack.com/query/latest)                                                 | Server state synchronization, infinite loading & caching    |
| **Database & ORM**   | [Drizzle ORM](https://orm.drizzle.team/) + [LibSQL Client](https://github.com/tursodatabase/libsql-client-ts) | Turso SQLite edge database & local SQLite support           |
| **Authentication**   | [jose](https://github.com/panva/jose)                                                                         | Lightweight, standards-compliant JWT signing & verification |
| **File Storage**     | GitHub REST API v3                                                                                            | Repository creation & Git Contents commit API               |
| **Edge CDN**         | [jsDelivr](https://www.jsdelivr.com/)                                                                         | Free, multi-CDN delivery pinned to Git commits              |
| **Bundler & Deploy** | [Vite 8](https://vitejs.dev/) + `@sveltejs/adapter-netlify`                                                   | Production-ready serverless build                           |

---

## Prerequisites

- **Node.js**: `>= 24.x` (recommended)
- **pnpm**: `>= 11.x` (recommended)
- **Database**: [Turso Database](https://turso.tech/) account (or local SQLite)
- **GitHub Account**: Personal account or GitHub Organization with fine-grained PAT

---

## GitHub Token & Account Types

`gh-vault` supports creating and managing vaults under **Personal Accounts** or **GitHub Organizations** via the `GITHUB_OWNER_TYPE` environment variable.

### 1. Account Types (`GITHUB_OWNER_TYPE`)

| Value | Mode                     | GitHub API Endpoint Used  | Description                                                                                                    |
| :---: | :----------------------- | :------------------------ | :------------------------------------------------------------------------------------------------------------- |
|  `P`  | **Personal** _(Default)_ | `POST /user/repos`        | Repositories are created directly under your personal GitHub account (`github.com/<your-username>/vault-...`). |
|  `O`  | **Organization**         | `POST /orgs/:owner/repos` | Repositories are created under a designated GitHub Organization (`github.com/<org-name>/vault-...`).           |

### 2. Required GitHub Fine-grained PAT Permissions

Create a token at [GitHub Settings > Personal Access Tokens > Fine-grained tokens](https://github.com/settings/tokens?type=beta):

- **Resource Owner**:
  - For `GITHUB_OWNER_TYPE="P"`: Select your personal user account.
  - For `GITHUB_OWNER_TYPE="O"`: Select the target GitHub Organization.
- **Repository Access**:
  - Select **All repositories** (required because new vault repos are created dynamically at runtime).
- **Repository Permissions**:
  - `Administration`: **Read and write** _(Required to create repository buckets)_
  - `Contents`: **Read and write** _(Required to upload and commit files)_
  - `Metadata`: **Read-only** _(Required default)_

> [!NOTE]
> If using an **Organization** (`O`), ensure your user role in that organization has rights to create repositories, or that your Fine-grained PAT request has been approved by the organization administrator.

---

## Getting Started & Local Development

### 1. Clone the repository

```bash
git clone https://github.com/your-username/gh-vault.git
cd gh-vault
```

### 2. Install dependencies

```bash
pnpm install
```

### 3. Configure environment variables

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Fill in your configuration:

```env
# Database (Turso LibSQL or local SQLite)
DATABASE_URL="libsql://your-db-name-user.turso.io"
DATABASE_AUTH_TOKEN="your-turso-auth-token"

# GitHub Configuration
GITHUB_PAT="github_pat_xxxxxxxxxxxx"
GITHUB_OWNER="your-github-username-or-org"
GITHUB_OWNER_TYPE="P"   # "P" for Personal, "O" for Organization

# Application Authentication
APP_PASSWORD="choose-a-strong-password"
APP_JWT_SECRET="generate-a-random-64-character-hex-string"
```

> [!TIP]
> Generate a strong 64-character hex secret for `APP_JWT_SECRET`:
>
> ```bash
> node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
> ```

### 4. Push database schema

```bash
# Push schema directly to your database
pnpm db:push

# (Optional) Launch Drizzle Studio web UI to inspect tables
pnpm db:studio
```

### 5. Start the development server

```bash
pnpm dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## Environment Variables (.env)

| Variable              | Description                                      | Example                     |       Required        |
| :-------------------- | :----------------------------------------------- | :-------------------------- | :-------------------: |
| `DATABASE_URL`        | Connection URL for Turso / LibSQL SQLite         | `libsql://db-user.turso.io` |        **Yes**        |
| `DATABASE_AUTH_TOKEN` | Authentication token for Turso database          | `eyJhbGci...`               | **Yes** _(for Turso)_ |
| `GITHUB_PAT`          | Fine-grained Personal Access Token               | `github_pat_11AB...`        |        **Yes**        |
| `GITHUB_OWNER`        | GitHub Username or Organization Name             | `acme-corp` or `octocat`    |        **Yes**        |
| `GITHUB_OWNER_TYPE`   | Owner type: `P` (Personal) or `O` (Organization) | `P` or `O`                  |  No _(Default: `P`)_  |
| `APP_PASSWORD`        | Master password to log in to the vault UI        | `Secret@2026`               |        **Yes**        |
| `APP_JWT_SECRET`      | 64-character hex secret for signing session JWTs | `a8f3b29c...`               |        **Yes**        |

---

## Database Management (Drizzle ORM)

Database schemas are defined in `src/lib/server/db/schema.ts`:

- **`buckets`**: Tracks vault records, GitHub repo references, file count, and byte capacities.
- **`files`**: Stores individual asset metadata including CDN URLs, commit SHAs, file SHAs, MIME types, and sizes.

Useful CLI commands:

```bash
# Sync schema definitions directly to database
pnpm db:push

# Generate SQL migration files
pnpm db:generate

# Apply pending migration files
pnpm db:migrate

# Open Drizzle Studio dashboard in browser
pnpm db:studio
```

---

## API Reference

All endpoints (except `/api/auth/login`) require a valid `session_token` cookie set upon authentication.

### 1. Authentication

#### `POST /api/auth/login`

Authenticate using the master password.

- **Request Body**:
  ```json
  {
  	"password": "your-password"
  }
  ```
- **Response** (`200 OK`): Sets an `HttpOnly`, `SameSite=Strict`, `Secure` cookie named `session_token` valid for 24 hours.

#### `POST /api/auth/logout`

Log out and clear the session cookie.

- **Response** (`200 OK`): Deletes `session_token` cookie.

---

### 2. Vaults / Buckets

#### `GET /api/buckets`

List all created vaults.

- **Query Parameters**:
  - `status` _(optional)_: Filter by status (`available` | `full`)
- **Response** (`200 OK`):
  ```json
  {
  	"data": [
  		{
  			"id": "c7a8b412-...",
  			"githubRepoName": "vault-c7a8b412",
  			"githubRepoFullName": "octocat/vault-c7a8b412",
  			"displayName": "Blog Assets",
  			"fileCount": 12,
  			"totalSizeBytes": 4521940,
  			"maxFiles": 500,
  			"maxSizeBytes": 1073741824,
  			"status": "available",
  			"createdAt": "2026-09-05T12:00:00.000Z",
  			"updatedAt": "2026-09-05T12:15:00.000Z"
  		}
  	],
  	"total": 1
  }
  ```

#### `POST /api/buckets`

Create a new vault and automatically provision a new GitHub repository under the owner.

- **Request Body**:
  ```json
  {
  	"display_name": "Product Photos"
  }
  ```
- **Response** (`201 Created`): Returns newly created bucket record.

#### `GET /api/buckets/:id`

Get detailed statistics for a single vault.

- **Response** (`200 OK`): Bucket object with storage and file metrics.

---

### 3. Files

#### `GET /api/buckets/:id/files`

List files in a vault with pagination and search.

- **Query Parameters**:
  - `offset` _(optional, default: `0`)_: Pagination offset.
  - `limit` _(optional, default: `20`)_: Items per page.
  - `search` _(optional)_: Search query matching filename, file ID, or MIME type.
  - `sortBy` _(optional, default: `createdAt`)_: `createdAt` | `sizeBytes`.
  - `sortOrder` _(optional, default: `desc`)_: `desc` | `asc`.
- **Response** (`200 OK`):
  ```json
  {
  	"data": [
  		{
  			"id": "912a7d21-...",
  			"bucketId": "c7a8b412-...",
  			"originalName": "hero.webp",
  			"storedName": "a8c91d4e_1725537600000.webp",
  			"githubPath": "images/a8c91d4e_1725537600000.webp",
  			"githubFileSha": "7f8b9...",
  			"commitSha": "3e4a2...",
  			"cdnUrl": "https://cdn.jsdelivr.net/gh/octocat/vault-c7a8b412@3e4a2.../images/a8c91d4e_1725537600000.webp",
  			"sizeBytes": 142800,
  			"mimeType": "image/webp",
  			"createdAt": "2026-09-05T12:10:00.000Z"
  		}
  	],
  	"hasNextPage": false,
  	"nextOffset": 20
  }
  ```

#### `POST /api/buckets/:id/files`

Upload a new file directly to GitHub and register its CDN URL.

- **Request Body**:
  ```json
  {
  	"filename": "banner.webp",
  	"mime_type": "image/webp",
  	"content": "<raw_base64_string_without_data_uri_prefix>"
  }
  ```
- **Constraints**: Maximum file size is **4MB**.
- **Response** (`201 Created`): Returns registered `FileItem` object containing `cdnUrl`.

---

## Security & Authentication

- **Isolated Secrets**: Your `GITHUB_PAT` and `APP_PASSWORD` remain securely on the server side; they are never exposed to client browsers.
- **Session Tokens**: Authenticated sessions use signed JWT tokens (HS256) stored inside secure, HttpOnly, SameSite cookies.
- **Rate Limit Protection**: Incoming GitHub API responses are parsed for `x-ratelimit-remaining`. Warnings are logged when capacity drops below 100, and graceful exceptions prevent quota ban.

---

## Deployment (Netlify)

This project is configured out of the box with `@sveltejs/adapter-netlify`.

1. Push your code to your GitHub repository.
2. Link your repository in [Netlify](https://www.netlify.com/).
3. In **Site configuration > Environment variables**, configure:
   - `DATABASE_URL`
   - `DATABASE_AUTH_TOKEN`
   - `GITHUB_PAT`
   - `GITHUB_OWNER`
   - `GITHUB_OWNER_TYPE` (`P` or `O`)
   - `APP_PASSWORD`
   - `APP_JWT_SECRET`
4. Build Settings:
   - **Build command**: `pnpm build`
   - **Publish directory**: `.netlify`

---

## Important Caveats & Limitations

1. **Public Repository Visibility**:
   - jsDelivr can only index and deliver files from **public repositories**. All repositories created by `gh-vault` are public by design.
   - **Never use gh-vault to store sensitive, confidential, or private personal data.**
2. **4MB File Size Limit**:
   - The 4MB upload cap complies with Serverless Function payload boundaries (Netlify / Vercel) and accounts for the ~33% Base64 encoding overhead across HTTP requests.
3. **GitHub API Rate Limits**:
   - Authenticated GitHub PAT requests are capped at **5,000 requests per hour**. Batch uploading thousands of files in rapid succession may exhaust your hourly limit.

---

## License

Copyright (c) 2026. All rights reserved.

You are welcome to reference, study, and take inspiration from the architectural concepts, system design, and ideas presented in this project. However, copying, reproducing, redistributing, modifying, or using the underlying source code (in whole or in part) for personal or commercial software without prior written permission is strictly prohibited.
