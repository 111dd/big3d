/**
 * Cloudflare API Config - BIG 3D (Production)
 */

window.CLOUDFLARE_API_URL = window.CLOUDFLARE_API_URL || 'https://big3d.111dordavid.workers.dev';

// Admin auth is an HttpOnly session cookie set by the Worker (POST /admin/login).
// The admin password is never stored in the browser; drop any key saved by older versions.
try { localStorage.removeItem('cf_admin_key'); } catch (_) {}

/** API client helpers */
window.cfApi = {
    on401: null,
    getBaseUrl() {
        return (window.CLOUDFLARE_API_URL || '').replace(/\/$/, '');
    },
    async request(path, opts = {}) {
        const res = await fetch(this.getBaseUrl() + path, { credentials: 'include', ...opts });
        const data = await res.json().catch(() => ({}));
        if (res.status === 401) {
            this.on401?.();
            throw new Error(data.error || 'Unauthorized');
        }
        if (!res.ok) throw new Error(data.error || res.statusText || 'Request failed');
        return data;
    },
    /** Exchanges the admin password for a session cookie. Returns false on a wrong password. */
    async login(key) {
        const res = await fetch(this.getBaseUrl() + '/admin/login', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key })
        });
        if (res.status === 401) return false;
        if (!res.ok) throw new Error('Request failed');
        return true;
    },
    async logout() {
        await fetch(this.getBaseUrl() + '/admin/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
    },
    /** True if the browser currently holds a valid admin session cookie. */
    async verifyAuth() {
        const res = await fetch(this.getBaseUrl() + '/admin/me', { credentials: 'include' });
        if (res.status === 401) return false;
        if (!res.ok) throw new Error('Request failed');
        return true;
    },
    get(path) {
        return this.request(path);
    },
    post(path, body, useFormData = false) {
        return this.request(path, useFormData
            ? { method: 'POST', body }
            : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    },
    put(path, body) {
        return this.request(path, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    },
    delete(path) {
        return this.request(path, { method: 'DELETE' });
    }
};
