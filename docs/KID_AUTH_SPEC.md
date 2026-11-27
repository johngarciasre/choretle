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
4. **RLS lands in phase T**, while the schema is fresh and before any tenant data exists. (Implemented after the first pass — see §18.7.)
5. **Helpers can approve chores as complete**, from an `adult` session only. No authoring, no other parent powers.

No open items remain. Implementation proceeds under the phase order in §16.

## 18. Implementation notes (2026-11-26)

Landed on `feat/v2-postgres-households-kid-auth` in four commits:

| Commit | What |
|---|---|
| `5dd3cc3` | The v2 schema, tenancy, PIN auth, seed, deploy |
| `78f3dc9` | Review writes restricted to parents/helpers |
| `b1823ba` | A PIN session cannot touch another child's chore |
| `03eec5b` | Timestamptz parsing fixed for real Postgres |

`main` and `production` are untouched and nothing was pushed.

### 18.1 Where the code lives

| Area | Files |
|---|---|
| Schema + runner | `db/migrations/001_init.sql`, `scripts/migrate.mjs` |
| Database client | `src/db/index.ts` (async `prepare()` over `pg` / PGlite, type parsers, `withTx`, migrations) |
| Tenancy seam | `src/lib/membership.ts` (`getMembership`, `getMembershipFor`, `getMembershipById`) |
| Sessions | `src/lib/session.ts` (token hash, TTLs, sliding idle, revoke) |
| PIN | `src/lib/pin.ts` (PBKDF2), `src/lib/pin-emoji.ts` (36 IDs) |
| Auth resolution | `src/lib/auth.ts` (`verifyAuth`, `verifyPicker`, `canAuthor`, `canApprove`, `isRestrictedSession`) |
| Picker / kid API | `src/app/api/auth/{profiles,kid,touch,household,enroll}` |
| Household admin | `src/app/api/household/{members,devices,links}` |
| Kiosk | `src/app/api/kiosk/{leaderboard,wallboard}` |
| Screens | `src/app/profiles`, `src/app/enroll`, `src/components/IdleGuard.tsx`, `src/components/HouseholdAccessPanel.tsx` |
| Deploy | `docker-compose.yml`, `Dockerfile`, `deploy/helm/choretle` |
| Tests | `src/__tests__/integration/{kid-auth,tenancy}.test.ts`, `src/__tests__/db-time.test.ts` |

### 18.2 Decisions taken while building

1. **TEXT ids, generated by the app.** No `uuid` column type, so seeded ids (`seed-brady-bobby-brady`), dev ids and session ids all behave the same and no cast churn was needed.
2. **`timestamptz` in the database, ISO strings at the API boundary.** `pg` type parsers return numbers for `int8` and strings for dates; `timestamptzToIso()` handles Postgres's `+00` offset. Day buckets use `to_char(col, 'YYYY-MM-DD')` rather than `::date`, because PGlite hands back a `Date` object for `::date` while `pg` hands back a string.
3. **Legacy 0/1 flags stay `integer`.** Only columns introduced in v2 are `boolean`. This keeps the ~50 existing truthiness and `= 1` sites untouched.
4. **`prepare()` stays synchronous; statements return promises.** That is what made the 325-site conversion mechanical: the compiler finds every missing `await`. `?` → `$n` rewriting skips quoted strings and `--` comments.
5. **Sessions are rows, not signed cookies**, because a parent has to revoke one tablet without logging out the household. A shared session carries a five-minute idle expiry on the row and a four-hour cookie; a cookie cannot be re-issued on every request, so the server, not the browser, owns the idle rule.
6. **The active household is a `ch-household` cookie** that middleware forwards as `x-household-id`. `verifyAuth` honours it only when a membership exists for that household, so it can never widen access.
7. **`getMembership()` is the single tenancy seam.** Role and points live on the membership; every route resolves through that function, so a future switcher or per-household policy changes one file.
8. **Kiosk is a separate endpoint with first names only.** A lobby screen must not leak emails or chore detail. The seed exposed why: dev signup uses the email as the display name, so the kiosk strips anything that looks like an address.
9. **PGlite for tests.** Real Postgres in wasm, no container, fast. It does *not* go through `pg`'s type parsers, which is exactly how the timestamp bug below reached a built server — hence `db-time.test.ts` and the built-server run.
10. **Migrations never run from a request path in production.** `AUTO_MIGRATE` defaults on outside production and is `0` in the Dockerfile, compose and chart; the chart runs `node scripts/migrate.mjs` as a pre-install/pre-upgrade Job.
11. **The seed refuses to run outside `AUTH_MODE=dev`** unless given `--force`, and derives each demo PIN deterministically from the person's name so the demo is repeatable.
12. **Kiosk medals were dropped** from the payload; medals live on the profile, not on a screen the whole room can read.

