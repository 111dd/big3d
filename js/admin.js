// Admin Panel JavaScript - Cloudflare Backend

let currentProjectId = null;
let uploadedImages = [];
let currentLogoFile = null;

document.addEventListener('DOMContentLoaded', () => {
    safeCreateIcons();
    setupEventListeners();
    window.cfApi.on401 = () => {
        logout();
        showLoginScreen();
    };
    checkAuth();
});

async function checkAuth() {
    showLoginScreen();
    if (!window.cfApi?.verifyAuth) {
        showConnectionStatus(false, 'שגיאת טעינה – רענן את העמוד');
        return;
    }
    try {
        if (!(await window.cfApi.verifyAuth())) {
            showConnectionStatus(false, 'הכנס סיסמה כדי להתחבר');
            return;
        }
        showAdminPanel();
        loadProjects();
        showConnectionStatus(true, 'החיבור הצליח');
    } catch {
        showConnectionStatus(false, 'שגיאת חיבור לשרת');
    }
}

function showConnectionStatus(isConnected, message) {
    const loginScreen = document.getElementById('login-screen');
    if (!loginScreen) return;
    const existing = document.getElementById('cf-status');
    if (existing) existing.remove();
    const div = document.createElement('div');
    div.id = 'cf-status';
    div.className = `fixed top-4 left-4 p-3 rounded-lg text-sm z-50 ${isConnected ? 'bg-green-600/80' : 'bg-amber-600/80'} text-white`;
    div.innerHTML = `<div class="flex items-center gap-2"><i data-lucide="${isConnected ? 'check-circle' : 'alert-circle'}" class="h-4 w-4"></i><span>${message}</span></div>`;
    loginScreen.appendChild(div);
    safeCreateIcons();
    if (isConnected) setTimeout(() => div.remove(), 4000);
}

function setupEventListeners() {
    document.getElementById('login-form').addEventListener('submit', handleLogin);
    document.getElementById('project-form').addEventListener('submit', handleProjectSubmit);
    const uploadInput = document.getElementById('image-upload');
    uploadInput.addEventListener('change', handleImageSelect);
    const uploadArea = document.getElementById('upload-area');
    uploadArea.addEventListener('click', () => uploadInput.click());
    uploadArea.addEventListener('dragover', (e) => { e.preventDefault(); uploadArea.classList.add('dragover'); });
    uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('dragover'));
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        uploadInput.files = e.dataTransfer.files;
        handleImageSelect({ target: uploadInput });
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !document.getElementById('image-editor-modal').classList.contains('hidden')) {
            closeImageEditor();
        }
    });
    const logoUpload = document.getElementById('logo-upload');
    logoUpload.addEventListener('change', handleLogoSelect);
    const logoUploadArea = document.getElementById('logo-upload-area');
    if (logoUploadArea) {
        logoUploadArea.addEventListener('click', () => logoUpload.click());
        logoUploadArea.addEventListener('dragover', (e) => { e.preventDefault(); logoUploadArea.classList.add('dragover'); });
        logoUploadArea.addEventListener('dragleave', () => logoUploadArea.classList.remove('dragover'));
        logoUploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            logoUploadArea.classList.remove('dragover');
            logoUpload.files = e.dataTransfer.files;
            handleLogoSelect({ target: logoUpload });
        });
    }
}

