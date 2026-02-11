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
    const key = localStorage.getItem('cf_admin_key');
    if (!key) {
        showConnectionStatus(false, 'הכנס API Key כדי להתחבר');
        return;
    }
    if (!window.cfApi?.verifyAuth) {
        showConnectionStatus(false, 'שגיאת טעינה – רענן את העמוד');
        return;
    }
    try {
        const valid = await window.cfApi.verifyAuth(key);
        if (!valid) {
            localStorage.removeItem('cf_admin_key');
            if (window.CLOUDFLARE_ADMIN_KEY) window.CLOUDFLARE_ADMIN_KEY = '';
            showConnectionStatus(false, 'API Key לא תקף או פג תוקף');
            return;
        }
        window.CLOUDFLARE_ADMIN_KEY = key;
        showAdminPanel();
        loadProjects();
        showConnectionStatus(true, 'חיבור ל-Cloudflare');
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
        if (errorDiv) { errorDiv.textContent = 'הכנס API Key'; errorDiv.classList.remove('hidden'); }
        return;
    }

    if (!window.cfApi?.verifyAuth) {
        if (errorDiv) { errorDiv.textContent = 'שגיאת טעינה – רענן את העמוד'; errorDiv.classList.remove('hidden'); }
        return;
    }

    if (submitBtn) { submitBtn.textContent = 'מתחבר...'; submitBtn.disabled = true; }
    if (errorDiv) errorDiv.classList.add('hidden');

    try {
        const valid = await window.cfApi.verifyAuth(key);
        if (!valid) {
            localStorage.removeItem('cf_admin_key');
            if (window.CLOUDFLARE_ADMIN_KEY) window.CLOUDFLARE_ADMIN_KEY = '';
            if (errorDiv) { errorDiv.textContent = 'API Key שגוי'; errorDiv.classList.remove('hidden'); }
            return;
        }
        localStorage.setItem('cf_admin_key', key);
        window.CLOUDFLARE_ADMIN_KEY = key;
        showAdminPanel();
        loadProjects();
        showConnectionStatus(true, 'חיבור ל-Cloudflare');
    } catch (err) {
        localStorage.removeItem('cf_admin_key');
        if (window.CLOUDFLARE_ADMIN_KEY) window.CLOUDFLARE_ADMIN_KEY = '';
        if (errorDiv) {
            errorDiv.textContent = err.message === 'Unauthorized' ? 'API Key שגוי' : (err.message || 'שגיאת חיבור');
            errorDiv.classList.remove('hidden');
        }
    } finally {
        if (submitBtn) { submitBtn.textContent = originalText || 'התחבר'; submitBtn.disabled = false; }
    }
}

function logout() {
    localStorage.removeItem('cf_admin_key');
    window.CLOUDFLARE_ADMIN_KEY = '';
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
    uploadedImages.forEach((img, i) => {
        const div = document.createElement('div');
        div.className = 'relative';
        div.innerHTML = `
            <img src="${img.preview}" class="image-preview" alt="Preview ${i + 1}">
            <button onclick="removeImage(${i})" class="absolute top-2 right-2 bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center hover:bg-red-700"><i data-lucide="x" class="h-4 w-4"></i></button>`;
        container.appendChild(div);
    });
    safeCreateIcons();
}

function removeImage(index) {
    uploadedImages.splice(index, 1);
    updateImagePreview();
}

async function handleProjectSubmit(e) {
    e.preventDefault();
    const title = document.getElementById('project-title').value;
    const key = document.getElementById('project-key').value;
    const description = document.getElementById('project-description').value;

    try {
        const existingImages = uploadedImages.filter(img => img.isExisting && img.url);
        const newFiles = uploadedImages.filter(img => img.file && !img.isExisting);
        let imageUrls = existingImages.map(img => img.url);

        if (currentProjectId) {
            for (const img of newFiles) {
                const fd = new FormData();
                fd.append('file', img.file);
                const uploaded = await window.cfApi.post(`/projects/${currentProjectId}/images`, fd, true);
                imageUrls.push(uploaded.url);
            }
            await window.cfApi.put(`/projects/${currentProjectId}`, { title, description, images: imageUrls });
        } else {
            const body = { title, key, description, images: imageUrls };
            const created = await window.cfApi.post('/projects', body);
            for (const img of newFiles) {
                const fd = new FormData();
                fd.append('file', img.file);
                await window.cfApi.post(`/projects/${created.id}/images`, fd, true);
            }
        }
        closeProjectModal();
        loadProjects();
        alert('הפרויקט נשמר בהצלחה!');
    } catch (err) {
        alert('שגיאה: ' + err.message);
    }
}

async function editProject(projectId) {
    currentProjectId = projectId;
    try {
        const project = await window.cfApi.get(`/projects/${projectId}`, true);
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
        <img src="dark_logo_big3d.webp" alt="Current Logo" class="logo-preview">
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
