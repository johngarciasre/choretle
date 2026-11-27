#!/usr/bin/env node
/**
 * Demo seed for the v2 (Postgres, household) schema.
 *
 *   DATABASE_URL=postgres://... AUTH_MODE=dev npm run seed
 *
 * Idempotent: each demo household is deleted and rebuilt, so re-running is safe
 * and anything you created by hand survives.
 *
 * Ages drive auth, per the product rule: 13 and over have an email identity,
 * children under 13 are PIN-only and carry no email at all.
 */
import { randomBytes, randomUUID, pbkdf2Sync } from "node:crypto";
import pg from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}
if (process.env.AUTH_MODE !== "dev" && !process.argv.includes("--force")) {
  console.error("Refusing to seed outside dev mode. Pass --force if you mean it.");
  process.exit(1);
}

const PIN_EMOJI_IDS = [
  "smile", "grin", "wink", "cool", "starstruck", "party", "heart", "rainbow",
  "star", "sparkle", "sun", "moon", "cloud", "flower", "clover", "tree",
  "cat", "dog", "panda", "fox", "turtle", "butterfly", "whale", "unicorn",
  "apple", "watermelon", "cookie", "pizza", "soccer", "basketball", "bike",
  "kite", "puzzle", "paint", "music", "rocket",
];

/** Same format `src/lib/pin.ts` produces, so the app can verify seeded PINs. */
function hashPin(ids) {
  const salt = randomBytes(16);
  const hash = pbkdf2Sync(ids.join(":"), salt, 210000, 32, "sha256");
  return `pbkdf2$sha256$210000$${salt.toString("base64")}$${hash.toString("base64")}`;
}

/** Deterministic PIN so the demo is repeatable. */
function pinFor(name) {
  let seed = 0;
  for (const ch of name) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  return Array.from({ length: 4 }, (_, i) => PIN_EMOJI_IDS[(seed + i * 7) % PIN_EMOJI_IDS.length]);
}

const HOUSEHOLDS = [
  {
    slug: "brady",
    name: "The Brady Bunch",
    timezone: "America/New_York",
    weekStartDay: 0,
    domain: "brady.bunch",
    people: [
      { name: "Mike Brady", age: 46, role: "parent", points: 120 },
      { name: "Carol Brady", age: 44, role: "parent", points: 90 },
      { name: "Alice Nelson", age: 58, role: "helper", points: 30 },
      { name: "Greg Brady", age: 17, role: "child", points: 210 },
      { name: "Marcia Brady", age: 16, role: "child", points: 260 },
      { name: "Peter Brady", age: 15, role: "child", points: 140 },
      { name: "Jan Brady", age: 14, role: "child", points: 150 },
      { name: "Bobby Brady", age: 12, role: "child", points: 95 },
      { name: "Cindy Brady", age: 11, role: "child", points: 80 },
    ],
    tasks: [
      ["Set the table", 5, false],
      ["Take out the trash", 8, false],
      ["Clear the dishes", 5, false],
      ["Mow the lawn", 15, true],
      ["Walk the dog", 4, false],
      ["Clean your room", 10, true],
    ],
  },
  {
    slug: "partridge",
    name: "The Partridge Family",
    timezone: "America/Los_Angeles",
    weekStartDay: 1,
    domain: "partridge.bunch",
    people: [
      { name: "Shirley Partridge", age: 52, role: "parent", points: 60 },
      { name: "Reuben Kincaid", age: 60, role: "helper", points: 20 },
      { name: "Keith Partridge", age: 17, role: "child", points: 180 },
      { name: "Laurie Partridge", age: 16, role: "child", points: 175 },
      { name: "Danny Partridge", age: 13, role: "child", points: 110 },
      { name: "Tracy Partridge", age: 11, role: "child", points: 70 },
      { name: "Chris Partridge", age: 9, role: "child", points: 65 },
    ],
    tasks: [
      ["Load the dishwasher", 5, false],
      ["Feed the cat", 3, false],
      ["Practice your instrument", 10, false],
      ["Pack your lunch", 4, false],
    ],
  },
  {
    slug: "bower",
    name: "The Bower House",
    timezone: "America/New_York",
    weekStartDay: 0,
    domain: "bower.bunch",
    people: [
      { name: "Angela Bower", age: 34, role: "parent", points: 75 },
      { name: "Mona Robinson", age: 58, role: "parent", points: 55 },
      { name: "Tony Micelli", age: 37, role: "helper", points: 65 },
      { name: "Samantha Micelli", age: 14, role: "child", points: 130 },
      { name: "Jonathan Bower", age: 7, role: "child", points: 45 },
    ],
    tasks: [
      ["Set the table", 5, false],
      ["Tidy the living room", 6, false],
      ["Water the plants", 4, false],
      ["Put away your toys", 3, false],
    ],
  },
  {
    slug: "micelli",
    name: "The Micelli House",
    timezone: "America/New_York",
    weekStartDay: 0,
    domain: "micelli.bunch",
    people: [
      { name: "Tony Micelli", age: 37, role: "parent", points: 40 },
      { name: "Samantha Micelli", age: 14, role: "child", points: 85 },
    ],
    tasks: [
      ["Make your bed", 3, false],
      ["Take out the recycling", 5, false],
    ],
  },
];

