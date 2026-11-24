const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('./db');
const { ADMIN_USERNAME, ADMIN_PASSWORD } = require('./config');

// Placeholders like {{FLAG_B64}} are replaced per user when the challenge page is rendered,
// so every player gets a different ciphertext that decodes to THEIR OWN flag.
const CHALLENGES = [
  {
    title: 'Welcome to RootQuest', category: 'misc', difficulty: 'easy', points: 10, skills: 'basics',
    flag_type: 'static', static_flag: 'RQ{welcome_to_rootquest}',
    description: 'Every flag on RootQuest looks like `RQ{...}`.\n\nThis first one is free and the same for everybody:\n\n```\nRQ{welcome_to_rootquest}\n```\n\nType it into the box below and press Submit to see how scoring works. Almost every other challenge gives each player a DIFFERENT flag, so copying a friend\'s flag will not work (and gets logged).',
    hints: ['Copy the text in the code block exactly, including the braces.', 'Flags are case-sensitive.', 'Paste it into the flag box and press Submit.'],
    writeup: 'Flags are the proof that you solved a challenge. Here the flag was handed over so you could learn the workflow: read, find the flag, submit.\n\nOn RootQuest most flags are generated per user with an HMAC of your account and the challenge, so nobody can share answers.',
    real_world_link: '',
  },
  {
    title: 'Base64 Basics', category: 'crypto', difficulty: 'easy', points: 50, skills: 'encoding',
    description: 'A message was intercepted in transit. It looks like gibberish, but the letters, digits, `+`, `/` and `=` at the end are a giveaway.\n\n```\n{{FLAG_B64}}\n```\n\nDecode it to get your flag.',
    hints: ['The trailing `=` signs are padding. Which encoding uses them?', 'It is Base64. The Tools page has a decoder.', 'On Linux: `echo "<text>" | base64 -d`'],
    writeup: 'Base64 turns bytes into 64 printable characters. It is an *encoding*, not encryption: anyone can reverse it without a key.\n\nSolution: paste the text into any Base64 decoder.',
    real_world_link: 'https://datatracker.ietf.org/doc/html/rfc7617',
  },
  {
    title: 'Hexed', category: 'crypto', difficulty: 'easy', points: 50, skills: 'encoding',
    description: 'This looks like a memory dump. Every pair of characters is one byte.\n\n```\n{{FLAG_HEX}}\n```\n\nTurn the bytes back into text.',
    hints: ['Each pair of hex digits is one byte: `41` is the letter `A`.', 'Look up an ASCII table, or use the Tools page hex decoder.', 'On Linux: `echo "<hex>" | xxd -r -p`'],
    writeup: 'Hexadecimal is how humans usually read raw bytes. Converting each pair of hex digits to a byte (and then to an ASCII character) reveals the text.',
    real_world_link: 'https://en.wikipedia.org/wiki/Hexadecimal',
  },
  {
    title: 'Binary Beats', category: 'crypto', difficulty: 'easy', points: 50, skills: 'encoding',
    description: 'A very old machine sent this message, one bit at a time. Each group of eight digits is one character.\n\n```\n{{FLAG_BIN}}\n```',
    hints: ['Eight bits make one byte, and a byte maps to one ASCII character.', '`01010010` is 82 in decimal, which is the letter `R`.', 'Use the binary decoder on the Tools page, or `python3 -c` with `int(x, 2)` and `chr`.'],
    writeup: 'Binary is the lowest-level representation of data. Converting each 8-bit group to its decimal value and then to an ASCII character recovers the plaintext.',
    real_world_link: 'https://en.wikipedia.org/wiki/ASCII',
  },
  {
    title: "Caesar's Shift", category: 'crypto', difficulty: 'easy', points: 100, skills: 'classical-crypto',
    description: 'Julius Caesar shifted every letter by a fixed number of places. Digits and symbols are left alone.\n\n```\n{{FLAG_CAESAR}}\n```\n\nThe flag always starts with `RQ{`. Can you use that to find the shift?',
    hints: ['Only letters move. Digits and braces stay as they are.', 'The cipher text starts with `YX{`. How far is `Y` from `R`?', 'The shift is 7. Move every letter back by 7, or try all 25 shifts in the Tools page Caesar brute-forcer.'],
    writeup: 'A Caesar cipher has only 25 useful keys, so it falls to brute force instantly. A known plaintext prefix (`RQ{`) tells you the shift directly: `R` became `Y`, which is +7.',
    real_world_link: 'https://en.wikipedia.org/wiki/Caesar_cipher',
  },
  {
    title: 'Onion Layers', category: 'crypto', difficulty: 'medium', points: 150, skills: 'encoding,classical-crypto',
    description: 'The sender was paranoid and wrapped the message in several layers of encoding.\n\n```\n{{FLAG_LAYERED}}\n```\n\nPeel them off one at a time. Each layer is something you have already met in other challenges.',
    hints: ['The outer layer only contains characters `0-9` and `a-f`.', 'After undoing hex you get something that ends in `=`. Then what?', 'Order of encoding: reverse the text, then Base64, then hex. Undo them in the opposite order.'],
    writeup: 'Layered encoding is a common way to hide strings in malware and scripts. It does not add any security because every layer is reversible without a key, but it slows down casual inspection.\n\nUndo: hex -> Base64 -> reverse the string.',
    real_world_link: 'https://en.wikipedia.org/wiki/Obfuscation_(software)',
  },
  {
    title: 'One Byte Key', category: 'crypto', difficulty: 'medium', points: 200, skills: 'xor,classical-crypto',
    description: 'Each byte of the flag was XORed with the same secret one-byte key. The result is shown in hex.\n\n```\n{{FLAG_XOR}}\n```\n\nThere are only 255 possible keys...',
    hints: ['XOR is its own inverse: `(a ^ k) ^ k == a`.', 'You know the plaintext starts with `RQ{`. XOR the first cipher byte with `R` to get the key.', 'Write a small script that tries every key from 1 to 255 and prints results containing `RQ{`.'],
    writeup: 'Single-byte XOR is trivially breakable: either brute-force all 255 keys, or use the known prefix `RQ{` to compute the key directly (`key = cipher[0] ^ ord("R")`).\n\nMalware often hides strings with a single-byte XOR; analysts routinely brute-force it.',
    real_world_link: 'https://en.wikipedia.org/wiki/XOR_cipher',
  },
  {
    title: "Robots Don't Lie", category: 'web', difficulty: 'easy', points: 100, skills: 'recon,web', lab: 'robots',
    description: 'ACME Corp keeps a hidden vault on its intranet. They did not link to it anywhere, and they asked search engines politely to stay away.\n\nOpen the lab and find the vault. The flag is shown inside it.',
    hints: ['Websites tell crawlers where not to go in a standard text file at the site root.', 'Open `/lab/robots/robots.txt` in your browser.', 'Visit the `Disallow` path listed in that file.'],
    writeup: '`robots.txt` is a polite request to crawlers, NOT access control. Listing a secret path there actually advertises it to anyone who reads the file.\n\nFix: protect sensitive pages with authentication, and never rely on obscurity.',
    real_world_link: 'https://datatracker.ietf.org/doc/html/rfc9309',
  },
  {
    title: 'Cookie Monster', category: 'web', difficulty: 'easy', points: 100, skills: 'http,web', lab: 'cookie',
    description: 'The members area decides what you are allowed to see by looking at something your own browser sends with every request.\n\nOpen the lab and become the administrator.',
    hints: ['Open your browser developer tools and look at the cookies for this site.', 'There is a cookie called `rq_lab_role`. What is its value?', 'Change the value to `admin` (DevTools -> Application/Storage -> Cookies) and reload the lab page.'],
    writeup: 'Never trust data that the client controls. A role stored in a plain cookie can be edited by the user. Authorization decisions must be made on the server, using a signed session or a server-side lookup.',
    real_world_link: 'https://owasp.org/Top10/A01_2021-Broken_Access_Control/',
  },
  {
    title: 'Admin Bypass', category: 'web', difficulty: 'medium', points: 200, skills: 'sqli,web', lab: 'sqli',
    description: 'The Northwind staff portal checks logins with a database query. The developer built that query by gluing strings together.\n\nLog in as `admin` without knowing the password. The flag is shown on the admin page.',
    hints: ['What happens if your username contains a single quote `\'`? Read the error message.', 'The query is `... WHERE username = \'<you>\' AND password = \'<you>\'`. Can you end the string early and comment out the rest?', 'In SQL, `--` starts a comment. Try the username `admin\'--` with any password.'],
    writeup: 'The query was `SELECT * FROM users WHERE username = \'$u\' AND password = \'$p\'`. With username `admin\'--` it becomes `... WHERE username = \'admin\'--\' AND password = \'\'`, and everything after `--` is ignored, so the password check disappears.\n\nFix: parameterised queries / prepared statements, never string concatenation. SQL injection has been behind many real breaches.',
    real_world_link: 'https://owasp.org/Top10/A03_2021-Injection/',
  },
  {
    title: 'Needle in a Haystack', category: 'forensics', difficulty: 'easy', points: 100, skills: 'forensics', lab: 'strings',
    description: 'Investigators recovered a strange file from a suspect\'s laptop. It does not open in any program, but a flag is hiding inside.\n\nDownload the file from the lab. Beware of decoys: only the real flag works for your account.',
    hints: ['You do not need to understand the file format. Look for readable text inside a binary.', 'On Linux and macOS there is a command that prints printable character sequences from any file.', 'Run `strings evidence.bin | grep RQ{` and pick the flag that is not obviously fake.'],
    writeup: '`strings` prints sequences of printable characters found in binary files. Analysts use it as a first step on unknown files and malware samples. Combine it with `grep` to find interesting patterns quickly.\n\nThe decoy flag was there to remind you to always verify results.',
    real_world_link: 'https://en.wikipedia.org/wiki/Strings_(Unix)',
  },
];

