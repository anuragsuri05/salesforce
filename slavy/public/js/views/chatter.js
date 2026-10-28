// Chatter: company-wide feed with composer (with @mentions), likes, comments and filters.
// renderFeedItem(post, opts) is exported so record pages can reuse the same post renderer.
import { h, icon, mount, clear, fmt, toast, confirmDialog, avatar, spinner, emptyState, objIcon } from '../lib.js';
import { GET, POST, DEL, me, getObj } from '../api.js';

const MENTION_RE = /@([A-Z][\w'-]+ [A-Z][\w'-]+)/g;

let usersCache = null;
export async function loadUsers() {
  usersCache ||= await GET('/api/users').catch(() => []);
  return usersCache;
}

// Body text with @First Last mentions highlighted and URLs linked. Built with text nodes (no innerHTML).
export function renderBody(text, users = usersCache || []) {
  const out = h('div', { class: 'feed-body' });
  const known = new Set(users.map((u) => u.Name));
  const src = String(text || '');
  let last = 0;
  const re = new RegExp(`${MENTION_RE.source}|(https?:\\/\\/[^\\s<]+)`, 'g');
  for (const m of src.matchAll(re)) {
    if (m.index > last) out.appendChild(document.createTextNode(src.slice(last, m.index)));
    if (m[1]) {
      const isUser = !users.length || known.has(m[1]);
      out.appendChild(isUser ? h('span', { class: ['mention', m[1] === me()?.Name && 'me'] }, `@${m[1]}`) : document.createTextNode(m[0]));
    } else out.appendChild(h('a', { href: m[2], target: '_blank', rel: 'noopener noreferrer' }, m[2]));
    last = m.index + m[0].length;
  }
  if (last < src.length) out.appendChild(document.createTextNode(src.slice(last)));
  return out;
}

// Textarea with an @mention typeahead. Returns { el, input, clear() }.
export function mentionTextarea({ placeholder = 'Share an update...', rows = 3, onSubmit, cls = '' } = {}) {
  const ta = h('textarea', { class: `input ${cls}`, rows, placeholder, 'aria-label': placeholder });
  const list = h('div', { class: 'typeahead-list mention-list hidden', role: 'listbox' });
  let matches = [], active = 0, token = null;
  const close = () => { list.classList.add('hidden'); token = null; };
  const pick = (u) => {
    if (!token) return;
    const before = ta.value.slice(0, token.start);
    const after = ta.value.slice(ta.selectionStart);
    ta.value = `${before}@${u.Name} ${after}`;
    const pos = before.length + u.Name.length + 2;
    ta.focus();
    ta.setSelectionRange(pos, pos);
    close();
  };
  const update = async () => {
    const pos = ta.selectionStart;
    const m = /(^|\s)@([A-Za-z][\w'-]*(?: [A-Za-z][\w'-]*)?)?$/.exec(ta.value.slice(0, pos));
    if (!m) { close(); return; }
    token = { start: pos - (m[2] || '').length - 1 };
    const q = (m[2] || '').toLowerCase();
    const users = await loadUsers();
    matches = users.filter((u) => !q || u.Name.toLowerCase().includes(q)).slice(0, 6);
    if (!matches.length) { close(); return; }
    active = 0;
    clear(list);
    matches.forEach((u, i) => list.appendChild(h('div', { class: ['typeahead-item', i === active && 'active'], role: 'option', onMousedown: (e) => { e.preventDefault(); pick(u); } },
      avatar(u.Name, 'sm'), h('div', { class: 'grow' }, h('div', u.Name), u.Title ? h('div', { class: 'sub' }, u.Title) : null))));
    list.classList.remove('hidden');
  };
  ta.addEventListener('input', update);
  ta.addEventListener('blur', () => setTimeout(close, 150));
  ta.addEventListener('keydown', (e) => {
    if (!list.classList.contains('hidden') && matches.length) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        active = (active + (e.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length;
        [...list.children].forEach((c, i) => c.classList.toggle('active', i === active));
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pick(matches[active]); return; }
      if (e.key === 'Escape') { e.stopPropagation(); close(); return; }
    }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); onSubmit?.(); }
  });
  return { el: h('div', { class: 'typeahead mention-wrap' }, ta, list), input: ta, clear: () => { ta.value = ''; close(); } };
}

