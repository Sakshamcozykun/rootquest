import { get, post, del } from '../api.js';
import { state, navigate } from '../state.js';
import { h, empty, toast, errBox, fmtDate } from '../ui.js';
import { challengeForm } from './challengeForm.js';
import { pips } from '../ui.js';

export async function groupsView() {
  const { groups, max_size } = await get('/api/groups');
  const err = h('div');
  const name = h('input', { id: 'gname', maxlength: 30, required: true, placeholder: 'e.g. Sem 5 CSE' });
  const code = h('input', { id: 'gcode', maxlength: 8, required: true, placeholder: '8-character code', autocomplete: 'off' });
  return h('div', {},
    h('h1', {}, 'Groups'),
    h('p', { class: 'muted' }, `Groups let a class or club share progress and notes. A group holds up to ${max_size} players.`),
    groups.length ? h('div', { class: 'panel table-scroll' }, h('table', {},
      h('thead', {}, h('tr', {}, h('th', {}, 'Group'), h('th', {}, 'Your role'), h('th', { class: 'num' }, 'Members'), h('th', { class: 'num' }, 'Group points'))),
      h('tbody', {}, groups.map((g) => h('tr', {}, h('td', {}, h('a', { href: '#/groups/' + g.id }, g.name)), h('td', {}, g.role), h('td', { class: 'num' }, g.member_count), h('td', { class: 'num' }, g.total_points)))))) : empty('You are not in a group yet. Create one or join with an invite code.'),
    h('div', { class: 'grid2' },
      h('form', { class: 'panel', async onsubmit(e) { e.preventDefault(); err.replaceChildren(); try { const r = await post('/api/groups', { name: name.value }); navigate('/groups/' + r.id); } catch (ex) { err.replaceChildren(errBox(ex)); } } },
        h('h2', {}, 'Create a group'), h('div', { class: 'field' }, h('label', { for: 'gname' }, 'Group name'), name), h('button', { class: 'btn', type: 'submit' }, 'Create group')),
      h('form', { class: 'panel', async onsubmit(e) { e.preventDefault(); err.replaceChildren(); try { const r = await post('/api/groups/join', { invite_code: code.value }); navigate('/groups/' + r.id); } catch (ex) { err.replaceChildren(errBox(ex)); } } },
        h('h2', {}, 'Join with a code'), h('div', { class: 'field' }, h('label', { for: 'gcode' }, 'Invite code'), code), h('button', { class: 'btn', type: 'submit' }, 'Join group'))),
    err);
}

export async function groupDetail(id) {
  const root = h('div');
  async function load() {
    const d = await get('/api/groups/' + id);
    root.replaceChildren(build(d));
  }

  function build(d) {
    const g = d.group, isOwner = d.my_role === 'owner';
    const members = h('div', { class: 'panel table-scroll' }, h('table', {},
      h('thead', {}, h('tr', {}, h('th', { class: 'num' }, '#'), h('th', {}, 'Member'), h('th', { class: 'num' }, 'Solved'), h('th', { class: 'num' }, 'Points'), h('th', { class: 'num' }, 'Share'), h('th', {}, ''))),
      h('tbody', {}, d.members.map((m) => h('tr', { class: m.id === state.user.id ? 'me' : '' },
        h('td', { class: 'num' }, m.rank),
        h('td', {}, h('a', { href: '#/u/' + m.username }, m.username), m.role === 'owner' ? h('span', { class: 'tag', style: 'margin-left:6px' }, 'owner') : null, m.top_contributor ? h('span', { class: 'tag daily', style: 'margin-left:6px' }, 'top contributor') : null),
        h('td', { class: 'num' }, m.solves), h('td', { class: 'num' }, m.points), h('td', { class: 'num' }, m.share_pct + '%'),
        h('td', { class: 'num' }, (isOwner && m.id !== state.user.id) ? h('button', { class: 'btn danger small', async onclick() { if (confirm(`Remove ${m.username} from the group?`)) { try { await del(`/api/groups/${g.id}/members/${m.id}`); await load(); } catch (ex) { toast(ex.message); } } } }, 'Remove') : null))))));

    const invite = g.invite_code ? h('section', { class: 'panel' }, h('h2', {}, 'Invite code'),
      h('p', {}, h('span', { class: 'invite' }, g.invite_code)),
      h('p', { class: 'muted small' }, 'Share this with people you want in the group. Regenerate it if it leaks - the old code stops working.'),
      isOwner ? h('button', { class: 'btn ghost small', async onclick() { try { await post(`/api/groups/${g.id}/regenerate-invite`); await load(); toast('New invite code created'); } catch (ex) { toast(ex.message); } } }, 'Regenerate code') : null) : null;

    const challenges = h('section', { class: 'panel' }, h('h2', {}, 'Group-only challenges'),
      h('p', { class: 'muted' }, 'Only members can see these. They count towards the group score, not the global scoreboard.'),
      d.challenges.length ? h('div', { class: 'rows' }, d.challenges.map((c) => h('div', { class: 'crow' + (c.solved ? ' done' : '') },
        pips(c.difficulty), h('a', { class: 't', href: '#/challenges/' + c.id }, c.title), h('div', { class: 'state' }, `${c.member_solves} of ${d.members.length} solved`),
        h('div', { class: 'pts' }, isOwner ? h('button', { class: 'btn danger small', async onclick() { if (confirm('Delete this challenge?')) { try { await del(`/api/groups/${g.id}/challenges/${c.id}`); await load(); } catch (ex) { toast(ex.message); } } } }, 'Delete') : c.points))))
        : empty(isOwner ? 'No group challenges yet. Add one below.' : 'The owner has not added any group challenges yet.'));

    const addForm = isOwner ? h('details', { class: 'panel' }, h('summary', { style: 'cursor:pointer;font-weight:700' }, 'Add a group-only challenge'),
      h('div', { style: 'margin-top:16px' }, challengeForm({
        isAdmin: false, submitLabel: 'Add challenge',
        async onSubmit(data) { await post(`/api/groups/${g.id}/challenges`, data); toast('Challenge added'); await load(); },
      }))) : null;

    return h('div', {},
      h('div', { class: 'crumb' }, h('a', { href: '#/groups' }, 'Groups'), ' / ', g.name),
      h('h1', {}, g.name),
      h('p', { class: 'muted' }, `${d.members.length} of ${g.max_size} members, ${d.total_points} points together.`),
      members, invite,
      h('div', { class: 'grid2' },
        h('section', { class: 'panel' }, h('h2', {}, 'Recent solves'),
          d.activity.length ? h('ul', { class: 'feed' }, d.activity.map((a) => h('li', {}, h('b', {}, a.username), ' solved ', h('a', { href: '#/challenges/' + a.challenge_id }, a.title), ` for ${a.points_awarded} points `, h('span', { class: 'muted' }, fmtDate(a.solved_at))))) : empty('No solves from members yet.')),
        challenges),
      addForm,
      h('div', {}, isOwner
        ? h('button', { class: 'btn danger', async onclick() { if (confirm('Delete this group and its private challenges? This cannot be undone.')) { try { await del('/api/groups/' + g.id); navigate('/groups'); } catch (ex) { toast(ex.message); } } } }, 'Delete group')
        : h('button', { class: 'btn danger', async onclick() { if (confirm('Leave this group?')) { try { await del(`/api/groups/${g.id}/members/${state.user.id}`); navigate('/groups'); } catch (ex) { toast(ex.message); } } } }, 'Leave group')));
  }
  await load();
  return root;
}
