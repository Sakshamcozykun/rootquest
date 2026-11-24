import { h, toast } from '../ui.js';

const enc = new TextEncoder();
const bytesToStr = (b) => new TextDecoder('utf-8', { fatal: false }).decode(b);
const rot = (s, n) => s.replace(/[a-z]/gi, (c) => { const b = c <= 'Z' ? 65 : 97; return String.fromCharCode(((c.charCodeAt(0) - b + n) % 26 + 26) % 26 + b); });
const hexToBytes = (s) => { const x = s.replace(/0x|\s|:/gi, ''); if (!/^([0-9a-f]{2})+$/i.test(x)) throw new Error('Not valid hex (needs an even number of 0-9 a-f characters).'); return Uint8Array.from(x.match(/../g).map((p) => parseInt(p, 16))); };
const printable = (b) => b.filter((c) => (c >= 32 && c < 127) || c === 10).length / (b.length || 1);

const OPS = {
  'Base64 decode': (s) => bytesToStr(Uint8Array.from(atob(s.trim().replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))),
  'Base64 encode': (s) => btoa(String.fromCharCode(...enc.encode(s))),
  'Hex decode': (s) => bytesToStr(hexToBytes(s)),
  'Hex encode': (s) => [...enc.encode(s)].map((b) => b.toString(16).padStart(2, '0')).join(''),
  'Binary decode': (s) => { const x = s.replace(/[^01]/g, ''); if (!x || x.length % 8) throw new Error('Binary needs groups of 8 bits.'); return bytesToStr(Uint8Array.from(x.match(/.{8}/g).map((p) => parseInt(p, 2)))); },
  'Binary encode': (s) => [...enc.encode(s)].map((b) => b.toString(2).padStart(8, '0')).join(' '),
  'ROT13': (s) => rot(s, 13),
  'Reverse text': (s) => [...s].reverse().join(''),
  'URL decode': (s) => decodeURIComponent(s),
  'URL encode': (s) => encodeURIComponent(s),
  'Caesar: try all 25 shifts': (s) => Array.from({ length: 25 }, (_, i) => `shift ${String(i + 1).padStart(2)}: ${rot(s, i + 1)}`).join('\n'),
  'XOR: try all 255 single-byte keys (input hex)': (s) => {
    const b = hexToBytes(s); const found = [];
    for (let k = 1; k < 256; k++) { const out = b.map((c) => c ^ k); if (printable(out) > 0.92 || bytesToStr(out).includes('RQ{')) found.push(`key 0x${k.toString(16).padStart(2, '0')}: ${bytesToStr(out)}`); }
    return found.length ? found.slice(0, 30).join('\n') : 'No readable result for any key.';
  },
};

const CHEAT = [
  ['strings file.bin | grep RQ{', 'print readable text inside a binary'],
  ['file mystery', 'guess a file type from its content, not its name'],
  ['xxd file.bin | head', 'hex dump of the first bytes'],
  ['echo "SGk=" | base64 -d', 'decode Base64 on the command line'],
  ['echo "4869" | xxd -r -p', 'decode hex on the command line'],
  ['curl -i https://site/robots.txt', 'see response headers and robots.txt'],
  ["' OR 1=1--", 'classic SQL injection probe for login forms'],
];

export function toolsView() {
  const input = h('textarea', { id: 'tin', rows: 5, spellcheck: 'false', placeholder: 'Paste text here' });
  const out = h('pre', { class: 'out', 'aria-live': 'polite' }, 'Output appears here.');
  const op = h('select', { id: 'top' }, Object.keys(OPS).map((k) => h('option', { value: k }, k)));
  function run() {
    try { out.textContent = OPS[op.value](input.value) || '(empty result)'; } catch (e) { out.textContent = 'Could not convert: ' + e.message; }
  }
  return h('div', {},
    h('h1', {}, 'Decoder toolbox'),
    h('p', { class: 'muted' }, 'Everything runs in your browser. Nothing you paste is sent to the server.'),
    h('section', { class: 'panel' },
      h('div', { class: 'field' }, h('label', { for: 'tin' }, 'Input'), input),
      h('div', { class: 'row' }, h('div', {}, h('label', { for: 'top' }, 'Operation'), op),
        h('button', { class: 'btn fit', onclick: run }, 'Convert'),
        h('button', { class: 'btn ghost fit', onclick() { input.value = out.textContent; out.textContent = 'Output appears here.'; } }, 'Use output as input'),
        h('button', { class: 'btn ghost fit', async onclick() { try { await navigator.clipboard.writeText(out.textContent); toast('Copied'); } catch (_) { toast('Copy is not available here'); } } }, 'Copy output')),
      h('div', { style: 'margin-top:16px' }, out)),
    h('section', { class: 'panel' }, h('h2', {}, 'Command cheat sheet'),
      h('table', {}, h('tbody', {}, CHEAT.map(([c, d]) => h('tr', {}, h('td', {}, h('code', {}, c)), h('td', { class: 'muted' }, d)))))));
}
