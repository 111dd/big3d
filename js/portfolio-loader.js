// Portfolio Loader - Loads projects from Cloudflare API
// Renders first 6 initially, "Load more" for the rest

const INITIAL_COUNT = 6;
const LOAD_MORE_COUNT = 6;
const PORTFOLIO_PLACEHOLDER_URL = '/portfolio-placeholder.svg';

window.CLOUDFLARE_API_URL = window.CLOUDFLARE_API_URL || 'https://big3d.111dordavid.workers.dev';
window.portfolioRemaining = [];
let imageManifestPromise = null;

function escapeAttribute(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function getProjectDomId(key) {
  return (key || 'project').toLowerCase().replace(/[^a-z0-9_-]+/gi, '-');
}

function buildProject(key, images, title) {
  const urls = Array.isArray(images) ? images : [];
  const imgs = urls.map((url, i) => ({
    url: url.startsWith('http') ? url : (window.location?.origin || '') + '/' + url,
    is_thumbnail: i === 0
  }));
  return { key, title, images: imgs };
}

function normalizeImageKey(url) {
  if (!url) return '';
  try {
    const parsed = new URL(url, window.location?.origin || 'https://www.big3d.co.il');
    return decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
  } catch (_) {
    return decodeURIComponent(String(url).split('?')[0].replace(/^\/+/, ''));
  }
}

function getOptimizedImageEntry(url) {
  const manifest = window.OPTIMIZED_IMAGES || {};
  return manifest[normalizeImageKey(url)] || null;
}

/** Card thumbnails use the subject-focused 4:3 "thumb" crop when the manifest has one. */
function getVariantEntry(url, variant) {
  const entry = getOptimizedImageEntry(url);
  if (!entry) return null;
  if (variant === 'thumb' && entry.thumb) return entry.thumb;
  return entry;
}

function buildOptimizedSrcset(url, format, variant) {
  const entry = getVariantEntry(url, variant);
  if (!entry || !Array.isArray(entry[format])) return '';
  return entry[format].map(item => `${item.url} ${item.width}w`).join(', ');
}

function getBestOptimizedUrl(url, targetWidth = 800, variant) {
  const entry = getVariantEntry(url, variant);
  if (!entry) return null;
  const candidates = entry.webp || [];
  const match = candidates.find(item => item.width >= targetWidth) || candidates[candidates.length - 1];
  return match?.url || entry.fallback || null;
}

function isWorkerStorageUrl(url) {
  try {
    const u = new URL(url, window.location?.origin || 'https://www.big3d.co.il');
    const apiBase = (window.CLOUDFLARE_API_URL || '').replace(/\/$/, '');
    if (!apiBase) return false;
    return u.origin === new URL(apiBase).origin && u.pathname.includes('/storage/');
  } catch (_) {
    return false;
  }
}

/** Returns an optimized URL for thumbnails from local assets or Worker storage. */
function getSizedImageUrl(url, width = 400, variant) {
  if (!url) return url;
  const localOptimized = getBestOptimizedUrl(url, width, variant);
  if (localOptimized) return localOptimized;

  try {
    const u = new URL(url);
    if (isWorkerStorageUrl(url)) {
      u.searchParams.set('w', String(width));
      return u.toString();
    }
  } catch (_) {}
  return url;
}

function buildWorkerStorageSrcset(url, widths) {
  if (!isWorkerStorageUrl(url)) return '';
  return widths.map(width => `${getSizedImageUrl(url, width)} ${width}w`).join(', ');
}

function buildImageSources(url, widths, variant) {
  const avif = buildOptimizedSrcset(url, 'avif', variant);
  const webp = buildOptimizedSrcset(url, 'webp', variant);
  const storage = buildWorkerStorageSrcset(url, widths);
  return { avif, webp: webp || storage };
}

function loadImageManifestIfNeeded() {
  if (window.OPTIMIZED_IMAGES) return Promise.resolve();
  if (imageManifestPromise) return imageManifestPromise;

  imageManifestPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = '/js/image-manifest.js?v=2';
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  }).catch(() => {
    window.OPTIMIZED_IMAGES = window.OPTIMIZED_IMAGES || {};
  });

  return imageManifestPromise;
}

