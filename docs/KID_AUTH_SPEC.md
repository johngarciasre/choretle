# Identity, Tenancy & Kid Auth — Design Spec

**Version:** 2, 2026-11-26. Supersedes v1 (kid auth only).
**Status:** Proposed. No code changed. The app has not entered production, so v2 assumes a **tabula rasa schema** — obsolete structures are dropped, not migrated.
**Covers:** household-as-tenant, person/membership identity, Postgres-only data layer, kid auth (picker + PIN), QR device enrollment, shared-tablet sessions, kiosk mode.

---

## 1. Decisions recorded in v2

| # | Decision |
|---|---|
| 1 | **`household` replaces `family` as the tenant.** Full rename in DB, types, and API paths, done once in the PG pass. |
| 2 | **Person ≠ tenant.** `users` becomes an identity table with no `household_id`; `memberships(user, household, role)` carries tenancy, role, and points. |
| 3 | **SQLite is gone.** Postgres in a container for dev/demo/prod; PGlite for tests. Drizzle and both schema mirrors are deleted. |
| 4 | **Tabula rasa.** No `ALTER`/rebuild migrations, no data copy. New schema, reseeded demo. |
| 5 | **Shared-tablet kid sessions idle out in 5 minutes**, activity-refreshed, with a kid-friendly 60-second warning. |
| 6 | **Picker sessions can read a curated kiosk payload** (leaderboard, wallboard) so an idle tablet looks alive — and nothing else. |
| 7 | **36 PIN emoji**, stored as stable IDs, not glyphs. |
| 8 | No age floor for anything. 13+ may have email; children under 13 never do. |
| 9 | A child may change their own PIN after proving the current one. |
| 10 | Adults appear on the picker, but only after setting a PIN in the app, and a tablet adult gets the kid-level write subset. |
| 11 | A picker belongs to exactly one household, so profiles are never labelled. |
| 12 | Cross-household reporting is **explicit and two-sided** (`household_links`), never implicit by person. |

## 2. Goals

1. A child signs in with **no email address**. Nothing in the product collects a child's PII.
2. Several people share one tablet and switch profiles without a full sign-out.
3. An idle tablet is useful (leaderboard) and locked (no chores) at the same time.
4. A parent provisions, resets, and revokes from the household page, immediately.
5. A person can belong to more than one household (custody, roommates, helpers) with a role *per household*.
6. Two consenting households can see a combined report; nothing else is shared implicitly.

## 3. Non-goals

- Passkeys / WebAuthn (parked for 13+ kids with their own hardware).
- Per-kid email/password, magic links, SMS.
- Schema-per-tenant or DB-per-tenant. Shared schema is the model.
- Multi-replica / HA machinery. One app replica, one Postgres.

## 4. Tenancy model: household vs family

`family` currently does two jobs: it is the data partition *and* it implies kinship. Those diverge as soon as a household contains a roommate, a nanny, a grandparent, or a child in 50/50 custody. The alternatives:

| Option | Shape | Pros | Cons |
|---|---|---|---|
| **A. Keep `family` as tenant** | `users.family_id`, one per person | Cheapest; zero rename; matches today's code | Can't express custody, roommates, helpers; role is global, so "parent here, helper there" is impossible; every future tenancy fix inherits the wrong vocabulary |
| **B. `household` tenant + `memberships`** *(chosen)* | person ↔ household many-to-many, role and points on the membership | Handles all real living arrangements; role is per household; points and leaderboards are naturally household-scoped; gives billing and RLS a single anchor | One rename pass; points/medals/streaks move from `users` to `memberships` |
| **C. No tenant — person-owned rows + sharing graph** | every row carries an owner, access via grants | Maximum flexibility | Every query becomes a traversal; billing has no unit; RLS has nothing to anchor on; reports become a project per report. Rejected. |

**Why B:** the tenant has to be the thing you bill, the thing RLS filters by, and the thing a leaderboard is scoped to. That is the dwelling, not the surname. `household` is also the only word that reads correctly for a shared flat or a custody arrangement.

