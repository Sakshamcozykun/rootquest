// Shared validation for creating/updating challenges (admin panel and group owners).
const LAB_KEYS = ['robots', 'cookie', 'sqli', 'strings'];
const PLACEHOLDER = /\{\{FLAG(?:_[A-Z0-9]+)?\}\}/;

function cleanText(v, max) {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

// opts: { isAdmin, maxPoints }
function validateChallenge(body, opts) {
  const b = body || {};
  const out = {
    title: cleanText(b.title, 100),
    category: cleanText(b.category, 30).toLowerCase(),
    difficulty: cleanText(b.difficulty, 10).toLowerCase(),
    points: Number(b.points),
    description: cleanText(b.description, 5000),
    flag_type: b.flag_type === 'static' ? 'static' : 'dynamic',
    static_flag: cleanText(b.static_flag, 200),
    lab: opts.isAdmin && b.lab ? cleanText(b.lab, 20) : null,
    skills: cleanText(b.skills, 120).toLowerCase().split(',').map((s) => s.trim()).filter(Boolean).slice(0, 6).join(','),
    writeup: cleanText(b.writeup, 5000),
    real_world_link: cleanText(b.real_world_link, 300),
    active: b.active === false || b.active === 0 ? 0 : 1,
  };
  if (!out.title) return { error: 'Title is required.' };
  if (!out.category) return { error: 'Category is required.' };
  if (!['easy', 'medium', 'hard'].includes(out.difficulty)) return { error: 'Difficulty must be easy, medium or hard.' };
  if (!Number.isInteger(out.points) || out.points < 1 || out.points > opts.maxPoints) {
    return { error: `Points must be a whole number between 1 and ${opts.maxPoints}.` };
  }
  if (!out.description) return { error: 'Description is required.' };
  if (out.lab && !LAB_KEYS.includes(out.lab)) return { error: `Unknown lab. Available: ${LAB_KEYS.join(', ')}.` };
  if (out.flag_type === 'static') {
    if (!out.static_flag) return { error: 'A static challenge needs a flag value.' };
  } else {
    out.static_flag = null;
    if (!out.lab && !PLACEHOLDER.test(out.description)) {
      return { error: 'A dynamic challenge needs a {{FLAG}} placeholder in the description (e.g. {{FLAG_B64}}), or a lab.' };
    }
  }
  if (out.real_world_link && !/^https?:\/\//i.test(out.real_world_link)) {
    return { error: 'Reference link must start with http:// or https://.' };
  }
  const hints = [];
  if (Array.isArray(b.hints)) {
    b.hints.slice(0, 3).forEach((h) => {
      const text = cleanText(typeof h === 'string' ? h : h && h.text, 1000);
      if (text) hints.push(text);
    });
  }
  return { value: out, hints };
}

function saveHints(db, challengeId, hints) {
  db.prepare('DELETE FROM hints WHERE challenge_id = ?').run(challengeId);
  const ins = db.prepare('INSERT INTO hints (challenge_id, level, text) VALUES (?, ?, ?)');
  hints.forEach((text, i) => ins.run(challengeId, i + 1, text));
}

module.exports = { LAB_KEYS, validateChallenge, saveHints };
