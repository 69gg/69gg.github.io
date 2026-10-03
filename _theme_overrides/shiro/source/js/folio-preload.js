(() => {
    'use strict';

    const reveal = window.__shiro?.revealFolio;
    if (!reveal) return;
    const images = [window.__shiro.folioImagesReady];
    document.querySelectorAll('img').forEach((image) => {
        const rect = image.getBoundingClientRect();
        if (!rect.width || !rect.height || rect.bottom <= 0 || rect.top >= innerHeight) return;
        image.loading = 'eager';
        images.push(image.decode());
    });

    // Load only the faces needed by actual first-viewport text, including
    // Chinese subsets, instead of downloading every font in the bundle.
    const textByFont = new Map();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
        const node = walker.currentNode;
        const element = node.parentElement;
        if (!node.textContent.trim() || element.closest('script, style, [aria-hidden="true"]')) continue;
        const rect = element.getBoundingClientRect();
        if (!rect.width || !rect.height || rect.bottom <= 0 || rect.top >= innerHeight) continue;
        const style = getComputedStyle(element);
        const font = `${style.fontStyle} ${style.fontWeight} 16px ${style.fontFamily}`;
        textByFont.set(font, (textByFont.get(font) || '') + node.textContent);
    }
    const fonts = document.fonts ? [...textByFont].map(([font, text]) => document.fonts.load(font, text)) : [];
    Promise.allSettled([...images, ...fonts])
        .then(() => document.fonts?.ready)
        .finally(reveal);
})();