**Cost of B:** `family_id` → `household_id` across the schema, `/api/family/*` → `/api/household/*`, and `points_total` moving to `memberships`. This is mechanical but touches ~52 files; it is free now and expensive later.

### 4.1 Cross-household reporting

| Option | Behaviour | Verdict |
|---|---|---|
| **A. Implicit by person** | a parent sees a separate report per household they belong to | Needed anyway (household switcher); does not give a combined view |
| **B. Two-sided consent link** *(chosen)* | `household_links` row, requested by a parent in one household, approved by a parent in the other; combined + separate reports while `status='active'`; revocable | Least privilege, auditable, reversible; mirrors the existing Swap Meet request/accept shape |
| **C. Merge everything by person** | a person's data is visible across every household they touch | A new partner in household X would see the other household's chores and points. Rejected. |

Rules: a link grants **reports only** (aggregates, completion rates, points) — never tasks, jobs, comments, or photos. Kids' names appear as first names + avatar; no emails. Either side can revoke; revocation is immediate.

**Consequence to accept:** points belong to a membership, not a person. Bobby in two households has two point totals, two streaks, two medal sets. A "lifetime" cross-household stat is a later, opt-in addition.

## 5. Identity model

| Actor | Rows | Credential | Session kind |
|---|---|---|---|
| Adult (parent/helper) | `users` + `auth_identities` + `memberships` | Supabase | `adult` |
| 13+ child | same, optionally with an identity | Supabase, or PIN | `adult` / `kid` |
| Under-13 child | `users` + `memberships`, **no identity row**, `pin_hash` set | PIN | `kid` |
| Adult on a shared tablet | as adult, `pin_hash` set | PIN | `tablet_adult` |
| Shared tablet, nobody signed in | none | QR-enrolled device token | `picker` |

`users` is an identity record and never carries tenancy. `auth_identities` exists so a child who turns 13 can attach a Supabase login **without changing `users.id`** and orphaning their jobs, points, or history.

## 6. Data model (Postgres)

```sql
create table households (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  slug            text unique not null,
  timezone        text not null default 'America/New_York',
  week_start_day  int  not null default 0,
  theme           text not null default 'coral',
  teams_enabled   boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table users (                    -- identity, deliberately not tenant-scoped
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  avatar_url  text,
  birth_year  int,                      -- optional; advisory only (13+ hint)
  pin_hash    text,
  pin_set_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table auth_identities (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users(id) on delete cascade,
  provider     text not null,           -- 'supabase'
  provider_uid text not null,           -- auth.users.id
  email        text,
  created_at   timestamptz not null default now(),
  unique (provider, provider_uid)
);

create table memberships (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references households(id) on delete cascade,
  user_id       uuid not null references users(id) on delete cascade,
  role          text not null check (role in ('parent','child','helper')),
  points_total  int  not null default 0,
  joined_at     timestamptz not null default now(),
  unique (household_id, user_id)
);

create table household_links (          -- cross-household reporting consent
  id                   uuid primary key default gen_random_uuid(),
  household_id         uuid not null references households(id) on delete cascade,
  linked_household_id  uuid not null references households(id) on delete cascade,
  requested_by         uuid not null references users(id),
  approved_by          uuid references users(id),
  status               text not null default 'pending'
                        check (status in ('pending','active','revoked')),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  check (household_id <> linked_household_id),
  unique (household_id, linked_household_id)
);

create table sessions (
  id            uuid primary key default gen_random_uuid(),
  kind          text not null check (kind in ('adult','tablet_adult','kid','picker')),
  membership_id uuid references memberships(id) on delete cascade,  -- null for picker
  household_id  uuid not null references households(id) on delete cascade,
  mode          text not null default 'own' check (mode in ('own','shared')),
  token_hash    text unique not null,
  device_label  text,
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  expires_at    timestamptz not null,
  revoked_at    timestamptz
);
create index on sessions (household_id);

create table device_enrollments (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references households(id) on delete cascade,
  user_id       uuid references users(id),        -- null = enrol a picker
  code_hash     text unique not null,
  created_by    uuid not null references users(id),
  expires_at    timestamptz not null,
  used_at       timestamptz
);
```