const pool = new pg.Pool({ connectionString, max: 1 });
const client = await pool.connect();

const now = () => new Date().toISOString();
const newId = (prefix) => `${prefix}-${randomUUID()}`;

async function q(sql, params = []) {
  return client.query(sql, params);
}

function ageToYear(age) {
  return new Date().getUTCFullYear() - age;
}

async function seedHousehold(config) {
  await q(`delete from households where slug = $1`, [config.slug]);
  await q(`delete from users where id like $1`, [`seed-${config.slug}-%`]);

  const householdId = `seed-${config.slug}`;
  await q(
    `insert into households (id, name, slug, timezone, week_start_day, teams_enabled, created_at, updated_at)
     values ($1, $2, $3, $4, $5, false, $6, $6)`,
    [householdId, config.name, config.slug, config.timezone, config.weekStartDay, now()],
  );

  const people = [];
  for (const person of config.people) {
    const userId = `seed-${config.slug}-${person.name.toLowerCase().replace(/[^a-z]+/g, "-")}`;
    const email = person.age >= 13 ? `${person.name.split(" ")[0].toLowerCase()}@${config.domain}` : null;
    await q(
      `insert into users (id, email, name, birth_year, pin_hash, pin_set_at, created_at, updated_at)
       values ($1, $2, $3, $4, $5, $6, $6, $6)`,
      [userId, email, person.name, ageToYear(person.age), hashPin(pinFor(person.name)), now()],
    );
    if (email) {
      await q(
        `insert into auth_identities (id, user_id, provider, provider_uid, email)
         values ($1, $2, 'supabase', $3, $4)`,
        [newId("ident"), userId, `seed-${userId}`, email],
      );
    }
    await q(
      `insert into memberships (id, household_id, user_id, role, points_total, joined_at)
       values ($1, $2, $3, $4, $5, $6)`,
      [newId("mem"), householdId, userId, person.role, person.points, now()],
    );
    people.push({ ...person, userId, email });
  }

  // A slate with its tasks, so generation and rotations have something real.
  const slateId = newId("slate");
  await q(
    `insert into slates (id, household_id, name, description, frequency, interval, is_active, created_at, updated_at)
     values ($1, $2, $3, $4, 'weekly', 1, 1, $5, $5)`,
    [slateId, householdId, "Weekly chores", "Everyone pitches in.", now()],
  );

  const kids = people.filter((person) => person.role === "child");

  // One list per slate per day (a unique index enforces it), so today's jobs all
  // hang off the same list.
  const listId = newId("list");
  await q(
    `insert into lists (id, slate_id, household_id, name, start_date, end_date, period, status, created_at)
     values ($1, $2, $3, $4, $5, NULL, 'day', 'active', $5)`,
    [listId, slateId, householdId, "Today's chores", now()],
  );

  for (const [index, [name, points, verifyRequired]] of config.tasks.entries()) {
    const taskId = newId("task");
    await q(
      `insert into tasks (id, household_id, name, description, points, archtype, is_active, verify_required, created_at, updated_at)
       values ($1, $2, $3, NULL, $4, 'job', 1, $5, $6, $6)`,
      [taskId, householdId, name, points, verifyRequired ? 1 : 0, now()],
    );
    const slateTaskId = newId("st");
    await q(
      `insert into slate_tasks (id, slate_id, task_id, points_override, "order") values ($1, $2, $3, NULL, $4)`,
      [slateTaskId, slateId, taskId, index],
    );
    const assignee = kids[index % kids.length];
    const jobId = newId("job");
    const done = index % 3 === 2;
    await q(
      `insert into jobs (id, list_id, slate_task_id, assigned_to, name, description, points, status, verify_required,
                         completed_at, created_at, updated_at)
       values ($1, $2, $3, $4, $5, NULL, $6, $7, $8, $9, $10, $10)`,
      [
        jobId,
        listId,
        slateTaskId,
        assignee.userId,
        name,
        points,
        done ? "done" : "todo",
        verifyRequired ? 1 : 0,
        done ? now() : null,
        now(),
      ],
    );
    await q(
      `insert into job_history (id, job_id, action, details, user_id, created_at)
       values ($1, $2, $3, $4, $5, $6)`,
      [newId("jh"), jobId, done ? "completed" : "created", name, assignee.userId, now()],
    );
  }

  // One chore waiting on a grown-up, so the review screen is not empty.
  const reviewer = people.find((person) => person.role === "parent");
  const pending = await q(
    `select j.id from jobs j join lists l on l.id = j.list_id
      where l.household_id = $1 and j.verify_required = 1 limit 1`,
    [householdId],
  );
  if (pending.rows[0] && reviewer) {
    await q(
      `insert into reviews (id, job_id, household_id, reviewer_id, status, notes, created_at, updated_at)
       values ($1, $2, $3, $4, 'pending', NULL, $5, $5)`,
      [newId("review"), pending.rows[0].id, householdId, reviewer.userId, now()],
    );
  }

  return people;
}

