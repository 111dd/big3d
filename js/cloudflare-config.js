/**
 * Cloudflare API Config - BIG 3D
 * Replace these with your deployed Worker URL and Admin API Key
 */

// Your Cloudflare Worker URL (after deployment)
// Example: https://big3d-api.YOUR_SUBDOMAIN.workers.dev
window.CLOUDFLARE_API_URL = window.CLOUDFLARE_API_URL || 'https://big3d-api.YOUR_SUBDOMAIN.workers.dev';

// Admin API Key - set via wrangler secret put ADMIN_API_KEY
// Stored in localStorage after login
window.CLOUDFLARE_ADMIN_KEY = window.CLOUDFLARE_ADMIN_KEY || localStorage.getItem('cf_admin_key') || '';

/** API client helpers */
window.cfApi = {
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
    async get(path) {
        const res = await fetch(this.getBaseUrl() + path);
        if (!res.ok) throw new Error((await res.json()).error || res.statusText);
        return res.json();
    },
    async post(path, body, useFormData = false) {
        const key = window.CLOUDFLARE_ADMIN_KEY || localStorage.getItem('cf_admin_key');
        const opts = {
            method: 'POST',
            headers: useFormData ? { 'X-Admin-Key': key || '' } : this.getHeaders(true),
            body: useFormData ? body : JSON.stringify(body)
        };
        // FormData: don't set Content-Type - fetch adds multipart boundary automatically
        const res = await fetch(this.getBaseUrl() + path, opts);
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
        return res.json();
    },
    async put(path, body) {
        const res = await fetch(this.getBaseUrl() + path, {
            method: 'PUT',
            headers: this.getHeaders(true),
            body: JSON.stringify(body)
        });
        if (!res.ok) throw new Error((await res.json()).error || res.statusText);
        return res.json();
    },
    async delete(path) {
        const res = await fetch(this.getBaseUrl() + path, {
            method: 'DELETE',
            headers: this.getHeaders(true)
        });
        if (!res.ok) throw new Error((await res.json()).error || res.statusText);
        return res.json();
    }
};