Every existing table keeps its shape with `family_id` → `household_id`; `users` loses `family_id`, `role`, and `points_total` (they live on `memberships`). `jobs.assigned_to` continues to reference `users.id`.

### 6.1 Postgres driver rules

- **One async shim** so the 367 existing `.prepare(sql).get/all/run` sites only gain `await`: `src/db/client.ts` exposes `prepare(sql)` returning those three methods, rewrites `?` → `$n` outside string literals, and normalises results.
- **Type parsers** keep the current client contract without touching the UI:
  ```ts
  import pg from "pg";
  pg.types.setTypeParser(20,   (v) => Number(v)); // int8  (COUNT(*) etc.)
  pg.types.setTypeParser(1114, (v) => v);         // timestamp   -> string
  pg.types.setTypeParser(1184, (v) => v);         // timestamptz -> string
  pg.types.setTypeParser(1082, (v) => v);         // date        -> string
  ```
  Timestamps stay strings end-to-end; SQL-side comparisons get real `timestamptz` semantics for free.
- `.run()` returns `rowCount`; every former `.changes` check moves to `rowCount` or a `RETURNING` read-back.
- Dialect rewrites: `GROUP_CONCAT` → `string_agg`, `date(x)` → `x::date`, `datetime('now','-N days')` → `now() - interval 'N days'`, `INSERT OR IGNORE` → `on conflict do nothing`.
- **Transactions become mandatory** where they were implicit: list generation, job completion + points + history, review approval. Use `withTx(fn)`.
- Migrations: numbered `.sql` files in `db/migrations/` plus a `npm run db:migrate` runner, executed as an init step — **never** from a request handler.

### 6.2 Running Postgres

| Context | How |
|---|---|
| Dev / demo | `docker compose up` (or `podman compose`) — `postgres:17-alpine`, named volume, port 5432 |
| Tests | **PGlite** in-process: real Postgres compiled to wasm, no container, fast, and it supports RLS so isolation can be tested in CI |
| Single droplet | k3s StatefulSet, `postgres:17-alpine`, `local-path` PVC, `replicas: 1`, `strategy: Recreate`, backup CronJob running `pg_dump` to object storage |

Both orchestrators are supported from one image: the Helm chart takes `postgres.enabled` (bundled StatefulSet) or `postgres.url` (external). The compose file is the dev loop and the demo path, not a second production story.

Config for a 1–2 GB droplet: `shared_buffers=256MB`, `max_connections=50`, `work_mem=8MB`. The app uses a pool of 10.

## 7. Sessions

| Cookie | Holds | Lifetime | Notes |
|---|---|---|---|
| `__Host-cs-device` | picker token | 180 days, sliding | the tablet's credential; binds to one household |
| `__Host-cs-kid` | kid token, shared tablet | **5 minutes idle**, sliding, 4 h absolute | activity refreshes |
| `__Host-cs-kid` | kid token, own device | 90 days, sliding | from QR enrolment |
| `__Host-cs-tablet` | tablet-adult token | **5 minutes idle**, sliding, 4 h absolute | PIN-authenticated adult |
| Supabase cookies | adult | unchanged | the authority device is the phone/laptop |

All Choretle cookies: `HttpOnly; Secure; SameSite=Lax; Path=/`. Unprefixed names (`cs-kid`, …) when `NODE_ENV !== "production"`, because `__Host-` requires `Secure`, which browsers only accept on `http://localhost`.

**Sliding expiry:** every authenticated request whose session is `mode='shared'` bumps `last_seen_at` (write at most once per 30 s) and re-issues the cookie with `Max-Age=300`. An idle tablet therefore stops working after 5 minutes on its own — the client warning is a courtesy, the server is the truth.

