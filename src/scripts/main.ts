import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import { ScrambleTextPlugin } from 'gsap/ScrambleTextPlugin';
import Lenis from 'lenis';
import { createAsciiScene, type AsciiScene } from './ascii-scene';

gsap.registerPlugin(ScrollTrigger, SplitText, ScrambleTextPlugin);

const root = document.documentElement;
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
const $ = <T extends Element = HTMLElement>(sel: string, scope: ParentNode = document) => scope.querySelector<T>(sel);
const $$ = <T extends Element = HTMLElement>(sel: string, scope: ParentNode = document) => Array.from(scope.querySelectorAll<T>(sel));

/* ---------- smooth scroll ---------- */
let lenis: Lenis | null = null;
if (!reduceMotion) {
  lenis = new Lenis({ lerp: 0.09, wheelMultiplier: 1 });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => lenis?.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);
}

function scrollToTarget(target: HTMLElement | number) {
  if (lenis) lenis.scrollTo(target, { duration: 1.4, easing: (t) => 1 - Math.pow(1 - t, 4) });
  else if (typeof target === 'number') window.scrollTo({ top: target });
  else target.scrollIntoView();
}

/* ---------- mobile menu ---------- */
const menuBtn = $<HTMLButtonElement>('[data-menu-btn]');
const setMenu = (open: boolean) => {
  root.classList.toggle('menu-open', open);
  menuBtn?.setAttribute('aria-expanded', String(open));
  menuBtn?.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  if (open) lenis?.stop();
  else lenis?.start();
};
menuBtn?.addEventListener('click', () => setMenu(!root.classList.contains('menu-open')));
document.addEventListener('keydown', (e) => e.key === 'Escape' && setMenu(false));

/* ---------- in-page links ---------- */
$$<HTMLAnchorElement>('a[href^="#"]').forEach((a) => {
  a.addEventListener('click', (e) => {
    const id = a.getAttribute('href') || '';
    if (id.length < 2) return;
    const target = document.querySelector<HTMLElement>(id);
    if (!target) return;
    e.preventDefault();
    setMenu(false);
    scrollToTarget(id === '#top' ? 0 : target);
    history.replaceState(null, '', id);
  });
});

/* ---------- header ---------- */
const header = $('[data-header]');
if (header) {
  ScrollTrigger.create({
    start: 0,
    end: 'max',
    onUpdate(self) {
      const y = self.scroll();
      header.classList.toggle('is-scrolled', y > 40);
      header.classList.toggle('is-hidden', self.direction === 1 && y > 500 && !root.classList.contains('menu-open'));
    },
  });
}

/* ---------- preloader ---------- */
function runPreloader(): Promise<void> {
  const el = $('[data-preloader]');
  const markSeen = () => {
    try { sessionStorage.setItem('uxl-intro', '1'); } catch { /* storage unavailable */ }
  };
  if (!el || reduceMotion || root.classList.contains('intro-seen')) {
    el?.remove();
    markSeen();
    return Promise.resolve();
  }
  lenis?.stop();
  window.scrollTo(0, 0);
  const logo = $('[data-preloader-logo]', el);
  const purple = $('[data-fill-purple]', el);
  const white = $('[data-fill-white]', el);

  return new Promise((resolve) => {
    gsap
      .timeline({
        defaults: { ease: 'power2.inOut' },
        onComplete() {
          el.remove();
          lenis?.start();
          markSeen();
        },
      })
      // Purple rises inside the letters, white follows right behind it
      .to(purple, { attr: { y: 0 }, duration: 1.4 }, 0.2)
      .to(white, { attr: { y: 0 }, duration: 1.1 }, 1.1)
      // Then everything lifts away
      .to(logo, { yPercent: -60, autoAlpha: 0, duration: 0.9, ease: 'expo.in' }, 2.35)
      .to(el, { clipPath: 'inset(0% 0% 100% 0%)', duration: 1.1, ease: 'expo.inOut' }, 2.55)
      .add(() => resolve(), 2.95);
  });
}

/* ---------- hero intro ---------- */
function prepareHeroScene(): Promise<AsciiScene | null> {
  const canvas = $<HTMLCanvasElement>('[data-ascii-canvas]');
  if (!canvas?.dataset.src) return Promise.resolve(null);
  return createAsciiScene(canvas, canvas.dataset.src, { cell: innerWidth < 640 ? 7 : 9, lens: innerWidth < 640 ? 60 : 95 });
}

