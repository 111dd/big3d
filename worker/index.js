/**
 * Cloudflare Worker - BIG 3D API
 * Handles: projects, images, site_logos, auth
 */

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const SESSION_COOKIE = '__Host-big3d_admin';
const SESSION_TTL_SECONDS = 12 * 60 * 60; // 12 hours

function getAllowedOrigins(env) {
  const raw = (env.ALLOWED_ORIGINS || '').trim();
  return raw ? raw.split(',').map(o => o.trim()).filter(Boolean) : [];
}

/** True only for origins listed explicitly (a '*' entry never counts for credentialed requests). */
function isExplicitlyAllowedOrigin(origin, env) {
  return !!origin && getAllowedOrigins(env).includes(origin);
}

function getCorsHeaders(origin, env) {
  const allowed = getAllowedOrigins(env);
  const allowOrigin = origin && allowed.length && (allowed.includes('*') || allowed.includes(origin))
    ? origin
    : (allowed[0] || '*');
  const headers = {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Key',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
  // The admin session cookie is only sent back to origins we list by name.
  if (isExplicitlyAllowedOrigin(origin, env)) headers['Access-Control-Allow-Credentials'] = 'true';
  return headers;
}

function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function base64url(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** HMAC key derived from ADMIN_API_KEY, so rotating the admin key also ends every session. */
async function getSessionKey(env) {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode('big3d-admin-session:' + env.ADMIN_API_KEY),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
}

async function signSession(payload, env) {
  const key = await getSessionKey(env);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return base64url(new Uint8Array(sig));
}

/** Session token: "v1.<expires-epoch-seconds>.<random>.<hmac>" */
async function createSessionToken(env) {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const nonce = base64url(crypto.getRandomValues(new Uint8Array(16)));
  const payload = `v1.${exp}.${nonce}`;
  return `${payload}.${await signSession(payload, env)}`;
}

async function isValidSessionToken(token, env) {
  const parts = (token || '').split('.');
  if (parts.length !== 4 || parts[0] !== 'v1') return false;
  const exp = parseInt(parts[1], 10);
  if (!exp || exp < Math.floor(Date.now() / 1000)) return false;
  const expected = await signSession(parts.slice(0, 3).join('.'), env);
  return timingSafeEqual(parts[3], expected);
}

function getCookie(request, name) {
  const header = request.headers.get('Cookie') || '';
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > -1 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

/**
 * HttpOnly so page scripts never see it. SameSite=None + Partitioned because the admin page
 * (big3d.co.il) and the Worker (*.workers.dev) are different sites; CSRF is handled by the
 * Origin check in isValidAdmin.
 */
function sessionCookie(value, maxAge) {
  return `${SESSION_COOKIE}=${value}; Max-Age=${maxAge}; Path=/; Secure; HttpOnly; SameSite=None; Partitioned`;
}

/**
 * Admin auth: either the X-Admin-Key header (scripts / curl) or the HttpOnly session cookie
 * issued by POST /admin/login. Cookie-authenticated writes must come from an allowed Origin.
 */
async function isValidAdmin(request, env) {
  const secret = env.ADMIN_API_KEY;
  if (!secret) return false;

  const headerKey = request.headers.get('X-Admin-Key');
  if (headerKey) return timingSafeEqual(headerKey, secret);

  const token = getCookie(request, SESSION_COOKIE);
  if (!token) return false;
  if (!['GET', 'HEAD'].includes(request.method)) {
    if (!isExplicitlyAllowedOrigin(request.headers.get('Origin'), env)) return false;
  }
  return isValidSessionToken(token, env);
}

/** Guard: returns 401 Response if invalid, null if allowed */
async function requireAdmin(request, env, cors) {
  if (!(await isValidAdmin(request, env))) {
    return errorResponse('Unauthorized', 401, cors);
  }
  return null;
}

async function login(request, env, cors) {
  const origin = request.headers.get('Origin');
  if (origin && !isExplicitlyAllowedOrigin(origin, env)) return errorResponse('Forbidden', 403, cors);

  const body = await request.json().catch(() => ({}));
  const secret = env.ADMIN_API_KEY;
  if (!secret || !timingSafeEqual(typeof body.key === 'string' ? body.key : '', secret)) {
    return errorResponse('Unauthorized', 401, cors);
  }
  const token = await createSessionToken(env);
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Set-Cookie': sessionCookie(token, SESSION_TTL_SECONDS),
      ...cors,
    },
  });
}

