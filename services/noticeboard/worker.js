const encoder = new TextEncoder();
const decoder = new TextDecoder();
const colors = new Set(['cream', 'rose', 'sage', 'blue', 'lilac']);
const metadataPattern = /\n*<!-- null-board:(\{[^\n]*\}) -->\s*$/;
const reactionFields = 'content viewerHasReacted reactors { totalCount }';
const commentFields = `id body createdAt updatedAt deletedAt isMinimized
    author { login ... on User { name } }
    reactionGroups { ${reactionFields} }`;
const pageFields = 'pageInfo { hasNextPage endCursor }';
const installationTokens = new Map();

class HttpError extends Error {
    constructor(status, message) { super(message); this.status = status; }
}

function base64url(bytes) {
    return btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function unbase64(value) {
    return Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), (character) => character.charCodeAt(0));
}

async function sessionKey(env) {
    return crypto.subtle.importKey('raw', unbase64(env.SESSION_SECRET), 'AES-GCM', false, ['encrypt', 'decrypt']);
}

async function seal(payload, env) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await sessionKey(env), encoder.encode(JSON.stringify(payload)));
    return `${base64url(iv)}.${base64url(ciphertext)}`;
}

async function unseal(value, env, purpose) {
    try {
        const [iv, ciphertext] = value.split('.');
        const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unbase64(iv) }, await sessionKey(env), unbase64(ciphertext));
        const payload = JSON.parse(decoder.decode(plaintext));
        if (payload.purpose !== purpose || payload.expiresAt < Date.now()) throw new Error('Expired');
        return payload;
    } catch {
        throw new HttpError(401, '登录已过期，请重新登录 GitHub。');
    }
}

async function github(path, token, method = 'GET', data) {
    const response = await fetch(`https://api.github.com${path}`, {
        method,
        headers: {
            Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json',
            'Content-Type': 'application/json', 'User-Agent': 'Null-Noticeboard',
            'X-GitHub-Api-Version': '2026-03-10'
        },
        body: data ? JSON.stringify(data) : undefined
    });
    const result = await response.json();
    if (!response.ok) throw new HttpError(response.status === 401 ? 401 : 502, response.status === 401 ? 'GitHub 登录已失效，请重新登录。' : 'GitHub 暂时无法处理留言，请稍后再试。');
    return result;
}

async function graphql(token, query, variables = {}) {
    const result = await github('/graphql', token, 'POST', { query, variables });
    if (result.errors?.length) throw new HttpError(502, result.errors[0].message);
    return result.data;
}