function heroIntro(scenePromise: Promise<AsciiScene | null>) {
  const title = $('[data-hero-title]');
  const lines = $$('[data-hero-line]');
  const fades = $$('[data-hero-fade]');
  const squares = $$('[data-square]');
  if (!title) return;
  const startScene = () => scenePromise.then((scene) => scene?.start());

  if (reduceMotion) {
    gsap.set([title, ...fades, ...squares], { autoAlpha: 1 });
    startScene();
    return;
  }

  gsap.set(title, { autoAlpha: 1 });
  const scrambles = $$('[data-scramble]', title);
  gsap
    .timeline({ defaults: { ease: 'expo.out' } })
    .fromTo(lines[0], { yPercent: 60, autoAlpha: 0 }, { yPercent: 0, autoAlpha: 1, duration: 1.3 }, 0)
    .fromTo(lines[1], { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.3 }, 0.25)
    .add(() => {
      scrambles.forEach((el, i) =>
        gsap.to(el, {
          duration: 1.4 + i * 0.3,
          scrambleText: { text: el.dataset.text || el.textContent || '', chars: 'upperAndLowerCase', speed: 0.6, revealDelay: 0.15 },
          ease: 'none',
        }),
      );
    }, 0.3)
    .fromTo(fades, { y: 24, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 1.1, stagger: 0.08 }, 0.5)
    .add(startScene, 0.6)
    .fromTo(squares, { scale: 0, autoAlpha: 0 }, { scale: 1, autoAlpha: 1, duration: 0.8, stagger: 0.12, ease: 'back.out(2)' }, 1.4);

  // Hovering the headline decodes the second line again
  scrambles.forEach((el) => (el.dataset.text = el.textContent || ''));
  let busy = false;
  title.addEventListener('pointerenter', () => {
    if (busy) return;
    busy = true;
    scrambles.forEach((el, i) =>
      gsap.to(el, {
        duration: 0.9 + i * 0.2,
        scrambleText: { text: el.dataset.text || '', chars: 'upperAndLowerCase', speed: 0.8 },
        onComplete: () => { busy = false; },
      }),
    );
  });
}

/* ---------- scroll animations ---------- */
function scrollAnimations() {
  if (reduceMotion) return;

  // Headings: masked line reveal
  $$('[data-split]').forEach((el) => {
    SplitText.create(el, {
      type: 'lines',
      mask: 'lines',
      linesClass: 'split-line',
      autoSplit: true,
      onSplit: (self) =>
        gsap.from(self.lines, {
          yPercent: 110,
          duration: 1.3,
          stagger: 0.09,
          ease: 'expo.out',
          scrollTrigger: { trigger: el, start: 'top 88%', once: true },
        }),
    });
  });

  // Statement text: words light up as you scroll
  $$('[data-scrub]').forEach((el) => {
    SplitText.create(el, {
      type: 'words',
      autoSplit: true,
      onSplit: (self) =>
        gsap.fromTo(
          self.words,
          { opacity: 0.14 },
          { opacity: 1, stagger: 0.1, ease: 'none', scrollTrigger: { trigger: el, start: 'top 82%', end: 'bottom 50%', scrub: true } },
        ),
    });
  });

  // Fade up
  $$('[data-reveal]').forEach((el) => {
    gsap.from(el, {
      y: 48,
      autoAlpha: 0,
      duration: 1.3,
      ease: 'expo.out',
      scrollTrigger: { trigger: el, start: 'top 90%', once: true },
    });
  });

  // Lines draw in
  $$('[data-line]').forEach((el) => {
    gsap.from(el, { scaleX: 0, duration: 1.6, ease: 'expo.inOut', scrollTrigger: { trigger: el, start: 'top 90%', once: true } });
  });

  // Parallax images
  $$('[data-parallax]').forEach((el) => {
    const amount = parseFloat(el.dataset.parallax || '0.1') * 100;
    gsap.fromTo(el, { yPercent: -amount }, {
      yPercent: amount,
      ease: 'none',
      scrollTrigger: { trigger: el.parentElement, start: 'top bottom', end: 'bottom top', scrub: true },
    });
  });

  // About visual: glass panels spread apart in depth while scrolling past
  const studio = $('[data-studio]');
  const stage = $('[data-studio-stage]');
  if (studio && stage) {
    gsap.fromTo(stage, { '--spread': 0 }, {
      '--spread': 1,
      ease: 'none',
      scrollTrigger: { trigger: studio, start: 'top bottom', end: 'bottom top', scrub: true },
    });
  }

  // Number count-up
  $$('[data-count-to]').forEach((el) => {
    const end = parseFloat(el.dataset.countTo || '0');
    const obj = { v: 0 };
    gsap.to(obj, {
      v: end,
      duration: 1.8,
      ease: 'power3.out',
      scrollTrigger: { trigger: el, start: 'top 92%', once: true },
      onUpdate: () => { el.textContent = String(Math.round(obj.v)); },
    });
  });

  // Footer wordmark rises in
  const footerLogo = $('[data-footer-logo]');
  if (footerLogo) {
    gsap.from(footerLogo, {
      yPercent: 100,
      duration: 1.6,
      ease: 'expo.out',
      scrollTrigger: { trigger: footerLogo.parentElement, start: 'top 95%', once: true },
    });
  }

  // CTA glow breathes with scroll
  const ctaOrb = $('[data-cta-orb]');
  if (ctaOrb) {
    gsap.fromTo(ctaOrb, { scale: 0.7, opacity: 0.4 }, {
      scale: 1.1,
      opacity: 1,
      ease: 'none',
      scrollTrigger: { trigger: ctaOrb.parentElement, start: 'top bottom', end: 'bottom bottom', scrub: true },
    });
  }
}