try {
  const seeded = {};
  for (const config of HOUSEHOLDS) {
    seeded[config.slug] = await seedHousehold(config);
    console.log(`[seed] ${config.name}: ${seeded[config.slug].length} people`);
  }

  // Cross-household reporting demo: a two-sided link between Bower and Micelli.
  const angela = seeded.bower.find((person) => person.name === "Angela Bower");
  const tony = seeded.micelli.find((person) => person.name === "Tony Micelli");
  await q(`delete from household_links where household_id in ('seed-bower','seed-micelli')`);
  await q(
    `insert into household_links (id, household_id, linked_household_id, requested_by, approved_by, status, created_at, updated_at)
     values ($1, 'seed-bower', 'seed-micelli', $2, $3, 'active', $4, $4)`,
    [newId("link"), angela.userId, tony.userId, now()],
  );
  console.log("[seed] linked Bower <-> Micelli for combined reports");

  console.log("\nSign in with any password (dev mode):");
  for (const config of HOUSEHOLDS) {
    const emails = seeded[config.slug].filter((person) => person.email).map((person) => person.email);
    console.log(`  ${config.name}: ${emails.join(", ")}`);
  }
  console.log("\nUnder-13 members sign in from the tablet profile picker with their emoji PIN:");
  for (const config of HOUSEHOLDS) {
    for (const person of seeded[config.slug].filter((p) => !p.email)) {
      console.log(`  ${person.name}: ${pinFor(person.name).join(" ")}`);
    }
  }
} catch (err) {
  console.error("[seed] failed:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
