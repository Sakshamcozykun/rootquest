import { post } from './api.js';
import { state, navigate, refreshMe, refreshTimed } from './state.js';
import { h, brandIcon, clock, destroyCharts, errBox } from './ui.js';
import { loginView, registerView } from './views/auth.js';
import { homeView } from './views/home.js';
import { challengeList, challengeDetail } from './views/challenges.js';
import { scoreboardView, publicProfile } from './views/scoreboard.js';
import { profileView } from './views/profile.js';
import { groupsView, groupDetail } from './views/groups.js';
import { timedView, timedSummary } from './views/timed.js';
import { toolsView } from './views/tools.js';
import { adminView } from './views/admin.js';

const PUBLIC = new Set(['/', '/login', '/register']);
const routes = [
  [/^\/$/, homeView], [/^\/login$/, loginView], [/^\/register$/, registerView],
  [/^\/challenges$/, challengeList], [/^\/challenges\/(\d+)$/, challengeDetail],
  [/^\/scoreboard$/, scoreboardView], [/^\/u\/([A-Za-z0-9_]+)$/, publicProfile],
  [/^\/profile$/, profileView],
  [/^\/groups$/, groupsView], [/^\/groups\/(\d+)$/, groupDetail],
  [/^\/timed$/, timedView], [/^\/timed\/(\d+)$/, timedSummary],
  [/^\/tools$/, toolsView], [/^\/admin$/, adminView],
];

const NAV = [['/challenges', 'Challenges'], ['/scoreboard', 'Scoreboard'], ['/groups', 'Groups'], ['/timed', 'Timed mode'], ['/tools', 'Tools'], ['/profile', 'My skills']];
const currentPath = () => location.hash.slice(1).split('?')[0] || '/';

function renderNav() {
  const path = currentPath();
  const nav = document.getElementById('nav');
  const links = state.user ? [...NAV, ...(state.user.role === 'admin' ? [['/admin', 'Admin']] : [])] : [];
  nav.replaceChildren(
    h('a', { class: 'brand', href: '#/' }, brandIcon(), 'RootQuest'),
    h('nav', { class: 'nav-links', 'aria-label': 'Main' },
      links.map(([to, label]) => h('a', { href: '#' + to, 'aria-current': path === to || path.startsWith(to + '/') ? 'page' : null }, label))),
    state.user
      ? h('div', { class: 'nav-user' },
        state.user.streak > 0 ? h('span', { class: 'chip', title: 'Daily challenge streak' }, `${state.user.streak}-day streak`) : null,
        h('a', { href: '#/u/' + state.user.username }, state.user.username),
        h('button', { class: 'btn ghost small', onclick: logout }, 'Log out'))
      : h('div', { class: 'nav-user' },
        h('a', { href: '#/login' }, 'Log in'),
        h('a', { class: 'btn small', href: '#/register' }, 'Create account')),
  );
}

let bannerTimer = null;
function renderBanner() {
  clearInterval(bannerTimer);
  const root = document.getElementById('banner');
  if (!state.timed) { root.replaceChildren(); return; }
  const t = state.timed;
  const time = h('b', {}, clock((t.ends_at - Date.now()) / 1000));
  root.replaceChildren(h('div', { class: 'banner' }, h('div', { class: 'banner-in' },
    h('span', {}, 'Timed session running. Hints are off.'), time,
    h('a', { href: '#/timed' }, 'Manage session'))));
  bannerTimer = setInterval(async () => {
    const left = (t.ends_at - Date.now()) / 1000;
    if (left <= 0) {
      clearInterval(bannerTimer);
      await refreshTimed();
      navigate('/timed/' + t.id);
    } else time.textContent = clock(left);
  }, 1000);
}

async function logout() {
  await post('/api/auth/logout');
  await refreshMe();
  navigate('/');
}

async function render() {
  const path = currentPath();
  const app = document.getElementById('app');
  destroyCharts();
  renderNav();
  if (!state.user && !PUBLIC.has(path)) return navigate('/login');
  if (path === '/admin' && (!state.user || state.user.role !== 'admin')) return navigate('/');
  for (const [re, view] of routes) {
    const m = path.match(re);
    if (!m) continue;
    document.title = 'RootQuest';
    try {
      app.replaceChildren(await view(...m.slice(1)));
    } catch (e) {
      if (e.status === 401) { await refreshMe(); return navigate('/login'); }
      app.replaceChildren(errBox(e));
    }
    window.scrollTo(0, 0);
    return;
  }
  app.replaceChildren(h('div', { class: 'empty' }, 'Page not found. ', h('a', { href: '#/' }, 'Go home')));
}

state.onChange = () => { renderNav(); renderBanner(); };
window.addEventListener('hashchange', render);
(async () => {
  try { await refreshMe(); } catch (_) { /* offline: show logged-out shell */ }
  render();
})();