async function handleLogin(e) {
    e.preventDefault();
    const keyInput = document.getElementById('login-api-key');
    const key = (keyInput && keyInput.value) ? keyInput.value.trim() : '';
    const errorDiv = document.getElementById('login-error');
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalText = submitBtn?.textContent;

    if (!key) {
        if (errorDiv) { errorDiv.textContent = 'הכנס סיסמה'; errorDiv.classList.remove('hidden'); }
        return;
    }

    if (!window.cfApi?.verifyAuth) {
        if (errorDiv) { errorDiv.textContent = 'שגיאת טעינה – רענן את העמוד'; errorDiv.classList.remove('hidden'); }
        return;
    }

    if (submitBtn) { submitBtn.textContent = 'מתחבר...'; submitBtn.disabled = true; }
    if (errorDiv) errorDiv.classList.add('hidden');

    try {
        if (!(await window.cfApi.login(key))) {
            if (errorDiv) { errorDiv.textContent = 'הסיסמה שגויה'; errorDiv.classList.remove('hidden'); }
            return;
        }
        if (keyInput) keyInput.value = '';
        // The password was right; if the session still doesn't verify, the browser dropped the cookie.
        if (!(await window.cfApi.verifyAuth())) {
            if (errorDiv) {
                errorDiv.textContent = 'הדפדפן חוסם את עוגיית ההתחברות. נסו דפדפן אחר או אפשרו עוגיות לאתר.';
                errorDiv.classList.remove('hidden');
            }
            return;
        }
        showAdminPanel();
        loadProjects();
        showConnectionStatus(true, 'החיבור הצליח');
    } catch (err) {
        if (errorDiv) {
            errorDiv.textContent = err.message || 'שגיאת חיבור';
            errorDiv.classList.remove('hidden');
        }
    } finally {
        if (submitBtn) { submitBtn.textContent = originalText || 'התחבר'; submitBtn.disabled = false; }
    }
}

function logout() {
    window.cfApi?.logout();
    showLoginScreen();
    uploadedImages = [];
    currentProjectId = null;
}

function showLoginScreen() {
    const loginScreen = document.getElementById('login-screen');
    const adminPanel = document.getElementById('admin-panel');
    if (loginScreen) loginScreen.classList.remove('hidden');
    if (adminPanel) adminPanel.classList.add('hidden');
}

function showAdminPanel() {
    const loginScreen = document.getElementById('login-screen');
    const adminPanel = document.getElementById('admin-panel');
    if (loginScreen) loginScreen.classList.add('hidden');
    if (adminPanel) {
        adminPanel.classList.remove('hidden');
        showTab('projects');
    }
}

function showTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.add('hidden'));
    document.querySelectorAll('[id^="tab-"]').forEach(btn => {
        btn.classList.remove('border-brand-500', 'text-brand-500');
        btn.classList.add('border-transparent', 'text-gray-400');
    });
    document.getElementById(`content-${tabName}`).classList.remove('hidden');
    const tabBtn = document.getElementById(`tab-${tabName}`);
    tabBtn.classList.add('border-brand-500', 'text-brand-500');
    tabBtn.classList.remove('border-transparent', 'text-gray-400');
    if (tabName === 'logo') loadCurrentLogo();
    else if (tabName === 'projects') loadProjects();
}

async function loadProjects() {
    const container = document.getElementById('projects-list');
    if (!container) return;
    container.innerHTML = '<div class="col-span-full text-center py-8"><p class="text-gray-400">טוען פרויקטים...</p></div>';

    try {
        const data = await window.cfApi.get('/projects');
        container.innerHTML = '';
        if (!data || data.length === 0) {
            container.innerHTML = `
                <div class="col-span-full text-center py-8 bg-neutral p-8 rounded-2xl">
                    <p class="text-gray-300 text-lg mb-2">אין פרויקטים ב-Cloudflare עדיין</p>
                    <p class="text-gray-400 text-sm mb-4">לחץ על הכפתור למטה כדי לייבא את הפרויקטים הקיימים</p>
                    <button onclick="importExistingProjects()" class="bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-500 transition flex items-center gap-2 mx-auto">
                        <i data-lucide="upload" class="h-5 w-5"></i>ייבא פרויקטים קיימים
                    </button>
                </div>`;
            setTimeout(() => safeCreateIcons(), 100);
            return;
        }
        data.forEach(project => container.appendChild(createProjectCard(project)));
    } catch (err) {
        container.innerHTML = `<div class="col-span-full text-center py-8"><p class="text-red-400">שגיאה: ${err.message}</p><p class="text-gray-400 text-sm mt-2">ודא ש-CLOUDFLARE_API_URL מצביע ל-Worker שלך</p></div>`;
    }
}

