(() => {
    'use strict';

    const reveal = window.__shiro?.revealFolio;
    if (!reveal || !document.documentElement.hasAttribute('data-folio-loading')) return;
    document.body.inert = true;
    // Select the installed fonts and consume the preloaded CSS images during
    // layout. Leave image decoding to CSS's rendering pipeline.
    document.body.getBoundingClientRect();
    const images = [window.__shiro.folioImagesReady];
    document.querySelectorAll('img').forEach((image) => {
        const rect = image.getBoundingClientRect();
        if (!rect.width || !rect.height || rect.bottom <= 0 || rect.top >= innerHeight) return;
        image.loading = 'eager';
        images.push(image.decode());
    });

    const fontsReady = async () => {
        const style = getComputedStyle(document.documentElement);
        const installed = await Promise.all(['--folio-serif', '--folio-ui'].map(async (variable) => {
            const families = style.getPropertyValue(variable).split(',').map((family) => family.trim().replace(/^['"]|['"]$/g, ''));
            const candidates = families.slice(0, families.findIndex((family) => family.startsWith('Folio ')));
            try {
                // An unattached local-only face proves availability without
                // adding a face, downloading a file or changing weight matching.
                const source = candidates.map((family) => `local(${JSON.stringify(family)})`).join(',');
                await new FontFace(`Probe ${variable}`, source).load();
                return true;
            } catch { return false; }
        }));
        if (!installed.every(Boolean)) {
            const sheet = document.createElement('link');
            sheet.href = document.querySelector('meta[name="folio-fonts"]').content;
            sheet.rel = 'stylesheet';
            await new Promise((resolve) => {
                sheet.addEventListener('load', resolve, { once: true });
                sheet.addEventListener('error', resolve, { once: true });
                document.head.appendChild(sheet);
            });
            document.body.getBoundingClientRect();
        }
        // Wait for faces actually selected by layout. fonts.load() would
        // force unused web fallbacks despite the installed fonts in the stack.
        await document.fonts?.ready;
    };
    Promise.allSettled([...images, fontsReady()])
        .finally(reveal);
})();
