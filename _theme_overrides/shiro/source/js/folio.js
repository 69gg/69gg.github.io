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
    // Content stays readable even if JavaScript or IntersectionObserver fails.
    const targets = document.querySelectorAll('.folio-entry, .folio-footer, .folio-inner article.group, .folio-inner .section-heading, .folio-inner .prose-shiro > :is(h2, h3, blockquote, figure, img)');
    targets.forEach((target) => target.setAttribute('data-folio-reveal', ''));
    let observer;
    const syncMotion = () => {
        observer?.disconnect();
        if (motion.matches || !('IntersectionObserver' in window)) return;
        observer = new IntersectionObserver((entries) => {
            let order = 0;
            entries.forEach((entry) => {
                if (!entry.isIntersecting) return;
                entry.target.style.setProperty('--folio-reveal-order', Math.min(order++, 3));
                entry.target.classList.add('is-visible');
                observer.unobserve(entry.target);
            });
        }, { threshold: 0.08 });
        targets.forEach((target) => {
            if (!target.classList.contains('is-visible')) observer.observe(target);
        });
    };
    motion.addEventListener('change', syncMotion);
    syncMotion();
})();
