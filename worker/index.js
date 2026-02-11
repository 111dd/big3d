/**
 * Cloudflare Worker - BIG 3D API
 * Handles: projects, images, site_logos, auth
 */

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

function getCorsHeaders(origin, env) {
  const raw = (env.ALLOWED_ORIGINS || '').trim();
  const allowed = raw ? raw.split(',').map(o => o.trim()).filter(Boolean) : [];
  const allowOrigin = origin && allowed.length && (allowed.includes('*') || allowed.includes(origin))
    ? origin
    : (allowed[0] || '*');
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Key',
    'Access-Control-Max-Age': '86400',
  };
}

/** Check if request has valid admin key (X-Admin-Key matches env.ADMIN_API_KEY) */
function isValidAdmin(request, env) {
  const key = request.headers.get('X-Admin-Key');
  const secret = env.ADMIN_API_KEY;
  if (!key || !secret) return false;
  if (key.length !== secret.length) return false;
  let diff = 0;
  for (let i = 0; i < key.length; i++) diff |= key.charCodeAt(i) ^ secret.charCodeAt(i);
  return diff === 0;
}

/** Guard: returns 401 Response if invalid, null if allowed */
function requireAdmin(request, env, cors) {
  if (!isValidAdmin(request, env)) {
    return errorResponse('Unauthorized', 401, cors);
  }
  return null;
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
      if (path === '/' || path === '/projects') {
        if (request.method === 'GET') return await getProjects(env, cors);
      }
      if (path === '/site-logos' && request.method === 'GET') {
        return await getActiveLogo(env, cors);
      }
      const storageMatch = path.match(/^\/storage\/(.+)$/);
      if (storageMatch && request.method === 'GET') {
        return await serveStorage(storageMatch[1], env, cors);
      }

      const isPublic =
        ((path === '/' || path === '/projects') && request.method === 'GET') ||
        (path === '/site-logos' && request.method === 'GET') ||
        (path.match(/^\/storage\//) && request.method === 'GET');

      const authError = requireAdmin(request, env, cors);
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

async function serveStorage(key, env, cors = {}) {
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