**Resolution order** in `verifyAuth`: (1) `x-user-id` header + `auth_identities` lookup, (2) dev cookie when `AUTH_MODE=dev`, (3) `cs-kid` / `cs-tablet` cookie → `sessions` row (`revoked_at is null and expires_at > now()`) → `memberships` → `AuthResult { userId, householdId, membershipId, role, kind }`.

**`cs-device` is never accepted by `verifyAuth`.** It resolves only inside `verifyPicker()`, used by the three picker endpoints. That is the safety property: a picker token cannot reach any data route.

## 8. Shared-tablet idle UX

- Client tracks real interaction (`pointerdown`, `keydown`, `scroll`); a 30-second-throttled `POST /api/auth/touch` keeps the session alive. Timers alone never refresh it, so an abandoned tab dies on schedule.
- At **60 s idle**: overlay, kid-friendly and minimal.
  - Heading: "Still there?"
  - Body: "Tap a picture to keep going."
  - A single tap dismisses; the countdown restarts.
- At 0 s the client clears to `/profiles`. If it misses, the server already 401s.
- No modal chains, no exclamation marks beyond the question, full punctuation.

## 9. PIN emoji

36 entries, stored as **stable IDs** (`smile`, `rocket`) so a platform font change can never break a login. 4 picks with repeats = 1,679,616 combinations.

`smile 😊 · grin 😄 · wink 😉 · cool 😎 · starstruck 🤩 · party 🥳 · heart 💚 · rainbow 🌈 · star ⭐ · sparkle ✨ · sun ☀️ · moon 🌙 · cloud ☁️ · flower 🌻 · clover 🍀 · tree 🌳 · cat 🐱 · dog 🐶 · panda 🐼 · fox 🦊 · turtle 🐢 · butterfly 🦋 · whale 🐳 · unicorn 🦄 · apple 🍎 · watermelon 🍉 · cookie 🍪 · pizza 🍕 · soccer ⚽ · basketball 🏀 · bike 🚲 · kite 🪁 · puzzle 🧩 · paint 🎨 · music 🎵 · rocket 🚀`

Screen rules: no negative expressions, no hand gestures, no weapons, no money, no religious or political symbols. The set lives in `src/lib/pin-emoji.ts` (separate from `AVATAR_EMOJIS`), each entry `{ id, glyph, label }` with the label used as `aria-label`. A test asserts ≥ 30 entries, unique IDs, unique glyphs, and that every ID is a lowercase slug.

**Hashing:** PBKDF2-SHA256, 210 000 iterations, 16-byte salt, stored `pbkdf2$sha256$210000$<saltB64>$<hashB64>`. Verified in a Node route only — `middleware.ts` runs on Edge and must never attempt it.

**Lockout:** extend `src/lib/rate-limit.ts` with `tooManyAttempts(key, { max, windowMs })`, key `pin:<userId>`, 5 attempts / 15 min. Existing signin/websudo defaults unchanged. The limiter is in-process memory (`ponytail:` note stays) — acceptable at one replica, must move to a shared store before replica #2.

## 10. Capability matrix

| Endpoint group | adult (parent) | adult (child) | tablet_adult | kid | picker |
|---|---|---|---|---|---|
| Parent-only authoring (28 handlers) | ✅ | 403 | **403** | 403 | 401 |
| Kid-level writes: own job status/comments, own PIN | ✅ | ✅ | ✅ | ✅ | ❌ |
| Review approve/return | ✅ (parent, helper) | 403 | **403** | 403 | ❌ |
| Reads: jobs, tasks, profiles, medals | ✅ | ✅ | ✅ | ✅ | ❌ |
| `GET /api/kiosk/leaderboard` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `GET /api/kiosk/wallboard` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `GET /api/reports` (full payload) | ✅ | 403 | 403 | 403 | **401** |
| `POST /api/auth/kid` (PIN login) | — | — | — | — | ✅ |
| `GET /api/auth/profiles` | — | — | — | — | ✅ |
| Mint enrollment code / devices / reset PIN | ✅ | 403 | 403 | 403 | ❌ |
| Household links (request/approve/revoke) | ✅ | 403 | 403 | 403 | ❌ |

