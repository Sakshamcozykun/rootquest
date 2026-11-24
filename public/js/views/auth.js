import { post } from '../api.js';
import { refreshMe, navigate } from '../state.js';
import { h, errBox } from '../ui.js';

function form(mode) {
  const isReg = mode === 'register';
  const err = h('div');
  const username = h('input', { id: 'u', name: 'username', autocomplete: 'username', required: true, minlength: 3, maxlength: 20 });
  const password = h('input', { id: 'p', name: 'password', type: 'password', required: true, minlength: isReg ? 8 : 1, maxlength: 72, autocomplete: isReg ? 'new-password' : 'current-password' });
  const btn = h('button', { class: 'btn', type: 'submit' }, isReg ? 'Create account' : 'Log in');
  const f = h('form', {
    class: 'panel', style: 'max-width:420px', async onsubmit(e) {
      e.preventDefault();
      btn.disabled = true; err.replaceChildren();
      try {
        await post(`/api/auth/${mode}`, { username: username.value.trim(), password: password.value });
        await refreshMe();
        navigate('/challenges');
      } catch (ex) { err.replaceChildren(errBox(ex)); btn.disabled = false; }
    },
  },
  h('h2', {}, isReg ? 'Create your account' : 'Log in'),
  h('div', { class: 'field' }, h('label', { for: 'u' }, 'Username'), username,
    isReg ? h('div', { class: 'muted small' }, '3-20 letters, digits or underscores.') : null),
  h('div', { class: 'field' }, h('label', { for: 'p' }, 'Password'), password,
    isReg ? h('div', { class: 'muted small' }, 'At least 8 characters.') : null),
  btn, err,
  h('p', { class: 'muted small', style: 'margin-top:16px' },
    isReg ? ['Already have an account? ', h('a', { href: '#/login' }, 'Log in')] : ['New here? ', h('a', { href: '#/register' }, 'Create an account')]));
  return f;
}
export const loginView = () => form('login');
export const registerView = () => form('register');
