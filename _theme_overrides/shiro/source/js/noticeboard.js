(() => {
    'use strict';

    const config = JSON.parse(document.getElementById('noticeboard-config').textContent);
    const viewport = document.getElementById('noticeboard-viewport');
    const wallpaper = document.getElementById('noticeboard-wallpaper');
    const flowersRoot = document.getElementById('noticeboard-flowers');
    const petalsRoot = document.getElementById('noticeboard-petals');
    const notesRoot = document.getElementById('noticeboard-notes');
    const loading = document.getElementById('noticeboard-loading');
    const loadingMessage = document.getElementById('noticeboard-loading-message');
    const refreshButton = document.getElementById('noticeboard-refresh');
    const zoomOut = document.getElementById('noticeboard-zoom-out');
    const zoomIn = document.getElementById('noticeboard-zoom-in');
    const zoomReset = document.getElementById('noticeboard-zoom-reset');
    const sidebar = document.getElementById('noticeboard-sidebar');
    const sidebarEdge = document.getElementById('noticeboard-sidebar-edge');
    const sidebarToggle = document.getElementById('noticeboard-sidebar-toggle');
    const sidebarContent = document.getElementById('noticeboard-sidebar-content');
    const paperList = document.getElementById('noticeboard-list');
    const listEmpty = document.getElementById('noticeboard-list-empty');
    const editor = document.getElementById('noticeboard-editor');
    const form = document.getElementById('noticeboard-form');
    const colorChoice = form.elements.color;
    const hexInput = document.getElementById('noticeboard-color-hex');
    const customSwatch = document.getElementById('noticeboard-custom-color');
    const defaultPaperColor = getComputedStyle(form.querySelector('.noticeboard-color')).getPropertyValue('--note-paper').trim();
    const bodyInput = document.getElementById('noticeboard-body');
    const geometryInputs = ['width', 'height', 'rotation'].map((name) => form.elements[name]);
    const paperPreview = editor.querySelector('.noticeboard-preview-paper');
    const noteStyle = getComputedStyle(document.querySelector('.noticeboard'));
    const noteSize = { width: parseFloat(noteStyle.getPropertyValue('--board-note-width')), height: parseFloat(noteStyle.getPropertyValue('--board-note-height')) };
    const newNoteSize = { width: parseFloat(noteStyle.getPropertyValue('--board-new-note-width')), height: parseFloat(noteStyle.getPropertyValue('--board-new-note-height')) };
    const replyScale = parseFloat(noteStyle.getPropertyValue('--board-reply-scale'));
    const submit = document.getElementById('noticeboard-submit');
    const removeDialog = document.getElementById('noticeboard-delete');
    const status = document.getElementById('noticeboard-status');
    const loginButton = document.getElementById('noticeboard-login');
    const logoutButton = document.getElementById('noticeboard-logout');
    const writeButton = document.getElementById('noticeboard-write');
    const editorContext = document.getElementById('noticeboard-editor-context');
    const reactionPicker = document.getElementById('noticeboard-reaction-picker');
    const reactionOptions = [
        ['THUMBS_UP', '👍', '赞'], ['THUMBS_DOWN', '👎', '不赞同'], ['LAUGH', '😄', '开心'], ['HOORAY', '🎉', '庆祝'],
        ['CONFUSED', '😕', '疑惑'], ['HEART', '❤️', '喜欢'], ['ROCKET', '🚀', '加油'], ['EYES', '👀', '关注']
    ];
    const storageKey = `noticeboard:${config.repository}:${config.discussionNumber}`;
    const cameraKey = `${storageKey}:camera`;
    const cameraOrigin = { x: 0, y: 0, scale: 1 };
    let camera = { ...cameraOrigin, ...JSON.parse(sessionStorage.getItem(cameraKey) || '{}') };
    camera.scale = Math.max(config.zoom.min, Math.min(config.zoom.max, camera.scale));
    let paintFrame = 0;
    let motionFrame = 0;
    let statusTimer;
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    const wallpaperStyle = getComputedStyle(wallpaper);
    const tile = wallpaperStyle.backgroundSize.split(' ').map(parseFloat);
    const wallpaperPad = parseFloat(wallpaperStyle.getPropertyValue('--wallpaper-pad'));
    let wallpaperAnchor = { ...cameraOrigin };
    const flowerSpacing = parseFloat(getComputedStyle(flowersRoot).getPropertyValue('--flower-spacing'));
    const flowerCells = new Map();
    const petalSpacing = parseFloat(getComputedStyle(petalsRoot).getPropertyValue('--petal-spacing'));
    const petalCells = new Map();
    const localPreview = !config.apiUrl && ['127.0.0.1', 'localhost', '[::1]'].includes(location.hostname);
    const previewUser = { login: 'preview', name: '预览访客' };
    let notes = [];
    let user = null;
    let editing = null;
    let removing = null;
    let activeNote = null;
    let replyingTo = null;
    let reactionTarget = null;
    let selectedPaperId = null;
    let sidebarPinned = false;
    let sidebarHovered = false;
    let boardReady = false;
    let boardRevision = 0;
    let refreshPromise = null;
    let refreshFeedback = false;
    let topLayer = 2;
    let ticket = sessionStorage.getItem(`${storageKey}:session`) || '';
    const dateFormat = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

    const returnedParams = new URLSearchParams(location.hash.slice(1));
    const returned = returnedParams.get('noticeboard-session');
    if (returned) {
        ticket = returned;
        sessionStorage.setItem(`${storageKey}:session`, ticket);
        history.replaceState(null, '', location.pathname + location.search);
    }
    const loginError = returnedParams.get('noticeboard-error');
    if (loginError) {
        status.textContent = loginError;
        history.replaceState(null, '', location.pathname + location.search);
    }

    async function request(path, method = 'GET', data) {
        const headers = { 'Content-Type': 'application/json' };
        if (ticket) headers.Authorization = `Bearer ${ticket}`;
        const response = await fetch(`${config.apiUrl.replace(/\/$/, '')}${path}`, {
            method, headers, body: data ? JSON.stringify(data) : undefined
        });
        const result = await response.json();
        if (!response.ok) {
            if (response.status === 401) {
                ticket = '';
                user = null;
                sessionStorage.removeItem(`${storageKey}:session`);
                renderAccount();
            }
            throw new Error(result.error || '纸条暂时没有保存成功，请稍后再试。');
        }
        return result;
    }

    const owns = (note) => user && note.author?.login === user.login;
    const persistPreview = () => localStorage.setItem(storageKey, JSON.stringify(notes));
    const say = (message) => {
        status.textContent = message;
        clearTimeout(statusTimer);
        statusTimer = setTimeout(() => { status.textContent = ''; }, 5000);
    };

    function scatterLayer(root, cells, spacing, create) {
        const bounds = [
            Math.floor(-camera.x / camera.scale / spacing) - 1,
            Math.floor(-camera.y / camera.scale / spacing) - 1,
            Math.floor((viewport.clientWidth - camera.x) / camera.scale / spacing) + 1,
            Math.floor((viewport.clientHeight - camera.y) / camera.scale / spacing) + 1
        ];
        const nextWindow = bounds.join(':');
        if (nextWindow === root.dataset.window) return;
        root.dataset.window = nextWindow;
        const visible = new Set();
        for (let x = bounds[0]; x <= bounds[2]; x++) {
            for (let y = bounds[1]; y <= bounds[3]; y++) {
                const key = `${x}:${y}`;
                visible.add(key);
                if (cells.has(key)) continue;
                // World coordinates seed each cluster, so revisiting it keeps
                // its placement without repeating or mirroring a large image.
                let seed = Math.imul(x ^ 0x9e3779b9, 1597334677) ^ Math.imul(y, 3812015801);
                const random = () => {
                    seed ^= seed << 13;
                    seed ^= seed >>> 17;
                    seed ^= seed << 5;
                    return (seed >>> 0) / 4294967296;
                };
                const element = create(x, y, random);
                root.append(element);
                cells.set(key, element);
            }
        }
        for (const [key, element] of cells) {
            if (visible.has(key)) continue;
            element.remove();
            cells.delete(key);
        }
    }

    function scatterFlowers() {
        scatterLayer(flowersRoot, flowerCells, flowerSpacing, (x, y, random) => {
            const anchor = document.createElement('div');
            anchor.className = 'noticeboard-flower';
            const size = 170 + random() * 110;
            anchor.style.width = `${size}px`;
            anchor.style.left = `${(x + .2 + random() * .6) * flowerSpacing - size / 2}px`;
            anchor.style.top = `${(y + .2 + random() * .6) * flowerSpacing - size / 2}px`;
            anchor.style.transform = `rotate(${random() * 100 - 50}deg)`;
            anchor.style.opacity = .7 + random() * .3;
            const flower = document.createElement('div');
            flower.className = `folio-flowers folio-blossom-${1 + Math.floor(random() * 5)}`;
            flower.style.setProperty('--flower-period-x', `${61 + random() * 64}s`);
            flower.style.setProperty('--flower-period-y', `${79 + random() * 56}s`);
            flower.style.setProperty('--flower-delay-x', `${-random() * 125}s`);
            flower.style.setProperty('--flower-delay-y', `${-random() * 135}s`);
            flower.style.animationDirection = `${random() > .5 ? 'reverse' : 'normal'}, ${random() > .5 ? 'reverse' : 'normal'}`;
            anchor.append(flower);
            return anchor;
        });
    }

    function scatterPetals() {
        scatterLayer(petalsRoot, petalCells, petalSpacing, (x, y, random) => {
            const petal = document.createElement('span');
            petal.className = 'folio-petal';
            petal.style.left = `${(x + random()) * petalSpacing}px`;
            petal.style.top = `${(y + random()) * petalSpacing - petalSpacing / 2}px`;
            petal.style.setProperty('--petal-size', `${16 + random() * 15}px`);
            petal.style.setProperty('--petal-x', `${random() * 240 - 120}px`);
            petal.style.setProperty('--petal-y', `${380 + random() * 260}px`);
            petal.style.setProperty('--petal-sway', `${random() * 44 - 22}px`);
            petal.style.setProperty('--petal-start', `${random() * 360}deg`);
            petal.style.setProperty('--petal-turn', `${random() * 280 - 140}deg`);
            const period = 48 + random() * 36;
            petal.style.setProperty('--petal-period', `${period}s`);
            petal.style.setProperty('--petal-delay', `${-random() * period}s`);
            petal.style.setProperty('--petal-opacity', `${.25 + random() * .25}`);
            return petal;
        });
    }

    function paintCamera() {
        paintFrame = 0;
        const scaledTile = tile.map((size) => size * camera.scale);
        wallpaper.style.backgroundSize = scaledTile.map((size) => `${size}px`).join(' ');
        if (camera.scale !== wallpaperAnchor.scale || Math.abs(camera.x - wallpaperAnchor.x) > wallpaperPad || Math.abs(camera.y - wallpaperAnchor.y) > wallpaperPad) {
            wallpaperAnchor = { ...camera };
            wallpaper.style.backgroundPosition = `calc(50% + ${camera.x % scaledTile[0]}px) ${wallpaperPad + camera.y % scaledTile[1]}px`;
        }
        viewport.style.setProperty('--camera-x', `${camera.x}px`);
        viewport.style.setProperty('--camera-y', `${camera.y}px`);
        viewport.style.setProperty('--camera-scale', camera.scale);
        viewport.style.setProperty('--wallpaper-x', `${camera.x - wallpaperAnchor.x}px`);
        viewport.style.setProperty('--wallpaper-y', `${camera.y - wallpaperAnchor.y}px`);
        zoomReset.textContent = `${Math.round(camera.scale * 100)}% · 还原`;
        zoomOut.disabled = camera.scale <= config.zoom.min;
        zoomIn.disabled = camera.scale >= config.zoom.max;
        scatterFlowers();
        scatterPetals();
    }

    function queuePaint() {
        if (!paintFrame) paintFrame = requestAnimationFrame(paintCamera);
    }

    function rememberCamera() { sessionStorage.setItem(cameraKey, JSON.stringify(camera)); }

    function visibleWidth() {
        return sidebar.classList.contains('is-open') ? sidebar.offsetLeft - 20 : viewport.clientWidth;
    }

    function zoomCamera(scale) {
        if (viewport.classList.contains('is-panning') || notesRoot.querySelector('.is-dragging')) return;
        cancelAnimationFrame(motionFrame);
        const nextScale = Math.max(config.zoom.min, Math.min(config.zoom.max, Math.round(scale * 100) / 100));
        const anchor = { x: visibleWidth() / 2, y: viewport.clientHeight / 2 };
        const ratio = nextScale / camera.scale;
        camera = { x: anchor.x - (anchor.x - camera.x) * ratio, y: anchor.y - (anchor.y - camera.y) * ratio, scale: nextScale };
        paintCamera();
        rememberCamera();
    }

    function coast(vx, vy) {
        let previous = performance.now();
        const step = (now) => {
            const decay = Math.exp(-(now - previous) / 130);
            camera.x += vx * 130 * (1 - decay);
            camera.y += vy * 130 * (1 - decay);
            vx *= decay;
            vy *= decay;
            previous = now;
            paintCamera();
            if (Math.hypot(vx, vy) > .02) motionFrame = requestAnimationFrame(step);
            else rememberCamera();
        };
        motionFrame = requestAnimationFrame(step);
    }

    function bindCamera() {
        let drag;
        viewport.addEventListener('pointerdown', (event) => {
            if (event.button !== 0 || !event.isPrimary || event.target.closest('.board-note')) return;
            event.preventDefault();
            cancelAnimationFrame(motionFrame);
            viewport.focus({ preventScroll: true });
            viewport.setPointerCapture(event.pointerId);
            drag = { id: event.pointerId, x: event.clientX, y: event.clientY, start: { ...camera }, at: event.timeStamp, vx: 0, vy: 0 };
            viewport.classList.add('is-panning');
        });
        viewport.addEventListener('pointermove', (event) => {
            if (!drag || drag.id !== event.pointerId) return;
            const next = { ...drag.start, x: drag.start.x + event.clientX - drag.x, y: drag.start.y + event.clientY - drag.y };
            const elapsed = Math.max(8, event.timeStamp - drag.at);
            drag.vx = .5 * drag.vx + .5 * Math.max(-1.2, Math.min(1.2, (next.x - camera.x) / elapsed));
            drag.vy = .5 * drag.vy + .5 * Math.max(-1.2, Math.min(1.2, (next.y - camera.y) / elapsed));
            drag.at = event.timeStamp;
            camera = next;
            queuePaint();
        });
        const finish = (event) => {
            if (!drag || drag.id !== event.pointerId) return;
            viewport.releasePointerCapture(event.pointerId);
            viewport.classList.remove('is-panning');
            if (event.type === 'pointerup' && !motion.matches && event.timeStamp - drag.at < 80) coast(drag.vx, drag.vy);
            else rememberCamera();
            drag = null;
        };
        viewport.addEventListener('pointerup', finish);
        viewport.addEventListener('pointercancel', finish);
        viewport.addEventListener('wheel', (event) => {
            event.preventDefault();
            cancelAnimationFrame(motionFrame);
            const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewport.clientHeight : 1;
            camera.x -= (event.shiftKey ? event.deltaY : event.deltaX) * unit;
            camera.y -= (event.shiftKey ? 0 : event.deltaY) * unit;
            queuePaint();
            rememberCamera();
        }, { passive: false });
        viewport.addEventListener('keydown', (event) => {
            if (event.target !== viewport) return;
            const direction = { ArrowLeft: [1, 0], ArrowRight: [-1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[event.key];
            if (!direction) return;
            event.preventDefault();
            cancelAnimationFrame(motionFrame);
            camera.x += direction[0] * 60;
            camera.y += direction[1] * 60;
            queuePaint();
            rememberCamera();
        });
        paintCamera();
    }

    function worldPosition(position) {
        if (position.v === 2) return position;
        // Preserve positions from the former 880px board without changing storage on read.
        return { ...position, v: 2, x: 32 + position.x * (880 - 252 - 64), y: position.y + 96 };
    }

    function moveCamera(target) {
        cancelAnimationFrame(motionFrame);
        const start = { ...camera };
        const at = performance.now();
        const step = (now) => {
            const progress = motion.matches ? 1 : Math.min(1, (now - at) / 320);
            const eased = 1 - (1 - progress) ** 3;
            camera = { ...start, x: start.x + (target.x - start.x) * eased, y: start.y + (target.y - start.y) * eased };
            paintCamera();
            if (progress < 1) motionFrame = requestAnimationFrame(step);
            else rememberCamera();
        };
        motionFrame = requestAnimationFrame(step);
    }

    function bringPaperForward(branch) {
        for (let current = branch; current; current = current.parentElement.closest('.board-branch')) {
            current.style.zIndex = ++topLayer;
        }
    }

    function revealPaper(paper, center = false) {
        bringPaperForward(paper.closest('.board-branch'));
        paper.style.animation = 'none';
        const rect = paper.getBoundingClientRect();
        const width = visibleWidth();
        if (!center && rect.left >= 20 && rect.right <= width - 20 && rect.top >= 90 && rect.bottom <= innerHeight - 90) return;
        moveCamera({ x: camera.x + (width - rect.width) / 2 - rect.left, y: camera.y + Math.max(100, (viewport.clientHeight - rect.height) / 2) - rect.top });
    }

    function renderMetadata(container, comment) {
        container.replaceChildren();
        const author = document.createElement('span');
        author.className = 'board-note-author';
        author.textContent = comment.author?.name ? `${comment.author.name} · @${comment.author.login}` : `@${comment.author?.login || '路过的人'}`;
        container.append(author);
        const timestamps = document.createElement('div');
        timestamps.className = 'board-note-timestamps';
        const stamp = (label, value) => {
            const row = document.createElement('span');
            row.className = 'board-note-date';
            const caption = document.createElement('span');
            caption.textContent = label;
            const time = document.createElement('time');
            time.dateTime = value;
            time.textContent = dateFormat.format(new Date(value));
            time.title = value;
            row.append(caption, time);
            timestamps.append(row);
        };
        stamp('创建', comment.createdAt);
        if (comment.updatedAt && new Date(comment.updatedAt) > new Date(comment.createdAt)) stamp('修改', comment.updatedAt);
        container.append(timestamps);
    }

    function renderMarkdown(container, body) {
        container.innerHTML = window.DOMPurify.sanitize(window.marked.parse(body, { gfm: true, breaks: true }), { USE_PROFILES: { html: true } });
    }

    function normalizeHex(value) {
        const hex = value.replace(/^#/, '');
        return `#${hex.length === 3 ? hex.replace(/./g, '$&$&') : hex}`.toUpperCase();
    }

    function paintPaper(element, color) {
        element.dataset.color = color;
        ['--note-paper', '--note-ink', '--note-pin'].forEach((property) => element.style.removeProperty(property));
        if (!color.startsWith('#')) return;
        const channels = color.slice(1).match(/../g).map((hex) => {
            const channel = parseInt(hex, 16) / 255;
            return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
        });
        const luminance = channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
        element.style.setProperty('--note-paper', color);
        element.style.setProperty('--note-ink', `var(--note-${luminance > .179 ? 'dark' : 'light'}-ink)`);
        element.style.setProperty('--note-pin', 'var(--note-ink)');
    }

    function selectedPaperColor() {
        return colorChoice.value === 'custom' ? normalizeHex(hexInput.value) : colorChoice.value;
    }

    function syncEditorPaper() {
        hexInput.disabled = colorChoice.value !== 'custom';
        if (!hexInput.disabled && !hexInput.checkValidity()) return;
        paintPaper(editor, selectedPaperColor());
        if (!hexInput.disabled) paintPaper(customSwatch, selectedPaperColor());
    }

    function editorGeometry() {
        return Object.fromEntries(geometryInputs.map((input) => [input.name, Number(input.value)]));
    }

    function syncEditorGeometry() {
        const { width, height, rotation } = editorGeometry();
        geometryInputs.forEach((input) => {
            input.parentElement.querySelector('output').textContent = `${input.value}${input.name === 'rotation' ? '°' : 'px'}`;
        });
        const scale = Math.min(paperPreview.parentElement.clientWidth / width, 160 / height);
        paperPreview.style.setProperty('--preview-width', `${width * scale}px`);
        paperPreview.style.setProperty('--preview-height', `${height * scale}px`);
        paperPreview.style.setProperty('--preview-turn', `${rotation}deg`);
        document.getElementById('noticeboard-preview-body').textContent = bodyInput.value || '今天有什么想说的？';
    }

    function action(label, onClick, className = '') {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = label;
        button.className = className;
        button.addEventListener('click', onClick);
        return button;
    }

    function reactionBar(note, comment = note) {
        const bar = document.createElement('div');
        bar.className = 'noticeboard-reactions';
        bar.setAttribute('aria-label', '表情回应');
        for (const [content, emoji, label] of reactionOptions) {
            const reaction = comment.reactions?.find((item) => item.content === content);
            if (!reaction?.count) continue;
            const button = action(`${emoji} ${reaction.count}`, () => toggleReaction(note, comment, content, bar), 'noticeboard-reaction');
            button.setAttribute('aria-pressed', String(Boolean(user && reaction.viewerHasReacted)));
            button.setAttribute('aria-label', `${label}，${reaction.count} 人回应`);
            button.title = `${label}${user && reaction.viewerHasReacted ? ' · 点击取消' : ''}`;
            bar.append(button);
        }
        const add = action('', () => openReactionPicker(note, comment, add, bar), 'noticeboard-reaction noticeboard-reaction-add');
        add.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-9-9M17 3v6m-3-3h6M8 14s1.5 3 4 3 4-3 4-3"/><path d="M8 9h.01M12 9h.01"/></svg>';
        add.setAttribute('aria-label', '添加表情回应');
        add.setAttribute('aria-haspopup', 'true');
        add.setAttribute('aria-expanded', 'false');
        add.title = '添加表情回应';
        bar.append(add);
        return bar;
    }

    function openReactionPicker(note, comment, button, bar) {
        reactionTarget?.button.setAttribute('aria-expanded', 'false');
        reactionTarget = { note, comment, button };
        paintPaper(reactionPicker, paperPosition(note, comment).color);
        reactionPicker.replaceChildren(...reactionOptions.map(([content, emoji, label]) => {
            const choice = action(emoji, () => {
                reactionPicker.hidePopover();
                toggleReaction(note, comment, content, bar);
            });
            choice.title = label;
            choice.setAttribute('aria-label', label);
            choice.setAttribute('aria-pressed', String(Boolean(user && comment.reactions?.find((item) => item.content === content)?.viewerHasReacted)));
            return choice;
        }));
        bar.append(reactionPicker);
        reactionPicker.showPopover();
        const rect = button.getBoundingClientRect();
        reactionPicker.style.left = `${Math.max(12, Math.min(rect.left, innerWidth - reactionPicker.offsetWidth - 12))}px`;
        const below = rect.bottom + 8;
        reactionPicker.style.top = `${Math.max(12, below + reactionPicker.offsetHeight < innerHeight - 12 ? below : rect.top - reactionPicker.offsetHeight - 8)}px`;
        button.setAttribute('aria-expanded', 'true');
        reactionPicker.querySelector('button').focus({ preventScroll: true });
    }

    async function toggleReaction(note, comment, content, bar) {
        if (!user) return login();
        bar.setAttribute('aria-busy', 'true');
        bar.querySelectorAll('button').forEach((button) => { button.disabled = true; });
        try {
            const reaction = comment.reactions?.find((item) => item.content === content);
            if (localPreview) {
                const item = reaction || { content, count: 0, viewerHasReacted: false };
                if (!reaction) (comment.reactions ||= []).push(item);
                item.count += item.viewerHasReacted ? -1 : 1;
                item.viewerHasReacted = !item.viewerHasReacted;
                persistPreview();
            } else {
                const kind = note === comment ? 'notes' : 'replies';
                const updated = await request(`/api/${kind}/${encodeURIComponent(comment.id)}/reactions`, reaction?.viewerHasReacted ? 'DELETE' : 'POST', { content });
                comment.reactions = updated.reactions;
            }
            refreshPaper(note);
        } catch (error) {
            say(error.message);
        } finally {
            bar.removeAttribute('aria-busy');
            bar.querySelectorAll('button').forEach((button) => { button.disabled = false; });
        }
    }

    reactionPicker.addEventListener('toggle', (event) => {
        if (event.newState === 'closed') reactionTarget?.button.setAttribute('aria-expanded', 'false');
    });

    function confirmRemove(note, reply = null) {
        removing = { note, reply };
        paintPaper(removeDialog, paperPosition(note, reply || note).color);
        document.getElementById('noticeboard-delete-title').textContent = reply ? '移除这条回复？' : '移除这张纸条？';
        document.getElementById('noticeboard-delete-description').textContent = reply ? '这条回复会移除，已有的后续回复会保留。' : '纸条及其下面的回复都会删除。';
        removeDialog.showModal();
    }

    function renderAccount() {
        document.getElementById('noticeboard-user').textContent = user ? (user.name || user.login) : '';
        loginButton.hidden = Boolean(user);
        logoutButton.hidden = !user || localPreview;
        if (localPreview) loginButton.textContent = '使用预览身份';
    }

    function positionNote(element, position) {
        element.style.setProperty('--note-x', `${position.x}px`);
        element.style.setProperty('--note-y', `${position.y}px`);
        element.style.setProperty('--note-turn', `${position.rotation}deg`);
        element.style.setProperty('--note-width', `${position.width || noteSize.width}px`);
        element.style.setProperty('--note-height', `${position.height || noteSize.height}px`);
        paintPaper(element.querySelector(':scope > .board-note'), position.color);
    }

    function updateCount() {
        const replies = notes.reduce((total, note) => total + (note.replies?.length || 0), 0);
        document.getElementById('noticeboard-count').textContent = `总数量：${notes.length + replies}`;
        document.getElementById('noticeboard-count-detail').textContent = `主纸条 ${notes.length} · 回复 ${replies}`;
        boardRevision++;
        renderPaperList();
    }

    function syncSidebar() {
        const open = sidebarPinned || sidebarHovered;
        sidebar.classList.toggle('is-open', open);
        sidebar.inert = !open;
        sidebarToggle.setAttribute('aria-expanded', String(open));
        sidebarToggle.setAttribute('aria-label', sidebarPinned ? '收起纸条列表' : open ? '固定纸条列表' : '展开纸条列表');
    }

    function closeSidebar() {
        sidebarPinned = false;
        sidebarHovered = false;
        if (sidebar.contains(document.activeElement)) sidebarToggle.focus({ preventScroll: true });
        syncSidebar();
    }

    function renderPaperList() {
        const collapsed = new Set([...paperList.querySelectorAll('details:not([open])')].map((item) => item.dataset.id));
        const focused = paperList.contains(document.activeElement) ? document.activeElement : null;
        const focusedId = focused?.closest('li')?.dataset.id;
        const scrollTop = sidebarContent.scrollTop;
        const entries = new Map();
        const createList = (branches) => {
            const list = document.createElement('ul');
            list.className = 'noticeboard-tree';
            for (const branch of branches) {
                const paper = branch.querySelector(':scope > .board-note');
                const children = branch.querySelector(':scope > .board-note-replies')?.children;
                const item = document.createElement('li');
                item.dataset.id = branch.dataset.id;
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'noticeboard-tree-item';
                button.dataset.id = branch.dataset.id;
                button.setAttribute('aria-current', String(branch.dataset.id === selectedPaperId));
                button.title = '定位这张纸条';
                const author = document.createElement('span');
                author.className = 'noticeboard-tree-author';
                author.textContent = paper.querySelector('.board-note-author').textContent;
                const excerpt = document.createElement('span');
                excerpt.className = 'noticeboard-tree-excerpt';
                excerpt.textContent = paper.querySelector('.board-note-message').textContent.replace(/\s+/g, ' ').trim() || '空白纸条';
                button.append(author, excerpt);
                button.addEventListener('click', () => {
                    selectedPaperId = branch.dataset.id;
                    paperList.querySelectorAll('.noticeboard-tree-item').forEach((row) => row.setAttribute('aria-current', String(row.dataset.id === selectedPaperId)));
                    notesRoot.querySelectorAll('.board-note').forEach((note) => note.classList.toggle('is-located', note.dataset.id === selectedPaperId));
                    if (sidebar.offsetWidth > viewport.clientWidth / 2) closeSidebar();
                    revealPaper(paper, true);
                });
                let summary;
                if (children?.length) {
                    const details = document.createElement('details');
                    details.dataset.id = branch.dataset.id;
                    details.open = !collapsed.has(branch.dataset.id);
                    summary = document.createElement('summary');
                    summary.title = '展开或收起回复';
                    summary.append(button);
                    details.append(summary, createList(children));
                    item.append(details);
                } else item.append(button);
                entries.set(branch.dataset.id, { button, summary });
                list.append(item);
            }
            return list;
        };
        paperList.replaceChildren(createList(notesRoot.children));
        listEmpty.hidden = notes.length > 0;
        listEmpty.textContent = '还没有纸条';
        sidebarContent.scrollTop = scrollTop;
        const entry = entries.get(focusedId);
        if (entry) (focused.tagName === 'SUMMARY' ? entry.summary || entry.button : entry.button).focus({ preventScroll: true });
    }

    function nextPosition(color = 'cream', size = newNoteSize) {
        let slot = 0;
        let x, y;
        const occupied = [...notesRoot.querySelectorAll('.board-note')].map((paper) => {
            const rect = paper.getBoundingClientRect();
            return { x: (rect.left - camera.x) / camera.scale, y: (rect.top - camera.y) / camera.scale, width: rect.width / camera.scale, height: rect.height / camera.scale };
        });
        const origin = { x: (visibleWidth() / 2 - camera.x) / camera.scale - size.width / 2, y: (Math.max(110, (viewport.clientHeight - size.height * camera.scale) / 2) - camera.y) / camera.scale };
        do {
            x = origin.x + [0, size.width + 35, -size.width - 35][slot % 3];
            y = origin.y + Math.floor(slot / 3) * (size.height + 40);
            slot++;
        } while (occupied.some((paper) => x < paper.x + paper.width + 20 && x + size.width + 20 > paper.x && y < paper.y + paper.height + 20 && y + size.height + 20 > paper.y));
        return { v: 2, x, y, color, ...size, rotation: Math.random() * 6 - 3 };
    }

    function replyParentLabel(note, reply) {
        const parent = note.replies?.find((item) => item.id === reply.parentId);
        const target = reply.parentId ? parent : note;
        return target ? `回复 @${target.author?.login || '路过的人'}` : '原回复已移除';
    }

    function paperPosition(note, comment) {
        if (comment === note) return note.position;
        const parent = note.replies?.find((item) => item.id === comment.parentId) || note;
        return { v: 2, x: 0, y: 0, color: parent.position?.color || note.position.color, ...noteSize, rotation: 0, ...comment.position };
    }

    function replySize(position) {
        return Object.fromEntries(geometryInputs.filter((input) => input.name !== 'rotation').map((input) => {
            const step = Number(input.step);
            const size = position[input.name] ?? noteSize[input.name];
            return [input.name, Math.max(Number(input.min), Math.round(size * replyScale / step) * step)];
        }));
    }

    function renderPaper(note, comment = note) {
        const branch = document.createElement('div');
        branch.className = 'board-branch';
        branch.dataset.id = comment.id;
        const article = document.createElement('article');
        article.className = 'board-note';
        article.dataset.id = comment.id;
        article.tabIndex = -1;
        article.classList.toggle('is-located', comment.id === selectedPaperId);
        article.innerHTML = '<span class="board-note-pin" aria-hidden="true"></span><div class="board-note-message noticeboard-markdown"></div><footer class="board-note-footer"></footer>';
        branch.append(article);
        article.addEventListener('pointerdown', () => bringPaperForward(branch));
        article.addEventListener('focusin', () => bringPaperForward(branch));
        positionNote(branch, paperPosition(note, comment));
        renderMarkdown(article.querySelector('.board-note-message'), comment.body);
        renderMetadata(article.querySelector(':scope > footer'), comment);
        article.append(reactionBar(note, comment));
        if (comment !== note) {
            const target = document.createElement('p');
            target.className = 'noticeboard-reply-target';
            target.textContent = replyParentLabel(note, comment);
            article.querySelector('.board-note-message').before(target);
        }
        if (owns(comment)) {
            article.querySelector('.board-note-pin').remove();
            const handle = document.createElement('button');
            handle.className = 'board-note-handle';
            handle.type = 'button';
            handle.setAttribute('aria-label', '拖动纸条上沿移动自己的纸条，也支持方向键');
            handle.title = '按住纸条上沿移动；方向键也可以移动';
            handle.innerHTML = '<span class="board-note-pin" aria-hidden="true"></span>';
            article.prepend(handle);
            bindMovement(handle, article, branch, note, comment);
        }
        const actions = document.createElement('div');
        actions.className = 'board-note-actions';
        if (owns(comment)) actions.append(action('修改', () => openEditor(note, comment)));
        if (owns(comment) || (comment !== note && owns(note))) actions.append(action('移除', () => confirmRemove(note, comment === note ? null : comment)));
        const replies = comment === note ? note.replies || [] : (note.replies || []).filter((reply) => reply.parentId === comment.id);
        actions.append(action(replies.length ? `回复 · ${replies.length}` : '回复', () => openEditor(note, null, comment), 'board-note-reply'));
        article.append(actions);
        return branch;
    }

    function renderNote(note) {
        const branch = renderPaper(note);
        const replies = note.replies || [];
        const branches = new Map([[note.id, branch], ...replies.map((reply) => [reply.id, renderPaper(note, reply)])]);
        for (const reply of replies) {
            const parent = branches.get(reply.parentId) || branch;
            let papers = parent.querySelector(':scope > .board-note-replies');
            if (!papers) {
                papers = document.createElement('div');
                papers.className = 'board-note-replies';
                parent.append(papers);
            }
            papers.append(branches.get(reply.id));
        }
        branch.querySelectorAll('.board-note-replies').forEach((papers) => {
            [...papers.children].forEach((paper, index) => {
                paper.style.setProperty('--reply-anchor', `${(index + 1) / (papers.childElementCount + 1) * 100}%`);
            });
        });
        return branch;
    }

    function renderNotes(immediate = false) {
        const layers = new Map([...notesRoot.querySelectorAll('.board-branch')].map((branch) => [branch.dataset.id, branch.style.zIndex]));
        const focused = notesRoot.contains(document.activeElement) ? document.activeElement : null;
        const focusedPaper = focused?.closest('.board-note');
        const controls = (paper) => [...paper.querySelectorAll('button, a')];
        const focusIndex = focusedPaper ? controls(focusedPaper).indexOf(focused) : -1;
        const branches = notes.map(renderNote);
        for (const branch of branches) {
            [branch, ...branch.querySelectorAll('.board-branch')].forEach((item) => { item.style.zIndex = layers.get(item.dataset.id) || ''; });
            if (immediate) branch.querySelectorAll('.board-note').forEach((paper) => { paper.style.animation = 'none'; });
        }
        notesRoot.replaceChildren(...branches);
        if (focusedPaper) {
            const paper = [...notesRoot.querySelectorAll('.board-note')].find((item) => item.dataset.id === focusedPaper.dataset.id);
            if (paper) (controls(paper)[focusIndex] || paper).focus({ preventScroll: true });
        }
        updateCount();
    }

    function refreshPaper(note, comment = note) {
        const paper = [...notesRoot.children].find((element) => element.dataset.id === note.id);
        const updated = renderNote(note);
        if (paper) {
            updated.style.zIndex = paper.style.zIndex;
            const layers = new Map([...paper.querySelectorAll('.board-branch')].map((branch) => [branch.dataset.id, branch.style.zIndex]));
            updated.querySelectorAll('.board-branch').forEach((branch) => { branch.style.zIndex = layers.get(branch.dataset.id) || ''; });
            updated.querySelectorAll('.board-note').forEach((element) => { element.style.animation = 'none'; });
            paper.replaceWith(updated);
        } else notesRoot.append(updated);
        updateCount();
        return [...updated.querySelectorAll('.board-note')].find((element) => element.dataset.id === comment.id);
    }

    async function saveComment(note, comment, changes) {
        if (localPreview) {
            Object.assign(comment, changes, { updatedAt: new Date().toISOString() });
            persistPreview();
            return comment;
        }
        const kind = comment === note ? 'notes' : 'replies';
        const updated = await request(`/api/${kind}/${encodeURIComponent(comment.id)}`, 'PATCH', changes);
        Object.assign(comment, updated);
        return comment;
    }

    async function saveMovement(article, branch, note, comment, original) {
        article.classList.add('is-saving');
        try {
            await saveComment(note, comment, { position: comment.position });
            renderMetadata(article.querySelector(':scope > footer'), comment);
            say('位置已保存。');
        } catch (error) {
            comment.position = original;
            positionNote(branch, original);
            say(error.message);
        } finally {
            article.classList.remove('is-saving');
            updateCount();
        }
    }

    function constrainReplyPin(article, branch, position, left, top) {
        const parent = branch.parentElement.closest('.board-branch');
        if (!parent) return { x: left, y: top };
        const paper = parent.querySelector(':scope > .board-note');
        paper.style.animation = 'none';
        const style = getComputedStyle(paper);
        const width = parseFloat(style.width);
        const height = parseFloat(style.height);
        const bounds = paper.getBoundingClientRect();
        const matrix = new DOMMatrix(style.transform);
        matrix.a *= camera.scale;
        matrix.b *= camera.scale;
        matrix.c *= camera.scale;
        matrix.d *= camera.scale;
        // 用纸面四角还原坐标，避免把旋转后的外接矩形当成可移动范围。
        matrix.e = bounds.left - Math.min(0, matrix.a * width, matrix.c * height, matrix.a * width + matrix.c * height);
        matrix.f = bounds.top - Math.min(0, matrix.b * width, matrix.d * height, matrix.b * width + matrix.d * height);
        const pin = article.querySelector('.board-note-pin').getBoundingClientRect();
        const proposed = new DOMPoint(pin.left + pin.width / 2 + (left - position.x) * camera.scale, pin.top + pin.height / 2 + (top - position.y) * camera.scale);
        const local = matrix.inverse().transformPoint(proposed);
        const inset = Math.max(pin.width, pin.height) / camera.scale / 2;
        local.x = Math.max(inset, Math.min(width - inset, local.x));
        local.y = Math.max(inset, Math.min(height - inset, local.y));
        const constrained = matrix.transformPoint(local);
        return { x: left + (constrained.x - proposed.x) / camera.scale, y: top + (constrained.y - proposed.y) / camera.scale };
    }

    function bindMovement(handle, article, branch, note, comment) {
        let drag;
        let keyOriginal;
        let keyTimer;
        const setPosition = (left, top) => {
            const position = paperPosition(note, comment);
            comment.position = { ...position, v: 2, ...constrainReplyPin(article, branch, position, left, top) };
            positionNote(branch, comment.position);
        };
        handle.addEventListener('pointerdown', (event) => {
            if (event.button !== 0 || !event.isPrimary || article.classList.contains('is-saving')) return;
            event.preventDefault();
            event.stopPropagation();
            cancelAnimationFrame(motionFrame);
            handle.focus({ preventScroll: true });
            handle.setPointerCapture(event.pointerId);
            const position = paperPosition(note, comment);
            const original = { ...position };
            bringPaperForward(branch);
            article.style.animation = 'none';
            article.classList.add('is-dragging');
            setPosition(position.x, position.y);
            const start = paperPosition(note, comment);
            drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, left: start.x, top: start.y, original };
        });
        handle.addEventListener('pointermove', (event) => {
            if (!drag || event.pointerId !== drag.pointerId) return;
            setPosition(drag.left + (event.clientX - drag.x) / camera.scale, drag.top + (event.clientY - drag.y) / camera.scale);
        });
        handle.addEventListener('pointerup', () => {
            if (!drag) return;
            const original = drag.original;
            handle.releasePointerCapture(drag.pointerId);
            drag = null;
            article.classList.remove('is-dragging');
            const position = paperPosition(note, comment);
            if (position.x !== original.x || position.y !== original.y) saveMovement(article, branch, note, comment, original);
            else updateCount();
        });
        handle.addEventListener('pointercancel', () => {
            if (!drag) return;
            comment.position = drag.original;
            positionNote(branch, comment.position);
            drag = null;
            article.classList.remove('is-dragging');
            updateCount();
        });
        handle.addEventListener('keydown', (event) => {
            const direction = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
            if (!direction || article.classList.contains('is-saving')) return;
            event.preventDefault();
            const position = paperPosition(note, comment);
            keyOriginal ||= { ...position };
            article.classList.add('is-dragging');
            const step = event.shiftKey ? 30 : 10;
            bringPaperForward(branch);
            article.style.animation = 'none';
            setPosition(position.x + direction[0] * step, position.y + direction[1] * step);
            clearTimeout(keyTimer);
            keyTimer = setTimeout(() => {
                const original = keyOriginal;
                keyOriginal = null;
                article.classList.remove('is-dragging');
                saveMovement(article, branch, note, comment, original);
            }, 350);
        });
    }

    function login() {
        if (localPreview) {
            user = previewUser;
            renderAccount();
            renderNotes();
            return;
        }
        if (!config.apiUrl) return say('布告栏正在布置中，暂时还不能贴纸条。');
        const url = new URL(`${config.apiUrl.replace(/\/$/, '')}/auth/start`);
        url.searchParams.set('return_to', location.href.split('#')[0]);
        location.assign(url);
    }

    function openEditor(note = null, comment = note, target = null) {
        if (!user) return login();
        activeNote = note;
        editing = comment;
        replyingTo = target;
        form.reset();
        bodyInput.value = comment?.body || '';
        bodyInput.placeholder = target ? '写下你的回复…' : '今天有什么想说的？';
        const position = comment ? paperPosition(note, comment) : target ? paperPosition(note, target) : { ...newNoteSize, color: colorChoice.value };
        const size = target ? replySize(position) : position;
        const color = position.color;
        colorChoice.value = color.startsWith('#') ? 'custom' : color;
        hexInput.value = color.startsWith('#') ? color : defaultPaperColor;
        paintPaper(customSwatch, normalizeHex(hexInput.value));
        syncEditorPaper();
        geometryInputs.forEach((input) => {
            const saved = input.name === 'rotation' && !comment ? undefined : size[input.name];
            input.value = saved ?? (input.name === 'rotation' ? Math.round(Math.random() * 6 - 3) : noteSize[input.name]);
        });
        const isReply = Boolean(target || (comment && comment !== note));
        editorContext.hidden = !isReply;
        editorContext.textContent = target ? `回复 @${target.author?.login || '路过的人'}` : isReply ? replyParentLabel(note, comment) : '';
        document.getElementById('noticeboard-editor-title').textContent = comment ? (isReply ? '修改回复纸条' : '修改纸条') : (isReply ? '写张回复纸条' : '写张纸条');
        submit.textContent = comment ? '保存纸条' : isReply ? '钉在下面' : '贴上去';
        document.getElementById('noticeboard-form-status').textContent = '';
        editor.showModal();
        syncEditorGeometry();
        bodyInput.focus();
    }

    form.addEventListener('change', (event) => {
        if (event.target.name === 'color') syncEditorPaper();
    });
    hexInput.addEventListener('input', syncEditorPaper);
    geometryInputs.forEach((input) => input.addEventListener('input', syncEditorGeometry));
    bodyInput.addEventListener('input', syncEditorGeometry);
    hexInput.addEventListener('blur', () => {
        if (hexInput.checkValidity()) hexInput.value = normalizeHex(hexInput.value);
    });

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const body = bodyInput.value.trim();
        if (!body) return;
        const geometry = editorGeometry();
        const placement = editing ? paperPosition(activeNote, editing) : replyingTo ? { v: 2, x: 0, y: 0 } : nextPosition(selectedPaperColor(), geometry);
        const position = { ...placement, ...geometry, color: selectedPaperColor() };
        submit.disabled = true;
        const formStatus = document.getElementById('noticeboard-form-status');
        formStatus.textContent = '正在把纸条贴好…';
        try {
            let note = activeNote;
            let comment;
            if (editing) comment = await saveComment(note, editing, { body, position });
            else if (replyingTo) {
                const path = replyingTo === note ? `/api/notes/${encodeURIComponent(note.id)}/replies` : `/api/replies/${encodeURIComponent(replyingTo.id)}/replies`;
                comment = localPreview ? { id: crypto.randomUUID(), body, position, author: user, createdAt: new Date().toISOString(), parentId: replyingTo === note ? null : replyingTo.id } : await request(path, 'POST', { body, position });
                (note.replies ||= []).push(comment);
                if (localPreview) persistPreview();
            } else if (localPreview) {
                note = comment = { id: crypto.randomUUID(), body, position, author: user, createdAt: new Date().toISOString(), replies: [] };
                notes.push(note);
                persistPreview();
            } else {
                note = comment = await request('/api/notes', 'POST', { body, position });
                notes.push(note);
            }
            editor.close();
            const paper = refreshPaper(note, comment);
            revealPaper(paper);
            say(editing ? '纸条已更新。' : replyingTo ? '回复纸条已经钉好了。' : '你的纸条已经贴好了。');
        } catch (error) { formStatus.textContent = error.message; }
        finally { submit.disabled = false; }
    });

    document.getElementById('noticeboard-delete-form').addEventListener('submit', async (event) => {
        event.preventDefault();
        const button = event.submitter;
        button.disabled = true;
        try {
            const { note, reply } = removing;
            if (!localPreview) await request(reply ? `/api/replies/${encodeURIComponent(reply.id)}` : `/api/notes/${encodeURIComponent(note.id)}`, 'DELETE');
            if (reply) {
                note.replies = note.replies.filter((item) => item.id !== reply.id);
                refreshPaper(note);
            } else {
                notes = notes.filter((item) => item.id !== note.id);
                [...notesRoot.children].find((element) => element.dataset.id === note.id).remove();
                updateCount();
            }
            if (localPreview) persistPreview();
            removeDialog.close();
            say(reply ? '回复已移除。' : '纸条已移除。');
        } catch (error) { removeDialog.close(); say(error.message); }
        finally { button.disabled = false; }
    });

    document.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', () => document.getElementById(button.dataset.close).close()));
    writeButton.addEventListener('click', () => openEditor());
    document.getElementById('noticeboard-center').addEventListener('click', () => moveCamera(cameraOrigin));
    zoomOut.addEventListener('click', () => zoomCamera(camera.scale - config.zoom.step));
    zoomIn.addEventListener('click', () => zoomCamera(camera.scale + config.zoom.step));
    zoomReset.addEventListener('click', () => zoomCamera(cameraOrigin.scale));
    document.addEventListener('keydown', (event) => {
        if (event.ctrlKey) {
            const direction = ['-', '_'].includes(event.key) ? -1 : ['+', '='].includes(event.key) ? 1 : 0;
            if (direction) {
                event.preventDefault();
                zoomCamera(camera.scale + config.zoom.step * direction);
            }
        }
        if (event.key === 'Escape' && sidebar.classList.contains('is-open') && !editor.open && !removeDialog.open && !reactionPicker.matches(':popover-open')) {
            event.preventDefault();
            closeSidebar();
        }
    });
    const hoverSidebar = (event) => {
        if (event.pointerType !== 'mouse' || viewport.classList.contains('is-panning')) return;
        sidebarHovered = true;
        syncSidebar();
    };
    const leaveSidebar = (event) => {
        if (sidebar.contains(event.relatedTarget) || sidebarToggle.contains(event.relatedTarget) || event.relatedTarget === sidebarEdge) return;
        sidebarHovered = false;
        syncSidebar();
    };
    sidebarEdge.addEventListener('pointerenter', hoverSidebar);
    sidebar.addEventListener('pointerenter', hoverSidebar);
    [sidebarEdge, sidebar, sidebarToggle].forEach((element) => element.addEventListener('pointerleave', leaveSidebar));
    sidebar.addEventListener('focusin', () => { sidebarPinned = true; syncSidebar(); });
    sidebarToggle.addEventListener('click', () => { sidebarPinned = !sidebarPinned; sidebarHovered = false; syncSidebar(); });
    document.getElementById('noticeboard-sidebar-close').addEventListener('click', closeSidebar);
    refreshButton.addEventListener('click', () => refreshBoard());
    loginButton.addEventListener('click', login);
    logoutButton.addEventListener('click', () => {
        ticket = '';
        user = null;
        sessionStorage.removeItem(`${storageKey}:session`);
        renderAccount();
        renderNotes(true);
        say('已退出，纸条会继续留在这里。');
    });

    function hasActiveInteraction() {
        return editor.open || removeDialog.open || submit.disabled || removeDialog.querySelector('button[type="submit"]').disabled
            || viewport.classList.contains('is-panning') || reactionPicker.matches(':popover-open')
            || Boolean(notesRoot.querySelector('.is-dragging, .is-saving, [aria-busy="true"]'));
    }

    async function load() {
        const revision = boardRevision;
        if (localPreview) {
            user = previewUser;
            notes = JSON.parse(localStorage.getItem(storageKey) || '[]');
            document.getElementById('noticeboard-mode').textContent = '本地预览 · 纸条只保存在这个浏览器';
        } else if (config.apiUrl) {
            const board = await request('/api/board');
            // 读取期间发生的编辑或移动优先保留，下一次刷新再同步。
            if (boardReady && (hasActiveInteraction() || revision !== boardRevision)) return false;
            notes = board.notes;
            user = board.user;
        } else {
            document.getElementById('noticeboard-mode').textContent = '留言板即将开放';
            writeButton.disabled = true;
            loginButton.hidden = true;
            updateCount();
            return true;
        }
        notes.forEach((note) => { note.position = worldPosition(note.position); });
        renderAccount();
        renderNotes(boardReady);
        writeButton.disabled = false;
        loginButton.disabled = false;
        return true;
    }

    function showRefreshLoading() {
        refreshFeedback = true;
        loadingMessage.textContent = '加载留言中…';
        loading.classList.remove('has-error');
        loading.hidden = false;
        refreshButton.disabled = true;
        viewport.setAttribute('aria-busy', 'true');
    }

    function reportRefreshError(error) {
        if (!refreshFeedback) return;
        if (!boardReady) {
            loadingMessage.textContent = '留言加载失败，请刷新重试。';
            loading.classList.add('has-error');
            document.getElementById('noticeboard-count').textContent = '加载失败';
            listEmpty.textContent = '纸条列表加载失败，请刷新重试。';
        }
        say(error.message);
    }

    function refreshBoard(silent = false) {
        if (!silent) showRefreshLoading();
        if (refreshPromise) return refreshPromise;
        refreshPromise = load().then((refreshed) => {
            if (!refreshed) return;
            boardReady = true;
            notesRoot.hidden = false;
            loading.hidden = true;
            loading.classList.remove('has-error');
        }).catch(reportRefreshError).finally(() => {
            if (refreshFeedback) {
                if (!loading.classList.contains('has-error')) loading.hidden = true;
                viewport.setAttribute('aria-busy', 'false');
            }
            refreshButton.disabled = !config.apiUrl && !localPreview;
            refreshFeedback = false;
            refreshPromise = null;
        });
        return refreshPromise;
    }

    bindCamera();
    window.addEventListener('resize', queuePaint);
    const syncVisibility = () => {
        document.documentElement.toggleAttribute('data-folio-paused', document.hidden);
        if (document.hidden) cancelAnimationFrame(motionFrame);
    };
    document.addEventListener('visibilitychange', syncVisibility);
    syncVisibility();
    showRefreshLoading();
    Promise.resolve(window.__shiro.folioReady).then(() => {
        if (config.apiUrl || localPreview) {
            setInterval(() => {
                if (!document.hidden && !hasActiveInteraction()) refreshBoard(true);
            }, config.refreshInterval * 1000);
        }
        return refreshBoard();
    }).catch((error) => {
        reportRefreshError(error);
        viewport.setAttribute('aria-busy', 'false');
    });
})();