Three deliberate choices:

- **Tablet adults do not approve reviews.** Approval pays points; a 4-emoji PIN on a shared kitchen tablet is the weakest credential in the system, and the sibling who watched the parent type it is the threat. Approval stays on the phone. (Alternative if you prefer convenience: allow it and stamp `approved_via='tablet'` with an undo window — more code, weaker control.)
- **Kiosk is a separate endpoint, not general report access.** A lobby screen needs names, avatars, points, streaks, and completion percentages. The full `/api/reports` payload carries chore-level detail, per-job timings, and photo references — far more than a public-ish screen should expose.
- **Helpers approve.** A `helper` (Alice, Reuben, Tony in Bower) may approve or return a submitted chore from an `adult` session — the same power as a parent for this one action, nothing else. On a tablet they are demoted like everyone else: the credential decides, not the role.

## 11. Endpoints

**Identity / sessions**
- `POST /api/auth/signin` — adults, Supabase (unchanged)
- `GET  /api/auth/me` — resolves any session kind
- `GET  /api/auth/profiles` — picker only; names + avatars, no points, no emails
- `POST /api/auth/kid` — picker only; `{ userId, pin: [ids] }` → kid or tablet_adult session
- `POST /api/auth/touch` — slides a shared session; throttled
- `POST /api/auth/signout` — revokes the calling session row
- `POST /api/auth/enroll` — parent only; `{ userId?, label? }` → `{ code, expiresAt, qrPayload }`
- `POST /api/auth/enroll/consume` — public, code-gated

**Household administration**
- `POST   /api/household/members` — create a person + membership (parent only)
- `POST   /api/household/members/:id/pin` — set/reset a PIN (parent only)
- `GET    /api/household/devices` · `DELETE /api/household/devices/:id`
- `GET    /api/household/links` · `POST /api/household/links` · `POST /api/household/links/:id/approve` · `DELETE /api/household/links/:id`

**Kiosk**
- `GET /api/kiosk/leaderboard` → `{ household, updatedAt, members: [{ user, avatar, points, streakDays, medals }] }`
- `GET /api/kiosk/wallboard` → weekly completion percentages, jobs remaining today, points this week

Both are read-only, cache for `private, max-age=30`, and return **first names + avatars only**.

## 12. Flows

**F1 Parent adds a member.** Household page → name, avatar, role. Under-13: no email field at all. 13+: optional email, which creates a Supabase user + `auth_identities` row. Both get a PIN on first setup (for the picker).

**F2 Enrol the shared tablet.** Parent → "Set up this tablet" → QR + copyable code → tablet opens `/enroll#code` → `cs-device` (picker) bound to that household → `/profiles` → kiosk leaderboard idles behind the picker.

**F3 Sign in on the tablet.** `/profiles` → tap → emoji grid → kid/tablet_adult session (5 min idle). Sign-out returns to `/profiles`; the device token survives.

**F4 Own device.** Parent → "Add device for Emma" → QR → **kid** session, 90-day sliding, no countdown. Revocable.

**F5 Idle.** 60 s warning, 5 min absolute, back to `/profiles` + kiosk.

**F6 Revoke / reset.** Parent revokes a device (`revoked_at`) or sets a new PIN. No read-back of an old PIN, ever.

**F7 Turn 13.** Parent adds an email → Supabase identity linked to the **same** `users.id`; points, history, and streak survive because they live on `memberships`.

**F8 Custody report.** Parent in household A requests a link to household B → parent in B approves → `GET /api/reports?scope=linked` merges aggregate stats. Revocation is immediate and one-sided.

## 13. Data exposure

