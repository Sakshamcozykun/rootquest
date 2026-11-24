import { get, post, put, del } from '../api.js';
import { h, empty, toast, fmtDate, pips } from '../ui.js';
import { challengeForm } from './challengeForm.js';

export async function adminView() {
  const root = h('div');
  let tab = 'challenges', editing = null;

  async function draw() {
    const tabs = h('div', { class: 'tabs', role: 'tablist' }, [['challenges', 'Challenges'], ['form', editing ? 'Edit challenge' : 'Add challenge'], ['alerts', 'Flag-sharing alerts'], ['users', 'Users']].map(([k, label]) =>
      h('button', { role: 'tab', 'aria-selected': tab === k ? 'true' : 'false', onclick() { if (k === 'form') editing = null; tab = k; draw(); } }, label)));
    const [stats, body] = await Promise.all([get('/api/admin/stats'), panel()]);
    root.replaceChildren(h('h1', {}, 'Admin'),
      h('div', { class: 'panel grid3' }, [['users', 'players'], ['challenges', 'public challenges'], ['solves', 'solves'], ['submissions', 'flag attempts'], ['groups', 'groups'], ['alerts', 'sharing alerts']].map(([k, l]) =>
        h('div', { class: 'stat' }, h('b', {}, stats[k]), h('span', {}, l)))), tabs, body);
  }

  async function panel() {
    if (tab === 'challenges') {
      const { challenges } = await get('/api/admin/challenges');
      return h('div', { class: 'panel table-scroll' }, h('table', {},
        h('thead', {}, h('tr', {}, h('th', {}, 'Challenge'), h('th', {}, 'Type'), h('th', { class: 'num' }, 'Points'), h('th', { class: 'num' }, 'Solves'), h('th', {}, ''))),
        h('tbody', {}, challenges.map((c) => h('tr', {},
          h('td', {}, h('a', { href: '#/challenges/' + c.id }, c.title), ' ', pips(c.difficulty), h('div', { class: 'muted small' }, `${c.category}${c.group_name ? ', group: ' + c.group_name : ''}${c.active ? '' : ', hidden'}`)),
          h('td', {}, c.flag_type + (c.lab ? ' + lab ' + c.lab : '')), h('td', { class: 'num' }, c.points), h('td', { class: 'num' }, c.solve_count),
          h('td', { class: 'num' }, c.group_id ? null : h('button', { class: 'btn ghost small', onclick() { editing = c; tab = 'form'; draw(); } }, 'Edit'), ' ',
            h('button', { class: 'btn danger small', async onclick() { if (confirm(`Delete "${c.title}" and all its solves?`)) { await del('/api/admin/challenges/' + c.id); toast('Deleted'); draw(); } } }, 'Delete')))))));
    }
    if (tab === 'form') {
      const { labs } = await get('/api/admin/challenges');
      return challengeForm({
        isAdmin: true, labs, initial: editing, submitLabel: editing ? 'Save changes' : 'Add challenge',
        async onSubmit(data) {
          if (editing) await put('/api/admin/challenges/' + editing.id, data); else await post('/api/admin/challenges', data);
          toast(editing ? 'Saved' : 'Challenge added'); editing = null; tab = 'challenges'; draw();
        },
      });
    }
    if (tab === 'alerts') {
      const { alerts } = await get('/api/admin/alerts');
      return alerts.length ? h('div', { class: 'panel table-scroll' }, h('table', {},
        h('thead', {}, h('tr', {}, h('th', {}, 'When'), h('th', {}, 'Submitted by'), h('th', {}, "Flag belongs to"), h('th', {}, 'Challenge'), h('th', {}, 'Same group'), h('th', {}, ''))),
        h('tbody', {}, alerts.map((a) => h('tr', {}, h('td', {}, fmtDate(a.created_at)), h('td', {}, a.submitter), h('td', {}, a.flag_owner || 'unknown'), h('td', {}, a.challenge), h('td', {}, a.same_group ? 'yes' : 'no'),
          h('td', {}, h('button', { class: 'btn ghost small', async onclick() { await del('/api/admin/alerts/' + a.id); draw(); } }, 'Dismiss'))))))) : empty('No flag sharing detected. When a player submits another player\'s flag it shows up here.');
    }
    const { users } = await get('/api/admin/users');
    return h('div', { class: 'panel table-scroll' }, h('table', {},
      h('thead', {}, h('tr', {}, h('th', {}, 'User'), h('th', {}, 'Role'), h('th', {}, 'Joined'), h('th', { class: 'num' }, 'Solves'), h('th', { class: 'num' }, 'Points'), h('th', { class: 'num' }, 'Alerts'))),
      h('tbody', {}, users.map((u) => h('tr', {}, h('td', {}, u.username), h('td', {}, u.role), h('td', {}, fmtDate(u.created_at)), h('td', { class: 'num' }, u.solves), h('td', { class: 'num' }, u.points), h('td', { class: 'num' }, u.alerts))))));
  }

  await draw();
  return root;
}