function createProjectCard(project) {
    const card = document.createElement('div');
    card.className = 'bg-neutral p-6 rounded-2xl shadow-card';
    const images = project.images || [];
    const thumbnail = images.find(img => img.is_thumbnail) || images[0];
    const thumbnailUrl = thumbnail ? thumbnail.url : null;
    card.innerHTML = `
        ${thumbnailUrl ? `<img src="${thumbnailUrl}" class="w-full h-40 object-cover rounded-lg mb-4" alt="${project.title}" onerror="this.src='https://images.unsplash.com/photo-1560275619-4662e36fa65c?q=80&w=1200&auto=format&fit=crop'; this.onerror=null;">` : '<div class="w-full h-40 bg-neutral-dark rounded-lg mb-4 flex items-center justify-center text-gray-500">אין תמונה</div>'}
        <h3 class="text-xl font-bold mb-2">${project.title}</h3>
        ${project.description ? `<p class="text-gray-400 text-sm mb-4">${project.description}</p>` : ''}
        <p class="text-gray-500 text-xs mb-4"><i data-lucide="image" class="h-4 w-4 inline"></i> ${images.length} תמונות</p>
        <div class="flex gap-2">
            <button onclick="editProject('${project.id}')" class="flex-1 bg-brand-600 text-white px-4 py-2 rounded-lg hover:bg-brand-500 transition flex items-center justify-center gap-2"><i data-lucide="edit" class="h-4 w-4"></i>ערוך</button>
            <button onclick="deleteProject('${project.id}')" class="flex-1 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition flex items-center justify-center gap-2"><i data-lucide="trash" class="h-4 w-4"></i>מחק</button>
        </div>`;
    setTimeout(() => safeCreateIcons(), 100);
    return card;
}

function showAddProjectModal() {
    currentProjectId = null;
    document.getElementById('modal-title').textContent = 'הוסף פרויקט';
    document.getElementById('project-form').reset();
    document.getElementById('image-preview-container').innerHTML = '';
    uploadedImages = [];
    const keyInput = document.getElementById('project-key');
    keyInput.disabled = false;
    keyInput.classList.remove('opacity-50', 'cursor-not-allowed');
    document.getElementById('project-modal').classList.remove('hidden');
    document.getElementById('project-modal').classList.add('flex');
}

function closeProjectModal() {
    document.getElementById('project-modal').classList.add('hidden');
    document.getElementById('project-modal').classList.remove('flex');
}

const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10 MB
function handleImageSelect(e) {
    Array.from(e.target.files || []).forEach(file => {
        if (file.size > MAX_IMAGE_SIZE) return;
        if (file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = ev => {
                uploadedImages.push({ file, preview: ev.target.result });
                updateImagePreview();
            };
            reader.readAsDataURL(file);
        }
    });
}

function updateImagePreview() {
    const container = document.getElementById('image-preview-container');
    container.innerHTML = '';
    const last = uploadedImages.length - 1;
    uploadedImages.forEach((img, i) => {
        const div = document.createElement('div');
        div.className = 'relative';
        const badge =
            (i === 0 ? '<span class="tile-badge bg-brand-600 text-white">תמונה ראשית</span>' : '') +
            (img.edited ? '<span class="tile-badge bg-amber-500 text-black" style="right:auto;left:.5rem">נערכה</span>' : '');
        div.innerHTML = `
            <img src="${img.preview}" class="image-preview cursor-pointer" alt="תמונה ${i + 1}" title="לחיצה לעריכה" onclick="openImageEditor(${i})">
            ${badge}
            <div class="tile-actions flex items-center justify-center gap-1 mt-2">
                <button type="button" onclick="openImageEditor(${i})" title="חיתוך / סיבוב"><i data-lucide="crop" class="h-4 w-4"></i></button>
                <button type="button" onclick="moveImage(${i}, -1)" title="הזז קדימה" ${i === 0 ? 'disabled' : ''}><i data-lucide="chevron-right" class="h-4 w-4"></i></button>
                <button type="button" onclick="moveImage(${i}, 1)" title="הזז אחורה" ${i === last ? 'disabled' : ''}><i data-lucide="chevron-left" class="h-4 w-4"></i></button>
                <button type="button" onclick="setAsCover(${i})" title="הגדר כתמונה ראשית" ${i === 0 ? 'disabled' : ''}><i data-lucide="star" class="h-4 w-4"></i></button>
                <button type="button" onclick="removeImage(${i})" class="danger" title="הסר"><i data-lucide="trash-2" class="h-4 w-4"></i></button>
            </div>`;
        container.appendChild(div);
    });
    safeCreateIcons();
}

