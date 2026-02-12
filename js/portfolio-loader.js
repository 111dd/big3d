// Portfolio Loader - Loads projects from Cloudflare API
// Renders first 6 initially, "Load more" for the rest

const INITIAL_COUNT = 6;
const LOAD_MORE_COUNT = 6;

window.CLOUDFLARE_API_URL = window.CLOUDFLARE_API_URL || 'https://big3d.111dordavid.workers.dev';
window.portfolioRemaining = [];

function buildProject(key, images, title) {
  const urls = Array.isArray(images) ? images : [];
  const imgs = urls.map((url, i) => ({
    url: url.startsWith('http') ? url : (window.location?.origin || '') + '/' + url,
    is_thumbnail: i === 0
  }));
  return { key, title, images: imgs };
}

/** Returns thumbnail URL with ?w=400 for Worker storage (smaller payload) */
function getThumbnailUrl(url) {
  if (!url) return url;
  try {
    const u = new URL(url);
    const apiBase = (window.CLOUDFLARE_API_URL || '').replace(/\/$/, '');
    if (!apiBase) return url;
    const apiOrigin = new URL(apiBase).origin;
    if (u.origin === apiOrigin && u.pathname.includes('/storage/')) {
      u.searchParams.set('w', '400');
      return u.toString();
    }
  } catch (_) {}
  return url;
}

