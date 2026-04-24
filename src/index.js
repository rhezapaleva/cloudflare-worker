export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // Handle /secure - return authenticated user info
    if (path === "/secure") {
      return handleSecure(request);
    }

    // Handle /flags/:country - serve flag from R2
    if (path.startsWith("/flags/") && !path.startsWith("/flags-d1/")) {
      const country = path.split("/flags/")[1].toUpperCase();
      return handleFlagR2(country, env);
    }

    // Handle /flags-d1/:country - serve flag from D1
    if (path.startsWith("/flags-d1/")) {
      const country = path.split("/flags-d1/")[1].toUpperCase();
      return handleFlagD1(country, env);
    }

    return new Response("Not found", { status: 404 });
  },
};

async function handleSecure(request) {
  const email = request.headers.get("Cf-Access-Authenticated-User-Email") || "unknown@example.com";
  const country = request.headers.get("CF-IPCountry") || "SG";
  const timestamp = new Date().toISOString().replace("T", " ").split(".")[0] + " UTC";
  const flagUrl = `/flags/${country}`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Secure — Authenticated</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #0f1117; color: #e2e8f0;
      min-height: 100vh; display: flex;
      align-items: center; justify-content: center; padding: 2rem;
    }
    .card {
      background: #1a1d2e; border: 1px solid #2d3148;
      border-radius: 16px; padding: 2.5rem;
      max-width: 520px; width: 100%; text-align: center;
    }
    .icon { font-size: 2.5rem; margin-bottom: 1rem; }
    h1 { font-size: 1.4rem; font-weight: 700; color: #f6821f; margin-bottom: 1.5rem; }
    .info {
      background: #0f1117; border: 1px solid #2d3148;
      border-radius: 10px; padding: 1.25rem;
      font-size: 1rem; line-height: 1.8; color: #e2e8f0;
    }
    .info a { color: #f6821f; text-decoration: none; font-weight: 600; }
    .info a:hover { text-decoration: underline; }
    .badge {
      display: inline-block; margin-top: 1.5rem;
      background: #f6821f22; border: 1px solid #f6821f55;
      color: #f6821f; padding: 0.35rem 1rem;
      border-radius: 999px; font-size: 0.8rem;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">🔐</div>
    <h1>Authentication successful</h1>
    <div class="info">
      <strong>${email}</strong> authenticated at<br>
      ${timestamp}<br>
      from <a href="${flagUrl}">${country}</a>
    </div>
    <div class="badge">⚡ Secured by Cloudflare Access</div>
  </div>
</body>
</html>`;

  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

async function handleFlagR2(country, env) {
  if (!env.FLAGS_BUCKET) {
    return new Response("R2 bucket not configured", { status: 500 });
  }
  const extensions = ["png", "svg", "jpg", "gif"];
  for (const ext of extensions) {
    const key = `${country.toLowerCase()}.${ext}`;
    const object = await env.FLAGS_BUCKET.get(key);
    if (object) {
      const contentType = ext === "svg" ? "image/svg+xml" :
                          ext === "png" ? "image/png" :
                          ext === "jpg" ? "image/jpeg" : "image/gif";
      return new Response(object.body, {
        headers: { "Content-Type": contentType },
      });
    }
  }
  return new Response(`Flag not found for country: ${country}`, { status: 404 });
}

async function handleFlagD1(country, env) {
  if (!env.FLAGS_DB) {
    return new Response("D1 database not configured", { status: 500 });
  }
  const result = await env.FLAGS_DB.prepare(
    "SELECT flag_data, content_type FROM flags WHERE country_code = ?"
  ).bind(country).first();

  if (!result) {
    return new Response(`Flag not found for country: ${country}`, { status: 404 });
  }

  const binaryData = Uint8Array.from(atob(result.flag_data), c => c.charCodeAt(0));
  return new Response(binaryData, {
    headers: { "Content-Type": result.content_type },
  });
}