function removeImage(index) {
    const img = uploadedImages[index];
    if (img?.preview?.startsWith('blob:')) URL.revokeObjectURL(img.preview);
    uploadedImages.splice(index, 1);
    updateImagePreview();
}

function moveImage(index, delta) {
    const target = index + delta;
    if (target < 0 || target >= uploadedImages.length) return;
    const [item] = uploadedImages.splice(index, 1);
    uploadedImages.splice(target, 0, item);
    updateImagePreview();
}

function setAsCover(index) {
    if (index <= 0 || index >= uploadedImages.length) return;
    const [item] = uploadedImages.splice(index, 1);
    uploadedImages.unshift(item);
    updateImagePreview();
}

/* ---------------- Image editor (crop / rotate / flip) ---------------- */

const editorState = { cropper: null, index: null, mime: 'image/jpeg', objectUrl: null, aspect: 'free' };
const ASPECTS = { free: NaN, '4:3': 4 / 3, '1:1': 1, '3:4': 3 / 4, '16:9': 16 / 9 };

function isPngSource(item) {
    if (item.file) return item.file.type === 'image/png';
    return /\.png(\?|$)/i.test(item.url || '');
}

function openImageEditor(index) {
    const item = uploadedImages[index];
    if (!item) return;
    if (typeof Cropper !== 'function') { alert('עורך התמונות עדיין נטען, נסו שוב בעוד רגע.'); return; }

    destroyEditor();
    editorState.index = index;
    editorState.mime = isPngSource(item) ? 'image/png' : 'image/jpeg';

    const img = document.getElementById('image-editor-img');
    const modal = document.getElementById('image-editor-modal');
    const status = document.getElementById('image-editor-status');

    // Fresh <img> each time - Cropper wraps the element and leaves state behind otherwise.
    const fresh = img.cloneNode(false);
    fresh.removeAttribute('src');
    img.replaceWith(fresh);

    let src;
    if (item.file) {
        src = URL.createObjectURL(item.file);
        editorState.objectUrl = src;
    } else {
        src = item.url;
        fresh.crossOrigin = 'anonymous';
    }

    modal.classList.remove('hidden');
    modal.classList.add('flex');
    status.textContent = 'טוען תמונה...';

    fresh.onerror = () => {
        status.textContent = 'לא ניתן לטעון את התמונה לעריכה (בעיית הרשאות CORS). נסו להעלות אותה מחדש.';
    };
    fresh.src = src;

    editorState.cropper = new Cropper(fresh, {
        viewMode: 1,
        dragMode: 'crop',
        autoCropArea: 1,
        responsive: true,
        background: false,
        checkOrientation: true,
        checkCrossOrigin: true,
        movable: true,
        zoomable: true,
        rotatable: true,
        scalable: true,
        toggleDragModeOnDblclick: false,
        ready() {
            status.textContent = 'גררו את המסגרת לחיתוך, גללו לזום. הגלריה באתר מציגה כרטיסים ביחס 4:3.';
            setEditorAspect(editorState.aspect || 'free');
        },
    });
    safeCreateIcons();
}

function destroyEditor() {
    if (editorState.cropper) {
        try { editorState.cropper.destroy(); } catch (_) {}
        editorState.cropper = null;
    }
    if (editorState.objectUrl) {
        URL.revokeObjectURL(editorState.objectUrl);
        editorState.objectUrl = null;
    }
}