async function appJwt(env) {
    const now = Math.floor(Date.now() / 1000);
    const header = base64url(encoder.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
    const payload = base64url(encoder.encode(JSON.stringify({ iat: now - 60, exp: now + 540, iss: env.GITHUB_APP_ID })));
    const pem = env.GITHUB_PRIVATE_KEY.replace(/-----[^-]+-----/g, '').replace(/\s/g, '');
    const key = await crypto.subtle.importKey('pkcs8', unbase64(pem), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
    const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, encoder.encode(`${header}.${payload}`));
    return `${header}.${payload}.${base64url(signature)}`;
}

async function installationToken(env, permission = 'read') {
    const cacheKey = `${env.GITHUB_APP_ID}:${env.GITHUB_REPOSITORY}:${permission}`;
    const cached = installationTokens.get(cacheKey);
    if (cached && Date.parse(cached.expires_at) > Date.now() + 60000) return cached.token;
    const jwt = await appJwt(env);
    const installation = await github(`/repos/${env.GITHUB_REPOSITORY}/installation`, jwt);
    const [, repository] = env.GITHUB_REPOSITORY.split('/');
    const token = await github(`/app/installations/${installation.id}/access_tokens`, jwt, 'POST', {
        repositories: [repository], permissions: { discussions: permission }
    });
    installationTokens.set(cacheKey, token);
    return token.token;
}

function defaultPosition(index = 0) {
    return { v: 2, x: 100 + (index % 3) * 315, y: 150 + Math.floor(index / 3) * 420, color: 'cream', rotation: (index * 5) % 7 - 3 };
}

function checkPosition(position) {
    const version = position?.v || 1;
    if (!position || ![1, 2].includes(version) || (!colors.has(position.color) && !/^#[\da-f]{6}$/i.test(position.color)) || ['x', 'y', 'rotation'].some((field) => !Number.isFinite(position[field])) || (version === 1 && (position.x < 0 || position.x > 1 || position.y < 0)) || Math.abs(position.rotation) > 12) {
        throw new HttpError(400, '纸条的位置或颜色不正确。');
    }
    const size = {};
    for (const field of ['width', 'height']) {
        if (position[field] === undefined) continue;
        if (!Number.isFinite(position[field]) || position[field] <= 0) throw new HttpError(400, '纸条的尺寸不正确。');
        size[field] = position[field];
    }
    return { v: version, x: position.x, y: position.y, color: position.color, rotation: position.rotation, ...size };
}

function checkBody(body) {
    if (typeof body !== 'string' || !body.trim()) throw new HttpError(400, '先写一点内容吧。');
    return body.trim();
}

function readNote(comment, index = 0) {
    const match = comment.body.match(metadataPattern);
    let position = defaultPosition(index);
    if (match) {
        try { position = checkPosition(JSON.parse(match[1])); } catch { /* Plain GitHub comments may lack usable board metadata. */ }
    }
    return { ...readComment(comment), body: comment.body.replace(metadataPattern, '').trim(), position };
}

function readComment(comment) {
    return { id: comment.id, body: comment.body, author: comment.author, createdAt: comment.createdAt, updatedAt: comment.updatedAt, reactions: readReactions(comment.reactionGroups) };
}

function readReactions(groups = []) {
    return groups.map((group) => ({ content: group.content, count: group.reactors.totalCount, viewerHasReacted: group.viewerHasReacted }));
}

function writeNote(body, position) {
    return `${body}\n\n<!-- null-board:${JSON.stringify(position)} -->`;
}

async function listReplies(token, id, connection = null) {
    const replies = connection ? [...connection.nodes] : [];
    let cursor = connection?.pageInfo.endCursor || null;
    if (connection && !connection.pageInfo.hasNextPage) return replies;
    do {
        const data = await graphql(token, `query($id: ID!, $after: String) {
            node(id: $id) { ... on DiscussionComment {
                replies(first: 100, after: $after) { nodes { ${commentFields} } ${pageFields} }
            } }
        }`, { id, after: cursor });
        const page = data.node.replies;
        replies.push(...page.nodes);
        cursor = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
    } while (cursor);
    return replies;
}

async function board(token, env) {
    const [owner, name] = env.GITHUB_REPOSITORY.split('/');
    const comments = [];
    let cursor = null;
    do {
        const data = await graphql(token, `query($owner: String!, $name: String!, $number: Int!, $after: String) {
            repository(owner: $owner, name: $name) { discussion(number: $number) {
                comments(first: 100, after: $after) { nodes {
                    ${commentFields}
                    replies(first: 100) { nodes { ${commentFields} } ${pageFields} }
                } ${pageFields} }
            } }
        }`, { owner, name, number: Number(env.DISCUSSION_NUMBER), after: cursor });
        if (!data.repository?.discussion) throw new HttpError(404, '留言板对应的 Discussion 尚未配置。');
        const page = data.repository.discussion.comments;
        comments.push(...page.nodes.filter((comment) => !comment.deletedAt && !comment.isMinimized));
        cursor = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
    } while (cursor);
    return Promise.all(comments.map(async (comment, index) => ({
        ...readNote(comment, index),
        replies: (await listReplies(token, comment.id, comment.replies)).filter((reply) => !reply.deletedAt && !reply.isMinimized).map(readComment)
    })));
}

async function getComment(token, id, env) {
    const data = await graphql(token, `query($id: ID!) {
        node(id: $id) { ... on DiscussionComment {
            ${commentFields} viewerDidAuthor viewerCanUpdate viewerCanDelete
            discussion { id number repository { nameWithOwner } }
            replyTo { id viewerDidAuthor deletedAt }
        } }
    }`, { id });
    const comment = data.node;
    if (!comment?.discussion || comment.deletedAt || comment.discussion.number !== Number(env.DISCUSSION_NUMBER) || comment.discussion.repository.nameWithOwner.toLowerCase() !== env.GITHUB_REPOSITORY.toLowerCase()) {
        throw new HttpError(404, '这张纸条或回复已经不在布告栏上。');
    }
    return comment;
}

function requireAuthor(comment) {
    if (!comment.viewerDidAuthor) throw new HttpError(403, '只能修改或移动自己的纸条和回复。');
}

async function addComment(token, discussionId, body, replyToId = null) {
    const data = await graphql(token, `mutation($input: AddDiscussionCommentInput!) {
        addDiscussionComment(input: $input) { comment { ${commentFields} } }
    }`, { input: { discussionId, body, replyToId } });
    return data.addDiscussionComment.comment;
}

async function updateComment(token, commentId, body) {
    const data = await graphql(token, `mutation($input: UpdateDiscussionCommentInput!) {
        updateDiscussionComment(input: $input) { comment { ${commentFields} } }
    }`, { input: { commentId, body } });
    return data.updateDiscussionComment.comment;
}

async function deleteComment(token, id) {
    await graphql(token, 'mutation($id: ID!) { deleteDiscussionComment(input: {id: $id}) { clientMutationId } }', { id });
}

function allowedOrigins(env) { return env.ALLOWED_ORIGINS.split(',').map((value) => value.trim()); }

async function authenticate(request, env, required = false) {
    const value = request.headers.get('Authorization')?.match(/^Bearer (.+)$/)?.[1];
    if (value) return unseal(value, env, 'session');
    if (required) throw new HttpError(401, '登录 GitHub 后就可以留言了。');
    return null;
}

function oauthCookie(nonce, url, age) {
    return `noticeboard_oauth=${nonce}; Path=/auth; HttpOnly; SameSite=Lax; Max-Age=${age}${url.protocol === 'https:' ? '; Secure' : ''}`;
}

async function startLogin(url, env) {
    const returnTo = new URL(url.searchParams.get('return_to'));
    if (!allowedOrigins(env).includes(returnTo.origin)) throw new HttpError(403, '请从本站的留言板发起登录。');
    returnTo.hash = '';
    const nonce = base64url(crypto.getRandomValues(new Uint8Array(24)));
    const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
    const state = await seal({ purpose: 'oauth', nonce, verifier, returnTo: returnTo.href, expiresAt: Date.now() + 600000 }, env);
    const target = new URL('https://github.com/login/oauth/authorize');
    target.search = new URLSearchParams({
        client_id: env.GITHUB_CLIENT_ID, redirect_uri: `${url.origin}/auth/callback`, state,
        code_challenge: base64url(await crypto.subtle.digest('SHA-256', encoder.encode(verifier))), code_challenge_method: 'S256'
    });
    return new Response(null, { status: 302, headers: { Location: target.href, 'Set-Cookie': oauthCookie(nonce, url, 600) } });
}

async function finishLogin(request, url, env) {
    const state = await unseal(url.searchParams.get('state') || '', env, 'oauth');
    const nonce = request.headers.get('Cookie')?.split(';').map((part) => part.trim()).find((part) => part.startsWith('noticeboard_oauth='))?.slice('noticeboard_oauth='.length);
    if (nonce !== state.nonce) throw new HttpError(401, '登录页面已失效，请回到留言板重新登录。');
    const returnTo = new URL(state.returnTo);
    if (url.searchParams.has('error')) {
        returnTo.hash = new URLSearchParams({ 'noticeboard-error': 'GitHub 登录已取消。' });
    } else {
        const response = await fetch('https://github.com/login/oauth/access_token', {
            method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: env.GITHUB_CLIENT_ID, client_secret: env.GITHUB_CLIENT_SECRET,
                code: url.searchParams.get('code'), redirect_uri: `${url.origin}/auth/callback`, code_verifier: state.verifier
            })
        });
        const result = await response.json();
        if (!result.access_token) throw new HttpError(401, 'GitHub 登录没有完成，请重新登录。');
        const viewer = await github('/user', result.access_token);
        const ticket = await seal({
            purpose: 'session', accessToken: result.access_token, user: { login: viewer.login, name: viewer.name },
            expiresAt: Date.now() + Math.min(result.expires_in || 28800, 28800) * 1000
        }, env);
        returnTo.hash = new URLSearchParams({ 'noticeboard-session': ticket });
    }
    return new Response(null, { status: 302, headers: { Location: returnTo.href, 'Set-Cookie': oauthCookie('', url, 0) } });
}

