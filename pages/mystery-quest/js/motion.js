/* 視認性を優先したページ内モーション */
(() => {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  if (reduceMotion.matches) return;

  document.documentElement.classList.add('motion-ready');

  // アニメーションさせたい要素のグループ（グループごとに0番から遅延をつける）
  const groups = [
    document.querySelectorAll('.timeline__item'),
    document.querySelectorAll('.menu-item'),
  ];

  if (!('IntersectionObserver' in window)) {
    groups.forEach((items) => items.forEach((item) => item.classList.add('is-visible')));
    return;
  }

  const observer = new IntersectionObserver((entries, currentObserver) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;

      const item = entry.target;
      const items = groups.find((group) => [...group].includes(item));
      const index = items ? [...items].indexOf(item) : 0;
      item.style.transitionDelay = `${index * 90}ms`;
      item.classList.add('is-visible');
      currentObserver.unobserve(item);
    });
  }, { threshold: 0.15 });

  groups.forEach((items) => items.forEach((item) => observer.observe(item)));
})();
