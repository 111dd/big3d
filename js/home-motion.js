/**
 * Home page motion system: Lenis smooth scroll + GSAP ScrollTrigger.
 *
 * - Hero: on load the logo is "printed" layer by layer in bare metal (LPBF style),
 *   then a red finish is sprayed across it. It plays on its own, independent of scroll.
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
      lerp: 0.12,
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

  /* ---------- Hero: layer-by-layer logo print, then a red finish ---------- */
  function initLogoPrint() {
    const hero = document.getElementById('home');
    const stage = document.querySelector('[data-print-stage]');
    if (!hero || !stage || !root.classList.contains('js-print')) {
      root.classList.remove('js-print');
      return;
    }

    const part = stage.querySelector('.print-part');
    const finish = stage.querySelector('.print-finish');
    const laser = stage.querySelector('.print-laser');
    const pool = stage.querySelector('.print-pool');
    const heat = stage.querySelector('.print-heat');
    const spray = stage.querySelector('.print-spray');
    const sparksBox = stage.querySelector('.print-sparks');
    const hud = document.querySelector('[data-print-hud]');
    const hudPhase = hud && hud.querySelector('[data-print-phase]');
    const hudLayer = hud && hud.querySelector('[data-print-layer]');
    const hudPct = hud && hud.querySelector('[data-print-pct]');
    const hudBar = hud && hud.querySelector('.print-bar i');

    const LAYERS = 60;
    // Sequence: first the metal build, a short beat of bare metal, then the red finish.
    const PRINT_END = 0.64;
    const FINISH_START = 0.72;
    const clamp01 = (v) => Math.min(1, Math.max(0, v));
    const state = { p: 0 };
    let lastSpark = 0;

    const sparks = [];
    for (let i = 0; i < 12; i++) {
      const s = document.createElement('i');
      sparksBox.appendChild(s);
      sparks.push(s);
    }
    let sparkIndex = 0;

    function spark(x, y, mist) {
      const now = performance.now();
      if (now - lastSpark < 45) return;
      lastSpark = now;
      const s = sparks[sparkIndex++ % sparks.length];
      s.classList.toggle('is-mist', !!mist);
      gsap.killTweensOf(s);
      gsap.fromTo(s,
        { x, y, autoAlpha: 1, scale: 1 },
        {
          x: x + (mist ? gsap.utils.random(-30, 4) : gsap.utils.random(-26, 26)),
          y: y + (mist ? gsap.utils.random(-14, 14) : -gsap.utils.random(8, 34)),
          autoAlpha: 0,
          scale: 0.3,
          duration: gsap.utils.random(0.35, 0.7),
          ease: 'power2.out',
        });
    }

    function render() {
      const p = clamp01(state.p);
      const pp = clamp01(p / PRINT_END);
      const pf = clamp01((p - FINISH_START) / (1 - FINISH_START));
      const printed = pp >= 0.995;
      const done = pf >= 0.995;
      const printing = pp > 0.005 && !printed;
      const finishing = pf > 0.005 && !done;
      const h = stage.clientHeight;
      const w = stage.clientWidth;

      // Phase 1: bare metal grows in whole layers, like a real build.
      const exact = pp * LAYERS;
      const layer = Math.min(LAYERS, Math.floor(exact));
      const top = printed ? 0 : (1 - layer / LAYERS) * 100;
      part.style.clipPath = 'inset(' + top + '% 0 0 0)';

      // The laser sits on the layer being melted and rasters across it (alternating direction).
      const lineY = Math.max(0, (1 - (layer + 1) / LAYERS) * h);
      const frac = exact - Math.floor(exact);
      const poolX = (layer % 2 === 0 ? frac : 1 - frac) * w;
      gsap.set(laser, { y: lineY });
      gsap.set(heat, { y: lineY });
      gsap.set(pool, { x: poolX });
      if (printing) spark(poolX, lineY, false);

      // Phase 2: a red finish is sprayed across the part, right to left (reading direction).
      const edge = (1 - pf) * 100;
      finish.style.clipPath = done ? 'none' : 'inset(0 0 0 ' + edge + '%)';
      const sprayX = (edge / 100) * w;
      gsap.set(spray, { x: sprayX });
      if (finishing) spark(sprayX, gsap.utils.random(0.15, 0.85) * h, true);

      stage.classList.toggle('is-printing', printing);
      stage.classList.toggle('is-printed', printed);
      stage.classList.toggle('is-finishing', finishing);
      stage.classList.toggle('is-done', done);

      if (hud) {
        hudPhase.textContent = pf > 0.005 ? 'FINISH' : 'LPBF';
        hudLayer.textContent = String(printed ? LAYERS : Math.max(0, layer)).padStart(2, '0') + '/' + LAYERS;
        hudPct.textContent = done ? 'הושלם' : printed && pf <= 0.005 ? 'מתכת' : Math.round((pf > 0.005 ? pf : pp) * 100) + '%';
        hudBar.style.transform = 'scaleX(' + (pf > 0.005 ? pf : pp) + ')';
        hud.classList.toggle('is-finishing', pf > 0.005 && !done);
        hud.classList.toggle('is-done', done);
      }
    }

    // Plays on its own as soon as the page is ready; scrolling never holds it back.
    // The print repeats roughly every 10 s (about 5 s of print, then the finished
    // logo holds for 5 s) and pauses while the hero is off screen.
    const REPEAT_HOLD = 5;
    const tl = gsap.timeline({ delay: 0.3, repeat: -1, repeatDelay: REPEAT_HOLD, onUpdate: render })
      .to(state, { p: PRINT_END, duration: 3.2, ease: 'power1.inOut' })
      .to(state, { p: FINISH_START, duration: 0.5, ease: 'none' })
      .to(state, { p: 1, duration: 1.4, ease: 'power2.inOut' });

    // If the visitor arrives below the hero (e.g. a #contact link), show the finished
    // logo and start the loop with a hold when the hero first comes into view.
    let waitingForHero = hero.getBoundingClientRect().bottom <= 0;
    if (waitingForHero) {
      tl.pause();
      state.p = 1;
    }

    if ('IntersectionObserver' in window) {
      new IntersectionObserver((entries) => {
        const onScreen = entries[entries.length - 1].isIntersecting;
        if (!onScreen) {
          tl.pause();
        } else if (waitingForHero) {
          waitingForHero = false;
          gsap.delayedCall(REPEAT_HOLD, () => tl.restart());
        } else {
          tl.resume();
        }
      }).observe(hero);
    }

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
