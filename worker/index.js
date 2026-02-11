/**
 * Cloudflare Worker - BIG 3D API
 * Handles: projects, images, site_logos, auth
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Key',
};

// Simple auth - check X-Admin-Key header matches secret
async function isAuthenticated(request, env) {
  const key = request.headers.get('X-Admin-Key');
  return key && key === env.ADMIN_API_KEY;
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

function errorResponse(message, status = 400) {
  return jsonResponse({ error: message }, status);
}

export default {
  async fetch(request, env, ctx) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/api/, '') || '/';

    try {
      // Public routes (no auth required)
      if (path === '/' || path === '/projects') {
        if (request.method === 'GET') {
          return await getProjects(env);
        }
      }

      if (path === '/site-logos' && request.method === 'GET') {
        return await getActiveLogo(env);
      }

      // Protected routes (admin only)
      const authenticated = await isAuthenticated(request, env);
      if (!authenticated && path !== '/' && path !== '/projects' && path !== '/site-logos') {
        return errorResponse('Unauthorized', 401);
      }

      // Projects CRUD
      if (path === '/projects' && request.method === 'POST') {
        return await createProject(request, env);
      }
      const projectMatch = path.match(/^\/projects\/([^/]+)$/);
      if (projectMatch) {
        const id = projectMatch[1];
        if (request.method === 'GET') return await getProject(id, env);
        if (request.method === 'PUT') return await updateProject(id, request, env);
        if (request.method === 'DELETE') return await deleteProject(id, env);
      }

      // Images
      if (path.match(/^\/projects\/[^/]+\/images$/) && request.method === 'POST') {
        const projectId = path.split('/')[2];
        return await uploadImage(projectId, request, env);
      }

      // Logo
      if (path === '/site-logos' && request.method === 'POST') {
        return await uploadLogo(request, env);
      }

      // Serve R2 files (public)
      const storageMatch = path.match(/^\/storage\/(.+)$/);
      if (storageMatch && request.method === 'GET') {
        return await serveStorage(storageMatch[1], env);
      }

      return errorResponse('Not found', 404);
    } catch (err) {
      console.error(err);
      return errorResponse(err.message || 'Internal error', 500);
    }
  },
};

async function getProjects(env) {
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

  return jsonResponse(withImages);
}

async function getProject(id, env) {
  const project = await env.DB.prepare('SELECT * FROM projects WHERE id = ?').bind(id).first();
  if (!project) return errorResponse('Project not found', 404);

  const { results: images } = await env.DB.prepare(
    'SELECT * FROM images WHERE project_id = ? ORDER BY order_index ASC'
  ).bind(id).all();

  return jsonResponse({ ...project, images });
}

async function createProject(request, env) {
  const body = await request.json();
  const { title, key, description } = body;
  if (!title || !key) return errorResponse('title and key required');

  const id = crypto.randomUUID();
  await env.DB.prepare(
    'INSERT INTO projects (id, title, key, description) VALUES (?, ?, ?, ?)'
  ).bind(id, title, key, description || '').run();

  const { images = [] } = body;
  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    const imgId = crypto.randomUUID();
    await env.DB.prepare(
      'INSERT INTO images (id, project_id, url, is_thumbnail, order_index) VALUES (?, ?, ?, ?, ?)'
    ).bind(imgId, id, img.url, i === 0, i).run();
  }

  const project = await env.DB.prepare('SELECT * FROM projects WHERE id = ?').bind(id).first();
  const { results: projectImages } = await env.DB.prepare(
    'SELECT * FROM images WHERE project_id = ? ORDER BY order_index ASC'
  ).bind(id).all();

  return jsonResponse({ ...project, images: projectImages });
}

async function updateProject(id, request, env) {
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

  return jsonResponse({ ...project, images: projectImages });
}

async function deleteProject(id, env) {
  await env.DB.prepare('DELETE FROM images WHERE project_id = ?').bind(id).run();
  await env.DB.prepare('DELETE FROM projects WHERE id = ?').bind(id).run();
  return jsonResponse({ success: true });
}

async function uploadImage(projectId, request, env) {
  const formData = await request.formData();
  const file = formData.get('file');
  if (!file) return errorResponse('No file');

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
  return jsonResponse(img);
}

async function getActiveLogo(env) {
  const logo = await env.DB.prepare(
    'SELECT * FROM site_logos WHERE is_active = 1 LIMIT 1'
  ).first();
  return jsonResponse(logo || null);
}

async function serveStorage(key, env) {
  const obj = await env.BUCKET.get(key);
  if (!obj) return errorResponse('Not found', 404);
  const contentType = obj.httpMetadata?.contentType || 'application/octet-stream';
  return new Response(obj.body, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=31536000',
      ...corsHeaders,
    },
  });
}

async function uploadLogo(request, env) {
  await env.DB.prepare('UPDATE site_logos SET is_active = 0').run();

  const formData = await request.formData();
  const file = formData.get('file');
  if (!file) return errorResponse('No file');

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
  return jsonResponse(logo);
}