/* ---------- marquee ---------- */
function marquee() {
  const track = $('[data-marquee]');
  if (!track || reduceMotion) return;
  const loop = gsap.to(track, { xPercent: -50, duration: 38, ease: 'none', repeat: -1 });
  lenis?.on('scroll', ({ velocity }: { velocity: number }) => {
    const boost = 1 + Math.min(Math.abs(velocity) * 0.35, 5);
    gsap.to(loop, { timeScale: velocity < 0 ? -boost : boost, duration: 0.4, overwrite: true });
  });
}

/* ---------- pointer effects ---------- */
function pointerEffects() {
  if (!finePointer || reduceMotion) return;

  // Hero: code squares drift in parallax with the pointer
  const hero = $('.hero');
  if (hero) {
    const squares = $$('[data-square]', hero).map((el, i) => ({
      xTo: gsap.quickTo(el, 'x', { duration: 1.4, ease: 'power3' }),
      yTo: gsap.quickTo(el, 'y', { duration: 1.4, ease: 'power3' }),
      depth: 18 + (i % 3) * 14,
    }));
    hero.addEventListener('pointermove', (e) => {
      const px = e.clientX / innerWidth - 0.5;
      const py = e.clientY / innerHeight - 0.5;
      squares.forEach((q) => { q.xTo(px * q.depth); q.yTo(py * q.depth); });
    });
  }

  // About visual tilts toward the pointer
  const studio = $('[data-studio]');
  const stage = $('[data-studio-stage]');
  if (studio && stage) {
    gsap.set(stage, { rotationX: 14, rotationY: -26 });
    const rxTo = gsap.quickTo(stage, 'rotationX', { duration: 1.2, ease: 'power3' });
    const ryTo = gsap.quickTo(stage, 'rotationY', { duration: 1.2, ease: 'power3' });
    studio.addEventListener('pointermove', (e) => {
      const r = studio.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      ryTo(-26 + px * 24);
      rxTo(14 - py * 18);
    });
    studio.addEventListener('pointerleave', () => { rxTo(14); ryTo(-26); });
  }

  // Magnetic buttons
  $$('[data-magnetic]').forEach((el) => {
    const xTo = gsap.quickTo(el, 'x', { duration: 0.8, ease: 'elastic.out(1, 0.4)' });
    const yTo = gsap.quickTo(el, 'y', { duration: 0.8, ease: 'elastic.out(1, 0.4)' });
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      xTo((e.clientX - r.left - r.width / 2) * 0.3);
      yTo((e.clientY - r.top - r.height / 2) * 0.35);
    });
    el.addEventListener('pointerleave', () => { xTo(0); yTo(0); });
  });

  // Spotlight cards
  $$('[data-spotlight]').forEach((el) => {
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      el.style.setProperty('--x', `${e.clientX - r.left}px`);
      el.style.setProperty('--y', `${e.clientY - r.top}px`);
    });
  });

  // Custom cursor
  const cursor = $('.cursor');
  const ring = $('.cursor__ring');
  const dot = $('.cursor__dot');
  const label = $('[data-cursor-label]');
  if (!cursor || !ring || !dot) return;
  root.classList.add('has-cursor');
  const rx = gsap.quickTo(ring, 'x', { duration: 0.5, ease: 'power3' });
  const ry = gsap.quickTo(ring, 'y', { duration: 0.5, ease: 'power3' });
  const dx = gsap.quickTo(dot, 'x', { duration: 0.1 });
  const dy = gsap.quickTo(dot, 'y', { duration: 0.1 });
  window.addEventListener('pointermove', (e) => {
    rx(e.clientX); ry(e.clientY); dx(e.clientX); dy(e.clientY);
    const t = e.target as HTMLElement;
    const labelled = t.closest<HTMLElement>('[data-cursor]');
    cursor.classList.toggle('is-label', !!labelled);
    if (labelled && label) label.textContent = labelled.dataset.cursor || '';
    cursor.classList.toggle('is-hover', !labelled && !!t.closest('a, button, summary, select, input, textarea'));
  });
  document.addEventListener('pointerleave', () => gsap.to(cursor, { autoAlpha: 0, duration: 0.3 }));
  document.addEventListener('pointerenter', () => gsap.to(cursor, { autoAlpha: 1, duration: 0.3 }));
}