function logout(cors) {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Set-Cookie': sessionCookie('', 0),
      ...cors,
    },
  });
}

/**
 * Per-IP rate limit via a Workers Rate Limiting binding (see [[ratelimits]] in wrangler.toml).
 * Returns a 429 Response when over the limit, null otherwise. No binding (e.g. local dev) = no limit.
 */
async function rateLimit(limiter, request, cors) {
  if (!limiter) return null;
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const { success } = await limiter.limit({ key: ip });
  if (success) return null;
  return new Response(JSON.stringify({ error: 'Too many requests' }), {
    status: 429,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Retry-After': '60', ...cors },
  });
}

function jsonResponse(data, status = 200, cors = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors },
  });
}

function errorResponse(message, status = 400, cors = {}) {
  return jsonResponse({ error: message }, status, cors);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const cors = getCorsHeaders(origin, env);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: cors });
    }

    const path = url.pathname.replace(/^\/api/, '') || '/';

    try {
      const isPublic =
        ((path === '/' || path === '/projects') && request.method === 'GET') ||
        (path === '/site-logos' && request.method === 'GET') ||
        (path.match(/^\/storage\//) && request.method === 'GET');

      // Admin routes are limited before the key check, so this also caps key guessing.
      const limited = await rateLimit(isPublic ? env.PUBLIC_RATE_LIMITER : env.ADMIN_RATE_LIMITER, request, cors);
      if (limited) return limited;

      if (path === '/' || path === '/projects') {
        if (request.method === 'GET') return await getProjects(env, cors);
      }
      if (path === '/site-logos' && request.method === 'GET') {
        return await getActiveLogo(env, cors);
      }
      const storageMatch = path.match(/^\/storage\/(.+)$/);
      if (storageMatch && request.method === 'GET') {
        return await serveStorage(storageMatch[1], request, env, cors);
      }

      if (path === '/admin/login' && request.method === 'POST') {
        return await login(request, env, cors);
      }
      if (path === '/admin/logout' && request.method === 'POST') {
        return logout(cors);
      }

      const authError = await requireAdmin(request, env, cors);
      if (authError) return authError;

      if (path === '/admin/me' && request.method === 'GET') {
        return jsonResponse({ ok: true }, 200, cors);
      }

      if (path === '/projects' && request.method === 'POST') {
        return await createProject(request, env, cors);
      }
      const projectMatch = path.match(/^\/projects\/([^/]+)$/);
      if (projectMatch) {
        const id = projectMatch[1];
        if (request.method === 'GET') return await getProject(id, env, cors);
        if (request.method === 'PUT') return await updateProject(id, request, env, cors);
        if (request.method === 'DELETE') return await deleteProject(id, env, cors);
      }

      if (path.match(/^\/projects\/[^/]+\/images$/) && request.method === 'POST') {
        const projectId = path.split('/')[2];
        return await uploadImage(projectId, request, env, cors);
      }
      if (path === '/site-logos' && request.method === 'POST') {
        return await uploadLogo(request, env, cors);
      }
      if (storageMatch && request.method === 'DELETE') {
        return await deleteStorageObject(storageMatch[1], env, cors);
      }

      return errorResponse('Not found', 404, cors);
    } catch (err) {
      return errorResponse('Internal error', 500, cors);
    }
  },
};

async function getProjects(env, cors = {}) {
  const { results: projects } = await env.DB.prepare(
    'SELECT * FROM projects ORDER BY created_at DESC'
  ).all();
  const withImages = await Promise.all(
    projects.map(async (p) => {
      const { results: images } = await env.DB.prepare(
        'SELECT * FROM images WHERE project_id = ? ORDER BY order_index ASC'
      ).bind(p.id).all();
      return { ...p, images };
    })
  );
  return jsonResponse(withImages, 200, cors);
}

async function getProject(id, env, cors = {}) {
  const project = await env.DB.prepare('SELECT * FROM projects WHERE id = ?').bind(id).first();
  if (!project) return errorResponse('Project not found', 404, cors);
  const { results: images } = await env.DB.prepare(
    'SELECT * FROM images WHERE project_id = ? ORDER BY order_index ASC'
  ).bind(id).all();
  return jsonResponse({ ...project, images }, 200, cors);
}