// Renders one feed post. opts: { onChange(newPost), onDelete(post), showParent = true }
export function renderFeedItem(post, { onChange, onDelete, showParent = true } = {}) {
  const user = me();
  const el = h('article', { class: 'feed-item chatter-item', dataset: { id: post.id } });
  const replace = (p) => { post = p; const next = renderFeedItem(p, { onChange, onDelete, showParent }); el.replaceWith(next); onChange?.(p); };
  const parentIsRecord = post.parentObject && post.parentObject !== 'User';
  const parentObj = parentIsRecord ? getObj(post.parentObject) : null;
  const toOtherUser = !parentIsRecord && post.parentId && post.parentId !== post.createdById && post.parentName;
  const isSystem = post.type === 'approval' || post.type === 'tracked';

  const likeBtn = h('button', { class: ['btn btn-ghost btn-sm', post.liked && 'liked'], 'aria-pressed': String(!!post.liked), onClick: async () => {
    likeBtn.disabled = true;
    try { replace(await POST(`/api/feed/${post.id}/like`, {})); } catch (e) { toast(e.message, 'error'); likeBtn.disabled = false; }
  } }, icon('thumbsUp', { size: 14, filled: post.liked }), post.liked ? 'Liked' : 'Like');

  const commentBox = mentionTextarea({ placeholder: 'Write a comment...', rows: 1, cls: 'input-sm comment-input', onSubmit: () => addComment() });
  const commentBtn = h('button', { class: 'btn btn-sm btn-brand', onClick: () => addComment() }, 'Comment');
  async function addComment() {
    const body = commentBox.input.value.trim();
    if (!body) { commentBox.input.focus(); return; }
    commentBtn.disabled = true;
    try { const p = await POST(`/api/feed/${post.id}/comments`, { body }); replace(p); setTimeout(() => document.querySelector(`[data-id="${post.id}"] .comment-input`)?.focus(), 0); } catch (e) { toast(e.message, 'error'); commentBtn.disabled = false; }
  }
  commentBox.input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.defaultPrevented) { e.preventDefault(); addComment(); }
  });

  async function remove() {
    if (!(await confirmDialog('Delete this post and its comments?', { title: 'Delete Post', confirmLabel: 'Delete', danger: true }))) return;
    try { await DEL(`/api/feed/${post.id}`); el.remove(); toast('Post deleted.', 'success'); onDelete?.(post); } catch (e) { toast(e.message, 'error'); }
  }

  async function removeComment(c) {
    if (!(await confirmDialog('Delete this comment?', { title: 'Delete Comment', confirmLabel: 'Delete', danger: true }))) return;
    try {
      await DEL(`/api/comments/${c.id}`);
      replace({ ...post, comments: post.comments.filter((x) => x.id !== c.id) });
    } catch (e) { toast(e.message, 'error'); }
  }

  const header = h('div', { class: 'feed-head' },
    h('div', { class: 'grow' },
      h('div', { class: 'feed-who' },
        h('strong', post.createdBy || 'Automated Process'),
        isSystem ? h('span', { class: 'muted' }, ` ${post.body}`) : null,
        showParent && parentIsRecord ? [h('span', { class: 'muted feed-arrow' }, icon('chevronRight', { size: 12 })), parentObj ? objIcon(parentObj, 'xs') : null, h('a', { href: `#/r/${post.parentId}` }, post.parentName || post.parentId)] : null,
        showParent && toOtherUser ? [h('span', { class: 'muted feed-arrow' }, icon('chevronRight', { size: 12 })), h('span', post.parentName)] : null),
      h('div', { class: 'tiny muted', title: fmt.datetime(post.createdAt) }, fmt.relative(post.createdAt),
        post.data?.source ? [' · ', h('span', { class: 'feed-source' }, icon('flow', { size: 11 }), post.data.source)] : null,
        post.type === 'approval' && post.data?.status ? [' · ', h('span', { class: `badge ${post.data.status === 'Approved' ? 'success' : post.data.status === 'Rejected' ? 'danger' : 'warning'}` }, post.data.status)] : null)),
    post.canDelete ? h('button', { class: 'btn btn-ghost btn-sm btn-icon', 'aria-label': 'Delete post', title: 'Delete post', onClick: remove }, icon('trash', { size: 14 })) : null);

  const comments = h('div', { class: 'feed-comments' },
    post.comments.map((c) => h('div', { class: 'feed-comment row top' }, avatar(c.createdBy, 'sm'),
      h('div', { class: 'grow' },
        h('div', { class: 'row gap-4' }, h('strong', { class: 'small' }, c.createdBy), h('span', { class: 'tiny muted', title: fmt.datetime(c.createdAt) }, fmt.relative(c.createdAt)), h('span', { class: 'spacer' }),
          c.canDelete ? h('button', { class: 'btn btn-ghost btn-sm btn-icon comment-del', 'aria-label': 'Delete comment', title: 'Delete comment', onClick: () => removeComment(c) }, icon('x', { size: 12 })) : null),
        renderBody(c.body)))),
    h('div', { class: 'feed-comment-new row top' }, avatar(user?.Name, 'sm'), h('div', { class: 'grow' }, commentBox.el), commentBtn));

  el.append(
    h('div', { class: 'row top gap-12' },
      isSystem ? h('span', { class: 'avatar feed-sys' }, icon(post.type === 'approval' ? 'approval' : 'activity', { size: 16 })) : avatar(post.createdBy),
      h('div', { class: 'grow', style: { minWidth: 0 } },
        header,
        !isSystem ? renderBody(post.body) : null,
        h('div', { class: 'feed-actions row gap-4' }, likeBtn,
          h('button', { class: 'btn btn-ghost btn-sm', onClick: () => commentBox.input.focus() }, icon('message', { size: 14 }), 'Comment'),
          post.likes ? h('span', { class: 'tiny muted feed-likes' }, icon('thumbsUp', { size: 11 }), ` ${post.likes} ${post.likes === 1 ? 'person likes' : 'people like'} this`) : null),
        comments)));
  return el;
}

