/**
 * Home page motion system: Lenis smooth scroll + GSAP ScrollTrigger.
 *
 * - Hero: the logo is "printed" layer by layer (LPBF style) as the visitor scrolls.
 * - Section headings, cards and boxes reveal as they enter the viewport.
 * - Desktop only: spotlight/tilt on service cards, magnetic hero buttons, hero glow.
 *
 * Everything here is progressive enhancement. Without JS, with reduced motion,
 * or if the libraries fail to load, the page renders in its final readable state.
 */
(function () {
  'use strict';

  const root = document.documentElement;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  if (reduceMotion || !window.gsap || !window.ScrollTrigger) {
    root.classList.remove('js-print');
    return;
  }

  const gsap = window.gsap;
  const ScrollTrigger = window.ScrollTrigger;
  gsap.registerPlugin(ScrollTrigger);
  gsap.defaults({ ease: 'power3.out', duration: 0.85 });

  root.classList.add('motion-ready', 'has-motion');

  /* ---------- Smooth scroll (wheel only; touch keeps native scrolling) ---------- */
  let lenis = null;
  if (window.Lenis) {
    lenis = new window.Lenis({
      lerp: 0.09,
      smoothWheel: true,
      wheelMultiplier: 0.9,
      anchors: true, // honours html scroll-padding-top for the fixed navbar
    });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((time) => lenis.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);
    window.__lenis = lenis;

    // The portfolio modal locks the page with body.overflow-hidden; pause Lenis with it.
    new MutationObserver(() => {
      if (document.body.classList.contains('overflow-hidden')) lenis.stop();
      else lenis.start();
    }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  }

  /* ---------- Hero: layer-by-layer logo print ---------- */
  function initLogoPrint() {
    const hero = document.getElementById('home');
    const stage = document.querySelector('[data-print-stage]');
    if (!hero || !stage || !root.classList.contains('js-print')) {
      root.classList.remove('js-print');
      return;
    }

    const part = stage.querySelector('.print-part');
    const laser = stage.querySelector('.print-laser');
    const pool = stage.querySelector('.print-pool');
    const heat = stage.querySelector('.print-heat');
    const sparksBox = stage.querySelector('.print-sparks');
    const hud = document.querySelector('[data-print-hud]');
    const hudLayer = hud && hud.querySelector('[data-print-layer]');
    const hudPct = hud && hud.querySelector('[data-print-pct]');
    const hudBar = hud && hud.querySelector('.print-bar i');
    const hint = document.querySelector('[data-print-hint]');

    const LAYERS = 60;
    const state = { p: 0 };
    let intro = 0;
    let scrollP = 0;
    let lastLayer = -1;
    let lastSpark = 0;

    const sparks = [];
    for (let i = 0; i < 10; i++) {
      const s = document.createElement('i');
      sparksBox.appendChild(s);
      sparks.push(s);
    }
    let sparkIndex = 0;

    function spark(x, y) {
      const now = performance.now();
      if (now - lastSpark < 45) return;
      lastSpark = now;
      const s = sparks[sparkIndex++ % sparks.length];
      gsap.killTweensOf(s);
      gsap.fromTo(s,
        { x, y, autoAlpha: 1, scale: 1 },
        {
          x: x + gsap.utils.random(-26, 26),
          y: y - gsap.utils.random(8, 34),
          autoAlpha: 0,
          scale: 0.3,
          duration: gsap.utils.random(0.35, 0.7),
          ease: 'power2.out',
        });
    }

    function render() {
      const p = Math.min(1, Math.max(0, state.p));
      const exact = p * LAYERS;
      const layer = Math.min(LAYERS, Math.floor(exact));
      const done = p >= 0.995;
      const h = stage.clientHeight;
      const w = stage.clientWidth;

      // Printed height grows in whole layers, like a real build.
      const printed = done ? 1 : layer / LAYERS;
      const top = (1 - printed) * 100;
      part.style.clipPath = 'inset(' + top + '% 0 0 0)';

      // Laser sits on the layer being melted and rasters across it (alternating direction).
      const lineY = (1 - (layer + 1) / LAYERS) * h;
      const frac = exact - Math.floor(exact);
      const sweep = layer % 2 === 0 ? frac : 1 - frac;
      const poolX = sweep * w;
      gsap.set(laser, { y: Math.max(0, lineY) });
      gsap.set(pool, { x: poolX });
      gsap.set(heat, { y: Math.max(0, lineY) });

      if (layer !== lastLayer || frac > 0.02) {
        if (p > 0.005 && !done) spark(poolX, Math.max(0, lineY));
      }
      lastLayer = layer;

      stage.classList.toggle('is-printing', p > 0.005 && !done);
      stage.classList.toggle('is-done', done);

      if (hud) {
        const shown = done ? LAYERS : Math.max(0, layer);
        hudLayer.textContent = String(shown).padStart(2, '0') + '/' + LAYERS;
        hudPct.textContent = done ? 'הושלם' : Math.round(p * 100) + '%';
        hudBar.style.transform = 'scaleX(' + p + ')';
        hud.classList.toggle('is-done', done);
      }
      if (hint) hint.classList.toggle('is-hidden', p > 0.2);
    }

    const pTo = gsap.quickTo(state, 'p', { duration: 0.7, ease: 'power3.out', onUpdate: render });
    const target = () => Math.max(intro, scrollP);

    // Pin the hero while printing when it fits on screen; otherwise print over a short scroll.
    const canPin = hero.offsetHeight <= window.innerHeight + 4;
    ScrollTrigger.create({
      trigger: hero,
      start: 'top top',
      end: () => '+=' + Math.round(window.innerHeight * (canPin ? 0.9 : 0.45)),
      pin: canPin,
      anticipatePin: 1,
      invalidateOnRefresh: true,
      onUpdate: (self) => {
        scrollP = self.progress;
        pTo(target());
      },
      onRefresh: (self) => {
        scrollP = self.progress;
        pTo(target());
      },
    });

    // Short intro so the empty build plate comes alive before the first scroll.
    gsap.to({ v: 0 }, {
      v: 0.12,
      duration: 1.6,
      delay: 0.35,
      ease: 'power2.inOut',
      onUpdate: function () {
        intro = this.targets()[0].v;
        pTo(target());
      },
    });

    window.addEventListener('resize', render, { passive: true });
    render();
  }

  /* ---------- Hero ambience (desktop): pointer glow + magnetic buttons ---------- */
  function initHeroPointer() {
    if (!finePointer) return;
    const hero = document.getElementById('home');
    if (!hero) return;
    const glow = { x: 50, y: 40 };
    const xTo = gsap.quickTo(glow, 'x', { duration: 0.8, onUpdate: () => hero.style.setProperty('--gx', glow.x + '%') });
    const yTo = gsap.quickTo(glow, 'y', { duration: 0.8, onUpdate: () => hero.style.setProperty('--gy', glow.y + '%') });
    hero.addEventListener('pointermove', (e) => {
      const r = hero.getBoundingClientRect();
      xTo(((e.clientX - r.left) / r.width) * 100);
      yTo(((e.clientY - r.top) / r.height) * 100);
    });

    document.querySelectorAll('[data-magnetic]').forEach((el) => {
      const mx = gsap.quickTo(el, 'x', { duration: 0.45 });
      const my = gsap.quickTo(el, 'y', { duration: 0.45 });
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        mx((e.clientX - r.left - r.width / 2) * 0.2);
        my((e.clientY - r.top - r.height / 2) * 0.2);
      });
      el.addEventListener('pointerleave', () => { mx(0); my(0); });
    });
  }

  /* ---------- Section headings: word-by-word masked reveal ---------- */
  function splitWords(el) {
    const text = el.textContent.trim();
    el.setAttribute('aria-label', text);
    el.textContent = '';
    text.split(/\s+/).forEach((word, i) => {
      if (i) el.appendChild(document.createTextNode(' '));
      const mask = document.createElement('span');
      const inner = document.createElement('span');
      mask.className = 'motion-word-mask';
      mask.setAttribute('aria-hidden', 'true');
      inner.className = 'motion-word';
      inner.textContent = word;
      mask.appendChild(inner);
      el.appendChild(mask);
    });
    return el.querySelectorAll('.motion-word');
  }

  function initHeadings() {
    document.querySelectorAll('[data-motion-heading]').forEach((el) => {
      const words = splitWords(el);
      gsap.fromTo(words,
        { yPercent: 110 },
        {
          yPercent: 0,
          duration: 1,
          ease: 'power4.out',
          stagger: 0.06,
          scrollTrigger: { trigger: el, start: 'top 85%', once: true },
        });
    });
  }

  /* ---------- Blocks: take over the CSS .reveal fade with staggered GSAP reveals ---------- */
  function initReveals() {
    const blocks = Array.from(document.querySelectorAll('main .reveal'))
      .filter((el) => !el.closest('#home') && el.id !== 'portfolio-grid');

    blocks.forEach((el) => {
      el.classList.remove('reveal');
      const group = el.hasAttribute('data-reveal-group');
      const targets = group ? Array.from(el.children) : [el];
      if (group) gsap.set(el, { autoAlpha: 1 });
      gsap.fromTo(targets,
        { y: group ? 40 : 28, autoAlpha: 0 },
        {
          y: 0,
          autoAlpha: 1,
          duration: 0.95,
          ease: 'power4.out',
          stagger: group ? 0.09 : 0,
          clearProps: 'transform',
          scrollTrigger: { trigger: el, start: 'top 85%', once: true },
        });
    });

    // Portfolio cards are injected later by portfolio-loader.js; reveal each batch as it lands.
    const grid = document.getElementById('portfolio-grid');
    if (grid) {
      const seen = new WeakSet();
      const animateNew = () => {
        const fresh = Array.from(grid.children).filter((c) => !seen.has(c) && !c.classList.contains('skeleton'));
        if (!fresh.length) return;
        fresh.forEach((c) => seen.add(c));
        ScrollTrigger.batch(fresh, {
          start: 'top 90%',
          once: true,
          onEnter: (batch) => gsap.fromTo(batch,
            { y: 36, autoAlpha: 0 },
            { y: 0, autoAlpha: 1, duration: 0.85, ease: 'power4.out', stagger: 0.07, clearProps: 'transform' }),
        });
        ScrollTrigger.refresh();
      };
      new MutationObserver(animateNew).observe(grid, { childList: true });
      animateNew();
    }
  }

  /* ---------- Service cards (desktop): cursor spotlight + gentle tilt ---------- */
  function initCards() {
    if (!finePointer) return;
    document.querySelectorAll('[data-tilt-card]').forEach((card) => {
      gsap.set(card, { transformPerspective: 900 });
      const rx = gsap.quickTo(card, 'rotationX', { duration: 0.5 });
      const ry = gsap.quickTo(card, 'rotationY', { duration: 0.5 });
      card.addEventListener('pointermove', (e) => {
        const r = card.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width;
        const py = (e.clientY - r.top) / r.height;
        card.style.setProperty('--mx', (px * 100).toFixed(1) + '%');
        card.style.setProperty('--my', (py * 100).toFixed(1) + '%');
        rx((0.5 - py) * 6);
        ry((px - 0.5) * 6);
      });
      card.addEventListener('pointerleave', () => { rx(0); ry(0); });
    });
  }

  function init() {
    initLogoPrint();
    initHeroPointer();
    initHeadings();
    initReveals();
    initCards();
    window.addEventListener('load', () => ScrollTrigger.refresh());
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
