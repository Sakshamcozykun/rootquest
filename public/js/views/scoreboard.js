import { get } from '../api.js';
import { state } from '../state.js';
import { h, empty, radarChart, fmtDate } from '../ui.js';

export async function scoreboardView() {
  const d = await get('/api/scoreboard');
  return h('div', {},
    h('h1', {}, 'Scoreboard'),
    d.me ? h('p', { class: 'muted' }, `You are ranked #${d.me.rank} of ${d.total_players} with ${d.me.points} points. Group-made challenges do not count here.`) : null,
    d.scoreboard.length ? h('div', { class: 'panel table-scroll' }, h('table', {},
      h('thead', {}, h('tr', {}, h('th', { class: 'num' }, 'Rank'), h('th', {}, 'Player'), h('th', { class: 'num' }, 'Solved'), h('th', { class: 'num' }, 'Points'))),
      h('tbody', {}, d.scoreboard.map((r) => h('tr', { class: r.id === state.user.id ? 'me' : '' },
        h('td', { class: 'num' }, r.rank), h('td', {}, h('a', { href: '#/u/' + r.username }, r.username), r.id === state.user.id ? ' (you)' : ''),
        h('td', { class: 'num' }, r.solves), h('td', { class: 'num' }, r.points)))))) : empty('No players yet.'));
}

export async function publicProfile(name) {
  const p = await get('/api/users/' + encodeURIComponent(name));
  return h('div', {},
    h('h1', {}, p.username),
    h('div', { class: 'panel grid3' },
      h('div', { class: 'stat' }, h('b', {}, p.points), h('span', {}, 'points')),
      h('div', { class: 'stat' }, h('b', {}, '#' + p.rank), h('span', {}, 'rank')),
      h('div', { class: 'stat' }, h('b', {}, p.solves), h('span', {}, 'challenges solved'))),
    h('div', { class: 'grid2' },
      h('section', { class: 'panel' }, h('h2', {}, 'Skill map'), radarChart(p.skills)),
      h('section', { class: 'panel' }, h('h2', {}, 'Recent solves'),
        p.recent_solves.length ? h('ul', { class: 'feed' }, p.recent_solves.map((s) => h('li', {}, `${s.title} `, h('span', { class: 'muted' }, `+${s.points_awarded}, ${fmtDate(s.solved_at)}`)))) : empty('No solves yet.'))));
}
