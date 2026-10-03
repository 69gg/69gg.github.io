(() => {
    'use strict';

    const config = JSON.parse(document.getElementById('noticeboard-config').textContent);
    const viewport = document.getElementById('noticeboard-viewport');
    const wallpaper = document.getElementById('noticeboard-wallpaper');
    const notesRoot = document.getElementById('noticeboard-notes');
    const editor = document.getElementById('noticeboard-editor');
    const form = document.getElementById('noticeboard-form');
    const bodyInput = document.getElementById('noticeboard-body');
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
    const storageKey = `noticeboard:${config.repository}:${config.discussionNumber}`;
    const cameraKey = `${storageKey}:camera`;
    let camera = JSON.parse(sessionStorage.getItem(cameraKey) || '{"x":0,"y":0}');
    let paintFrame = 0;
    let motionFrame = 0;
    let statusTimer;
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    const wallpaperStyle = getComputedStyle(wallpaper);
    const tile = wallpaperStyle.backgroundSize.split(' ').map(parseFloat);
    const wallpaperPad = parseFloat(wallpaperStyle.getPropertyValue('--wallpaper-pad'));
    let wallpaperAnchor = { x: 0, y: 0 };
    const localPreview = !config.apiUrl && ['127.0.0.1', 'localhost', '[::1]'].includes(location.hostname);
    const previewUser = { login: 'preview', name: '预览访客' };
    let notes = [];
    let user = null;
    let editing = null;
    let removing = null;
    let activeNote = null;
    let editingReply = null;
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

    function revealPaper(paper, note) {
        paper.style.zIndex = ++topLayer;
        const rect = paper.getBoundingClientRect();
        if (rect.left >= 20 && rect.right <= innerWidth - 20 && rect.top >= 90 && rect.bottom <= innerHeight - 90) return;
        cancelAnimationFrame(motionFrame);
        const start = { ...camera };
        const target = { x: (viewport.clientWidth - paper.offsetWidth) / 2 - note.position.x, y: Math.max(100, (viewport.clientHeight - paper.offsetHeight) / 2) - note.position.y };
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

    function renderMetadata(container, comment) {
        container.replaceChildren();
        const author = document.createElement('span');
        author.className = 'board-note-author';
        author.textContent = comment.author?.name ? `${comment.author.name} · @${comment.author.login}` : `@${comment.author?.login || '路过的人'}`;
        container.append(author);
        const stamp = (label, value) => {
            const row = document.createElement('div');
            row.className = 'board-note-date';
            const caption = document.createElement('span');
            caption.textContent = label;
            const time = document.createElement('time');
            time.dateTime = value;
            time.textContent = dateFormat.format(new Date(value));
            time.title = value;
            row.append(caption, time);
            container.append(row);
        };
        stamp('创建', comment.createdAt);
        if (comment.updatedAt && new Date(comment.updatedAt) > new Date(comment.createdAt)) stamp('修改', comment.updatedAt);
    }

    function action(label, onClick, className = '') {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = label;
        button.className = className;
        button.addEventListener('click', onClick);
        return button;
    }

    function confirmRemove(note, reply = null) {
        removing = { note, reply };
        document.getElementById('noticeboard-delete-title').textContent = reply ? '删除这条回复？' : '取下这张纸条？';
        document.getElementById('noticeboard-delete-description').textContent = reply ? '这条回复会从纸条和留言记录中删除。' : '纸条及其下面的回复都会删除。';
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
        element.dataset.color = position.color;
    }

    function updateCount() {
        document.getElementById('noticeboard-count').textContent = `${notes.length} 张纸条`;
    }

    function nextPosition(color = 'cream') {
        let slot = 0;
        let x, y;
        const origin = { x: (viewport.clientWidth - 280) / 2 - camera.x, y: Math.max(110, viewport.clientHeight / 2 - 160) - camera.y };
        do {
            x = origin.x + [0, 315, -315][slot % 3];
            y = origin.y + Math.floor(slot / 3) * 420;
            slot++;
        } while (notes.some((note) => Math.abs(note.position.x - x) < 290 && Math.abs(note.position.y - y) < 370));
        return { v: 2, x, y, color, rotation: Math.random() * 6 - 3 };
    }

    function renderNote(note) {
        const article = document.createElement('article');
        article.className = 'board-note';
        article.dataset.id = note.id;
        article.innerHTML = '<span class="board-note-pin" aria-hidden="true"></span><p class="board-note-message"></p><footer class="board-note-footer"></footer>';
        positionNote(article, note.position);
        article.querySelector('.board-note-message').textContent = note.body;
        renderMetadata(article.querySelector('footer'), note);
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
        if (owns(note)) actions.append(action('改一改', () => openEditor(note)), action('取下来', () => confirmRemove(note)));
        const replies = note.replies || [];
        actions.append(action(replies.length ? `回复 · ${replies.length}` : '回一句', () => openThread(note), 'board-note-reply'));
        article.append(actions);
        if (replies.length) {
            const preview = document.createElement('ul');
            preview.className = 'board-note-reply-preview';
            replies.slice(-2).forEach((reply) => {
                const item = document.createElement('li');
                const message = document.createElement('p');
                message.textContent = reply.body;
                const metadata = document.createElement('div');
                metadata.className = 'board-note-footer';
                renderMetadata(metadata, reply);
                item.append(message, metadata);
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
        replyInput.value = '';
        replySubmit.textContent = '回一句';
        replyCancel.hidden = true;
        replyStatus.textContent = '';
    }

    function renderReplies() {
        renderMetadata(document.getElementById('noticeboard-thread-author'), activeNote);
        document.getElementById('noticeboard-thread-body').textContent = activeNote.body;
        const list = document.getElementById('noticeboard-replies');
        const replies = activeNote.replies || [];
        list.replaceChildren(...replies.map((reply, index) => {
            const item = document.createElement('li');
            item.innerHTML = '<header class="noticeboard-reply-heading"><div class="board-note-footer"></div><small></small></header><p class="noticeboard-reply-message"></p><div class="noticeboard-reply-actions"></div>';
            renderMetadata(item.querySelector('header div'), reply);
            item.querySelector('small').textContent = `${index + 1} 楼`;
            item.querySelector('p').textContent = reply.body;
            const actions = item.querySelector('.noticeboard-reply-actions');
            if (owns(reply)) actions.append(action('修改', () => {
                editingReply = reply;
                replyInput.value = reply.body;
                replySubmit.textContent = '保存回复';
                replyCancel.hidden = false;
                replyInput.focus();
            }));
            if (owns(reply) || owns(activeNote)) actions.append(action('删除', () => confirmRemove(activeNote, reply)));
            return item;
        }));
        document.getElementById('noticeboard-thread-empty').hidden = replies.length > 0;
        replyForm.hidden = !user;
        document.getElementById('noticeboard-reply-login').hidden = Boolean(user);
    }

    function openThread(note) {
        activeNote = note;
        resetReplyEditor();
        renderReplies();
        thread.showModal();
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
            renderMetadata(article.querySelector('footer'), note);
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
        form.elements.color.value = note?.position.color || 'cream';
        document.getElementById('noticeboard-editor-title').textContent = note ? '改改这张纸条' : '写张纸条';
        submit.textContent = note ? '保存纸条' : '贴上去';
        document.getElementById('noticeboard-form-status').textContent = '';
        editor.showModal();
        bodyInput.focus();
    }

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const body = bodyInput.value.trim();
        if (!body) return;
        const position = editing ? { ...editing.position, color: form.elements.color.value } : nextPosition(form.elements.color.value);
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
                    if (editingReply?.id === reply.id) resetReplyEditor();
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
            say(reply ? '回复已删除。' : '纸条已取下。');
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
                const reply = localPreview ? { id: crypto.randomUUID(), body, author: user, createdAt: new Date().toISOString() } : await request(`/api/notes/${encodeURIComponent(activeNote.id)}/replies`, 'POST', { body });
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
    const syncVisibility = () => {
        document.documentElement.toggleAttribute('data-folio-paused', document.hidden);
        if (document.hidden) cancelAnimationFrame(motionFrame);
    };
    document.addEventListener('visibilitychange', syncVisibility);
    syncVisibility();
    Promise.resolve(window.__shiro.folioReady).then(load).catch((error) => say(error.message));
})();
