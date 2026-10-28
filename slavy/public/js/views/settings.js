// Personal Settings: personal information, password, display/theme and account details.
import { h, icon, mount, clear, fmt, toast, avatar, store } from '../lib.js';
import { PATCH, POST, me, state, loadSession, can } from '../api.js';
import { applyTheme } from '../app.js';

const SECTIONS = [
  { id: 'profile', label: 'My Personal Information', icon: 'user' },
  { id: 'password', label: 'Change My Password', icon: 'lock' },
  { id: 'display', label: 'Display & Theme', icon: 'sun' },
  { id: 'account', label: 'Account Information', icon: 'info' },
];

function timeZones() {
  try { return Intl.supportedValuesOf('timeZone'); } catch { return ['UTC', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'Europe/London', 'Europe/Paris', 'Asia/Kolkata', 'Asia/Tokyo', 'Australia/Sydney']; }
}

export default async function settingsView(root, { query, app }) {
  app.setTitle('Personal Settings');
  let active = SECTIONS.some((s) => s.id === query.section) ? query.section : 'profile';
  const nav = h('nav', { class: 'card settings-nav', 'aria-label': 'Settings sections' });
  const content = h('div', { class: 'settings-content' });
  const headName = h('h1');
  const headSub = h('div', { class: 'small muted' });
  const headAvatar = h('span');

  const drawHead = () => {
    const u = me();
    headName.textContent = u.Name;
    headSub.textContent = [u.Title, u.Username].filter(Boolean).join(' · ');
    mount(headAvatar, avatar(u.Name, 'lg'));
  };

  mount(root,
    h('div', { class: 'page-header' }, h('div', { class: 'title-row' }, headAvatar, h('div', { class: 'grow' }, h('div', { class: 'eyebrow' }, 'Personal Settings'), headName, headSub))),
    h('div', { class: 'settings-layout' }, nav, content));

  const drawNav = () => {
    clear(nav);
    for (const s of SECTIONS) nav.appendChild(h('button', { class: ['settings-nav-item', active === s.id && 'active'], 'aria-current': active === s.id ? 'page' : null, onClick: () => { active = s.id; drawNav(); drawContent(); } }, icon(s.icon, { size: 15 }), s.label));
  };

  const card = (title, desc, ...children) => h('div', { class: 'card' }, h('div', { class: 'card-header' }, h('div', { class: 'grow' }, h('h3', title), desc ? h('div', { class: 'small muted' }, desc) : null)), h('div', { class: 'card-body' }, ...children));
  const field = (label, control, { help, required, id } = {}) => h('div', { class: 'form-row' }, h('label', { class: 'form-label', for: id }, required ? h('span', { class: 'req' }, '*') : null, label), control, help ? h('div', { class: 'form-help' }, help) : null);

  function profileSection() {
    const u = me();
    const inputs = {};
    const mk = (key, type = 'text', attrs = {}) => { inputs[key] = h('input', { class: 'input', type, id: `set-${key}`, value: u[key] ?? '', ...attrs }); return inputs[key]; };
    const tz = h('select', { class: 'input', id: 'set-TimeZone' }, timeZones().map((z) => h('option', { value: z, selected: z === (u.TimeZone || 'UTC') }, z.replace(/_/g, ' '))));
    if (u.TimeZone && !timeZones().includes(u.TimeZone)) tz.appendChild(h('option', { value: u.TimeZone, selected: true }, u.TimeZone));
    inputs.TimeZone = tz;
    const err = h('div', { class: 'alert danger mb-16 hidden' });
    const save = h('button', { class: 'btn btn-brand', type: 'submit' }, 'Save');
    const form = h('form', { novalidate: true, onSubmit: async (e) => {
      e.preventDefault();
      err.classList.add('hidden');
      const body = Object.fromEntries(Object.entries(inputs).map(([k, el]) => [k, el.value.trim() || null]));
      if (!body.LastName) { mount(err, icon('alert'), h('div', 'Last Name is required.')); err.classList.remove('hidden'); return; }
      if (body.Email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.Email)) { mount(err, icon('alert'), h('div', 'Enter a valid email address.')); err.classList.remove('hidden'); return; }
      save.disabled = true;
      try {
        await PATCH('/api/me', body);
        await loadSession();
        drawHead();
        toast('Your personal information was saved.', 'success');
      } catch (ex) { mount(err, icon('alert'), h('div', ex.message)); err.classList.remove('hidden'); } finally { save.disabled = false; }
    } },
    err,
    h('div', { class: 'form-grid' },
      field('First Name', mk('FirstName', 'text', { autocomplete: 'given-name' }), { id: 'set-FirstName' }),
      field('Last Name', mk('LastName', 'text', { autocomplete: 'family-name', required: true }), { required: true, id: 'set-LastName' }),
      field('Email', mk('Email', 'email', { autocomplete: 'email' }), { id: 'set-Email', help: 'Used for email alerts and notifications.' }),
      field('Title', mk('Title'), { id: 'set-Title' }),
      field('Phone', mk('Phone', 'tel', { autocomplete: 'tel' }), { id: 'set-Phone' }),
      field('Alias', mk('Alias', 'text', { maxlength: 8 }), { id: 'set-Alias', help: 'Short name shown in compact lists (max 8 characters).' }),
      field('Time Zone', tz, { id: 'set-TimeZone' })),
    h('div', { class: 'row', style: { justifyContent: 'flex-end' } }, h('button', { class: 'btn', type: 'button', onClick: () => drawContent() }, 'Cancel'), save));
    return card('My Personal Information', 'Update how your name and contact details appear to others.', form);
  }

  function passwordSection() {
    const cur = h('input', { class: 'input', type: 'password', id: 'pw-cur', autocomplete: 'current-password', required: true });
    const nw = h('input', { class: 'input', type: 'password', id: 'pw-new', autocomplete: 'new-password', required: true, minlength: 8 });
    const conf = h('input', { class: 'input', type: 'password', id: 'pw-conf', autocomplete: 'new-password', required: true });
    const meter = h('div', { class: 'pw-meter' }, h('span'));
    const hint = h('div', { class: 'form-help' }, 'At least 8 characters. Use a mix of letters, numbers and symbols.');
    const err = h('div', { class: 'alert danger mb-16 hidden' });
    const save = h('button', { class: 'btn btn-brand', type: 'submit' }, 'Change Password');
    nw.addEventListener('input', () => {
      const v = nw.value;
      const score = [v.length >= 8, v.length >= 12, /[a-z]/.test(v) && /[A-Z]/.test(v), /\d/.test(v), /[^A-Za-z0-9]/.test(v)].filter(Boolean).length;
      meter.dataset.score = v ? String(Math.min(4, score)) : '0';
      hint.textContent = !v ? 'At least 8 characters. Use a mix of letters, numbers and symbols.' : v.length < 8 ? `${8 - v.length} more character${8 - v.length === 1 ? '' : 's'} needed` : ['Weak', 'Weak', 'Fair', 'Good', 'Strong'][Math.min(4, score)] + ' password';
    });
    const form = h('form', { novalidate: true, onSubmit: async (e) => {
      e.preventDefault();
      err.classList.add('hidden');
      const fail = (m) => { mount(err, icon('alert'), h('div', m)); err.classList.remove('hidden'); };
      if (!cur.value) return fail('Enter your current password.');
      if (nw.value.length < 8) return fail('Your new password must be at least 8 characters.');
      if (nw.value !== conf.value) return fail('The new passwords don’t match.');
      if (nw.value === cur.value) return fail('Your new password must be different from your current password.');
      save.disabled = true;
      try {
        await POST('/api/me/password', { currentPassword: cur.value, newPassword: nw.value });
        form.reset(); meter.dataset.score = '0';
        toast('Your password was changed.', 'success');
      } catch (ex) { fail(ex.message); } finally { save.disabled = false; }
    } },
    err,
    h('div', { class: 'col', style: { maxWidth: '420px' } },
      field('Current Password', cur, { required: true, id: 'pw-cur' }),
      h('div', { class: 'form-row' }, h('label', { class: 'form-label', for: 'pw-new' }, h('span', { class: 'req' }, '*'), 'New Password'), nw, meter, hint),
      field('Confirm New Password', conf, { required: true, id: 'pw-conf' })),
    h('div', { class: 'row' }, save));
    return card('Change My Password', 'You stay signed in on this device after changing your password.', form);
  }

  function displaySection() {
    const current = store.get('theme', 'auto');
    const opts = [['auto', 'System default', 'Match your operating system’s light or dark setting.'], ['light', 'Light', 'Bright surfaces, ideal for daytime.'], ['dark', 'Dark', 'Easier on the eyes in low light.']];
    const wrap = h('div', { class: 'theme-grid', role: 'radiogroup', 'aria-label': 'Theme' });
    const draw = (sel) => mount(wrap, ...opts.map(([k, l, d]) => h('button', {
      type: 'button', role: 'radio', 'aria-checked': String(sel === k), class: ['theme-card', sel === k && 'active'],
      onClick: () => { applyTheme(k); draw(k); toast(`Theme set to ${l}.`, 'success', { timeout: 1500 }); },
    }, h('div', { class: `theme-preview ${k}` }, h('span', { class: 'tp-bar' }), h('span', { class: 'tp-side' }), h('span', { class: 'tp-card' }), h('span', { class: 'tp-card b' })),
    h('div', { class: 'row' }, h('span', { class: 'fb-radio' }), h('div', { class: 'grow' }, h('div', { class: 'strong' }, l), h('div', { class: 'tiny muted' }, d))))));
    draw(current);
    return card('Display & Theme', 'Choose how Slavy looks on this device.', wrap,
      h('div', { class: 'form-help mt-16' }, 'Tip: you can also switch themes from the profile menu in the header.'));
  }

  function accountSection() {
    const u = me();
    const org = state.session?.org || {};
    const rows = [
      ['Username', u.Username], ['User ID', h('code', u.Id)], ['Profile', u.ProfileName || '—'], ['Role', u.RoleName || '—'],
      ['Time Zone', u.TimeZone || 'UTC'], ['Last Login', u.LastLoginDate ? `${fmt.datetime(u.LastLoginDate)} (${fmt.relative(u.LastLoginDate)})` : '—'],
      ['Member Since', fmt.date(u.CreatedDate)], ['Organization', org.name || '—'], ['Currency / Locale', [org.currency, org.locale].filter(Boolean).join(' · ') || '—'],
    ];
    const perms = Object.entries(state.session?.perms?.system || {}).filter(([, v]) => v).map(([k]) => k.replace(/([a-z])([A-Z])/g, '$1 $2'));
    return card('Account Information', 'Managed by your administrator.',
      h('dl', { class: 'settings-dl' }, rows.map(([k, v]) => [h('dt', k), h('dd', v)])),
      h('div', { class: 'mt-16' }, h('div', { class: 'form-label' }, 'System Permissions'), perms.length ? h('div', { class: 'row wrap gap-4' }, perms.map((p) => h('span', { class: 'chip' }, p))) : h('div', { class: 'muted small' }, 'None')),
      can('RunSoql') || can('ModifyAllData') ? h('div', { class: 'mt-16' }, h('a', { class: 'btn btn-sm', href: '#/devconsole' }, icon('code', { size: 14 }), 'Developer Console')) : null);
  }

  function drawContent() {
    const map = { profile: profileSection, password: passwordSection, display: displaySection, account: accountSection };
    mount(content, map[active]());
  }

  drawHead();
  drawNav();
  drawContent();
}
