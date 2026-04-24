# Cloudflare Worker — Guestbook Assessment (Part 3)

A Cloudflare Worker built with Wrangler CLI for the Cloudflare Associate SE take-home assessment.

## Overview

This Worker handles three endpoints on `rhezapaleva.org`:

| Endpoint | Description |
|---|---|
| `/secure` | Returns authenticated user identity as HTML |
| `/flags/:country` | Serves country flag image from R2 bucket |
| `/flags-d1/:country` | Serves country flag image from D1 database |

## Architecture

```
User → Cloudflare Access (Zero Trust) → Worker
                                          ↓
                              /secure → reads CF-Access JWT headers
                                          ↓
                              /flags/:country → reads from R2 bucket
                                          ↓
                              /flags-d1/:country → reads from D1 database
```

## `/secure` Response

When an authenticated user visits `/secure`, the Worker returns an HTML page showing:

> **EMAIL** authenticated at **TIMESTAMP** from **COUNTRY**

Where `COUNTRY` is a clickable HTML link to `/flags/:country` which displays the country flag.

The email is extracted from the `Cf-Access-Authenticated-User-Email` header injected by Cloudflare Access after the user authenticates via GitHub SSO.

## Storage Bindings

### R2 Bucket (`FLAGS_BUCKET`)

- **Bucket name:** `flags-bucket`
- **Contents:** 255 country flag PNG images (1000px)
- **Naming convention:** `{country_code_lowercase}.png` (e.g. `sg.png`, `us.png`)
- **Endpoint:** `/flags/:country`

### D1 Database (`FLAGS_DB`)

- **Database name:** `flags-db`
- **Table:** `flags`
- **Schema:**

```sql
CREATE TABLE flags (
    country_code TEXT PRIMARY KEY,
    content_type TEXT NOT NULL,
    flag_data    TEXT NOT NULL  -- base64-encoded PNG
);
```

- **Contents:** 255 country flags stored as base64-encoded strings
- **Endpoint:** `/flags-d1/:country`

## Local Development

```bash
# Install dependencies
npm install

# Run locally
npm run dev

# Visit http://localhost:8787/secure
```

## Deployment

```bash
# Deploy to Cloudflare
wrangler deploy
```

## Setup

### 1. Create R2 bucket

```bash
wrangler r2 bucket create flags-bucket
```

### 2. Upload flag images to R2

```bash
for file in png1000px/*.png; do
  country=$(basename "$file" .png)
  wrangler r2 object put "flags-bucket/${country}.png" --file "$file" --remote
done
```

### 3. Create D1 database

```bash
wrangler d1 create flags-db
```

### 4. Create flags table

```bash
wrangler d1 execute flags-db --remote --command "CREATE TABLE IF NOT EXISTS flags (country_code TEXT PRIMARY KEY, flag_data TEXT NOT NULL, content_type TEXT NOT NULL);"
```

### 5. Insert flags into D1

Due to SQLite's statement length limit (`SQLITE_TOOBIG`), flags must be inserted individually using parameterized queries via the D1 REST API rather than inline SQL strings.

```bash
node insert_missing_flags.js
```

## Key Technical Notes

### Why both R2 and D1?

The assessment demonstrates two different Cloudflare storage approaches:

- **R2** — object storage, ideal for binary files like images. Simple and efficient.
- **D1** — SQL database, stores images as base64 text. Useful when you need queryable metadata alongside the asset.

### D1 `SQLITE_TOOBIG` workaround

Large flag images (e.g. `gb-wls.png` at 144KB, `vi.png` at 152KB) exceed SQLite's maximum SQL statement length when base64-encoded inline. The solution is to use the D1 REST API with parameterized queries — the SQL string stays small (~80 chars) while the large data is passed as a bound parameter.

### Cloudflare Access JWT

The `/secure` endpoint reads the `Cf-Access-Authenticated-User-Email` header which is automatically injected by Cloudflare Access after the user authenticates. This header is cryptographically signed and cannot be spoofed.

### Worker Routes

The Worker handles these routes on `rhezapaleva.org`:

- `rhezapaleva.org/secure`
- `rhezapaleva.org/flags/*`
- `rhezapaleva.org/flags-d1/*`

## Repository

- **Flask origin server:** https://github.com/rhezapaleva/Cloudflare-assessment
- **Cloudflare Worker:** https://github.com/rhezapaleva/cloudflare-worker
