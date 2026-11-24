import { get, post, put } from '../api.js';
import { state } from '../state.js';
import { h, rich, pips, empty, toast, fmtDate, errBox } from '../ui.js';

// ---------- list ----------
const filters = { q: '', category: '', difficulty: '', status: '' };

export async function challengeList() {
  const { challenges } = await get('/api/challenges');
  const cats = [...new Set(challenges.map((c) => c.category))].sort();
  const list = h('div');

  function draw() {
    const q = filters.q.trim().toLowerCase();
    const shown = challenges.filter((c) =>
      (!q || c.title.toLowerCase().includes(q) || c.skills.some((s) => s.includes(q))) &&
      (!filters.category || c.category === filters.category) &&
      (!filters.difficulty || c.difficulty === filters.difficulty) &&
      (!filters.status || (filters.status === 'solved') === c.solved));
    if (!shown.length) return list.replaceChildren(empty('No challenges match these filters. Clear a filter to see more.'));
    const byCat = {};
    shown.forEach((c) => (byCat[c.category] = byCat[c.category] || []).push(c));
    list.replaceChildren(...Object.keys(byCat).sort().map((cat) => h('section', {},
      h('div', { class: 'cat-title' }, h('h2', {}, cat), h('span', { class: 'muted small' }, `${byCat[cat].filter((c) => c.solved).length} of ${byCat[cat].length} solved`)),
      h('div', { class: 'rows' }, byCat[cat].map((c) => h('a', { class: 'crow' + (c.solved ? ' done' : ''), href: '#/challenges/' + c.id },
        pips(c.difficulty),
        h('div', {}, h('div', { class: 't' }, c.title, ' ',
          c.is_daily ? h('span', { class: 'tag daily' }, 'Daily') : null,
          c.group_name ? h('span', { class: 'tag group' }, 'Group: ' + c.group_name) : null),
        h('div', { class: 'sub' }, c.skills.join(', '))),
        h('div', { class: 'state' }, c.solved ? 'Solved' : `${c.solve_count} solved`),
        h('div', { class: 'pts' }, c.points)))))));
  }

  const sel = (key, label, opts) => h('div', {}, h('label', { for: 'f-' + key }, label),
    h('select', { id: 'f-' + key, value: filters[key], onchange: (e) => { filters[key] = e.target.value; draw(); } },
      h('option', { value: '' }, 'All'), opts.map(([v, t]) => h('option', { value: v }, t))));

  const view = h('div', {},
    h('h1', {}, 'Challenges'),
    h('div', { class: 'row' },
      h('div', {}, h('label', { for: 'f-q' }, 'Search'), h('input', { id: 'f-q', type: 'search', placeholder: 'Title or skill', value: filters.q, oninput: (e) => { filters.q = e.target.value; draw(); } })),
      sel('category', 'Category', cats.map((c) => [c, c])),
      sel('difficulty', 'Difficulty', [['easy', 'Easy'], ['medium', 'Medium'], ['hard', 'Hard']]),
      sel('status', 'Status', [['unsolved', 'Unsolved'], ['solved', 'Solved']])),
    list);
  draw();
  return view;
}

