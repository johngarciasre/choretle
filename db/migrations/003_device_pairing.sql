-- Pairing a device nobody can type into (a wall tablet, a smart fridge).
--
-- The device asks for a code and shows it as a QR; a signed-in phone scans it
-- and approves, which mints an ordinary single-use enrollment code for that
-- device. Rows exist before any household is known, so the table is owner-only:
-- no grant to choretle_app and RLS with no policy, so tenant-scoped SQL cannot
-- read it even if a grant ever slips in. Reads go through suspendTenant after
-- the approving session has been checked.

create table device_pairing_requests (
  id           text primary key,
  code_hash    text unique not null,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null,
  approved_at  timestamptz,
  household_id text references households(id) on delete cascade,
  approved_by  text references users(id) on delete set null
);

alter table device_pairing_requests enable row level security;
