(() => {
  'use strict';

  const hero = document.querySelector('.tx-hero');
  const canvas = document.getElementById('tx-hero-fluid');
  if (!hero || !canvas || !window.createTokenCloudFluid) return;

  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const pointers = new Set();
  let engine;
  let visible = false;
  let failed = false;
  let introPlayed = false;
  let introTimer;

  function stopPointers() {
    pointers.forEach(id => engine?.end(id));
    pointers.clear();
  }

  function stopIntro() {
    window.clearTimeout(introTimer);
  }

  function intro() {
    if (introPlayed) return;
    introPlayed = true;
    let index = 0;
    const locations = [[0.1, 0.38]];
    function splash() {
      const point = locations[index++];
      engine.start('intro', canvas.clientWidth * point[0], canvas.clientHeight * point[1]);
      engine.end('intro');
      if (index < locations.length) introTimer = window.setTimeout(splash, 280);
    }
    splash();
  }

  function update() {
    const paused = motion.matches || document.hidden || !visible || failed;
    stopIntro();
    stopPointers();
    if (!paused && !engine) {
      try {
        engine = window.createTokenCloudFluid(canvas);
        canvas.dataset.renderer = 'webgl';
      } catch {
        failed = true;
        canvas.dataset.renderer = 'unavailable';
      }
    }
    const active = !paused && !failed;
    canvas.hidden = !active;
    hero.classList.toggle('has-fluid', active);
    engine?.setPaused(!active);
    if (active) {
      engine.resize();
      engine.wake();
      intro();
    }
  }

  function coordinates(event) {
    const bounds = canvas.getBoundingClientRect();
    return [event.clientX - bounds.left, event.clientY - bounds.top];
  }

  hero.addEventListener('pointerdown', event => {
    if (!engine || canvas.hidden || (event.pointerType === 'mouse' && event.button !== 0)) return;
    if (event.target instanceof Element && event.target.closest(
      'a, button, input, textarea, select, label, code, [role="button"], [contenteditable]',
    )) return;
    const [x, y] = coordinates(event);
    if (y < 0 || y > canvas.clientHeight) return;
    stopIntro();
    pointers.add(event.pointerId);
    engine.start(event.pointerId, x, y);
  }, { passive: true });

  window.addEventListener('pointermove', event => {
    if (pointers.has(event.pointerId)) engine.move(event.pointerId, ...coordinates(event));
  }, { passive: true });

  function endPointer(event) {
    if (pointers.delete(event.pointerId)) engine?.end(event.pointerId);
  }
  window.addEventListener('pointerup', endPointer, { passive: true });
  window.addEventListener('pointercancel', endPointer, { passive: true });
  window.addEventListener('blur', stopPointers);
  document.addEventListener('visibilitychange', update);
  window.addEventListener('pageshow', update);
  window.addEventListener('pagehide', () => {
    stopIntro();
    stopPointers();
    engine?.setPaused(true);
  });
  motion.addEventListener('change', update);

  const observer = new IntersectionObserver(entries => {
    visible = entries[0].isIntersecting;
    update();
  });
  observer.observe(hero);

  const resizeObserver = new ResizeObserver(() => {
    if (engine && !canvas.hidden) engine.resize();
  });
  resizeObserver.observe(hero);

  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    failed = true;
    update();
    engine = undefined;
  });
  canvas.addEventListener('webglcontextrestored', () => {
    failed = false;
    introPlayed = false;
    update();
  });
})();