/* ---------- branded selects ---------- */
const CHEVRON = '<svg class="select__chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
const CHECK = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m4.5 10.5 3.5 3.5 7.5-8"/></svg>';

function customSelects() {
  $$<HTMLSelectElement>('select[data-select]').forEach((select, idx) => {
    const id = select.id || `select-${idx}`;
    const label = document.querySelector<HTMLLabelElement>(`label[for="${id}"]`);
    if (label && !label.id) label.id = `${id}-label`;

    const wrap = document.createElement('div');
    wrap.className = 'select';
    select.before(wrap);
    wrap.append(select);
    select.classList.add('select__native');
    select.tabIndex = -1;
    select.setAttribute('aria-hidden', 'true');

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'select__trigger';
    trigger.id = `${id}-trigger`;
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-controls', `${id}-list`);
    trigger.setAttribute('aria-labelledby', `${label?.id ?? ''} ${id}-trigger`.trim());
    trigger.innerHTML = `<span class="select__value"></span>${CHEVRON}`;
    const valueEl = trigger.querySelector<HTMLElement>('.select__value')!;

    const list = document.createElement('ul');
    list.className = 'select__list';
    list.id = `${id}-list`;
    list.setAttribute('role', 'listbox');
    list.setAttribute('tabindex', '-1');
    if (label) list.setAttribute('aria-labelledby', label.id);
    list.setAttribute('data-lenis-prevent', '');

    const opts = Array.from(select.options);
    const placeholder = opts.find((o) => o.disabled && o.value === '');
    const choices = opts.filter((o) => o !== placeholder);
    const items = choices.map((o, i) => {
      const li = document.createElement('li');
      li.className = 'select__option';
      li.id = `${id}-opt-${i}`;
      li.setAttribute('role', 'option');
      li.dataset.value = o.value;
      li.innerHTML = `<span>${o.text}</span>${CHECK}`;
      list.append(li);
      return li;
    });
    wrap.append(trigger, list);

    let active = -1;
    const isOpen = () => wrap.classList.contains('is-open');

    const sync = () => {
      const current = choices.findIndex((o) => o.value === select.value && select.selectedIndex >= 0 && !select.options[select.selectedIndex].disabled);
      items.forEach((li, i) => li.setAttribute('aria-selected', String(i === current)));
      valueEl.textContent = current >= 0 ? choices[current].text : placeholder?.text ?? '';
      wrap.classList.toggle('is-placeholder', current < 0);
      return current;
    };

    const setActive = (i: number) => {
      active = Math.max(0, Math.min(items.length - 1, i));
      items.forEach((li, j) => li.classList.toggle('is-active', j === active));
      list.setAttribute('aria-activedescendant', items[active].id);
      items[active].scrollIntoView({ block: 'nearest' });
    };

    const open = () => {
      if (isOpen()) return;
      document.querySelectorAll('.select.is-open').forEach((el) => el !== wrap && el.dispatchEvent(new Event('select:close')));
      wrap.classList.add('is-open');
      trigger.setAttribute('aria-expanded', 'true');
      setActive(Math.max(0, sync()));
      list.focus({ preventScroll: true });
    };

    const close = (focusTrigger = true) => {
      if (!isOpen()) return;
      wrap.classList.remove('is-open');
      trigger.setAttribute('aria-expanded', 'false');
      if (focusTrigger) trigger.focus({ preventScroll: true });
    };

    const choose = (i: number) => {
      select.value = choices[i].value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      wrap.classList.remove('is-invalid');
      sync();
      close();
    };

    wrap.addEventListener('select:close', () => close(false));
    trigger.addEventListener('click', () => (isOpen() ? close() : open()));
    trigger.addEventListener('keydown', (e) => {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); open(); }
    });
    select.addEventListener('focus', () => trigger.focus());
    label?.addEventListener('click', (e) => { e.preventDefault(); trigger.focus(); });

    let typed = '';
    let typedTimer = 0;
    list.addEventListener('keydown', (e) => {
      switch (e.key) {
        case 'ArrowDown': e.preventDefault(); setActive(active + 1); break;
        case 'ArrowUp': e.preventDefault(); setActive(active - 1); break;
        case 'Home': e.preventDefault(); setActive(0); break;
        case 'End': e.preventDefault(); setActive(items.length - 1); break;
        case 'Enter':
        case ' ': e.preventDefault(); choose(active); break;
        case 'Escape': e.preventDefault(); close(); break;
        case 'Tab': close(false); break;
        default:
          if (e.key.length === 1) {
            typed += e.key.toLowerCase();
            clearTimeout(typedTimer);
            typedTimer = window.setTimeout(() => (typed = ''), 600);
            const hit = choices.findIndex((o) => o.text.toLowerCase().startsWith(typed));
            if (hit >= 0) setActive(hit);
          }
      }
    });
    items.forEach((li, i) => {
      li.addEventListener('pointermove', () => active !== i && setActive(i));
      li.addEventListener('click', () => choose(i));
    });
    document.addEventListener('pointerdown', (e) => {
      if (isOpen() && !wrap.contains(e.target as Node)) close(false);
    });
    select.addEventListener('invalid', () => wrap.classList.add('is-invalid'));
    select.form?.addEventListener('reset', () => setTimeout(sync));

    sync();
  });
}