### 18.3 Bugs the implementation surfaced

- **Review writes were authorized by membership only.** A child could `POST /api/reviews` with `status: "approved"`, or `PUT` an existing review, and skip the `verify_required` gate that points depend on. Fixed in `78f3dc9`: parent/helper on an adult session, status limited to pending/approved/rejected, approver stamped from the session rather than a client-supplied id.
- **`PUT /api/jobs/[jobId]` checked the household but not the caller.** A PIN session could mark a sibling's chore done (paying the sibling), reset it, or reassign it to anyone. Fixed in `b1823ba`: another child's chore is a 404, reassignment is parent-only, and claiming from the open pool still works.
- **Postgres writes a UTC offset as `+00`.** `new Date("…T04:55:39.224+00")` rejects it, so every `timestamptz` read threw `RangeError: Invalid time value`; on the built server `/api/auth/enroll/consume` returned 500. Fixed in `03eec5b` with `timestamptzToIso()` and five unit cases. The PGlite suite was green throughout because it bypasses those parsers.
- **PIN sessions received member email addresses** from `/api/users`, `/api/household/[householdId]` and `/api/profile/[id]`. They now see `email: null` while adults still see addresses.

### 18.4 Running and verifying

```bash
docker compose up -d postgres
DATABASE_URL=postgres://choretle:choretle@localhost:5432/choretle npm run db:migrate
AUTH_MODE=dev DATABASE_URL=… npm run seed        # demo households
AUTH_MODE=dev DATABASE_URL=… npm run dev
```

Tests need no database (PGlite). The four gates are `npx tsc --noEmit`, `npm run lint`, `npm run test:run`, `npm run build`.

Built-server smoke test (what caught the timestamp bug):

```bash
DATABASE_URL=… AUTH_MODE=dev AUTO_MIGRATE=0 PORT=3100 npm start
# sign in -> POST /api/auth/enroll -> POST /api/auth/enroll/consume
# picker: GET /api/auth/profiles 200, GET /api/jobs 401, GET /api/kiosk/leaderboard 200
# kid:    POST /api/auth/kid 200, GET /api/jobs 200, GET /api/users -> email: null
```

### 18.5 Operational notes

- **Session lifetimes:** shared kid/tablet row 5 min idle (4 h absolute), own-device 90 days, picker 180 days. Activity slides at most once every 30 s; only real interaction touches, never a timer.
- **Cookie names:** `cs-kid`, `cs-tablet`, `cs-device`, plus `ch-household`. In production they use the `__Host-` prefix, which requires HTTPS — fine on localhost, not on a plain-HTTP LAN address.
- **PIN lockout:** 5 attempts / 15 min keyed `pin:<userId>` (per person, not per IP, because one tablet shares an IP). Hashing is PBKDF2-SHA256, 210k iterations, 16-byte salt.
- **`users.id` is stable.** `auth_identities` links a Supabase uid to it, so adding an email login to a 13-year-old later does not orphan their jobs or points.
- **The `lists` unique index uses `((start_date at time zone 'UTC')::date)`**, because a bare `timestamptz::date` is not immutable and Postgres rejects it in an index.
- **Backups:** the chart's CronJob runs `pg_dump --format=custom` to a PVC with `retentionDays` pruning. Point `backup.destination` at object storage before real tenants.