function closeImageEditor() {
    destroyEditor();
    editorState.index = null;
    const modal = document.getElementById('image-editor-modal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

function setEditorAspect(name) {
    editorState.aspect = name;
    document.querySelectorAll('#image-editor-modal [data-aspect]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.aspect === name);
    });
    if (editorState.cropper) editorState.cropper.setAspectRatio(ASPECTS[name]);
}

function editorRotate(deg) { editorState.cropper?.rotate(deg); }
function editorZoom(ratio) { editorState.cropper?.zoom(ratio); }
function editorFlip(axis) {
    const c = editorState.cropper;
    if (!c) return;
    const data = c.getData();
    if (axis === 'x') c.scaleX(-(data.scaleX || 1));
    else c.scaleY(-(data.scaleY || 1));
}
function editorReset() {
    editorState.cropper?.reset();
    setEditorAspect('free');
}

function fileBaseName(item) {
    const raw = item.file?.name || decodeURIComponent((item.url || 'image').split('/').pop().split('?')[0]) || 'image';
    return raw.replace(/\.[^.]+$/, '') || 'image';
}

async function applyImageEdit() {
    const c = editorState.cropper;
    const index = editorState.index;
    if (!c || index === null) return;
    const btn = document.getElementById('image-editor-apply');
    const original = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'מעבד...';

    try {
        // 2000px cap keeps files well under the 10 MB upload limit and is plenty for the gallery.
        const canvas = c.getCroppedCanvas({
            maxWidth: 2000,
            maxHeight: 2000,
            imageSmoothingEnabled: true,
            imageSmoothingQuality: 'high',
            fillColor: editorState.mime === 'image/png' ? 'transparent' : '#ffffff',
        });
        if (!canvas) throw new Error('canvas');
        const blob = await new Promise((resolve, reject) =>
            canvas.toBlob(b => (b ? resolve(b) : reject(new Error('blob'))), editorState.mime, 0.9));

        const item = uploadedImages[index];
        const ext = editorState.mime === 'image/png' ? 'png' : 'jpg';
        const file = new File([blob], `${fileBaseName(item)}-edited.${ext}`, { type: editorState.mime });
        if (item.preview?.startsWith('blob:')) URL.revokeObjectURL(item.preview);

        uploadedImages[index] = {
            file,
            preview: URL.createObjectURL(blob),
            isExisting: false,
            edited: true,
            // Remember what this replaces so the old storage object can be cleaned up after save.
            replacesUrl: item.replacesUrl || (item.isExisting ? item.url : null),
        };
        closeImageEditor();
        updateImagePreview();
    } catch (err) {
        const status = document.getElementById('image-editor-status');
        status.textContent = 'העריכה נכשלה. אם זו תמונה קיימת מהאתר, ייתכן שהדפדפן חוסם אותה (CORS) - נסו להעלות אותה מחדש כקובץ.';
    } finally {
        btn.disabled = false;
        btn.textContent = original;
    }
}

/** Returns the R2 key if the URL points at this Worker's /storage/, otherwise null. */
function storageKeyFromUrl(url) {
    try {
        const u = new URL(url);
        const base = new URL(window.cfApi.getBaseUrl());
        if (u.origin !== base.origin) return null;
        const m = u.pathname.match(/^\/(?:api\/)?storage\/(.+)$/);
        return m ? decodeURIComponent(m[1]) : null;
    } catch (_) {
        return null;
    }
}

async function handleProjectSubmit(e) {
    e.preventDefault();
    const title = document.getElementById('project-title').value;
    const key = document.getElementById('project-key').value;
    const description = document.getElementById('project-description').value;
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalText = submitBtn?.textContent;

    try {
        if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'שומר...'; }

        let projectId = currentProjectId;
        if (!projectId) {
            const created = await window.cfApi.post('/projects', { title, key, description, images: [] });
            projectId = created.id;
        }

        // Upload in display order so the saved order matches what the admin sees.
        const imageUrls = [];
        const replaced = [];
        let done = 0;
        const pending = uploadedImages.filter(img => img.file).length;
        for (const img of uploadedImages) {
            if (img.isExisting && img.url) { imageUrls.push(img.url); continue; }
            if (!img.file) continue;
            done += 1;
            if (submitBtn) submitBtn.textContent = `מעלה תמונה ${done}/${pending}...`;
            const fd = new FormData();
            fd.append('file', img.file);
            const uploaded = await window.cfApi.post(`/projects/${projectId}/images`, fd, true);
            imageUrls.push(uploaded.url);
            if (img.replacesUrl) replaced.push(img.replacesUrl);
        }

        await window.cfApi.put(`/projects/${projectId}`, { title, description, images: imageUrls });

        // Best-effort cleanup of storage objects that were replaced by edited versions.
        for (const url of replaced) {
            const storageKey = storageKeyFromUrl(url);
            if (storageKey && !imageUrls.includes(url)) {
                window.cfApi.delete('/storage/' + storageKey.split('/').map(encodeURIComponent).join('/')).catch(() => {});
            }
        }

        closeProjectModal();
        loadProjects();
        alert('הפרויקט נשמר בהצלחה!');
    } catch (err) {
        alert('שגיאה: ' + err.message);
    } finally {
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = originalText || 'שמור'; }
    }
}