export default async function chatterView(root, { query, app }) {
  app.setTitle('Chatter');
  const user = me();
  let filter = ['all', 'mine', 'mentions'].includes(query.filter) ? query.filter : 'all';
  let posts = [];
  let term = '';
  const nav = h('nav', { class: 'card chatter-nav', 'aria-label': 'Feed filters' });
  const feedEl = h('div', { class: 'chatter-feed' }, spinner());
  const countEl = h('span', { class: 'small muted' });
  const search = h('input', { class: 'input input-sm', placeholder: 'Search this feed...', 'aria-label': 'Search this feed', onInput: () => { term = search.value.trim().toLowerCase(); drawFeed(); } });

  const composer = mentionTextarea({ placeholder: 'Share an update...', rows: 3, cls: 'composer-input', onSubmit: () => share() });
  const shareBtn = h('button', { class: 'btn btn-brand', onClick: () => share() }, 'Share');
  async function share() {
    const body = composer.input.value.trim();
    if (!body) { composer.input.focus(); return; }
    shareBtn.disabled = true;
    try {
      const p = await POST('/api/feed', { parentId: user.Id, body });
      composer.clear();
      posts.unshift(p);
      toast('Your update was shared.', 'success');
      if (filter === 'mentions' && !mentionsMe(p)) filter = 'all';
      drawNav(); drawFeed();
    } catch (e) { toast(e.message, 'error'); } finally { shareBtn.disabled = false; }
  }

  const mentionsMe = (p) => [p.body, ...(p.comments || []).map((c) => c.body)].some((b) => String(b || '').includes(`@${user.Name}`));
  const FILTERS = [
    ['all', 'All Company', 'globe', () => true],
    ['mine', 'My Posts', 'user', (p) => p.createdById === user.Id],
    ['mentions', 'Mentions of Me', 'message', mentionsMe],
  ];

  function drawNav() {
    clear(nav);
    nav.appendChild(h('div', { class: 'chatter-me' }, avatar(user.Name, 'lg'), h('div', { class: 'grow', style: { minWidth: 0 } }, h('div', { class: 'strong truncate' }, user.Name), h('div', { class: 'tiny muted truncate' }, user.Title || user.Username))));
    nav.appendChild(h('div', { class: 'group-title' }, 'Feeds'));
    for (const [k, l, ic, fn] of FILTERS) {
      const n = posts.filter(fn).length;
      nav.appendChild(h('button', { class: ['chatter-nav-item', filter === k && 'active'], onClick: () => { filter = k; drawNav(); drawFeed(); } }, icon(ic, { size: 15 }), h('span', { class: 'grow' }, l), h('span', { class: 'tiny muted' }, String(n))));
    }
    nav.appendChild(h('div', { class: 'group-title' }, 'Shortcuts'));
    nav.appendChild(h('a', { class: 'chatter-nav-item', href: '#/approvals' }, icon('approval', { size: 15 }), h('span', { class: 'grow' }, 'Approval Requests')));
    nav.appendChild(h('a', { class: 'chatter-nav-item', href: '#/calendar' }, icon('calendar', { size: 15 }), h('span', { class: 'grow' }, 'Calendar')));
  }

  function drawFeed() {
    const fn = FILTERS.find((f) => f[0] === filter)[3];
    const shown = posts.filter(fn).filter((p) => !term || [p.body, p.createdBy, p.parentName, ...(p.comments || []).map((c) => c.body)].some((x) => String(x || '').toLowerCase().includes(term)));
    countEl.textContent = `${shown.length} post${shown.length === 1 ? '' : 's'}`;
    if (!shown.length) {
      const msg = { all: ['No posts yet', 'Share an update to get the conversation started.'], mine: ['You haven’t posted yet', 'Your posts and posts you make on records appear here.'], mentions: ['No mentions', `Posts that mention @${user.Name} appear here.`] }[filter];
      mount(feedEl, emptyState(term ? 'No matching posts' : msg[0], term ? 'Try a different search.' : msg[1], { iconName: 'message' }));
      return;
    }
    mount(feedEl, shown.map((p) => renderFeedItem(p, {
      onChange: (np) => { const i = posts.findIndex((x) => x.id === np.id); if (i >= 0) posts[i] = np; },
      onDelete: (dp) => { posts = posts.filter((x) => x.id !== dp.id); drawNav(); countEl.textContent = `${posts.filter(fn).length} posts`; if (!feedEl.children.length) drawFeed(); },
    })));
  }

  async function load() {
    mount(feedEl, spinner());
    try {
      [posts] = await Promise.all([GET('/api/feed'), loadUsers()]);
      drawNav(); drawFeed();
    } catch (e) { mount(feedEl, emptyState('Couldn’t load the feed', e.message, { iconName: 'alert' })); }
  }

  mount(root, h('div', { class: 'chatter-layout' },
    nav,
    h('div', { class: 'chatter-main' },
      h('div', { class: 'card chatter-composer' },
        h('div', { class: 'row top gap-12' }, avatar(user.Name), h('div', { class: 'grow' }, composer.el,
          h('div', { class: 'row mt-8' }, h('span', { class: 'tiny muted grow' }, 'Type @ to mention someone. Press Ctrl/⌘ + Enter to share.'), shareBtn)))),
      h('div', { class: 'card' },
        h('div', { class: 'card-header' }, h('h3', 'Feed'), countEl, h('div', { class: 'input-group', style: { width: '220px' } }, icon('search'), search),
          h('button', { class: 'btn btn-ghost btn-icon', 'aria-label': 'Refresh feed', title: 'Refresh', onClick: load }, icon('refresh'))),
        h('div', { class: 'card-body chatter-feed-body' }, feedEl)))));
  drawNav();
  await load();
}
