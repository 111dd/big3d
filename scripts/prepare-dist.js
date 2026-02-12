#!/usr/bin/env node
/**
 * Prepares dist/ for Cloudflare Pages deployment.
 * Ensures sitemap.xml, robots.txt, and all static files are included.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');

// Clean dist
if (fs.existsSync(dist)) fs.rmSync(dist, { recursive: true });
fs.mkdirSync(dist, { recursive: true });

// Copy everything except build/config files
const exclude = ['node_modules', '.git', 'dist', 'src', 'scripts', 'worker', 'tailwind.config.js', 'package.json', 'package-lock.json', '.gitignore'];
const excludeExt = ['.md'];
function shouldExclude(name) {
  if (exclude.includes(name)) return true;
  if (excludeExt.some(ext => name.endsWith(ext))) return true;
  return false;
}

function copyRecursiveFilter(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    for (const item of fs.readdirSync(src)) {
      if (shouldExclude(item)) continue;
      const srcItem = path.join(src, item);
      if (item === 'node_modules' || item === 'dist' || item === '.git') continue;
      copyRecursiveFilter(srcItem, path.join(dest, item));
    }
  } else {
    if (shouldExclude(path.basename(src))) return;
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

const items = fs.readdirSync(root);
for (const item of items) {
  if (shouldExclude(item)) continue;
  const src = path.join(root, item);
  if (item === 'node_modules' || item === 'dist' || item === '.git') continue;
  copyRecursiveFilter(src, path.join(dist, item));
}

console.log('✅ dist/ prepared for deployment');
