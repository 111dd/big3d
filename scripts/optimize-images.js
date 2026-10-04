#!/usr/bin/env node
/**
 * Generates high-quality responsive AVIF/WebP variants for local images.
 * Source images are kept untouched; the site consumes files from /optimized.
 *
 * Results are cached in scripts/image-cache.json: an image whose bytes, crop
 * override and this script are unchanged is not re-encoded. /optimized, the
 * manifest and the cache are committed, so Cloudflare builds reuse them too.
 * Pass --force to re-encode everything.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const root = path.join(__dirname, '..');
const outputRoot = path.join(root, 'optimized');
const manifestPath = path.join(root, 'js', 'image-manifest.js');
const cachePath = path.join(__dirname, 'image-cache.json');
const force = process.argv.includes('--force');

const imageExts = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const skipDirs = new Set(['.git', '.wrangler', 'dist', 'node_modules', 'optimized', 'big3d.co.il-audit', 'claude-seo']);
const photoWidths = [400, 800, 1200, 1600];
const graphicWidths = [96, 160, 240, 360];
// Gallery cards are 4:3 and use object-fit: cover. A dedicated, subject-focused
// crop is generated for every photo so cards fill edge-to-edge without margins.
const thumbAspect = 4 / 3;
const thumbWidths = [400, 800];
const focusPath = path.join(__dirname, 'image-focus.json');
// Optional per-image override of the crop position (sharp gravity/strategy names).
const focusOverrides = fs.existsSync(focusPath) ? JSON.parse(fs.readFileSync(focusPath, 'utf8')) : {};
const CONCURRENCY = 4;
// AVIF effort 4 is visually identical to 6 at these sizes but ~2x faster in CI.
const AVIF_EFFORT = 4;
const WEBP_EFFORT = 5;

function sha1(data) {
  return crypto.createHash('sha1').update(data).digest('hex');
}

// Any edit to this script (sizes, quality, crop logic) invalidates every cached image.
const scriptHash = sha1(fs.readFileSync(__filename, 'utf8').replace(/\r\n/g, '\n'));

function cacheKey(file, relative) {
  return sha1([scriptHash, JSON.stringify(focusOverrides[relative] || null), sha1(fs.readFileSync(file))].join('\n'));
}

/** Repo-relative paths of every file an entry points to. */
function outputsOf(entry) {
  const items = [...entry.avif, ...entry.webp, ...(entry.thumb ? [...entry.thumb.avif, ...entry.thumb.webp] : [])];
  return items.map(item => decodeURIComponent(item.url.slice(1)));
}

function readCache() {
  if (force || !fs.existsSync(cachePath)) return {};
  try {
    return JSON.parse(fs.readFileSync(cachePath, 'utf8'));
  } catch {
    return {};
  }
}

/** Deletes files under /optimized that no current entry points to, then empty folders. */
function removeOrphans(dir, expected) {
  let removed = 0;
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (fs.statSync(full).isDirectory()) {
      removed += removeOrphans(full, expected);
      if (!fs.readdirSync(full).length) fs.rmdirSync(full);
    } else if (!expected.has(toPosix(path.relative(root, full)))) {
      fs.unlinkSync(full);
      removed += 1;
    }
  }
  return removed;
}

function toPosix(filePath) {
  return filePath.split(path.sep).join('/');
}

function urlFor(relativeFile) {
  return '/' + relativeFile.split('/').map(encodeURIComponent).join('/');
}

function shouldSkipFile(relativeFile) {
  if (relativeFile === 'dark_logo_big3d.jpg') return true; // Legacy source; the WebP logo is the canonical source.
  if (relativeFile.startsWith('scripts/') || relativeFile.startsWith('src/')) return true;
  return false;
}

function collectImages(dir, result = []) {
  for (const entry of fs.readdirSync(dir)) {
    if (skipDirs.has(entry)) continue;
    const full = path.join(dir, entry);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      collectImages(full, result);
      continue;
    }

    const ext = path.extname(entry).toLowerCase();
    const relative = toPosix(path.relative(root, full));
    if (imageExts.has(ext) && !shouldSkipFile(relative)) {
      result.push(full);
    }
  }
  return result;
}

function variantsFor(relative, width) {
  const isGraphic =
    relative.startsWith('icons/') ||
    relative.includes('logo') ||
    relative === 'dark_logo_big3d.webp';
  const widths = isGraphic ? graphicWidths : photoWidths;
  const selected = widths.filter(w => w <= width);
  if (!selected.length) selected.push(Math.min(width, widths[0]));
  if (!selected.includes(width) && width < widths[widths.length - 1]) {
    selected.push(width);
  }
  return [...new Set(selected)].sort((a, b) => a - b);
}

async function writeVariant(source, relative, width, format) {
  const parsed = path.parse(relative);
  const outputRelative = toPosix(path.join(
    'optimized',
    parsed.dir,
    `${parsed.name}-${width}.${format}`
  ));
  const outputPath = path.join(root, outputRelative);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  const isGraphic = relative.startsWith('icons/') || relative.includes('logo');
  let pipeline = sharp(source)
    .rotate()
    .resize({
      width,
      withoutEnlargement: true,
      fit: 'inside',
    });

  await encode(pipeline, format, isGraphic).toFile(outputPath);
  return { width, url: urlFor(outputRelative), bytes: fs.statSync(outputPath).size };
}

function encode(pipeline, format, isGraphic) {
  if (format === 'avif') {
    return pipeline.avif({
      quality: isGraphic ? 72 : 62,
      effort: AVIF_EFFORT,
      chromaSubsampling: isGraphic ? '4:4:4' : '4:2:0',
    });
  }
  return pipeline.webp({
    quality: isGraphic ? 90 : 84,
    effort: WEBP_EFFORT,
    smartSubsample: true,
  });
}