async function route(request, url, env) {
    if (url.pathname === '/auth/start' && request.method === 'GET') return startLogin(url, env);
    if (url.pathname === '/auth/callback' && request.method === 'GET') return finishLogin(request, url, env);
    const session = await authenticate(request, env, request.method !== 'GET');
    if (url.pathname === '/api/board' && request.method === 'GET') {
        const token = session?.accessToken || await installationToken(env);
        return Response.json({ user: session?.user || null, notes: await board(token, env) });
    }
    if (url.pathname === '/api/notes' && request.method === 'POST') {
        const input = await request.json();
        const position = checkPosition(input.position);
        const [owner, name] = env.GITHUB_REPOSITORY.split('/');
        const data = await graphql(session.accessToken, 'query($owner: String!, $name: String!, $number: Int!) { repository(owner: $owner, name: $name) { discussion(number: $number) { id } } }', { owner, name, number: Number(env.DISCUSSION_NUMBER) });
        if (!data.repository?.discussion) throw new HttpError(404, '留言板对应的 Discussion 尚未配置。');
        const comment = await addComment(session.accessToken, data.repository.discussion.id, writeNote(checkBody(input.body), position));
        return Response.json({ ...readNote(comment), replies: [] }, { status: 201 });
    }
    const path = url.pathname.match(/^\/api\/(notes|replies)\/([^/]+)(?:\/(replies|reactions))?$/);
    if (!path) throw new HttpError(404, '没有这个留言接口。');
    if (!['POST', 'PATCH', 'DELETE'].includes(request.method)) throw new HttpError(405, '不支持这个留言操作。');
    const [, kind, encodedId, operation] = path;
    const comment = await getComment(session.accessToken, decodeURIComponent(encodedId), env);
    if (Boolean(comment.replyTo) !== (kind === 'replies')) throw new HttpError(404, '纸条与回复的地址不匹配。');
    if (operation === 'reactions' && ['POST', 'DELETE'].includes(request.method)) {
        const input = await request.json();
        const mutation = request.method === 'POST' ? 'addReaction' : 'removeReaction';
        const inputType = request.method === 'POST' ? 'AddReactionInput' : 'RemoveReactionInput';
        const data = await graphql(session.accessToken, `mutation($input: ${inputType}!) {
            ${mutation}(input: $input) { reactionGroups { ${reactionFields} } }
        }`, { input: { subjectId: comment.id, content: input.content } });
        return Response.json({ reactions: readReactions(data[mutation].reactionGroups) });
    }
    if (operation === 'replies' && kind === 'notes' && request.method === 'POST') {
        const input = await request.json();
        return Response.json(readComment(await addComment(session.accessToken, comment.discussion.id, checkBody(input.body), comment.id)), { status: 201 });
    }
    if (operation) throw new HttpError(405, '不支持这个留言操作。');
    if (request.method === 'PATCH') {
        requireAuthor(comment);
        const input = await request.json();
        if (kind === 'replies') return Response.json(readComment(await updateComment(session.accessToken, comment.id, checkBody(input.body))));
        const note = readNote(comment);
        const body = input.body === undefined ? note.body : checkBody(input.body);
        const position = input.position === undefined ? note.position : checkPosition(input.position);
        return Response.json(readNote(await updateComment(session.accessToken, comment.id, writeNote(body, position))));
    }
    if (request.method === 'DELETE') {
        if (kind === 'notes') {
            requireAuthor(comment);
            const replies = await listReplies(session.accessToken, comment.id);
            // GitHub retains a wiped parent while replies exist. Remove replies first.
            if (replies.length) {
                const token = await installationToken(env, 'write');
                for (const reply of replies) await deleteComment(token, reply.id);
            }
            await deleteComment(session.accessToken, comment.id);
        } else if (comment.viewerDidAuthor) {
            await deleteComment(session.accessToken, comment.id);
        } else if (comment.replyTo.viewerDidAuthor && !comment.replyTo.deletedAt) {
            // The App performs moderation only after GitHub confirms parent ownership.
            await deleteComment(await installationToken(env, 'write'), comment.id);
        } else throw new HttpError(403, '只有回复者和这张纸条的主人可以删除回复。');
        return Response.json({ deleted: comment.id });
    }
    throw new HttpError(405, '不支持这个留言操作。');
}

export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        const origin = request.headers.get('Origin');
        let response;
        try {
            if (origin && !allowedOrigins(env).includes(origin)) throw new HttpError(403, '只接受本站留言板的请求。');
            response = request.method === 'OPTIONS' ? new Response(null, { status: 204 }) : await route(request, url, env);
        } catch (error) {
            response = Response.json({ error: error.status ? error.message : '留言服务暂时不可用，请稍后再试。' }, { status: error.status || 500 });
        }
        response.headers.set('Cache-Control', 'no-store');
        response.headers.set('Referrer-Policy', 'no-referrer');
        if (origin && allowedOrigins(env).includes(origin)) {
            response.headers.set('Access-Control-Allow-Origin', origin);
            response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
            response.headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
            response.headers.set('Vary', 'Origin');
        }
        return response;
    }
};
