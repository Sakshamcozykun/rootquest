# RootQuest

A capture-the-flag practice platform where **every player gets their own flags**.
Node.js + Express + SQLite on the back end, plain HTML/CSS/JS on the front end. No build step.

## Run it

```bash
npm install
npm start            # http://localhost:3000
npm test             # 128 end-to-end checks against a throw-away database
```

On first start the app seeds 11 challenges and creates an admin account. If you did not set
`ADMIN_PASSWORD`, the random password is printed in the console **once**. Log in as `admin`
and open the **Admin** tab.

Requires Node 18+. Settings are environment variables, see `.env.example`.

## Features

| Feature | Where it lives |
|---|---|
| Accounts, login, scoreboard, admin panel | `src/routes/auth.js`, `stats.js`, `admin.js` |
| **Per-user dynamic flags** `RQ{HMAC(secret, user:challenge)}` | `src/flags.js` |
| Flag-sharing detection (shown to admin) | `src/routes/challenges.js` (submit), admin "Flag-sharing alerts" |
| **Hint ladder**: 3 hints, in order, cost 10/20/30% | `challenges.js` (`/hints/:level/unlock`) |
| **Skill radar chart** + weakest-skill recommendation | `src/services.js` (`skillStats`, `recommendNext`), profile page |
| **Walkthrough + real-world link** after solving | `challenges` table (`writeup`, `real_world_link`) |
| **Timed mode**: countdown, no hints, summary page | `src/routes/timed.js` |
| **Daily challenge + streak** | `src/services.js` (`dailyChallengeId`, `bumpStreak`) |
| **Per-challenge notes**, optionally shared with a group | `challenges.js` (`/notes`) |
| **Rate limiting**: 5 flag submissions/min per user | `src/auth.js` |
| **Decoder toolbox** (Base64, hex, binary, ROT13, Caesar, XOR) | `public/js/views/tools.js` (runs in the browser) |
| **Groups**: invite code, group scoreboard, top contributor, teammates' solves, shared notes, group-only challenges, leave/remove, size cap | `src/routes/groups.js` |
| 4 built-in labs: robots.txt, cookie tampering, SQL injection, strings/forensics | `src/labs.js` |

## How the per-user flags work

A dynamic flag is never stored. It is recomputed whenever needed:

```
flag = "RQ{" + first16hex( HMAC_SHA256(FLAG_SECRET, "flag:<userId>:<challengeId>") ) + "}"
```

* Crypto challenges embed a placeholder in their description, e.g. `{{FLAG_B64}}`. The server replaces it
  with that player's flag, encoded. Everyone gets different ciphertext.
* Labs show the logged-in player's own flag after the vulnerability is exploited.
* If a player submits a valid flag that belongs to someone else, the submission fails and an alert
  (who copied whom, same group or not) appears in the admin panel.

Placeholders: `{{FLAG}}` `{{FLAG_B64}}` `{{FLAG_HEX}}` `{{FLAG_BIN}}` `{{FLAG_ROT13}}` `{{FLAG_REV}}`
`{{FLAG_CAESAR}}` (shift 7) `{{FLAG_LAYERED}}` (reverse, Base64, hex) `{{FLAG_XOR}}` (hex, single-byte key).

## Adding challenges

* **Admin panel > Add challenge**. Pick *dynamic* and put a placeholder in the description, or pick
  *static* and type a flag. To use a lab, choose it in the "Built-in lab" list.
* Group owners can add private challenges (max 100 points) from their group page. Those count for the
  group scoreboard only, never the global one.
* New skills appear on the radar automatically: just type them in the Skills field.

To add a new lab, add routes in `src/labs.js`, add its key to `LAB_KEYS` in `src/challengeInput.js`,
and have the lab show `dynamicFlag(req.user.id, challengeId)`.

## Scoring rules

* Points = base points x (1 - hint penalty). The penalty is that of the **highest** hint opened (10, 20 or 30%).
* Hints open in order and are switched off during a timed session.
* Daily streak: solve the day's challenge on that day. Miss a day and it resets.
* Timed summary counts only challenges solved while the session was running.

## Database

`users`, `challenges`, `hints`, `hint_unlocks`, `solves`, `submissions`, `alerts`, `notes`,
`groups`, `group_members`, `timed_sessions`. The schema is in `src/db.js`. The file lives at `data/rootquest.db`.

## Security notes (worth mentioning in your report)

* Passwords: bcrypt. Sessions: signed JWT in an `httpOnly`, `SameSite=Lax` cookie.
* Flag comparison is constant-time; flags are never sent to the browser except as the player's own ciphertext.
* Walkthroughs and unlocked hints are only sent after the player earns them.
* Rate limits: 5 submissions/min per user, 30 auth attempts per 15 min per IP, 300 API calls/min per IP.
* Helmet with a strict CSP (scripts only from the same origin); all UI text is inserted with `textContent`, never `innerHTML`.
* State-changing API calls must be JSON, on top of SameSite cookies, as CSRF defence.
* The SQL-injection lab is **intentionally vulnerable**, but it runs on a separate in-memory database that
  contains nothing real, and a small filter blocks recursive queries and similar tricks that could freeze the server.
* Everything else uses parameterised SQL.

## Deploying

Run it on one machine (Render, Railway, a VPS, a lab PC). Set `NODE_ENV=production` behind HTTPS, set
`ADMIN_PASSWORD`, and keep the `data/` folder on persistent storage. Back up `data/secrets.json`: if
`FLAG_SECRET` is lost, every player's flags change.

## Demo script (5 minutes)

1. Landing page: two players, same challenge, different ciphertext.
2. Register, solve *Welcome*, solve *Base64 Basics* after opening hint 1 (50 -> 45 points).
3. Open *My skills*: radar chart and the suggested next challenge.
4. Log in as a second user, submit the first user's flag, then show the alert in the admin panel.
5. Create a group, join with the invite code, show teammates' solves and shared notes.
6. Start a 30-minute timed session, solve one challenge, end it, show the summary.
7. Lab: edit the cookie to `admin` or use `admin'--` in the SQL injection lab.