function isGraphicFile(relative) {
  return relative.startsWith('icons/') || relative.includes('logo') || relative === 'dark_logo_big3d.webp';
}

/** Writes a 4:3 cover crop centred on the visually salient region. */
async function writeThumb(source, relative, width, format, meta) {
  const parsed = path.parse(relative);
  const outputRelative = toPosix(path.join('optimized', parsed.dir, `${parsed.name}-thumb-${width}.${format}`));
  const outputPath = path.join(root, outputRelative);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  const height = Math.round(width / thumbAspect);
  const override = focusOverrides[relative];
  const position = override && sharp.strategy[override] ? sharp.strategy[override]
    : override || sharp.strategy.attention;

  // Never upscale: if the source is narrower than the requested width, cover-crop at source scale.
  const targetWidth = Math.min(width, meta.width);
  const targetHeight = Math.round(targetWidth / thumbAspect);

  const pipeline = sharp(source)
    .rotate()
    .resize({ width: targetWidth, height: targetHeight, fit: 'cover', position });

  await encode(pipeline, format, false).toFile(outputPath);
  return { width: targetWidth, url: urlFor(outputRelative), bytes: fs.statSync(outputPath).size };
}

async function processFile(file) {
  const relative = toPosix(path.relative(root, file));
  const meta = await sharp(file).rotate().metadata();
  if (!meta.width || !meta.height) return null;

  const widths = variantsFor(relative, meta.width);
  const avif = [];
  const webp = [];
  let bytes = 0;

  for (const width of widths) {
    const avifVariant = await writeVariant(file, relative, width, 'avif');
    const webpVariant = await writeVariant(file, relative, width, 'webp');
    avif.push(avifVariant);
    webp.push(webpVariant);
    bytes += avifVariant.bytes + webpVariant.bytes;
  }

  const entry = {
    width: meta.width,
    height: meta.height,
    original: urlFor(relative),
    fallback: (webp.find(item => item.width >= Math.min(meta.width, 800)) || webp[webp.length - 1]).url,
    avif,
    webp,
  };

  if (!isGraphicFile(relative)) {
    const thumbAvif = [];
    const thumbWebp = [];
    const seen = new Set();
    for (const width of thumbWidths) {
      const effective = Math.min(width, meta.width);
      if (seen.has(effective)) continue;
      seen.add(effective);
      const a = await writeThumb(file, relative, width, 'avif', meta);
      const w = await writeThumb(file, relative, width, 'webp', meta);
      thumbAvif.push(a);
      thumbWebp.push(w);
      bytes += a.bytes + w.bytes;
    }
    entry.thumb = { avif: thumbAvif, webp: thumbWebp, fallback: thumbWebp[thumbWebp.length - 1].url };
  }

  return { relative, entry, sourceBytes: fs.statSync(file).size, optimizedBytes: bytes, variants: avif.length + webp.length + (entry.thumb ? entry.thumb.avif.length + entry.thumb.webp.length : 0) };
}

async function main() {
  const started = Date.now();
  const cache = readCache();
  fs.mkdirSync(outputRoot, { recursive: true });

  const files = collectImages(root);
  const manifest = {};
  let sourceBytes = 0;
  let optimizedBytes = 0;
  let variantCount = 0;
  let done = 0;
  let reused = 0;

  console.log(`Optimizing ${files.length} images (${CONCURRENCY} in parallel)...`);

  const queue = files.slice();
  const results = [];
  async function worker() {
    while (queue.length) {
      const file = queue.shift();
      const relative = toPosix(path.relative(root, file));
      const key = cacheKey(file, relative);
      const cached = cache[relative];
      let result;
      if (cached && cached.key === key && outputsOf(cached.entry).every(f => fs.existsSync(path.join(root, f)))) {
        result = { ...cached, relative, sourceBytes: fs.statSync(file).size };
        reused += 1;
      } else {
        result = await processFile(file);
      }
      done += 1;
      if (result) results.push({ ...result, key });
      if (done % 10 === 0 || done === files.length) {
        console.log(`  ${done}/${files.length} images (${((Date.now() - started) / 1000).toFixed(0)}s)`);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, files.length) }, worker));

  // Deterministic manifest order regardless of completion order.
  results.sort((a, b) => a.relative.localeCompare(b.relative));
  for (const result of results) {
    manifest[result.relative] = result.entry;
    sourceBytes += result.sourceBytes;
    optimizedBytes += result.optimizedBytes;
    variantCount += result.variants;
  }

  const js = `// Auto-generated by scripts/optimize-images.js\nwindow.OPTIMIZED_IMAGES = ${JSON.stringify(manifest, null, 2)};\n`;
  fs.writeFileSync(manifestPath, js);

  const nextCache = {};
  for (const { relative, key, entry, optimizedBytes: bytes, variants } of results) {
    nextCache[relative] = { key, entry, optimizedBytes: bytes, variants };
  }
  fs.writeFileSync(cachePath, JSON.stringify(nextCache, null, 2) + '\n');
  const removed = removeOrphans(outputRoot, new Set(results.flatMap(r => outputsOf(r.entry))));

  console.log(`✅ Optimized ${files.length} images into ${variantCount} AVIF/WebP variants in ${((Date.now() - started) / 1000).toFixed(0)}s`);
  console.log(`Reused from cache: ${reused}, encoded: ${files.length - reused}, stale files removed: ${removed}`);
  console.log(`Source images: ${(sourceBytes / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Generated variants: ${(optimizedBytes / 1024 / 1024).toFixed(2)} MB`);
  console.log('Manifest: js/image-manifest.js');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
