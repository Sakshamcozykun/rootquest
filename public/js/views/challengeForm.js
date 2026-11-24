import { h } from '../ui.js';

// Shared form for admin challenges and group-owner challenges.
// opts: { isAdmin, labs, initial, submitLabel, onSubmit(data) }
export function challengeForm(opts) {
  const c = opts.initial || {};
  const hints = c.hints ? c.hints.map((x) => x.text) : [];
  const f = {};
  const field = (id, label, input, help) => h('div', { class: 'field' }, h('label', { for: id }, label), input, help ? h('div', { class: 'muted small' }, help) : null);
  const text = (id, v, extra = {}) => (f[id] = h('input', { id, value: v ?? '', ...extra }));
  const area = (id, v, extra = {}) => (f[id] = h('textarea', { id, value: v ?? '', ...extra }));

  f.difficulty = h('select', { id: 'difficulty', value: c.difficulty || 'easy' }, ['easy', 'medium', 'hard'].map((d) => h('option', { value: d }, d)));
  f.flag_type = h('select', { id: 'flag_type', value: c.flag_type || (opts.isAdmin ? 'dynamic' : 'static'), onchange: sync },
    h('option', { value: 'dynamic' }, 'Dynamic: a different flag for every player'), h('option', { value: 'static' }, 'Static: one flag for everyone'));
  f.static_flag = h('input', { id: 'static_flag', value: c.static_flag || '', placeholder: 'RQ{example_flag}', autocomplete: 'off' });
  f.lab = h('select', { id: 'lab', value: c.lab || '' }, h('option', { value: '' }, 'No lab'), (opts.labs || []).map((l) => h('option', { value: l }, l)));
  f.active = h('input', { id: 'active', type: 'checkbox', checked: c.active === undefined ? true : !!c.active, style: 'width:auto' });
  const hintInputs = [0, 1, 2].map((i) => h('input', { id: 'hint' + i, value: hints[i] || '', placeholder: `Hint ${i + 1} (costs ${[10, 20, 30][i]}%)` }));

  const staticRow = field('static_flag', 'Flag value', f.static_flag);
  function sync() { staticRow.classList.toggle('hidden', f.flag_type.value !== 'static'); }

  const err = h('div');
  const form = h('form', {
    class: 'panel', async onsubmit(e) {
      e.preventDefault();
      err.replaceChildren();
      const data = {
        title: f.title.value, category: f.category.value, difficulty: f.difficulty.value, points: Number(f.points.value),
        description: f.description.value, flag_type: f.flag_type.value, static_flag: f.static_flag.value, skills: f.skills.value,
        writeup: f.writeup.value, real_world_link: f.real_world_link.value, hints: hintInputs.map((i) => i.value),
      };
      if (opts.isAdmin) { data.lab = f.lab.value || null; data.active = f.active.checked; }
      try { await opts.onSubmit(data); } catch (ex) { err.replaceChildren(h('div', { class: 'msg bad', role: 'alert' }, ex.message)); }
    },
  },
  h('div', { class: 'row' },
    field('title', 'Title', text('title', c.title, { required: true, maxlength: 100 })),
    field('category', 'Category', text('category', c.category, { required: true, maxlength: 30, placeholder: 'web, crypto, forensics...' }))),
  h('div', { class: 'row' },
    field('difficulty', 'Difficulty', f.difficulty),
    field('points', 'Points', text('points', c.points ?? 100, { type: 'number', min: 1, max: opts.isAdmin ? 1000 : 100, required: true })),
    field('skills', 'Skills', text('skills', c.skills ?? '', { placeholder: 'sqli, web' }), 'Comma separated. These feed the skill map.')),
  field('description', 'Description', area('description', c.description, { required: true, maxlength: 5000, rows: 7 }),
    'Use ``` for code blocks. For dynamic flags add a placeholder: {{FLAG}}, {{FLAG_B64}}, {{FLAG_HEX}}, {{FLAG_BIN}}, {{FLAG_ROT13}}, {{FLAG_REV}}, {{FLAG_CAESAR}}, {{FLAG_LAYERED}} or {{FLAG_XOR}}. Each player sees their own value.'),
  field('flag_type', 'Flag type', f.flag_type),
  staticRow,
  opts.isAdmin ? h('div', { class: 'row' }, field('lab', 'Built-in lab', f.lab, 'A lab shows each player their own flag.'),
    h('div', { class: 'field fit' }, h('label', { for: 'active' }, 'Visible to players'), f.active)) : null,
  h('fieldset', { style: 'border:1px solid var(--line);border-radius:8px;margin-bottom:14px' }, h('legend', {}, 'Hint ladder (optional)'), hintInputs.map((i) => h('div', { class: 'field' }, i))),
  field('writeup', 'Walkthrough (shown after solving)', area('writeup', c.writeup, { maxlength: 5000 })),
  field('real_world_link', 'Real-world reference link', text('real_world_link', c.real_world_link, { type: 'url', placeholder: 'https://...' })),
  h('button', { class: 'btn', type: 'submit' }, opts.submitLabel || 'Save challenge'), err);
  sync();
  return form;
}