async function editProject(projectId) {
    currentProjectId = projectId;
    try {
        const project = await window.cfApi.get(`/projects/${projectId}`);
        document.getElementById('modal-title').textContent = 'ערוך פרויקט';
        document.getElementById('project-title').value = project.title;
        document.getElementById('project-key').value = project.key;
        document.getElementById('project-description').value = project.description || '';
        const keyInput = document.getElementById('project-key');
        keyInput.disabled = true;
        keyInput.classList.add('opacity-50', 'cursor-not-allowed');
        uploadedImages = [];
        document.getElementById('image-preview-container').innerHTML = '';
        const imgs = (project.images || []).sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
        imgs.forEach(img => {
            uploadedImages.push({ url: img.url, id: img.id, preview: img.url, isExisting: true });
        });
        updateImagePreview();
        document.getElementById('project-modal').classList.remove('hidden');
        document.getElementById('project-modal').classList.add('flex');
    } catch (err) {
        alert('שגיאה בטעינת הפרויקט: ' + err.message);
    }
}

async function deleteProject(projectId) {
    if (!confirm('האם אתה בטוח שברצונך למחוק את הפרויקט?')) return;
    try {
        await window.cfApi.delete(`/projects/${projectId}`);
        loadProjects();
        alert('הפרויקט נמחק בהצלחה!');
    } catch (err) {
        alert('שגיאה במחיקת הפרויקט: ' + err.message);
    }
}

async function loadCurrentLogo() {
    const container = document.getElementById('current-logo-container');
    if (!container) return;
    try {
        const data = await window.cfApi.get('/site-logos');
        if (data && data.url) {
            container.innerHTML = `<img src="${data.url}" alt="Current Logo" class="logo-preview"><p class="text-gray-300 mt-2">לוגו נוכחי</p>`;
        } else {
            showDefaultLogo();
        }
    } catch {
        showDefaultLogo();
    }
}

function showDefaultLogo() {
    const container = document.getElementById('current-logo-container');
    if (!container) return;
    container.innerHTML = `
        <img src="/optimized/dark_logo_big3d-160.webp" alt="Current Logo" class="logo-preview">
        <p class="text-gray-300 mt-2">לוגו נוכחי (מתיקיית האתר)</p>
        <p class="text-gray-500 text-xs mt-2">💡 העלה לוגו חדש כדי לשמור ב-Cloudflare</p>`;
}

function handleLogoSelect(e) {
    const file = e.target.files[0];
    if (!file || !file.type.startsWith('image/')) { if (file) alert('אנא בחר קובץ תמונה'); return; }
    currentLogoFile = file;
    const reader = new FileReader();
    reader.onload = ev => {
        document.getElementById('logo-preview').src = ev.target.result;
        document.getElementById('logo-preview-container').classList.remove('hidden');
    };
    reader.readAsDataURL(file);
}

function cancelLogoUpload() {
    currentLogoFile = null;
    document.getElementById('logo-upload').value = '';
    document.getElementById('logo-preview-container').classList.add('hidden');
}

async function uploadLogo() {
    if (!currentLogoFile) { alert('אנא בחר לוגו להעלאה'); return; }
    if (currentLogoFile.size > 10 * 1024 * 1024) {
        alert('הקובץ גדול מדי. מקסימום 10 MB.');
        return;
    }
    try {
        const fd = new FormData();
        fd.append('file', currentLogoFile);
        await window.cfApi.post('/site-logos', fd, true);
        alert('הלוגו נשמר בהצלחה!');
        cancelLogoUpload();
        loadCurrentLogo();
    } catch (err) {
        const msg = err.message || 'שגיאה בהעלאת הלוגו';
        alert(msg.includes('large') ? 'הקובץ גדול מדי (מקסימום 10 MB)' : msg.includes('Invalid') ? 'סוג קובץ לא נתמך. השתמש ב-JPEG, PNG, GIF או WebP' : msg);
    }
}

