(() => {
    'use strict';

    // Normalize index.html and trailing slashes without assuming the site's root.
    const normalize = (pathname) => decodeURI(pathname).replace(/index\.html$/, '').replace(/\/$/, '');
    const current = normalize(window.location.pathname);
    document.querySelectorAll('.folio-nav-link').forEach((link) => {
        if (normalize(new URL(link.href).pathname) === current) {
            link.setAttribute('aria-current', 'page');
        }
    });

    // Stop the decorative layers when the tab is out of view.
    const syncVisibility = () => document.documentElement.toggleAttribute('data-folio-paused', document.hidden);
    document.addEventListener('visibilitychange', syncVisibility);
    syncVisibility();

    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (motion.matches || !('IntersectionObserver' in window)) return;

    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
        });
    }, { threshold: 0.08 });

    // Content stays readable even if JavaScript or IntersectionObserver fails.
    document.querySelectorAll('.folio-entry').forEach((entry) => observer.observe(entry));
    motion.addEventListener('change', () => observer.disconnect(), { once: true });
})();