function createProjectCard(project) {
  if (!project.images || project.images.length === 0) return null;
  const thumbnail = project.images.find(img => img.is_thumbnail) || project.images[0];
  const thumbnailUrl = thumbnail.url;
  const safeKey = (project.key || '').replace(/'/g, "\\'");

  const card = document.createElement('div');
  card.className = 'relative rounded-2xl overflow-hidden shadow-card cursor-pointer group';
  card.setAttribute('onclick', `openPortfolioModal('${safeKey}')`);
  card.setAttribute('role', 'button');
  card.setAttribute('tabindex', '0');
  card.setAttribute('aria-label', `פתח גלריית תמונות - ${project.title}`);
  card.setAttribute('onkeypress', `if(event.key==='Enter') openPortfolioModal('${safeKey}')`);

  const thumbUrl = getThumbnailUrl(thumbnailUrl);
  card.innerHTML = `
    <div id="${safeKey}-skeleton" class="skeleton w-full h-60 absolute"></div>
    <img id="${safeKey}-thumb" width="400" height="240" loading="lazy" decoding="async" fetchpriority="low" src="${thumbUrl}"
         class="w-full h-60 object-cover group-hover:scale-105 transition-transform duration-500 relative watermarked"
         alt="פרויקט הדפסת תלת מימד וייצור – ${(project.title || '').replace(/"/g, '&quot;')}"
         onerror="this.src='https://images.unsplash.com/photo-1560275619-4662e36fa65c?q=80&w=1200&auto=format&fit=crop'; const el=document.getElementById('${safeKey}-skeleton'); if(el) el.style.display='none'"
         onload="const el=document.getElementById('${safeKey}-skeleton'); if(el) el.style.display='none'">
    <div class="absolute bottom-0 w-full p-4 bg-neutral/90">
      <h4 class="font-bold text-lg">${project.title}</h4>
    </div>`;
  return card;
}

function renderProjectsToGrid(projects, append = false) {
  const grid = document.querySelector('#portfolio .grid');
  const loadMoreContainer = document.getElementById('portfolio-load-more');
  if (!grid) return;

  if (!append) {
    grid.querySelectorAll('[data-portfolio-card]').forEach(el => el.remove());
    if (loadMoreContainer) loadMoreContainer.remove();
  }

  projects.forEach(project => {
    const card = createProjectCard(project);
    if (card) {
      card.setAttribute('data-portfolio-card', '1');
      grid.appendChild(card);
    }
  });
}

function updateLoadMoreButton() {
  const container = document.getElementById('portfolio-load-more');
  if (!container) return;
  if (window.portfolioRemaining.length === 0) {
    container.remove();
  } else {
    container.classList.remove('hidden');
  }
}

function loadMorePortfolio() {
  const next = window.portfolioRemaining.splice(0, LOAD_MORE_COUNT);
  if (next.length === 0) return;
  renderProjectsToGrid(next, true);
  updateLoadMoreButton();
  safeCreateIcons?.();
}

function updatePortfolioGrid(projects) {
  const grid = document.querySelector('#portfolio .grid');
  if (!grid) return;

  const valid = projects.filter(p => p.images && p.images.length > 0);
  const initial = valid.slice(0, INITIAL_COUNT);
  window.portfolioRemaining = valid.slice(INITIAL_COUNT);

  renderProjectsToGrid(initial, false);

  if (window.portfolioRemaining.length > 0) {
    const container = document.createElement('div');
    container.id = 'portfolio-load-more';
    container.className = 'col-span-full flex justify-center mt-8';
    container.innerHTML = `
      <button onclick="loadMorePortfolio()" class="bg-brand-600 text-white px-8 py-3 rounded-full font-semibold hover:bg-brand-500 transition">
        טען עוד פרויקטים
      </button>`;
    grid.parentElement.appendChild(container);
  }
}

function updateThumbnails(projects) {
  projects.forEach(project => {
    if (!project.images || project.images.length === 0) return;
    const thumbnail = project.images.find(img => img.is_thumbnail) || project.images[0];
    const imgElement = document.getElementById(`${project.key}-thumb`);
    if (imgElement) imgElement.src = getThumbnailUrl(thumbnail.url);
  });
}

async function loadProjectsFromCloudflare() {
  try {
    const base = (window.CLOUDFLARE_API_URL || '').replace(/\/$/, '');
    const res = await fetch(base + '/projects');
    if (!res.ok) throw new Error(res.statusText);
    const projects = await res.json();

    if (!projects || projects.length === 0) {
      useHardcodedProjects();
      return;
    }

    const projectImages = {};
    const projectTitles = {};
    projects.forEach(project => {
      if (project.images && project.images.length > 0) {
        const sorted = project.images.sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
        projectImages[project.key] = sorted.map(img => img.url);
        projectTitles[project.key] = project.title;
      }
    });

    window.projectImages = { ...(window.projectImages || {}), ...projectImages };
    window.projectTitles = { ...(window.projectTitles || {}), ...projectTitles };
    updatePortfolioGrid(projects);
    updateThumbnails(projects);
  } catch {
    useHardcodedProjects();
  }
}

function useHardcodedProjects() {
  const fallback = {
    'egg': ['egg/firtst_egg.jpeg', 'egg/egg-final-product-1.jpg', 'egg/egg-final-product-2.jpg', 'egg/egg-design-1.jpg', 'egg/egg-design-2.jpg', 'egg/egg-with-kids.png', 'egg/egg-whatsapp-1.jpg'],
    'Garbage shaft cleaning model': ['Garbage shaft cleaning model/first_wobg.png', 'Garbage shaft cleaning model/garbage-model-1.jpg', 'Garbage shaft cleaning model/garbage-model-2.jpg', 'Garbage shaft cleaning model/garbage-model-3.jpg', 'Garbage shaft cleaning model/garbage-model-4.jpg', 'Garbage shaft cleaning model/garbage-model-5.jpg', 'Garbage shaft cleaning model/garbage-laser-engraving.jpg', 'Garbage shaft cleaning model/garbage-model-7.jpg', 'Garbage shaft cleaning model/garbage-whatsapp-1.jpg', 'Garbage shaft cleaning model/garbage-whatsapp-2.jpg', 'Garbage shaft cleaning model/garbage-whatsapp-3.jpg', 'Garbage shaft cleaning model/garbage-whatsapp-4.jpg', 'Garbage shaft cleaning model/garbage-whatsapp-5.jpg', 'Garbage shaft cleaning model/garbage-whatsapp-6.jpg'],
    'pizza car holder': ['pizza car holder/pizza-holder-1.jpg', 'pizza car holder/pizza-holder-2.jpg'],
    'trump': ['trump/trump-1.jpg', 'trump/trump-2.jpg'],
    'World Cup Cup': ['World Cup Cup/world-cup-cup-1.jpg', 'World Cup Cup/world-cup-cup-2.jpg', 'World Cup Cup/world-cup-cup-3.jpg', 'World Cup Cup/world-cup-cup-4.jpg'],
    'shark': ['shark/shark-1.jpg', 'shark/shark-2.jpg', 'shark/shark-3.jpg', 'shark/shark-whatsapp-1.jpg', 'shark/shark-whatsapp-2.jpg', 'shark/shark-whatsapp-3.jpg', 'shark/shark-whatsapp-4.jpg', 'shark/shark-whatsapp-5.jpg', 'shark/shark-whatsapp-6.jpg', 'shark/shark-whatsapp-7.jpg'],
    'laser': ['laser/laser-engraving-1.jpg', 'laser/laser-engraving-2.jpg', 'laser/laser-engraving-3.jpg', 'laser/laser-engraving-4.jpg']
  };
  const fallbackTitles = {
    'egg': 'ביצה - כורסת ישיבה',
    'Garbage shaft cleaning model': 'מודל ניקוי פיר אשפה',
    'pizza car holder': 'מחזיק פיצה לרכב',
    'trump': 'פרויקט טראמפ',
    'World Cup Cup': 'גביע המונדיאל',
    'shark': 'מודל כריש',
    'laser': 'דוגמאות חריטה בלייזר'
  };
  window.projectImages = { ...(window.projectImages || {}), ...fallback };
  window.projectTitles = { ...(window.projectTitles || {}), ...fallbackTitles };

  const projects = Object.keys(fallback).map(key =>
    buildProject(key, fallback[key], fallbackTitles[key] || key)
  );
  updatePortfolioGrid(projects);
}

// Initialize
useHardcodedProjects();
if (typeof loadProjectsFromCloudflare === 'function') {
  loadProjectsFromCloudflare();
}
