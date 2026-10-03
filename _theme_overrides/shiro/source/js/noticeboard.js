(() => {
    'use strict';

    const config = JSON.parse(document.getElementById('noticeboard-config').textContent);
    const viewport = document.getElementById('noticeboard-viewport');
    const wallpaper = document.getElementById('noticeboard-wallpaper');
    const flowersRoot = document.getElementById('noticeboard-flowers');
    const petalsRoot = document.getElementById('noticeboard-petals');
    const notesRoot = document.getElementById('noticeboard-notes');
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
    const submit = document.getElementById('noticeboard-submit');
    const removeDialog = document.getElementById('noticeboard-delete');
    const status = document.getElementById('noticeboard-status');
    const loginButton = document.getElementById('noticeboard-login');
    const logoutButton = document.getElementById('noticeboard-logout');
    const writeButton = document.getElementById('noticeboard-write');
    const thread = document.getElementById('noticeboard-thread');
    const replyForm = document.getElementById('noticeboard-reply-form');
    const replyInput = document.getElementById('noticeboard-reply-body');
    const replySubmit = document.getElementById('noticeboard-reply-submit');
    const replyCancel = document.getElementById('noticeboard-reply-cancel');
    const replyStatus = document.getElementById('noticeboard-reply-status');
    const replyContext = document.getElementById('noticeboard-reply-context');
    const reactionPicker = document.getElementById('noticeboard-reaction-picker');
    const reactionOptions = [
        ['THUMBS_UP', '👍', '赞'], ['THUMBS_DOWN', '👎', '不赞同'], ['LAUGH', '😄', '开心'], ['HOORAY', '🎉', '庆祝'],
        ['CONFUSED', '😕', '疑惑'], ['HEART', '❤️', '喜欢'], ['ROCKET', '🚀', '加油'], ['EYES', '👀', '关注']
    ];
    const storageKey = `noticeboard:${config.repository}:${config.discussionNumber}`;
    const cameraKey = `${storageKey}:camera`;
    const cameraOrigin = { x: 0, y: 0 };
    let camera = JSON.parse(sessionStorage.getItem(cameraKey) || JSON.stringify(cameraOrigin));
    let paintFrame = 0;
    let motionFrame = 0;
    let statusTimer;
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    const wallpaperStyle = getComputedStyle(wallpaper);
    const tile = wallpaperStyle.backgroundSize.split(' ').map(parseFloat);
    const wallpaperPad = parseFloat(wallpaperStyle.getPropertyValue('--wallpaper-pad'));
    let wallpaperAnchor = { x: 0, y: 0 };
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
    let editingReply = null;
    let replyingTo = null;
    let reactionTarget = null;
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
            Math.floor(-camera.x / spacing) - 1,
            Math.floor(-camera.y / spacing) - 1,
            Math.floor((viewport.clientWidth - camera.x) / spacing) + 1,
            Math.floor((viewport.clientHeight - camera.y) / spacing) + 1
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
        if (Math.abs(camera.x - wallpaperAnchor.x) > wallpaperPad || Math.abs(camera.y - wallpaperAnchor.y) > wallpaperPad) {
            wallpaperAnchor = { ...camera };
            wallpaper.style.backgroundPosition = `calc(50% + ${camera.x % tile[0]}px) ${wallpaperPad + camera.y % tile[1]}px`;
        }
        viewport.style.setProperty('--camera-x', `${camera.x}px`);
        viewport.style.setProperty('--camera-y', `${camera.y}px`);
        viewport.style.setProperty('--wallpaper-x', `${camera.x - wallpaperAnchor.x}px`);
        viewport.style.setProperty('--wallpaper-y', `${camera.y - wallpaperAnchor.y}px`);
        scatterFlowers();
        scatterPetals();
    }

    function queuePaint() {
        if (!paintFrame) paintFrame = requestAnimationFrame(paintCamera);
    }

    function rememberCamera() { sessionStorage.setItem(cameraKey, JSON.stringify(camera)); }

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
            const next = { x: drag.start.x + event.clientX - drag.x, y: drag.start.y + event.clientY - drag.y };
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
            if (event.target.closest('.board-note')) return;
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
            camera = { x: start.x + (target.x - start.x) * eased, y: start.y + (target.y - start.y) * eased };
            paintCamera();
            if (progress < 1) motionFrame = requestAnimationFrame(step);
            else rememberCamera();
        };
        motionFrame = requestAnimationFrame(step);
    }

    function revealPaper(paper, note) {
        paper.style.zIndex = ++topLayer;
        const rect = paper.getBoundingClientRect();
        if (rect.left >= 20 && rect.right <= innerWidth - 20 && rect.top >= 90 && rect.bottom <= innerHeight - 90) return;
        moveCamera({ x: (viewport.clientWidth - paper.offsetWidth) / 2 - note.position.x, y: Math.max(100, (viewport.clientHeight - paper.offsetHeight) / 2) - note.position.y });
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
        paintPaper(reactionPicker, note.position.color);
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
        // Keep the picker inside the active dialog while the top layer lets it
        // escape the scrolling paper's clipping region.
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
            if (thread.open && activeNote === note) renderReplies();
        } catch (error) {
            if (thread.open && activeNote === note) replyStatus.textContent = error.message;
            else say(error.message);
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
        paintPaper(removeDialog, note.position.color);
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
        paintPaper(element, position.color);
    }

    function updateCount() {
        document.getElementById('noticeboard-count').textContent = `${notes.length} 张纸条`;
    }

    function nextPosition(color = 'cream', size = noteSize) {
        let slot = 0;
        let x, y;
        const origin = { x: (viewport.clientWidth - size.width) / 2 - camera.x, y: Math.max(110, (viewport.clientHeight - size.height) / 2) - camera.y };
        do {
            x = origin.x + [0, size.width + 35, -size.width - 35][slot % 3];
            y = origin.y + Math.floor(slot / 3) * (size.height + 40);
            slot++;
        } while (notes.some(({ position }) => x < position.x + (position.width || noteSize.width) + 20 && x + size.width + 20 > position.x && y < position.y + (position.height || noteSize.height) + 20 && y + size.height + 20 > position.y));
        return { v: 2, x, y, color, ...size, rotation: Math.random() * 6 - 3 };
    }

    function replyParentLabel(note, reply) {
        const parent = note.replies?.find((item) => item.id === reply.parentId);
        return parent ? `回复 @${parent.author?.login || '路过的人'}` : '原回复已移除';
    }

    function renderNote(note) {
        const article = document.createElement('article');
        article.className = 'board-note';
        article.dataset.id = note.id;
        article.innerHTML = '<span class="board-note-pin" aria-hidden="true"></span><div class="board-note-message noticeboard-markdown"></div><footer class="board-note-footer"></footer>';
        positionNote(article, note.position);
        renderMarkdown(article.querySelector('.board-note-message'), note.body);
        renderMetadata(article.querySelector(':scope > footer'), note);
        article.append(reactionBar(note));
        if (owns(note)) {
            article.querySelector('.board-note-pin').remove();
            const handle = document.createElement('button');
            handle.className = 'board-note-handle';
            handle.type = 'button';
            handle.setAttribute('aria-label', '拖动纸条上沿移动自己的纸条，也支持方向键');
            handle.title = '按住纸条上沿移动；方向键也可以移动';
            handle.innerHTML = '<span class="board-note-pin" aria-hidden="true"></span>';
            article.prepend(handle);
            bindMovement(handle, article, note);
        }
        const actions = document.createElement('div');
        actions.className = 'board-note-actions';
        if (owns(note)) actions.append(action('修改', () => openEditor(note)), action('移除', () => confirmRemove(note)));
        const replies = note.replies || [];
        actions.append(action(replies.length ? `回复 · ${replies.length}` : '回复', () => openThread(note), 'board-note-reply'));
        article.append(actions);
        if (replies.length) {
            const preview = document.createElement('ul');
            preview.className = 'board-note-reply-preview';
            replies.slice(-2).forEach((reply) => {
                const item = document.createElement('li');
                if (reply.parentId) {
                    const target = document.createElement('p');
                    target.className = 'noticeboard-reply-target';
                    target.textContent = replyParentLabel(note, reply);
                    item.append(target);
                }
                const message = document.createElement('div');
                message.className = 'board-note-reply-text noticeboard-markdown';
                renderMarkdown(message, reply.body);
                const metadata = document.createElement('div');
                metadata.className = 'board-note-footer';
                renderMetadata(metadata, reply);
                const reactions = reactionBar(note, reply);
                reactions.append(action('回复', () => openThread(note, reply), 'board-note-preview-reply'));
                item.append(message, metadata, reactions);
                preview.append(item);
            });
            article.append(preview);
        }
        return article;
    }

    function renderNotes() {
        notesRoot.replaceChildren(...notes.map(renderNote));
        updateCount();
    }

    function refreshPaper(note) {
        const paper = [...notesRoot.children].find((element) => element.dataset.id === note.id);
        const updated = renderNote(note);
        if (paper) {
            updated.style.zIndex = paper.style.zIndex;
            updated.style.animation = 'none';
            paper.replaceWith(updated);
        } else notesRoot.append(updated);
        updateCount();
        return updated;
    }

    function resetReplyEditor() {
        editingReply = null;
        replyingTo = null;
        replyContext.hidden = true;
        replyContext.textContent = '';
        replyInput.value = '';
        replyInput.placeholder = '写下你的回复…';
        replySubmit.textContent = '回复';
        replyCancel.hidden = true;
        replyStatus.textContent = '';
    }

    function targetReply(reply, edit = false) {
        if (!user) return login();
        resetReplyEditor();
        if (edit) {
            editingReply = reply;
            replyInput.value = reply.body;
            replySubmit.textContent = '保存回复';
        } else replyingTo = reply;
        const author = `@${reply.author?.login || '路过的人'}`;
        replyContext.textContent = edit ? `修改 ${author} 的回复` : `回复 ${author}`;
        replyContext.hidden = false;
        replyInput.placeholder = `回复 ${author}…`;
        replyCancel.textContent = edit ? '取消修改' : '取消回复';
        replyCancel.hidden = false;
        replyInput.focus({ preventScroll: true });
        replyForm.scrollIntoView({ block: 'nearest', behavior: motion.matches ? 'auto' : 'smooth' });
    }

    function renderReplies() {
        renderMetadata(document.getElementById('noticeboard-thread-author'), activeNote);
        renderMarkdown(document.getElementById('noticeboard-thread-body'), activeNote.body);
        document.getElementById('noticeboard-thread-reactions').replaceChildren(reactionBar(activeNote));
        const list = document.getElementById('noticeboard-replies');
        const replies = activeNote.replies || [];
        const items = new Map(replies.map((reply, index) => {
            const item = document.createElement('li');
            item.innerHTML = '<header class="noticeboard-reply-heading"><div class="board-note-footer"></div><small></small></header><div class="noticeboard-reply-message noticeboard-markdown"></div><div class="noticeboard-reply-actions"></div>';
            renderMetadata(item.querySelector('header div'), reply);
            item.querySelector('small').textContent = `${index + 1} 楼`;
            renderMarkdown(item.querySelector('.noticeboard-reply-message'), reply.body);
            if (reply.parentId) {
                const target = document.createElement('p');
                target.className = 'noticeboard-reply-target';
                target.textContent = replyParentLabel(activeNote, reply);
                item.querySelector('header').after(target);
            }
            item.querySelector('.noticeboard-reply-message').after(reactionBar(activeNote, reply));
            const actions = item.querySelector('.noticeboard-reply-actions');
            if (owns(reply)) actions.append(action('修改', () => targetReply(reply, true)));
            if (owns(reply) || owns(activeNote)) actions.append(action('移除', () => confirmRemove(activeNote, reply)));
            actions.append(action('回复', () => targetReply(reply)));
            return [reply.id, item];
        }));
        list.replaceChildren();
        for (const reply of replies) {
            const parent = items.get(reply.parentId);
            let destination = list;
            if (parent) {
                destination = parent.querySelector(':scope > .noticeboard-reply-children');
                if (!destination) {
                    destination = document.createElement('ol');
                    destination.className = 'noticeboard-reply-children';
                    parent.append(destination);
                }
            }
            destination.append(items.get(reply.id));
        }
        document.getElementById('noticeboard-thread-empty').hidden = replies.length > 0;
        replyForm.hidden = !user;
        document.getElementById('noticeboard-reply-login').hidden = Boolean(user);
    }

    function openThread(note, reply = null) {
        activeNote = note;
        paintPaper(thread, note.position.color);
        resetReplyEditor();
        renderReplies();
        thread.showModal();
        if (reply) targetReply(reply);
    }

    async function saveNote(note, changes) {
        if (localPreview) {
            Object.assign(note, changes, { updatedAt: new Date().toISOString() });
            persistPreview();
            return note;
        }
        const updated = await request(`/api/notes/${encodeURIComponent(note.id)}`, 'PATCH', changes);
        Object.assign(note, updated);
        return note;
    }

    async function saveMovement(article, note, original) {
        article.classList.add('is-saving');
        try {
            await saveNote(note, { position: note.position });
            renderMetadata(article.querySelector(':scope > footer'), note);
            say('位置已保存。');
        } catch (error) {
            note.position = original;
            positionNote(article, original);
            say(error.message);
        } finally {
            article.classList.remove('is-saving');
            updateCount();
        }
    }

    function bindMovement(handle, article, note) {
        let drag;
        let keyOriginal;
        let keyTimer;
        const setPosition = (left, top) => {
            note.position = { ...note.position, v: 2, x: left, y: top };
            positionNote(article, note.position);
        };
        handle.addEventListener('pointerdown', (event) => {
            if (event.button !== 0 || !event.isPrimary || article.classList.contains('is-saving')) return;
            event.preventDefault();
            event.stopPropagation();
            cancelAnimationFrame(motionFrame);
            handle.focus({ preventScroll: true });
            handle.setPointerCapture(event.pointerId);
            drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, left: note.position.x, top: note.position.y, original: { ...note.position } };
            article.style.zIndex = ++topLayer;
            article.classList.add('is-dragging');
        });
        handle.addEventListener('pointermove', (event) => {
            if (!drag || event.pointerId !== drag.pointerId) return;
            setPosition(drag.left + event.clientX - drag.x, drag.top + event.clientY - drag.y);
        });
        handle.addEventListener('pointerup', () => {
            if (!drag) return;
            const original = drag.original;
            handle.releasePointerCapture(drag.pointerId);
            drag = null;
            article.classList.remove('is-dragging');
            if (note.position.x !== original.x || note.position.y !== original.y) saveMovement(article, note, original);
            else updateCount();
        });
        handle.addEventListener('pointercancel', () => {
            if (!drag) return;
            note.position = drag.original;
            positionNote(article, note.position);
            drag = null;
            article.classList.remove('is-dragging');
            updateCount();
        });
        handle.addEventListener('keydown', (event) => {
            const direction = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
            if (!direction || article.classList.contains('is-saving')) return;
            event.preventDefault();
            keyOriginal ||= { ...note.position };
            const step = event.shiftKey ? 30 : 10;
            article.style.zIndex = ++topLayer;
            setPosition(article.offsetLeft + direction[0] * step, article.offsetTop + direction[1] * step);
            clearTimeout(keyTimer);
            keyTimer = setTimeout(() => {
                const original = keyOriginal;
                keyOriginal = null;
                saveMovement(article, note, original);
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

    function openEditor(note = null) {
        if (!user) return login();
        editing = note;
        form.reset();
        bodyInput.value = note?.body || '';
        const color = note?.position.color || colorChoice.value;
        colorChoice.value = color.startsWith('#') ? 'custom' : color;
        hexInput.value = color.startsWith('#') ? color : defaultPaperColor;
        paintPaper(customSwatch, normalizeHex(hexInput.value));
        syncEditorPaper();
        geometryInputs.forEach((input) => { input.value = note?.position[input.name] ?? (input.name === 'rotation' ? Math.round(Math.random() * 6 - 3) : noteSize[input.name]); });
        document.getElementById('noticeboard-editor-title').textContent = note ? '修改纸条' : '写张纸条';
        submit.textContent = note ? '保存纸条' : '贴上去';
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
        const position = { ...(editing ? editing.position : nextPosition(selectedPaperColor(), geometry)), ...geometry, color: selectedPaperColor() };
        submit.disabled = true;
        const formStatus = document.getElementById('noticeboard-form-status');
        formStatus.textContent = '正在把纸条贴好…';
        try {
            let note;
            if (editing) note = await saveNote(editing, { body, position });
            else if (localPreview) {
                note = { id: crypto.randomUUID(), body, position, author: user, createdAt: new Date().toISOString(), replies: [] };
                notes.push(note);
                persistPreview();
            } else {
                note = await request('/api/notes', 'POST', { body, position });
                notes.push(note);
            }
            editor.close();
            const paper = refreshPaper(note);
            revealPaper(paper, note);
            say(editing ? '纸条已更新。' : '你的纸条已经贴好了。');
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
                if (activeNote === note) {
                    if (editingReply?.id === reply.id || replyingTo?.id === reply.id) resetReplyEditor();
                    renderReplies();
                }
            } else {
                notes = notes.filter((item) => item.id !== note.id);
                [...notesRoot.children].find((element) => element.dataset.id === note.id).remove();
                updateCount();
                if (activeNote === note) thread.close();
            }
            if (localPreview) persistPreview();
            removeDialog.close();
            say(reply ? '回复已移除。' : '纸条已移除。');
        } catch (error) { removeDialog.close(); say(error.message); }
        finally { button.disabled = false; }
    });

    replyForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const body = replyInput.value.trim();
        if (!body) return;
        replySubmit.disabled = true;
        replyStatus.textContent = '正在送出回复…';
        try {
            if (editingReply) {
                const updated = localPreview ? { body, updatedAt: new Date().toISOString() } : await request(`/api/replies/${encodeURIComponent(editingReply.id)}`, 'PATCH', { body });
                Object.assign(editingReply, updated);
            } else {
                const path = replyingTo ? `/api/replies/${encodeURIComponent(replyingTo.id)}/replies` : `/api/notes/${encodeURIComponent(activeNote.id)}/replies`;
                const reply = localPreview ? { id: crypto.randomUUID(), body, author: user, createdAt: new Date().toISOString(), parentId: replyingTo?.id || null } : await request(path, 'POST', { body });
                (activeNote.replies ||= []).push(reply);
            }
            if (localPreview) persistPreview();
            refreshPaper(activeNote);
            resetReplyEditor();
            renderReplies();
            replyStatus.textContent = '回复已保存。';
        } catch (error) { replyStatus.textContent = error.message; }
        finally { replySubmit.disabled = false; }
    });
    replyCancel.addEventListener('click', resetReplyEditor);
    document.getElementById('noticeboard-reply-login').addEventListener('click', login);

    document.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', () => document.getElementById(button.dataset.close).close()));
    writeButton.addEventListener('click', () => openEditor());
    document.getElementById('noticeboard-center').addEventListener('click', () => moveCamera(cameraOrigin));
    loginButton.addEventListener('click', login);
    logoutButton.addEventListener('click', () => {
        ticket = '';
        user = null;
        sessionStorage.removeItem(`${storageKey}:session`);
        renderAccount();
        renderNotes();
        say('已退出，纸条会继续留在这里。');
    });

    async function load() {
        if (localPreview) {
            user = previewUser;
            notes = JSON.parse(localStorage.getItem(storageKey) || '[]');
            document.getElementById('noticeboard-mode').textContent = '本地预览 · 纸条只保存在这个浏览器';
        } else if (config.apiUrl) {
            const board = await request('/api/board');
            notes = board.notes;
            user = board.user;
        } else {
            document.getElementById('noticeboard-mode').textContent = '留言板即将开放';
            writeButton.disabled = true;
            loginButton.hidden = true;
            updateCount();
            return;
        }
        notes.forEach((note) => { note.position = worldPosition(note.position); });
        renderAccount();
        renderNotes();
    }
    bindCamera();
    window.addEventListener('resize', queuePaint);
    const syncVisibility = () => {
        document.documentElement.toggleAttribute('data-folio-paused', document.hidden);
        if (document.hidden) cancelAnimationFrame(motionFrame);
    };
    document.addEventListener('visibilitychange', syncVisibility);
    syncVisibility();
    Promise.resolve(window.__shiro.folioReady).then(load).catch((error) => say(error.message));
})();
