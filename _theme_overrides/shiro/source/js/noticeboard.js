(() => {
    'use strict';

    const config = JSON.parse(document.getElementById('noticeboard-config').textContent);
    const canvas = document.getElementById('noticeboard-canvas');
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
    const dateFormat = new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit' });

    const returned = new URLSearchParams(location.hash.slice(1)).get('noticeboard-session');
    if (returned) {
        ticket = returned;
        sessionStorage.setItem(`${storageKey}:session`, ticket);
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
    const say = (message) => { status.textContent = message; };
    const authorName = (comment) => comment.author?.name || comment.author?.login || '路过的人';

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
        element.style.setProperty('--note-x', position.x);
        element.style.setProperty('--note-y', `${position.y}px`);
        element.style.setProperty('--note-turn', `${position.rotation}deg`);
        element.dataset.color = position.color;
    }

    function fitCanvas() {
        const bottom = [...canvas.querySelectorAll('.board-note')].reduce((edge, element) => Math.max(edge, element.offsetTop + element.offsetHeight + 60), 610);
        canvas.style.minHeight = `${bottom}px`;
        document.getElementById('noticeboard-count').textContent = `${notes.length} 张纸条`;
    }

    function nextPosition(color = 'cream') {
        let slot = 1;
        let x, y;
        do {
            x = [.035, .375, .715][slot % 3];
            y = 46 + Math.floor(slot / 3) * 360;
            slot++;
        } while (notes.some((note) => Math.abs(note.position.x - x) < .14 && Math.abs(note.position.y - y) < 180));
        return { x, y, color, rotation: Math.random() * 6 - 3 };
    }

    function renderNote(note) {
        const article = document.createElement('article');
        article.className = 'board-note';
        article.dataset.id = note.id;
        article.innerHTML = '<span class="board-note-pin" aria-hidden="true"></span><p class="board-note-message"></p><footer class="board-note-footer"><span class="board-note-author"></span><time class="board-note-date"></time></footer>';
        positionNote(article, note.position);
        article.querySelector('.board-note-message').textContent = note.body;
        article.querySelector('.board-note-author').textContent = authorName(note);
        const date = article.querySelector('time');
        date.dateTime = note.createdAt;
        date.textContent = dateFormat.format(new Date(note.createdAt));
        if (owns(note)) {
            article.querySelector('.board-note-pin').remove();
            const handle = document.createElement('button');
            handle.className = 'board-note-handle';
            handle.type = 'button';
            handle.setAttribute('aria-label', '移动自己的纸条，支持拖动或方向键');
            handle.title = '拖动图钉挪位置；方向键也可以移动';
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
                item.textContent = `${authorName(reply)}：${reply.body}`;
                preview.append(item);
            });
            article.append(preview);
        }
        return article;
    }

    function renderNotes() {
        notesRoot.replaceChildren(...notes.map(renderNote));
        fitCanvas();
    }

    function refreshPaper(note) {
        const paper = [...notesRoot.children].find((element) => element.dataset.id === note.id);
        const updated = renderNote(note);
        if (paper) {
            updated.style.zIndex = paper.style.zIndex;
            updated.style.animation = 'none';
            paper.replaceWith(updated);
        } else notesRoot.append(updated);
        fitCanvas();
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
        document.getElementById('noticeboard-thread-author').textContent = authorName(activeNote);
        document.getElementById('noticeboard-thread-body').textContent = activeNote.body;
        const list = document.getElementById('noticeboard-replies');
        const replies = activeNote.replies || [];
        list.replaceChildren(...replies.map((reply, index) => {
            const item = document.createElement('li');
            item.innerHTML = '<header class="noticeboard-reply-heading"><span></span><small></small></header><p class="noticeboard-reply-message"></p><div class="noticeboard-reply-actions"></div>';
            item.querySelector('header span').textContent = authorName(reply);
            const date = document.createElement('time');
            date.dateTime = reply.createdAt;
            date.textContent = dateFormat.format(new Date(reply.createdAt));
            item.querySelector('header span').append(date);
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
            say('位置已保存。');
        } catch (error) {
            note.position = original;
            positionNote(article, original);
            say(error.message);
        } finally {
            article.classList.remove('is-saving');
            fitCanvas();
        }
    }

    function bindMovement(handle, article, note) {
        let drag;
        let keyOriginal;
        let keyTimer;
        const inset = parseFloat(getComputedStyle(canvas.closest('.noticeboard')).getPropertyValue('--board-inset'));
        const setPosition = (left, top) => {
            const travel = canvas.clientWidth - article.offsetWidth - 2 * inset;
            note.position = {
                ...note.position,
                x: Math.min(1, Math.max(0, (left - inset) / travel)),
                y: Math.min(canvas.clientHeight - article.offsetHeight - inset, Math.max(inset, top))
            };
            positionNote(article, note.position);
        };
        handle.addEventListener('pointerdown', (event) => {
            if (event.button !== 0 || article.classList.contains('is-saving')) return;
            event.preventDefault();
            handle.focus({ preventScroll: true });
            handle.setPointerCapture(event.pointerId);
            drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, left: article.offsetLeft, top: article.offsetTop, original: { ...note.position } };
            article.style.zIndex = ++topLayer;
            article.classList.add('is-dragging');
            canvas.style.minHeight = `${Math.max(canvas.clientHeight, article.offsetTop + article.offsetHeight + 180)}px`;
        });
        handle.addEventListener('pointermove', (event) => {
            if (!drag) return;
            setPosition(drag.left + event.clientX - drag.x, drag.top + event.clientY - drag.y);
        });
        handle.addEventListener('pointerup', () => {
            if (!drag) return;
            const original = drag.original;
            handle.releasePointerCapture(drag.pointerId);
            drag = null;
            article.classList.remove('is-dragging');
            if (note.position.x !== original.x || note.position.y !== original.y) saveMovement(article, note, original);
            else fitCanvas();
        });
        handle.addEventListener('pointercancel', () => {
            if (!drag) return;
            note.position = drag.original;
            positionNote(article, note.position);
            drag = null;
            article.classList.remove('is-dragging');
            fitCanvas();
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
            paper.style.zIndex = ++topLayer;
            paper.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'nearest', inline: 'center' });
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
                fitCanvas();
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
            fitCanvas();
            return;
        }
        renderAccount();
        renderNotes();
    }
    Promise.resolve(window.__shiro.folioReady).then(load).catch((error) => say(error.message));
})();