/* ---------- brief form ---------- */
function briefForm() {
  const form = $<HTMLFormElement>('[data-brief-form]');
  if (!form) return;
  const status = $('[data-form-status]', form);
  const submit = $<HTMLButtonElement>('button[type="submit"]', form);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const endpoint = form.dataset.endpoint;
    if (!endpoint) {
      if (status) status.textContent = "Our form is being set up — please use “Book a call” for now.";
      return;
    }
    if (submit) submit.disabled = true;
    if (status) status.textContent = 'Sending your brief…';
    try {
      const res = await fetch(endpoint, { method: 'POST', body: new FormData(form), headers: { Accept: 'application/json' } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false) throw new Error(data.message || 'Request failed');
      form.reset();
      if (status) status.textContent = "Thanks — your brief is in. We'll review it and get back to you shortly.";
    } catch {
      if (status) status.textContent = 'Something went wrong sending your brief. Please try again.';
    } finally {
      if (submit) submit.disabled = false;
    }
  });
}

/* ---------- boot ---------- */
async function init() {
  customSelects();
  briefForm();
  pointerEffects();
  await document.fonts.ready;
  scrollAnimations();
  marquee();
  const scenePromise = prepareHeroScene();
  await runPreloader();
  heroIntro(scenePromise);
  ScrollTrigger.refresh();
}

init();