function insertChallenge(c) {
  const info = db.prepare(`INSERT INTO challenges (title, category, difficulty, points, description, flag_type, static_flag, lab, skills, writeup, real_world_link, group_id, active, created_at)
    VALUES (@title, @category, @difficulty, @points, @description, @flag_type, @static_flag, @lab, @skills, @writeup, @real_world_link, NULL, 1, @now)`)
    .run({ flag_type: 'dynamic', static_flag: null, lab: null, ...c, now: Date.now() });
  const ins = db.prepare('INSERT INTO hints (challenge_id, level, text) VALUES (?, ?, ?)');
  c.hints.forEach((t, i) => ins.run(info.lastInsertRowid, i + 1, t));
}

function seed() {
  if (db.prepare('SELECT COUNT(*) n FROM challenges').get().n === 0) {
    db.transaction(() => CHALLENGES.forEach(insertChallenge))();
    console.log(`[seed] inserted ${CHALLENGES.length} challenges`);
  }
  if (!db.prepare("SELECT 1 FROM users WHERE role = 'admin'").get()) {
    const password = ADMIN_PASSWORD || crypto.randomBytes(9).toString('base64url');
    db.prepare("INSERT INTO users (username, password_hash, role, created_at) VALUES (?, ?, 'admin', ?)")
      .run(ADMIN_USERNAME, bcrypt.hashSync(password, 10), Date.now());
    console.log('[seed] ------------------------------------------------------------');
    console.log(`[seed] admin account created -> username: ${ADMIN_USERNAME}  password: ${password}`);
    if (!ADMIN_PASSWORD) console.log('[seed] (random password - shown only once, set ADMIN_PASSWORD in .env to choose your own)');
    console.log('[seed] ------------------------------------------------------------');
  }
}

module.exports = { seed };
