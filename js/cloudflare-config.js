/**
 * Cloudflare API Config - BIG 3D (Production)
 */

window.CLOUDFLARE_API_URL = window.CLOUDFLARE_API_URL || 'https://big3d.111dordavid.workers.dev';

// Admin API Key - set via wrangler secret put ADMIN_API_KEY
// Stored in localStorage after login
window.CLOUDFLARE_ADMIN_KEY = window.CLOUDFLARE_ADMIN_KEY || localStorage.getItem('cf_admin_key') || '';

/** API client helpers */
window.cfApi = {
    on401: null,
    getBaseUrl() {
        return (window.CLOUDFLARE_API_URL || '').replace(/\/$/, '');
    },
    getHeaders(includeAuth = false) {
        const h = { 'Content-Type': 'application/json' };
        if (includeAuth) {
            const key = window.CLOUDFLARE_ADMIN_KEY || localStorage.getItem('cf_admin_key');
            if (key) h['X-Admin-Key'] = key;
        }
        return h;
    },
    async verifyAuth(key) {
        const res = await fetch(this.getBaseUrl() + '/admin/me', {
            headers: { 'X-Admin-Key': key || '' }
        });
        if (res.status === 401) return false;
        if (!res.ok) throw new Error('Request failed');
        return true;
    },
    async get(path, includeAuth = false) {
        const opts = includeAuth ? { headers: this.getHeaders(true) } : {};
        const res = await fetch(this.getBaseUrl() + path, opts);
        const data = await res.json().catch(() => ({}));
        if (res.status === 401) {
            this.on401?.();
            throw new Error(data.error || 'Unauthorized');
        }
        if (!res.ok) throw new Error(data.error || res.statusText || 'Request failed');
        return data;
    },
    async post(path, body, useFormData = false) {
        const key = window.CLOUDFLARE_ADMIN_KEY || localStorage.getItem('cf_admin_key');
        const opts = {
            method: 'POST',
            headers: useFormData ? { 'X-Admin-Key': key || '' } : this.getHeaders(true),
            body: useFormData ? body : JSON.stringify(body)
        };
        const res = await fetch(this.getBaseUrl() + path, opts);
        const data = await res.json().catch(() => ({}));
        if (res.status === 401) {
            this.on401?.();
            throw new Error(data.error || 'Unauthorized');
        }
        if (!res.ok) throw new Error(data.error || res.statusText || 'Request failed');
        return data;
    },
    async put(path, body) {
        const res = await fetch(this.getBaseUrl() + path, {
            method: 'PUT',
            headers: this.getHeaders(true),
            body: JSON.stringify(body)
        });
        const data = await res.json().catch(() => ({}));
        if (res.status === 401) {
            this.on401?.();
            throw new Error(data.error || 'Unauthorized');
        }
        if (!res.ok) throw new Error(data.error || res.statusText || 'Request failed');
        return data;
    },
    async delete(path) {
        const res = await fetch(this.getBaseUrl() + path, {
            method: 'DELETE',
            headers: this.getHeaders(true)
        });
        const data = await res.json().catch(() => ({}));
        if (res.status === 401) {
            this.on401?.();
            throw new Error(data.error || 'Unauthorized');
        }
        if (!res.ok) throw new Error(data.error || res.statusText || 'Request failed');
        return data;
    }
};