async function createProject(request, env, cors = {}) {
  const body = await request.json();
  const { title, key, description } = body;
  if (!title || !key) return errorResponse('title and key required', 400, cors);

  const id = crypto.randomUUID();
  await env.DB.prepare(
    'INSERT INTO projects (id, title, key, description) VALUES (?, ?, ?, ?)'
  ).bind(id, title, key, description || '').run();

  const { images = [] } = body;
  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    const url = typeof img === 'string' ? img : img?.url;
    if (!url) continue;
    const imgId = crypto.randomUUID();
    await env.DB.prepare(
      'INSERT INTO images (id, project_id, url, is_thumbnail, order_index) VALUES (?, ?, ?, ?, ?)'
    ).bind(imgId, id, url, i === 0, i).run();
  }

  const project = await env.DB.prepare('SELECT * FROM projects WHERE id = ?').bind(id).first();
  const { results: projectImages } = await env.DB.prepare(
    'SELECT * FROM images WHERE project_id = ? ORDER BY order_index ASC'
  ).bind(id).all();
  return jsonResponse({ ...project, images: projectImages }, 200, cors);
}

async function updateProject(id, request, env, cors = {}) {
  const body = await request.json();
  const { title, description, images } = body;

  if (title) await env.DB.prepare('UPDATE projects SET title = ?, updated_at = ? WHERE id = ?').bind(title, new Date().toISOString(), id).run();
  if (description !== undefined) await env.DB.prepare('UPDATE projects SET description = ?, updated_at = ? WHERE id = ?').bind(description, new Date().toISOString(), id).run();

  if (Array.isArray(images)) {
    await env.DB.prepare('DELETE FROM images WHERE project_id = ?').bind(id).run();
    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      const imgId = crypto.randomUUID();
      await env.DB.prepare(
        'INSERT INTO images (id, project_id, url, is_thumbnail, order_index) VALUES (?, ?, ?, ?, ?)'
      ).bind(imgId, id, typeof img === 'string' ? img : img.url, i === 0, i).run();
    }
  }

  const project = await env.DB.prepare('SELECT * FROM projects WHERE id = ?').bind(id).first();
  const { results: projectImages } = await env.DB.prepare(
    'SELECT * FROM images WHERE project_id = ? ORDER BY order_index ASC'
  ).bind(id).all();
  return jsonResponse({ ...project, images: projectImages }, 200, cors);
}

async function deleteProject(id, env, cors = {}) {
  await env.DB.prepare('DELETE FROM images WHERE project_id = ?').bind(id).run();
  await env.DB.prepare('DELETE FROM projects WHERE id = ?').bind(id).run();
  return jsonResponse({ success: true }, 200, cors);
}

async function uploadImage(projectId, request, env, cors = {}) {
  const formData = await request.formData();
  const file = formData.get('file');
  if (!file) return errorResponse('No file', 400, cors);

  const mime = (file.type || '').toLowerCase();
  if (!ALLOWED_IMAGE_TYPES.includes(mime)) {
    return errorResponse('Invalid file type. Allowed: JPEG, PNG, GIF, WebP', 400, cors);
  }
  if (file.size > MAX_FILE_SIZE) {
    return errorResponse(`File too large. Max size: ${MAX_FILE_SIZE / 1024 / 1024} MB`, 413, cors);
  }

  const ext = (file.name || '').split('.').pop() || 'jpg';
  const key = `projects/${projectId}/${Date.now()}.${ext}`;
  await env.BUCKET.put(key, file.stream(), { httpMetadata: { contentType: file.type || 'image/jpeg' } });

  const base = new URL(request.url).origin;
  const publicUrl = `${base}/storage/${key}`;
  const imgId = crypto.randomUUID();
  const row = await env.DB.prepare('SELECT COUNT(*) as c FROM images WHERE project_id = ?').bind(projectId).first();
  const orderIndex = row?.c ?? 0;
  const isThumbnail = orderIndex === 0;

  await env.DB.prepare(
    'INSERT INTO images (id, project_id, url, is_thumbnail, order_index) VALUES (?, ?, ?, ?, ?)'
  ).bind(imgId, projectId, publicUrl, isThumbnail, orderIndex).run();

  const img = await env.DB.prepare('SELECT * FROM images WHERE id = ?').bind(imgId).first();
  return jsonResponse(img, 200, cors);
}

