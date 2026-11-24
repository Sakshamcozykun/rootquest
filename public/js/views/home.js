import { get } from '../api.js';
import { state } from '../state.js';
import { h, contours, pips, empty, fmtDate } from '../ui.js';

const FEATURES = [
  ['Flags that are yours alone', 'Every player gets a different flag for every challenge. Sharing answers does not work, and it gets logged.'],
  ['A hint ladder, not a hint wall', 'Three hints per challenge, opened in order. Each one costs 10, 20 or 30 percent of the points, and you choose how much help you need.'],
  ['A map of your skills', 'See which skills you have covered and which you have not. RootQuest suggests the easiest unsolved challenge in your weakest area.'],
  ['Walkthrough after you solve', 'Once you have solved a challenge you unlock the intended solution and a real-world reference.'],
  ['Timed mode', 'Simulate a real contest: a countdown, no hints, and a summary of your score, accuracy and time at the end.'],
  ['Groups for classes and clubs', 'Join with an invite code, see which teammates solved what, share notes, and run private challenges for your group.'],
  ['A daily challenge and streak', 'One challenge a day for everyone. Solve it on the day to keep your streak going.'],
  ['Notes and a decoder toolbox', 'Keep notes per challenge and decode Base64, hex, binary, ROT13, Caesar and XOR in the browser.'],
];

function landing() {
  const sample = (flag) => btoa(flag);
  const a = 'RQ{3f9a1c07d2be5a41}', b = 'RQ{b81e66d04a9c27f3}';
  return h('div', {},
    h('section', { class: 'hero' },
      contours(13, 2.4),
      h('div', { class: 'copy' },
        h('h1', {}, 'Practice capture the flag with flags that are yours alone.'),
        h('p', { class: 'lead' }, 'RootQuest is a practice ground for web, crypto and forensics challenges. Every player gets a unique flag, hints that cost points instead of locking you out, and a map of the skills you still need.'),
        h('div', { class: 'row' },
          h('a', { class: 'btn fit', href: '#/register' }, 'Create an account'),
          h('a', { class: 'btn ghost fit', href: '#/login' }, 'Log in'))),
      h('div', { class: 'two-players' },
        h('div', { class: 'panel' }, h('div', { class: 'who' }, 'Ada opens Base64 Basics'), h('pre', {}, sample(a)), h('div', { class: 'muted small' }, 'Decodes to her flag. Nobody else can use it.')),
        h('div', { class: 'panel' }, h('div', { class: 'who' }, 'Ravi opens the same challenge'), h('pre', {}, sample(b)), h('div', { class: 'muted small' }, 'Different text, different flag. Copying Ada gets him flagged.')))),
    h('section', {}, h('h2', {}, 'What makes it different'),
      h('div', { class: 'feat' }, FEATURES.map(([t, d]) => h('div', {}, h('h3', {}, t), h('p', {}, d))))));
}

async function dashboard() {
  const [me, daily] = await Promise.all([get('/api/profile/me'), get('/api/challenges/daily/today')]);
  const rec = me.recommended;
  return h('div', {},
    h('h1', {}, `Welcome back, ${state.user.username}`),
    h('div', { class: 'panel grid3' },
      h('div', { class: 'stat' }, h('b', {}, me.points), h('span', {}, 'points')),
      h('div', { class: 'stat' }, h('b', {}, me.rank ? '#' + me.rank : '-'), h('span', {}, `rank of ${me.total_players}`)),
      h('div', { class: 'stat' }, h('b', {}, `${me.solved_count}/${me.visible_challenges}`), h('span', {}, 'challenges solved')),
      h('div', { class: 'stat' }, h('b', {}, me.streak), h('span', {}, 'day streak'))),
    h('div', { class: 'grid2' },
      h('section', { class: 'panel' }, h('h2', {}, "Today's daily challenge"),
        daily.daily
          ? [h('p', {}, h('a', { href: '#/challenges/' + daily.daily.id }, daily.daily.title), ' ', pips(daily.daily.difficulty), ` ${daily.daily.points} points`),
            daily.daily.solved ? h('p', { class: 'msg ok' }, 'Done for today. Come back tomorrow to extend your streak.') : h('p', { class: 'muted' }, 'Solve it today to keep your streak alive.')]
          : empty('No challenges yet.')),
      h('section', { class: 'panel' }, h('h2', {}, 'Suggested next'),
        rec
          ? [h('p', {}, `Your weakest skill is `, h('b', {}, rec.skill), ` (${rec.pct}% solved).`),
            h('p', {}, h('a', { class: 'btn', href: '#/challenges/' + rec.challenge.id }, rec.challenge.title), ' ', pips(rec.challenge.difficulty), ` ${rec.challenge.points} points`)]
          : h('p', { class: 'muted' }, 'You have solved everything you can see. Check back after new challenges are added.'))),
    h('section', { class: 'panel' }, h('h2', {}, 'Recent solves'),
      me.recent_solves.length
        ? h('ul', { class: 'feed' }, me.recent_solves.slice(0, 5).map((s) => h('li', {}, h('a', { href: '#/challenges/' + s.id }, s.title), ` +${s.points_awarded} points `, h('span', { class: 'muted' }, fmtDate(s.solved_at)))))
        : empty('Nothing solved yet. Start with Welcome to RootQuest.')),
    h('p', {}, h('a', { class: 'btn', href: '#/challenges' }, 'Browse all challenges')));
}

export const homeView = () => (state.user ? dashboard() : landing());