`pin_hash` must never leave the server and `users` must never be `select *`-ed. With tabula rasa, enforce it structurally: a single `USER_PUBLIC` column list in `src/db/columns.ts`, and a test that greps for `select * from users` (case-insensitive) across `src/` and fails.

## 14. Tests that must bite

1. Picker token on `GET /api/jobs` → **401**.
2. Picker token on `GET /api/kiosk/leaderboard` → **200**, body contains no emails and no chore detail.
3. Picker token on `GET /api/reports` → **401**.
4. Emma's kid session on Greg's job → **404**.
5. Kid session on `POST /api/tasks` → **403**.
6. `tablet_adult` on review approve → **403**; on their own job status → **200**.
7. Shared kid session with `last_seen_at` 6 minutes old → **401**; `POST /api/auth/touch` makes the next request **200**.
8. Own-device kid session 6 minutes idle → **200** (mode `own` is not idle-limited).
9. Revoked session → **401** on the next request.
10. Token tamper → **401**, built from a guaranteed-different character.
11. Five wrong PINs → **429**; correct PIN during lockout → still **429**.
12. Enrollment code: first consume **200**, second **400**; expired **400**; cross-household **404**.
13. Kid session minting an enrollment code → **403**.
14. `POST /api/auth/kid` with a user from another household → **403**.
15. `select * from users` appears nowhere in `src/` (F3, §13).
16. A person in two households has **two** `points_total` values and appears once per household leaderboard.
17. `GET /api/reports?scope=linked` with `status='pending'` or `'revoked'` → **403**; `'active'` → **200** and contains both households' aggregates.
18. Emoji set: ≥ 30 entries, unique IDs, unique glyphs, slug-shaped IDs.
19. A 13+ member has an `auth_identities` row; an under-13 member has none.
20. `Set-Cookie` on a shared kid login carries `HttpOnly`, `Secure`, `SameSite=Lax`, `Max-Age=300`.
21. Existing `verify_required` regression: kid → `done` **403**, → `under_review` **200**.

## 15. Demo data (Brady Bunch)

One household: **Brady**, timezone `America/New_York`, week start Sunday.

| Person | Age | Role | Auth |
|---|---|---|---|
| Mike Brady | 46 | parent | email |
| Carol Brady | 44 | parent | email |
| Alice Nelson | 58 | helper | email + PIN |
| Greg Brady | 17 | child | email |
| Marcia Brady | 16 | child | email |
| Peter Brady | 15 | child | email |
| Jan Brady | 14 | child | email |
| Bobby Brady | 12 | child | **PIN only** |
| Cindy Brady | 11 | child | **PIN only** |

Second household **Partridge** (`America/Los_Angeles`, week start Monday): Shirley (parent, email), Reuben (helper, email + PIN), Keith 17, Laurie 16, Danny 13 (email), Tracy 11, Chris 9 (PIN only).

PINs: 4 emoji each, deterministic per person so the demo is repeatable. `AUTH_MODE=dev` lets you sign in as any adult by email; Bobby and Cindy are reachable only through the picker, which is exactly the point of the demo.

**Two linked households, from *Who's The Boss?*** — this is the multi-household demo.

Household **Bower** (`America/New_York`, week start Sunday):

| Person | Age | Role | Auth |
|---|---|---|---|
| Angela Bower | 34 | parent | email |
| Mona Robinson | 58 | parent | email |
| Tony Micelli | 37 | **helper** | email + PIN |
| Samantha Micelli | 14 | child | email |
| Jonathan Bower | 7 | child | **PIN only** |

Household **Micelli** (`America/New_York`, week start Sunday):

| Person | Age | Role | Auth |
|---|---|---|---|
| Tony Micelli | 37 | **parent** | email (same `users` row) |
| Samantha Micelli | 14 | child | email (same `users` row) |

An **active** `household_link` joins Bower and Micelli, so the combined report is demonstrable. This one pair exercises everything at once: a person with two memberships and a **different role per household** (Tony), a child with two point totals and two streaks (Samantha), a helper who can approve (Tony in Bower), an under-13 PIN-only account (Jonathan), and consent-based cross-household reporting.