### 18.6 Still open

- **Row-level security** is now enforced — see §18.7. What remains there is performance, not coverage: every statement currently opens its own tenant transaction.
- **Photo object storage.** Uploads are still data URLs in the database — fine at demo scale, not with real tenants.
- **Shared rate-limit store.** Per-process memory; must move before a second replica.
- **Passkeys** and **kiosk medals** remain out of scope.
- **Supabase auth** has still not been exercised against a live project; only dev mode has run.

### 18.7 Row-level security (implemented)

The database now enforces the household boundary itself, so a route that forgets a
`WHERE` clause returns nothing instead of another household's rows.

**Mechanism**

- `db/migrations/002_rls.sql` creates `choretle_app` (`nologin nosuperuser nobypassrls`),
  grants it CRUD on the schema, and enables RLS with policies on every tenant table:
  the 17 tables that carry `household_id`, the 9 child tables that reach it through a
  parent (`jobs`, `comments`, `job_history`, `job_subtasks`, `list_tasks`, `slate_tasks`,
  `slate_tags`, `task_tags`, `team_members`), and the identity tables.
- `src/db/tenant.ts` carries the request's household in `AsyncLocalStorage`.
- `src/lib/with-tenant.ts` resolves auth once, enters the scope, and all 57 API route
  files are wrapped with it.
- Every statement outside a transaction runs as `BEGIN; select set_config('app.household_id', $1, true); set local role choretle_app; <sql>; COMMIT`. `withTx` does the same at
  the start of its transaction, so inner statements are not re-wrapped.
- A policy compares against `current_setting('app.household_id', true)`, which is NULL
  when unset, so a scoped statement with no household matches nothing.

**Fail-closed by construction**

| Attempt | Result |
|---|---|
| `select * from tasks` with no WHERE inside a tenant | only that household's rows |
| `insert` a row with another `household_id` | `new row violates row-level security policy` |
| `update`/`delete` another household's row by id | 0 rows, row unchanged |
| scope names a household with no data | 0 rows |

**Deliberate owner paths.** `ENABLE`, not `FORCE`: the table owner still bypasses
policies. That is what lets migrations, the demo seed, sign-in and session lookup
work before a household is known. The few genuinely cross-household features opt
out explicitly with `suspendTenant()` (or an owner handle): invite lookup by code,
the household switcher, the target lookup when requesting a link, Swap Meet shares,
linked reports, and `/api/auth/me`'s own membership list. Each is authorised by the
route before the escape.

**Policy exceptions worth knowing**

- `household_links` accepts either side, so the recipient can approve and either side
  can revoke.
- `households` also shows a household linked to the current one, so a partner's name
  can be rendered without bypassing RLS.
- `swap_meet` is readable by the sharing and the requesting household.
- `users` is readable only for people who hold a membership in the tenant; `INSERT` is
  unrestricted because a new person is written before their membership row exists.

**Verified**

- `src/__tests__/integration/rls.test.ts` (6 tests): RLS is on for the tenant tables and
  the app role cannot bypass it; an unfiltered read is narrowed for tasks, jobs and
  users; a cross-tenant insert is rejected; update and delete affect 0 rows; an empty
  scope sees nothing; the `suspendTenant` escape works.
- The full suite (29 files, 304 tests) passes with RLS enabled, and the built app was
  exercised against real Postgres: owner sees 16 tasks while Brady sees 6 and
  Partridge 4; a forged `x-household-id: seed-brady` from the Partridge session still
  returns 4 with 0 Brady tasks; cross-tenant insert blocked; cross-tenant update 0
  rows; Bower sees itself plus its linked Micelli household.

**Known ceiling:** one transaction per statement adds two round-trips per query. That
is fine at this size; the upgrade path is a request-level transaction (one
`BEGIN`/`COMMIT` per handler) or a pool keyed by household. Child-table policies use
`EXISTS` joins, so their cost depends on the parent indexes.
