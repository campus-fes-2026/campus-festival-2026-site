/* 視認性を優先したページ内モーション */
(() => {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  if (reduceMotion.matches) return;

  document.documentElement.classList.add('motion-ready');

  const timelineItems = document.querySelectorAll('.timeline__item');

  if (!('IntersectionObserver' in window)) {
    timelineItems.forEach((item) => item.classList.add('is-visible'));
    return;
  }

  const observer = new IntersectionObserver((entries, currentObserver) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;

      const item = entry.target;
      const index = [...timelineItems].indexOf(item);
      item.style.transitionDelay = `${index * 90}ms`;
      item.classList.add('is-visible');
      currentObserver.unobserve(item);
    });
  }, { threshold: 0.15 });

  timelineItems.forEach((item) => observer.observe(item));
})();