async function getActiveLogo(env, cors = {}) {
  const logo = await env.DB.prepare(
    'SELECT * FROM site_logos WHERE is_active = 1 LIMIT 1'
  ).first();
  return jsonResponse(logo || null, 200, cors);
}

async function serveStorage(key, request, env, cors = {}) {
  const url = new URL(request.url);
  const w = url.searchParams.get('w') || url.searchParams.get('width');
  const isResizeRequest = /image-resizing/.test(request.headers.get('Via') || '');

  if (w && !isResizeRequest) {
    const originUrl = new URL(request.url);
    originUrl.search = '';
    const width = Math.min(parseInt(w, 10) || 400, 1200);
    try {
      const res = await fetch(originUrl.toString(), {
        cf: { image: { width, fit: 'scale-down', format: 'auto', quality: 82 } },
      });
      if (res.ok) {
        const headers = new Headers(res.headers);
        Object.entries(cors).forEach(([k, v]) => headers.set(k, v));
        headers.set('Cache-Control', 'public, max-age=31536000');
        headers.set('Vary', 'Accept');
        return new Response(res.body, { status: res.status, headers });
      }
    } catch (_) {}
  }

  const obj = await env.BUCKET.get(key);
  if (!obj) return errorResponse('Not found', 404, cors);
  const contentType = obj.httpMetadata?.contentType || 'application/octet-stream';
  return new Response(obj.body, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=31536000',
      ...cors,
    },
  });
}

/**
 * Admin-only cleanup of an R2 object (e.g. an image replaced by an edited copy).
 * Refuses to delete objects that are still referenced by any image or logo row.
 */
async function deleteStorageObject(rawKey, env, cors = {}) {
  const key = decodeURIComponent(rawKey);
  if (!key || key.includes('..')) return errorResponse('Invalid key', 400, cors);

  const suffix = `/storage/${key}`;
  const imgRef = await env.DB.prepare(
    "SELECT COUNT(*) as c FROM images WHERE url LIKE ? ESCAPE '\\'"
  ).bind('%' + suffix.replace(/[%_\\]/g, ch => '\\' + ch)).first();
  const logoRef = await env.DB.prepare(
    "SELECT COUNT(*) as c FROM site_logos WHERE url LIKE ? ESCAPE '\\'"
  ).bind('%' + suffix.replace(/[%_\\]/g, ch => '\\' + ch)).first();
  if ((imgRef?.c ?? 0) > 0 || (logoRef?.c ?? 0) > 0) {
    return errorResponse('Object is still in use', 409, cors);
  }

  await env.BUCKET.delete(key);
  return jsonResponse({ success: true }, 200, cors);
}

async function uploadLogo(request, env, cors = {}) {
  await env.DB.prepare('UPDATE site_logos SET is_active = 0').run();
  const formData = await request.formData();
  const file = formData.get('file');
  if (!file) return errorResponse('No file', 400, cors);

  const mime = (file.type || '').toLowerCase();
  if (!ALLOWED_IMAGE_TYPES.includes(mime)) {
    return errorResponse('Invalid file type. Allowed: JPEG, PNG, GIF, WebP', 400, cors);
  }
  if (file.size > MAX_FILE_SIZE) {
    return errorResponse(`File too large. Max size: ${MAX_FILE_SIZE / 1024 / 1024} MB`, 413, cors);
  }

  const ext = (file.name || '').split('.').pop() || 'jpg';
  const key = `logo/navbar-${Date.now()}.${ext}`;
  await env.BUCKET.put(key, file.stream(), { httpMetadata: { contentType: file.type || 'image/jpeg' } });

  const base = new URL(request.url).origin;
  const publicUrl = `${base}/storage/${key}`;
  const id = crypto.randomUUID();
  await env.DB.prepare(
    'INSERT INTO site_logos (id, type, url, is_active) VALUES (?, ?, ?, 1)'
  ).bind(id, 'navbar', publicUrl).run();

  const logo = await env.DB.prepare('SELECT * FROM site_logos WHERE id = ?').bind(id).first();
  return jsonResponse(logo, 200, cors);
}
