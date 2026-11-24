import { get } from './api.js';

export const state = { user: null, timed: null, onChange: () => {} };

export const navigate = (path) => { location.hash = '#' + path; };

export async function refreshMe() {
  const { user } = await get('/api/auth/me');
  state.user = user;
  if (user) await refreshTimed(); else state.timed = null;
  state.onChange();
}

export async function refreshTimed() {
  try {
    const { active } = await get('/api/timed');
    state.timed = active;
  } catch (_) { state.timed = null; }
  state.onChange();
}