async function importExistingProjects() {
    if (!confirm('האם לייבא את הפרויקטים הקיימים מהאתר?')) return;
    const existingProjects = [
        { key: 'egg', title: 'ביצה - כורסת ישיבה', description: '', images: ['egg/firtst_egg.jpeg', 'egg/egg-final-product-1.jpg', 'egg/egg-final-product-2.jpg', 'egg/egg-design-1.jpg', 'egg/egg-design-2.jpg', 'egg/egg-with-kids.png', 'egg/egg-whatsapp-1.jpg'] },
        { key: 'garbage-shaft-cleaning-model', title: 'מודל ניקוי פיר אשפה', description: '', images: ['Garbage shaft cleaning model/first_wobg.png', 'Garbage shaft cleaning model/garbage-model-1.jpg', 'Garbage shaft cleaning model/garbage-model-2.jpg', 'Garbage shaft cleaning model/garbage-model-3.jpg', 'Garbage shaft cleaning model/garbage-model-4.jpg', 'Garbage shaft cleaning model/garbage-model-5.jpg', 'Garbage shaft cleaning model/garbage-laser-engraving.jpg', 'Garbage shaft cleaning model/garbage-model-7.jpg', 'Garbage shaft cleaning model/garbage-whatsapp-1.jpg', 'Garbage shaft cleaning model/garbage-whatsapp-2.jpg', 'Garbage shaft cleaning model/garbage-whatsapp-3.jpg', 'Garbage shaft cleaning model/garbage-whatsapp-4.jpg', 'Garbage shaft cleaning model/garbage-whatsapp-5.jpg', 'Garbage shaft cleaning model/garbage-whatsapp-6.jpg'] },
        { key: 'pizza-car-holder', title: 'מחזיק פיצה לרכב', description: '', images: ['pizza car holder/pizza-holder-1.jpg', 'pizza car holder/pizza-holder-2.jpg'] },
        { key: 'trump', title: 'פרויקט טראמפ', description: '', images: ['trump/trump-1.jpg', 'trump/trump-2.jpg'] },
        { key: 'world-cup-cup', title: 'גביע המונדיאל', description: '', images: ['World Cup Cup/world-cup-cup-1.jpg', 'World Cup Cup/world-cup-cup-2.jpg', 'World Cup Cup/world-cup-cup-3.jpg', 'World Cup Cup/world-cup-cup-4.jpg'] },
        { key: 'shark', title: 'מודל כריש', description: '', images: ['shark/shark-1.jpg', 'shark/shark-2.jpg', 'shark/shark-3.jpg', 'shark/shark-whatsapp-1.jpg', 'shark/shark-whatsapp-2.jpg', 'shark/shark-whatsapp-3.jpg', 'shark/shark-whatsapp-4.jpg', 'shark/shark-whatsapp-5.jpg', 'shark/shark-whatsapp-6.jpg', 'shark/shark-whatsapp-7.jpg'] },
        { key: 'laser', title: 'דוגמאות חריטה בלייזר', description: '', images: ['laser/laser-engraving-1.jpg', 'laser/laser-engraving-2.jpg', 'laser/laser-engraving-3.jpg', 'laser/laser-engraving-4.jpg'] }
    ];
    let imported = 0, skipped = 0;
    try {
        const existing = await window.cfApi.get('/projects');
        const existingKeys = new Set((existing || []).map(p => p.key));
        for (const project of existingProjects) {
            if (existingKeys.has(project.key)) { skipped++; continue; }
            await window.cfApi.post('/projects', {
                title: project.title,
                key: project.key,
                description: project.description,
                images: project.images.map(url => (url.startsWith('http') ? url : window.location.origin + '/' + url))
            });
            imported++;
        }
        alert(`ייבוא הושלם!\nנוצרו: ${imported}\nנדלגו: ${skipped}`);
        loadProjects();
    } catch (err) {
        alert('שגיאה בייבוא: ' + err.message);
    }
}