function createProjectCard(project) {
  if (!project.images || project.images.length === 0) return null;
  const thumbnail = project.images.find(img => img.is_thumbnail) || project.images[0];
  const thumbnailUrl = thumbnail.url;
  const domId = getProjectDomId(project.key);

  const card = document.createElement('div');
  card.className = 'portfolio-card relative rounded-2xl overflow-hidden shadow-card cursor-pointer group';
  card.setAttribute('role', 'button');
  card.setAttribute('tabindex', '0');
  card.setAttribute('aria-label', `פתח גלריית תמונות - ${project.title}`);
  card.addEventListener('click', () => openPortfolioModal(project.key));
  card.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openPortfolioModal(project.key);
    }
  });

  const thumbUrl = getSizedImageUrl(thumbnailUrl, 400, 'thumb');
  const sources = buildImageSources(thumbnailUrl, [400, 800], 'thumb');
  const sizes = '(min-width: 960px) 223px, (min-width: 760px) calc((100vw - 68px) / 4), calc((100vw - 42px) / 2)';
  card.innerHTML = `
    <div id="${domId}-skeleton" class="skeleton w-full h-60 absolute"></div>
    <picture>
      ${sources.avif ? `<source type="image/avif" srcset="${escapeAttribute(sources.avif)}" sizes="${sizes}">` : ''}
      ${sources.webp ? `<source type="image/webp" srcset="${escapeAttribute(sources.webp)}" sizes="${sizes}">` : ''}
      <img id="${domId}-thumb" width="400" height="300" loading="lazy" decoding="async" fetchpriority="low" src="${escapeAttribute(thumbUrl)}"
           class="w-full h-60 object-cover group-hover:scale-105 transition-transform duration-500 relative watermarked"
           alt="פרויקט הדפסת תלת־ממד וייצור - ${escapeAttribute(project.title)}">
    </picture>
    <div class="absolute bottom-0 w-full p-4 bg-neutral/90">
      <h4 class="font-bold text-lg">${escapeAttribute(project.title)}</h4>
    </div>`;

  const skeleton = card.querySelector(`#${domId}-skeleton`);
  const image = card.querySelector(`#${domId}-thumb`);
  if (image) {
    image.addEventListener('load', () => {
      if (skeleton) skeleton.style.display = 'none';
    });
    image.addEventListener('error', () => {
      image.onerror = null;
      image.src = PORTFOLIO_PLACEHOLDER_URL;
      image.classList.add('object-contain', 'p-6', 'bg-neutral-dark');
      if (skeleton) skeleton.style.display = 'none';
    });
  }
  return card;
}

function renderPortfolioSkeletons(count = INITIAL_COUNT) {
  const grid = document.querySelector('#portfolio .grid');
  const loadMoreContainer = document.getElementById('portfolio-load-more');
  if (!grid) return;

  grid.querySelectorAll('[data-portfolio-card], [data-portfolio-skeleton]').forEach(el => el.remove());
  if (loadMoreContainer) loadMoreContainer.remove();

  for (let i = 0; i < count; i += 1) {
    const skeletonCard = document.createElement('div');
    skeletonCard.setAttribute('data-portfolio-skeleton', '1');
    skeletonCard.className = 'rounded-2xl overflow-hidden shadow-card bg-neutral';
    skeletonCard.innerHTML = `
      <div class="skeleton w-full h-60"></div>
      <div class="p-4 space-y-3">
        <div class="skeleton h-5 w-2/3"></div>
        <div class="skeleton h-4 w-1/2"></div>
      </div>`;
    grid.appendChild(skeletonCard);
  }
}

function renderProjectsToGrid(projects, append = false) {
  const grid = document.querySelector('#portfolio .grid');
  const loadMoreContainer = document.getElementById('portfolio-load-more');
  if (!grid) return;

  if (!append) {
    grid.querySelectorAll('[data-portfolio-card], [data-portfolio-skeleton]').forEach(el => el.remove());
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

async function loadProjectsFromCloudflare() {
  try {
    const base = (window.CLOUDFLARE_API_URL || '').replace(/\/$/, '');
    const res = await fetch(base + '/projects');
    if (!res.ok) throw new Error(res.statusText);
    const projects = await res.json();

    if (!projects || projects.length === 0) {
      await useHardcodedProjects();
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
  } catch {
    await useHardcodedProjects();
  }
}

async function useHardcodedProjects() {
  await loadImageManifestIfNeeded();

  const fallback = {
    'egg': ['egg/firtst_egg.jpeg', 'egg/egg-final-product-1.jpg', 'egg/egg-final-product-2.jpg', 'egg/egg-design-1.jpg', 'egg/egg-design-2.jpg', 'egg/egg-with-kids.png', 'egg/egg-whatsapp-1.jpg'],
    'Garbage shaft cleaning model': ['Garbage shaft cleaning model/first_wobg.png', 'Garbage shaft cleaning model/garbage-model-1.jpg', 'Garbage shaft cleaning model/garbage-model-2.jpg', 'Garbage shaft cleaning model/garbage-model-3-wbg.jpg', 'Garbage shaft cleaning model/garbage-model-4.jpg', 'Garbage shaft cleaning model/garbage-model-5.jpg', 'Garbage shaft cleaning model/garbage-laser-engraving.jpg', 'Garbage shaft cleaning model/garbage-model-7.jpg', 'Garbage shaft cleaning model/garbage-whatsapp-1.jpg', 'Garbage shaft cleaning model/garbage-whatsapp-2.jpg', 'Garbage shaft cleaning model/garbage-whatsapp-3.jpg', 'Garbage shaft cleaning model/garbage-whatsapp-4.jpg', 'Garbage shaft cleaning model/garbage-whatsapp-5.jpg', 'Garbage shaft cleaning model/garbage-whatsapp-6.jpg'],
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
renderPortfolioSkeletons();
loadProjectsFromCloudflare();
