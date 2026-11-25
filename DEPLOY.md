# Deploying RootQuest

RootQuest is a single Node.js process with a SQLite database in `data/`.
That makes it easy to host, but it means **the `data/` folder must be on
persistent storage** — otherwise every restart/deploy wipes accounts, solves,
groups and notes. It also means you should run **one instance** (SQLite is not
shared between replicas).

## 1. Environment variables

| Variable | Required | Notes |
|---|---|---|
| `NODE_ENV` | yes | `production` behind HTTPS (enables secure cookies + HSTS) |
| `PORT` | no | defaults to `3000` |
| `ADMIN_USERNAME` | no | defaults to `admin` |
| `ADMIN_PASSWORD` | **yes on first start** | only used when the admin account is created |
| `FLAG_SECRET` | recommended | if unset, generated once into `data/secrets.json` |
| `JWT_SECRET` | recommended | same as above |
| `DATA_DIR` | recommended | point at your persistent disk, e.g. `/app/data` or `/data` |
| `TRUST_PROXY` | recommended | `1` when one reverse proxy (nginx/Caddy/Render/Fly/Railway/tunnel) sits in front |
| `MAX_GROUP_SIZE` | no | defaults to `10` |
| `SUBMIT_LIMIT_PER_MIN` | no | defaults to `5` |
| `DAILY_TZ_OFFSET_MIN` | no | defaults to `330` (IST) |

Generate strong secrets with `openssl rand -hex 32`.

> Back up `data/secrets.json` (or keep `FLAG_SECRET`/`JWT_SECRET` somewhere safe).
> Losing them changes every player's flags and invalidates all sessions.

## 2. Docker (any VPS / home server)

```bash
cp .env.example .env          # then edit ADMIN_PASSWORD and the secrets
docker compose up -d --build
```

The app is on `http://<server>:3000`; the database lives in the
`rootquest-data` Docker volume. Put Caddy/nginx in front for HTTPS, e.g. Caddy:

```
rootquest.example.com {
    reverse_proxy 127.0.0.1:3000
}
```

## 3. Fly.io (cheap, volume included)

```bash
fly launch --no-deploy --copy-config --name your-rootquest
fly volumes create rootquest_data --size 1 --region sin
fly secrets set ADMIN_PASSWORD='<strong-password>' \
                FLAG_SECRET="$(openssl rand -hex 32)" \
                JWT_SECRET="$(openssl rand -hex 32)"
fly deploy
```

`fly.toml` already mounts the volume at `/data` and sets `DATA_DIR=/data`.
Keep it at one machine — do not scale out.

## 4. Render

`render.yaml` describes a Docker web service with a 1 GB disk at `/app/data`.
Render's **free plan has no persistent disks**, so use Starter or above.
After the first deploy, set `ADMIN_PASSWORD` (and optionally the two secrets)
in the dashboard; use `sync: false` variables rather than committing them.

## 5. Railway

1. New project → Deploy from repo.
2. Add a volume mounted at `/app/data`.
3. Variables: `NODE_ENV=production`, `DATA_DIR=/app/data`, `ADMIN_PASSWORD`, plus the secrets.
4. Railway detects the `Dockerfile` automatically.

## 6. Quick temporary public URL (demo only)

No account needed; dies when the machine or process stops:

```bash
./start-public.sh     # prints the live URL; also starts the app and installs tools if needed
./stop-public.sh      # stop both
```

`start-public.sh` tries a Cloudflare quick tunnel first and automatically falls
back to a `localhost.run` SSH tunnel when Cloudflare's quick-tunnel API is
unavailable. Both are free, account-less, temporary and give a new URL on every
restart. The script only accepts a URL after checking that real traffic reaches
the app through it.

## Post-deploy checklist

- [ ] `ADMIN_PASSWORD` was set **before** the first start (otherwise change it / delete the DB and reseed).
- [ ] `data/` is on a persistent volume and included in backups.
- [ ] HTTPS terminates in front of the app, `NODE_ENV=production`.
- [ ] Only one app instance is running (SQLite).
- [ ] Log in as admin, go to the Admin tab, and confirm the 11 seeded challenges exist.
- [ ] Register a throw-away player and solve *Welcome* to sanity-check flags.
- [ ] Do not expose the SQL-injection lab to untrusted users beyond your intended audience.