// ---------- detail ----------
export async function challengeDetail(id) {
  const root = h('div');
  let flash = null;

  async function load() {
    const c = await get('/api/challenges/' + id);
    document.title = c.title + ' - RootQuest';
    root.replaceChildren(build(c));
  }

  function build(c) {
    const flagInput = h('input', { id: 'flag', placeholder: 'RQ{...}', autocomplete: 'off', spellcheck: 'false', maxlength: 200, 'aria-describedby': 'flash' });
    const flashBox = h('div', { id: 'flash', 'aria-live': 'polite' });
    if (flash) flashBox.append(h('div', { class: 'msg ' + (flash.ok ? 'ok' : 'bad') }, flash.text));
    const worth = c.hint_penalty_pct && !c.solved
      ? [h('s', {}, c.points), h('b', {}, c.potential_points)]
      : [h('b', {}, c.solved ? c.points_awarded : c.points)];

    const submit = c.solved ? null : h('form', {
      class: 'panel', async onsubmit(e) {
        e.preventDefault();
        if (!flagInput.value.trim()) return;
        try {
          const r = await post(`/api/challenges/${c.id}/submit`, { flag: flagInput.value });
          flash = { ok: r.correct, text: r.message };
          if (r.correct) { if (r.daily_streak) toast(`Daily streak: ${r.daily_streak}`); await load(); } else { await load(); }
        } catch (ex) { flash = { ok: false, text: ex.message }; await load(); }
        flash = null;
      },
    }, h('label', { for: 'flag' }, 'Submit your flag'),
    h('div', { class: 'row' }, flagInput, h('button', { class: 'btn fit', type: 'submit' }, 'Submit flag')), flashBox);

    const solvedBox = c.solved ? h('div', { class: 'panel' },
      h('div', { class: 'msg ok', style: 'margin-top:0' }, `Solved. You earned ${c.points_awarded} points.`), flashBox) : null;

    return h('div', {},
      h('div', { class: 'crumb' }, h('a', { href: '#/challenges' }, 'Challenges'), ' / ', c.category),
      h('div', { class: 'ch-head' },
        h('div', {}, h('h1', {}, c.title),
          h('div', {}, pips(c.difficulty), ' ', c.difficulty, ' ',
            c.is_daily ? h('span', { class: 'tag daily' }, 'Daily') : null,
            c.group_id ? h('span', { class: 'tag group' }, 'Group challenge') : null,
            c.skills.map((s) => h('span', { class: 'tag' }, s)))),
        h('div', { class: 'worth' }, h('div', {}, worth), h('div', { class: 'muted small' }, c.hint_penalty_pct && !c.solved ? `after ${c.hint_penalty_pct}% hint cost` : 'points'))),
      c.teammates_solved.length ? h('p', { class: 'msg ok' }, c.teammates_solved.map((t) => t.username).join(', ') + ' from your group solved this.') : null,
      h('section', { class: 'panel', style: 'margin-top:16px' }, rich(c.description),
        c.lab_url ? h('p', {}, h('a', { class: 'btn amber', href: c.lab_url, target: '_blank', rel: 'noopener' }, 'Open the lab')) : null,
        h('p', { class: 'muted small' }, `${c.solve_count} ${c.solve_count === 1 ? 'player has' : 'players have'} solved this. Your flag is unique to your account.`)),
      solvedBox || submit,
      hintsPanel(c),
      c.solved ? h('section', { class: 'panel writeup' }, h('h2', {}, 'Walkthrough'), rich(c.writeup || 'No walkthrough was written for this challenge.'),
        /^https?:\/\//i.test(c.real_world_link || '') ? h('p', {}, 'Real-world reference: ', h('a', { href: c.real_world_link, target: '_blank', rel: 'noopener noreferrer' }, c.real_world_link)) : null) : null,
      notesPanel(c));
  }

  function hintsPanel(c) {
    if (!c.hints.length) return null;
    const body = c.hints_disabled
      ? h('p', { class: 'muted' }, 'Hints are off while your timed session is running.')
      : h('ol', { class: 'ladder' }, c.hints.map((hint, i) => {
        const prevOpen = i === 0 || c.hints[i - 1].unlocked;
        return h('li', {},
          h('div', {}, h('span', { class: 'rung' }, `Hint ${hint.level}`, h('span', { class: 'cost' }, c.solved ? 'free now' : `costs ${hint.penalty_pct}% of the points`)),
            hint.unlocked ? h('p', {}, rich(hint.text)) : null),
          hint.unlocked ? null : h('button', {
            class: 'btn amber small', disabled: !prevOpen || c.solved, title: prevOpen ? '' : 'Unlock the previous hint first',
            async onclick() { try { await post(`/api/challenges/${c.id}/hints/${hint.level}/unlock`); await load(); } catch (ex) { toast(ex.message); } },
          }, 'Unlock'));
      }));
    return h('section', { class: 'panel' }, h('h2', {}, 'Hint ladder'),
      c.solved || c.hints_disabled ? null : h('p', { class: 'muted' }, 'Hints open in order. Your penalty is the cost of the highest hint you open, not the sum.'), body);
  }

  function notesPanel(c) {
    const holder = h('section', { class: 'panel' }, h('h2', {}, 'My notes'), h('p', { class: 'muted' }, 'Loading...'));
    get(`/api/challenges/${c.id}/notes`).then((n) => {
      const text = h('textarea', { id: 'note', maxlength: 10000, placeholder: 'Commands you tried, ideas, dead ends...', value: n.mine ? n.mine.text : '' });
      const share = h('select', { id: 'share', value: n.mine && n.mine.group_id ? String(n.mine.group_id) : '' },
        h('option', { value: '' }, 'Only me'), n.groups.map((g) => h('option', { value: String(g.id) }, 'Share with ' + g.name)));
      holder.replaceChildren(h('h2', {}, 'My notes'),
        h('div', { class: 'field' }, h('label', { for: 'note' }, 'Notes for this challenge'), text),
        h('div', { class: 'row' }, h('div', {}, h('label', { for: 'share' }, 'Who can read them'), share),
          h('button', { class: 'btn fit', async onclick() { try { await put(`/api/challenges/${c.id}/notes`, { text: text.value, group_id: share.value || null }); toast('Notes saved'); } catch (ex) { toast(ex.message); } } }, 'Save notes')),
        n.shared.length ? h('div', { style: 'margin-top:20px' }, h('h3', {}, 'Shared by your group'),
          n.shared.map((s) => h('div', { class: 'panel' }, h('div', { class: 'small muted' }, `${s.username} in ${s.group_name}, ${fmtDate(s.updated_at)}`), h('div', { class: 'rich' }, s.text)))) : null);
    }).catch((e) => holder.replaceChildren(errBox(e)));
    return holder;
  }

  await load();
  return root;
}
