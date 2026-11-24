import { get, post } from '../api.js';
import { h, empty, radarChart, fmtDate, toast, errBox, pips } from '../ui.js';

export async function profileView() {
  const me = await get('/api/profile/me');
  const rec = me.recommended;
  const accuracy = me.attempts ? Math.round((me.correct_attempts / me.attempts) * 100) + '%' : '-';
  const weak = [...me.skills].sort((a, b) => a.pct - b.pct);

  const cur = h('input', { id: 'cur', type: 'password', autocomplete: 'current-password' });
  const nxt = h('input', { id: 'nxt', type: 'password', autocomplete: 'new-password', minlength: 8 });
  const msg = h('div');

  return h('div', {},
    h('h1', {}, 'My skills'),
    h('div', { class: 'panel grid3' },
      h('div', { class: 'stat' }, h('b', {}, me.points), h('span', {}, 'points')),
      h('div', { class: 'stat' }, h('b', {}, me.rank ? '#' + me.rank : '-'), h('span', {}, `rank of ${me.total_players}`)),
      h('div', { class: 'stat' }, h('b', {}, `${me.solved_count}/${me.visible_challenges}`), h('span', {}, 'solved')),
      h('div', { class: 'stat' }, h('b', {}, accuracy), h('span', {}, 'flag accuracy')),
      h('div', { class: 'stat' }, h('b', {}, me.streak), h('span', {}, 'day streak'))),
    h('div', { class: 'grid2' },
      h('section', { class: 'panel' }, h('h2', {}, 'Skill map'), radarChart(me.skills)),
      h('section', { class: 'panel' }, h('h2', {}, 'Where to focus'),
        rec ? h('div', {}, h('p', {}, 'Your weakest skill is ', h('b', {}, rec.skill), ` at ${rec.pct}% solved. Try this next:`),
          h('p', {}, h('a', { class: 'btn', href: '#/challenges/' + rec.challenge.id }, rec.challenge.title), ' ', pips(rec.challenge.difficulty), ` ${rec.challenge.points} points`))
          : h('p', { class: 'muted' }, 'You have solved every challenge you can see.'),
        weak.length ? h('div', { class: 'table-scroll' }, h('table', {}, h('tbody', {}, weak.map((s) => h('tr', {},
          h('td', {}, s.skill), h('td', { style: 'width:40%' }, h('div', { class: 'bar' }, h('i', { style: `width:${s.pct}%` }))),
          h('td', { class: 'num' }, `${s.solved}/${s.total}`)))))) : null)),
    h('section', { class: 'panel' }, h('h2', {}, 'Solve history'),
      me.recent_solves.length ? h('div', { class: 'table-scroll' }, h('table', {},
        h('thead', {}, h('tr', {}, h('th', {}, 'Challenge'), h('th', {}, 'When'), h('th', { class: 'num' }, 'Hint cost'), h('th', { class: 'num' }, 'Points'))),
        h('tbody', {}, me.recent_solves.map((s) => h('tr', {}, h('td', {}, h('a', { href: '#/challenges/' + s.id }, s.title)), h('td', {}, fmtDate(s.solved_at)),
          h('td', { class: 'num' }, s.hint_penalty_pct ? s.hint_penalty_pct + '%' : '-'), h('td', { class: 'num' }, s.points_awarded)))))) : empty('Nothing solved yet.')),
    h('form', {
      class: 'panel', style: 'max-width:420px', async onsubmit(e) {
        e.preventDefault();
        try { await post('/api/auth/change-password', { current: cur.value, next: nxt.value }); cur.value = ''; nxt.value = ''; msg.replaceChildren(h('div', { class: 'msg ok' }, 'Password changed.')); } catch (ex) { msg.replaceChildren(errBox(ex)); }
      },
    }, h('h2', {}, 'Change password'),
    h('div', { class: 'field' }, h('label', { for: 'cur' }, 'Current password'), cur),
    h('div', { class: 'field' }, h('label', { for: 'nxt' }, 'New password'), nxt),
    h('button', { class: 'btn', type: 'submit' }, 'Change password'), msg));
}
