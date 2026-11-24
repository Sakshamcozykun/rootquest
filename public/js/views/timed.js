import { get, post } from '../api.js';
import { refreshTimed, navigate } from '../state.js';
import { h, empty, clock, dur, fmtDate, toast, errBox } from '../ui.js';

export async function timedView() {
  const d = await get('/api/timed');
  const root = h('div');
  const choice = h('select', { id: 'dur', value: '60' }, [[30, '30 minutes'], [60, '1 hour'], [90, '90 minutes'], [120, '2 hours']].map(([v, t]) => h('option', { value: String(v) }, t)));
  const err = h('div');

  if (d.active) {
    const t = d.active, time = h('div', { class: 'timer-big', role: 'timer' }, clock((t.ends_at - Date.now()) / 1000));
    const tick = setInterval(() => { if (!time.isConnected) return clearInterval(tick); time.textContent = clock((t.ends_at - Date.now()) / 1000); }, 1000);
    root.append(h('h1', {}, 'Timed mode'), h('section', { class: 'panel' }, h('h2', {}, 'Session running'), time,
      h('p', { class: 'muted' }, `Started ${fmtDate(t.started_at)}. Hints are off until it ends.`),
      h('div', { class: 'row' }, h('a', { class: 'btn fit', href: '#/challenges' }, 'Go to challenges'),
        h('button', { class: 'btn danger fit', async onclick() { if (!confirm('End the session now?')) return; await post('/api/timed/end'); await refreshTimed(); navigate('/timed/' + t.id); } }, 'End session'))));
  } else {
    root.append(h('h1', {}, 'Timed mode'),
      h('p', { class: 'muted' }, 'A practice run that feels like a real contest. A countdown runs, hints are switched off, and only challenges you solve during the session count towards your summary.'),
      h('form', { class: 'panel', style: 'max-width:420px', async onsubmit(e) { e.preventDefault(); try { await post('/api/timed/start', { duration_min: Number(choice.value) }); await refreshTimed(); navigate('/challenges'); } catch (ex) { err.replaceChildren(errBox(ex)); } } },
        h('h2', {}, 'Start a session'), h('div', { class: 'field' }, h('label', { for: 'dur' }, 'Length'), choice), h('button', { class: 'btn', type: 'submit' }, 'Start the clock'), err));
  }

  root.append(h('section', { class: 'panel' }, h('h2', {}, 'Past sessions'),
    d.history.length ? h('div', { class: 'table-scroll' }, h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Started'), h('th', {}, 'Length'), h('th', { class: 'num' }, 'Solved'), h('th', { class: 'num' }, 'Points'), h('th', {}, ''))),
      h('tbody', {}, d.history.map((s) => h('tr', {}, h('td', {}, fmtDate(s.started_at)), h('td', {}, s.duration_min + ' min'), h('td', { class: 'num' }, s.solves), h('td', { class: 'num' }, s.points), h('td', {}, h('a', { href: '#/timed/' + s.id }, 'View summary'))))))) : empty('No finished sessions yet.')));
  return root;
}

export async function timedSummary(id) {
  const s = await get(`/api/timed/${id}/summary`);
  return h('div', {},
    h('div', { class: 'crumb' }, h('a', { href: '#/timed' }, 'Timed mode'), ' / summary'),
    h('h1', {}, s.running ? 'Session in progress' : 'Session summary'),
    h('div', { class: 'panel grid3' },
      h('div', { class: 'stat' }, h('b', {}, s.total_points), h('span', {}, 'points scored')),
      h('div', { class: 'stat' }, h('b', {}, s.solves.length), h('span', {}, 'challenges solved')),
      h('div', { class: 'stat' }, h('b', {}, dur(s.time_used_sec)), h('span', {}, `used of ${s.session.duration_min} minutes`)),
      h('div', { class: 'stat' }, h('b', {}, s.accuracy_pct === null ? '-' : s.accuracy_pct + '%'), h('span', {}, `flag accuracy (${s.correct_attempts}/${s.attempts})`))),
    h('div', { class: 'grid2' },
      h('section', { class: 'panel' }, h('h2', {}, 'Solve timeline'),
        s.solves.length ? h('ul', { class: 'feed' }, s.solves.map((r) => h('li', {}, h('b', {}, dur(r.at_sec)), ' in: ', h('a', { href: '#/challenges/' + r.id }, r.title), ` (${r.category}, ${r.difficulty}) +${r.points_awarded}`))) : empty('No challenges solved in this session.')),
      h('section', { class: 'panel' }, h('h2', {}, 'Skills practised'),
        s.skills_practised.length ? h('ul', { class: 'feed' }, s.skills_practised.map((k) => h('li', {}, `${k.skill}: ${k.count} solved`))) : empty('No skills practised yet.'))),
    h('a', { class: 'btn', href: '#/timed' }, 'Back to timed mode'));
}