## 16. Sequencing

The order is forced: Postgres and the rename must land before membership-shaped auth, and memberships must land before kid auth.

| Phase | Content | Est. |
|---|---|---|
| **R — Postgres + rename** | `db/migrations/*.sql`, `src/db/client.ts` shim, type parsers, `withTx`, port 367 sites (compiler-guided `await`), delete better-sqlite3/Drizzle/both schema files/PRAGMA code, PGlite test harness, `docker-compose.yml`, Helm chart with `postgres.enabled`, reseed | 3–4 days |
| **T — Households** | `households`, `users`, `auth_identities`, `memberships`, `household_links`; `getMembership()`; points/medals/streaks move to memberships; `/api/family/*` → `/api/household/*`; RLS policies + the "forgotten WHERE" test | 2 days |
| **K1 — Kid auth** | sessions, PIN, picker, `verifyAuth` branches, profiles API + UI | 2 days |
| **K2 — Devices** | enrolment endpoints, QR, `/enroll`, device list + revoke, reset PIN | 1 day |
| **S — Shared session** | idle 5 min, touch endpoint, 60 s warning, kiosk endpoints + screens | 1 day |
| **Tests** | §14 alongside each phase | 1 day total |

Total ≈ 10–11 working days to a demoable multitenant build. Phases R and T are the ones that unblock the CTaaS goal; K1–S are the product.

## 17. Resolved decisions (2026-11-26)

1. **Points are per membership.** Confirmed — `points_total`, streaks, and medals all live on `memberships`.
2. **A parent signing in with a kid PIN is a kid.** Credential strength decides the session kind: `tablet_adult` and `kid` sessions get kid-level writes and **no** approvals, whatever the person's role.
3. **Multi-household demo:** Bower + Micelli from *Who's The Boss?*, joined by an active link (§15).
4. **RLS lands in phase T**, while the schema is fresh and before any tenant data exists.
5. **Helpers can approve chores as complete**, from an `adult` session only. No authoring, no other parent powers.

No open items remain. Implementation proceeds under the phase order in §16.


## 18. Implementation status (2026-11-26)

Implemented on `feat/v2-postgres-households-kid-auth`:

- **Postgres only.** `db/migrations/001_init.sql` plus `scripts/migrate.mjs`; `src/db/index.ts` is an async `prepare()` shim over `pg` (production) and PGlite (tests). better-sqlite3, Drizzle and both schema mirrors are deleted.
- **Households, memberships, auth identities, links, sessions, enrolments.** Points, streaks and medals read from `memberships`.
- **PIN auth.** 36-emoji grid (`src/lib/pin-emoji.ts`, stored as IDs), PBKDF2 in `src/lib/pin.ts`, picker and kid session cookies, per-profile lockout, QR enrolment, device list and revoke, kiosk endpoints.
- **Shared-tablet idle.** Five-minute server-side idle with a 60-second "Still there?" overlay and a throttled activity ping.
- **Seed.** Brady, Partridge, Bower and Micelli, with email identities for 13+ and PIN-only under-13 members, plus an active Bower–Micelli link.
- **Deploy.** `docker-compose.yml` (Postgres + migrate + app) and `deploy/helm/choretle` (bundled or external Postgres, migration Job, nightly `pg_dump`). The old `k8/` manifests are removed.

Deliberately deferred:

- **Row-level security.** Policies are the right backstop for 367 hand-written `WHERE household_id = ?` clauses, but enforcing them needs every query inside a transaction that sets `app.household_id`. Until then isolation rests on the existing route checks and the multitenancy tests. This is the first item for the next pass.
- **Kiosk medals** (dropped from the payload) and passkeys.
- **Photo object storage.** Uploaded photos remain data URLs in the database; fine at demo scale, move before real tenants.
- **Shared rate-limit store.** Still per-process memory; must move before a second replica.
