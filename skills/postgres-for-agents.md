# PostgreSQL for Agent Marketplaces

Grounding for `blue build` (infra/database category), `blue audit` (schema consistency checks), `blue validate --db`, and `blue chat` when users discuss data layer design.

This skill teaches PostgreSQL schema design, indexing, migrations, transactions, and audit patterns specifically for AI agent marketplaces — gig platforms, microtask networks, reputation systems, and onchain payout workflows running on Base.

Use this skill when:
- A user runs `blue build --category infra --db postgres`
- A user asks to design or review a task/gig/payout schema
- A user is migrating from flat JSON files to a relational store
- `blue audit --check schema-consistency` runs on a project
- A user asks about JSONB vs columns, index strategy, or migration versioning

---

## 1. Purpose and Scope

Agent marketplaces have a specific data shape: tasks get claimed, work gets submitted, reputation accrues, payouts flow. Each of these is a distinct lifecycle with its own state machine. A schema that conflates them will become unmaintainable within weeks.

This guide covers:
- Table design for each domain object
- Foreign key constraints and index coverage
- Migration versioning you can run in CI
- Transaction isolation for claim races and payout finality
- Audit log for compliance and debugging
- Migration path from `~/.blue-agent/*.json` flat files to PostgreSQL
- SQL query patterns for marketplace browse and reputation profile pages
- JSONB tradeoffs — when to use it, when to stop
- CLI integration patterns for Blue Agent commands

All examples target PostgreSQL 15+ on Base-native infrastructure. Timestamps are stored in UTC. All monetary amounts are stored as integer cents or as `NUMERIC(36,18)` for ERC-20 amounts — never `FLOAT`.

---

## 2. Core Concepts — PostgreSQL for Marketplace Apps

### 2.1 Domain objects and their lifecycles

A marketplace has five core domain objects. Each one maps to a primary table. Never collapse them.

```
tasks        — units of work to be done
gigs         — repeatable service offerings (worker advertises)
claims       — a worker's intent to complete a task
submissions  — the actual work delivered against a claim
payouts      — onchain payment records (Base USDC or ETH)
reputation   — aggregate score per address
notifications — async events for workers and clients
audit_log    — append-only record of every state change
```

### 2.2 State machines

Every lifecycle has a defined set of states and allowed transitions. Encode these as `CHECK` constraints, not application logic.

Task states:
```
open → claimed → submitted → approved → paid
open → expired
claimed → disputed
submitted → rejected → open (recycled)
```

Payout states (separate from task states — see Section 11 on common mistakes):
```
pending → broadcast → confirmed → settled
pending → failed
broadcast → dropped
```

### 2.3 NUMERIC vs FLOAT for money

Never use `FLOAT` or `DOUBLE PRECISION` for amounts. IEEE 754 floating point introduces rounding error that compounds across aggregations.

```sql
-- WRONG
amount FLOAT  -- 0.1 + 0.2 = 0.30000000000000004

-- RIGHT for USDC (6 decimals)
amount NUMERIC(36, 6)

-- RIGHT for ETH (18 decimals)
amount NUMERIC(36, 18)

-- RIGHT for USD cents (avoids decimal entirely)
amount_cents INTEGER  -- store $1.50 as 150
```

### 2.4 Address storage

Store EVM addresses as `CITEXT` (case-insensitive text) or as `CHAR(42)` with a `CHECK (address ~* '^0x[0-9a-fA-F]{40}$')`. Never store them as `BYTEA` unless you have a specific binary indexing reason — it complicates debugging.

```sql
-- Install citext extension once per database
CREATE EXTENSION IF NOT EXISTS citext;

-- Then use it
wallet_address CITEXT NOT NULL CHECK (wallet_address ~* '^0x[0-9a-fA-F]{40}$')
```

### 2.5 UUIDs vs serial integers

Use `gen_random_uuid()` (built into PostgreSQL 13+) for primary keys on tables that will be exposed via API or referenced in URLs. Use `BIGSERIAL` for internal tables (audit_log, notifications) where ordering matters more than opacity.

```sql
-- Public-facing table: UUID
id UUID PRIMARY KEY DEFAULT gen_random_uuid()

-- Internal ordering table: BIGSERIAL
id BIGSERIAL PRIMARY KEY
```

---

## 3. Schema Design

### 3.1 Tasks table (microtask variant)

```sql
CREATE TABLE tasks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title           TEXT NOT NULL CHECK (char_length(title) BETWEEN 5 AND 200),
  description     TEXT NOT NULL,
  category        TEXT NOT NULL,
  requester_addr  CITEXT NOT NULL CHECK (requester_addr ~* '^0x[0-9a-fA-F]{40}$'),
  reward_usdc     NUMERIC(36, 6) NOT NULL CHECK (reward_usdc > 0),
  reward_token    CITEXT CHECK (reward_token ~* '^0x[0-9a-fA-F]{40}$'),
  status          TEXT NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open','claimed','submitted','approved','paid','expired','disputed')),
  tags            TEXT[] DEFAULT '{}',
  metadata        JSONB DEFAULT '{}',
  expires_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  claimed_at      TIMESTAMPTZ,
  submitted_at    TIMESTAMPTZ,
  approved_at     TIMESTAMPTZ,
  paid_at         TIMESTAMPTZ
);

-- Auto-update updated_at on any row change
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tasks_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- Indexes
CREATE INDEX idx_tasks_status          ON tasks (status);
CREATE INDEX idx_tasks_requester_addr  ON tasks (requester_addr);
CREATE INDEX idx_tasks_category        ON tasks (category);
CREATE INDEX idx_tasks_created_at      ON tasks (created_at DESC);
CREATE INDEX idx_tasks_expires_at      ON tasks (expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX idx_tasks_tags            ON tasks USING GIN (tags);
CREATE INDEX idx_tasks_metadata        ON tasks USING GIN (metadata);
CREATE INDEX idx_tasks_status_category ON tasks (status, category);
```

**Key decisions:**
- `reward_token` is nullable — NULL means the native reward is USDC in `reward_usdc`
- `metadata` JSONB holds extra fields (e.g., `{"chain_id": 8453, "contract": "0x..."}`) without requiring schema migration for every new field
- All phase timestamps (`claimed_at`, `submitted_at`, etc.) are separate columns — do not put them in JSONB
- `tags` is a `TEXT[]` with GIN index for fast `WHERE 'solidity' = ANY(tags)` queries

---

### 3.2 Gigs table

Gigs are reusable service offerings posted by workers. Unlike tasks (posted by clients), gigs are posted by the worker and claimed by clients.

```sql
CREATE TABLE gigs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_addr     CITEXT NOT NULL CHECK (worker_addr ~* '^0x[0-9a-fA-F]{40}$'),
  title           TEXT NOT NULL CHECK (char_length(title) BETWEEN 5 AND 200),
  description     TEXT NOT NULL,
  category        TEXT NOT NULL,
  subcategory     TEXT,
  price_usdc      NUMERIC(36, 6) NOT NULL CHECK (price_usdc > 0),
  delivery_days   INTEGER NOT NULL CHECK (delivery_days BETWEEN 1 AND 365),
  revisions       INTEGER NOT NULL DEFAULT 1 CHECK (revisions >= 0),
  status          TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('draft','active','paused','archived')),
  tags            TEXT[] DEFAULT '{}',
  requirements    TEXT,
  portfolio_urls  TEXT[] DEFAULT '{}',
  metadata        JSONB DEFAULT '{}',
  view_count      INTEGER NOT NULL DEFAULT 0,
  order_count     INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER gigs_updated_at
  BEFORE UPDATE ON gigs
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE INDEX idx_gigs_worker_addr  ON gigs (worker_addr);
CREATE INDEX idx_gigs_status       ON gigs (status);
CREATE INDEX idx_gigs_category     ON gigs (category);
CREATE INDEX idx_gigs_price_usdc   ON gigs (price_usdc);
CREATE INDEX idx_gigs_created_at   ON gigs (created_at DESC);
CREATE INDEX idx_gigs_tags         ON gigs USING GIN (tags);
CREATE INDEX idx_gigs_status_cat   ON gigs (status, category) WHERE status = 'active';
```

**Key decisions:**
- `status` check constraint prevents invalid states at the DB layer
- `order_count` is a denormalized count — update it in the same transaction as claim creation for fast sorting
- `portfolio_urls TEXT[]` stores IPFS or external links; no separate join table needed until > 20 items per gig

---

### 3.3 Claims table

A claim links a worker to a task (or a client to a gig). Claims are the join entity with the most business logic.

```sql
CREATE TABLE claims (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id         UUID REFERENCES tasks (id) ON DELETE RESTRICT,
  gig_id          UUID REFERENCES gigs (id) ON DELETE RESTRICT,
  worker_addr     CITEXT NOT NULL CHECK (worker_addr ~* '^0x[0-9a-fA-F]{40}$'),
  client_addr     CITEXT NOT NULL CHECK (client_addr ~* '^0x[0-9a-fA-F]{40}$'),
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','active','submitted','approved','rejected','disputed','cancelled')),
  agreed_price_usdc NUMERIC(36, 6) NOT NULL CHECK (agreed_price_usdc > 0),
  deadline_at     TIMESTAMPTZ,
  note            TEXT,
  dispute_reason  TEXT,
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Enforce: a claim must reference exactly one of task_id or gig_id
  CONSTRAINT claim_has_one_target CHECK (
    (task_id IS NOT NULL AND gig_id IS NULL) OR
    (task_id IS NULL AND gig_id IS NOT NULL)
  ),
  -- Prevent worker from claiming their own gig or task
  CONSTRAINT no_self_claim CHECK (worker_addr <> client_addr)
);

CREATE TRIGGER claims_updated_at
  BEFORE UPDATE ON claims
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- Critical: index both FK columns — missing these will cause sequential scans
CREATE INDEX idx_claims_task_id     ON claims (task_id);
CREATE INDEX idx_claims_gig_id      ON claims (gig_id);
CREATE INDEX idx_claims_worker_addr ON claims (worker_addr);
CREATE INDEX idx_claims_client_addr ON claims (client_addr);
CREATE INDEX idx_claims_status      ON claims (status);
CREATE INDEX idx_claims_created_at  ON claims (created_at DESC);

-- Partial index: only one active claim per task
CREATE UNIQUE INDEX idx_claims_one_active_per_task
  ON claims (task_id)
  WHERE status IN ('pending','active','submitted') AND task_id IS NOT NULL;
```

**Key decisions:**
- The `CONSTRAINT claim_has_one_target` enforces the polymorphic relationship at the DB layer, not just in app code
- The partial unique index on `task_id` prevents race-condition double-claims at the database layer — this is the correct place to enforce it, not in a transaction with `SELECT FOR UPDATE` alone
- `ON DELETE RESTRICT` on FK prevents deleting a task that has claims — use this to protect data integrity

---

### 3.4 Submissions table

Submissions are separate from claims. A claim is the intent; a submission is the deliverable.

```sql
CREATE TABLE submissions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id        UUID NOT NULL REFERENCES claims (id) ON DELETE RESTRICT,
  worker_addr     CITEXT NOT NULL CHECK (worker_addr ~* '^0x[0-9a-fA-F]{40}$'),
  content_url     TEXT,
  content_text    TEXT,
  content_hash    CHAR(66),  -- keccak256 hash of deliverable: 0x + 64 hex chars
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','approved','rejected','disputed')),
  reviewer_note   TEXT,
  revision_number INTEGER NOT NULL DEFAULT 1 CHECK (revision_number > 0),
  submitted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER submissions_updated_at
  BEFORE UPDATE ON submissions
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE INDEX idx_submissions_claim_id    ON submissions (claim_id);
CREATE INDEX idx_submissions_worker_addr ON submissions (worker_addr);
CREATE INDEX idx_submissions_status      ON submissions (status);
CREATE INDEX idx_submissions_submitted_at ON submissions (submitted_at DESC);
```

---

### 3.5 Reputation table

Reputation is per-address. One row per address. Updated after each approved/paid claim.

```sql
CREATE TABLE reputation (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  address           CITEXT NOT NULL UNIQUE CHECK (address ~* '^0x[0-9a-fA-F]{40}$'),
  total_completed   INTEGER NOT NULL DEFAULT 0 CHECK (total_completed >= 0),
  total_disputed    INTEGER NOT NULL DEFAULT 0 CHECK (total_disputed >= 0),
  total_cancelled   INTEGER NOT NULL DEFAULT 0 CHECK (total_cancelled >= 0),
  total_earned_usdc NUMERIC(36, 6) NOT NULL DEFAULT 0 CHECK (total_earned_usdc >= 0),
  avg_rating        NUMERIC(3, 2) CHECK (avg_rating BETWEEN 0 AND 5),
  rating_count      INTEGER NOT NULL DEFAULT 0 CHECK (rating_count >= 0),
  score             INTEGER NOT NULL DEFAULT 0 CHECK (score >= 0),
  level             TEXT NOT NULL DEFAULT 'newcomer'
                      CHECK (level IN ('newcomer','builder','trusted','verified','elite')),
  badges            TEXT[] DEFAULT '{}',
  last_active_at    TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER reputation_updated_at
  BEFORE UPDATE ON reputation
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE INDEX idx_reputation_score        ON reputation (score DESC);
CREATE INDEX idx_reputation_level        ON reputation (level);
CREATE INDEX idx_reputation_last_active  ON reputation (last_active_at DESC);
CREATE INDEX idx_reputation_badges       ON reputation USING GIN (badges);
```

**Key decisions:**
- One row per address (UNIQUE constraint on `address`)
- `score` is a computed integer (e.g., `(total_completed * 10) - (total_disputed * 5)`) recalculated in the payout trigger
- Use `INSERT ... ON CONFLICT (address) DO UPDATE` (upsert) when updating reputation after a payout
- Store `avg_rating` and `rating_count` separately so you can recompute the average without loading all reviews

---

### 3.6 Ratings table

Ratings are the raw data that feeds reputation. Store them separately for auditability.

```sql
CREATE TABLE ratings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id    UUID NOT NULL REFERENCES claims (id) ON DELETE RESTRICT,
  rater_addr  CITEXT NOT NULL CHECK (rater_addr ~* '^0x[0-9a-fA-F]{40}$'),
  rated_addr  CITEXT NOT NULL CHECK (rated_addr ~* '^0x[0-9a-fA-F]{40}$'),
  score       NUMERIC(3, 2) NOT NULL CHECK (score BETWEEN 1 AND 5),
  comment     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT no_self_rating CHECK (rater_addr <> rated_addr),
  CONSTRAINT one_rating_per_claim_per_rater UNIQUE (claim_id, rater_addr)
);

CREATE INDEX idx_ratings_claim_id   ON ratings (claim_id);
CREATE INDEX idx_ratings_rated_addr ON ratings (rated_addr);
CREATE INDEX idx_ratings_rater_addr ON ratings (rater_addr);
CREATE INDEX idx_ratings_created_at ON ratings (created_at DESC);
```

---

### 3.7 Payouts table

Payouts are onchain. This table records every payment event separately from task state.

```sql
CREATE TABLE payouts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id        UUID NOT NULL REFERENCES claims (id) ON DELETE RESTRICT,
  recipient_addr  CITEXT NOT NULL CHECK (recipient_addr ~* '^0x[0-9a-fA-F]{40}$'),
  payer_addr      CITEXT NOT NULL CHECK (payer_addr ~* '^0x[0-9a-fA-F]{40}$'),
  amount_usdc     NUMERIC(36, 6) NOT NULL CHECK (amount_usdc > 0),
  token_address   CITEXT CHECK (token_address ~* '^0x[0-9a-fA-F]{40}$'),
  token_amount    NUMERIC(36, 18),
  chain_id        INTEGER NOT NULL DEFAULT 8453,  -- Base mainnet
  tx_hash         CHAR(66) UNIQUE,  -- 0x + 64 hex chars
  block_number    BIGINT,
  gas_used        BIGINT,
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','broadcast','confirmed','settled','failed','dropped')),
  failure_reason  TEXT,
  initiated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  broadcast_at    TIMESTAMPTZ,
  confirmed_at    TIMESTAMPTZ,
  settled_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER payouts_updated_at
  BEFORE UPDATE ON payouts
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE INDEX idx_payouts_claim_id       ON payouts (claim_id);
CREATE INDEX idx_payouts_recipient_addr ON payouts (recipient_addr);
CREATE INDEX idx_payouts_payer_addr     ON payouts (payer_addr);
CREATE INDEX idx_payouts_status         ON payouts (status);
CREATE INDEX idx_payouts_tx_hash        ON payouts (tx_hash) WHERE tx_hash IS NOT NULL;
CREATE INDEX idx_payouts_chain_id       ON payouts (chain_id);
CREATE INDEX idx_payouts_initiated_at   ON payouts (initiated_at DESC);
```

**Key decisions:**
- `chain_id` defaults to 8453 (Base mainnet) — enforced here, not just in app code
- `tx_hash` is UNIQUE — prevents duplicate payout records for the same transaction
- Payout status is entirely separate from task/claim status — never merge them
- `block_number` enables correlation with onchain events during dispute resolution

---

### 3.8 Notifications table

```sql
CREATE TABLE notifications (
  id          BIGSERIAL PRIMARY KEY,
  user_addr   CITEXT NOT NULL CHECK (user_addr ~* '^0x[0-9a-fA-F]{40}$'),
  type        TEXT NOT NULL,  -- e.g. 'claim_received', 'submission_approved', 'payout_settled'
  title       TEXT NOT NULL,
  body        TEXT,
  entity_type TEXT,  -- 'task', 'gig', 'claim', 'payout'
  entity_id   UUID,
  read        BOOLEAN NOT NULL DEFAULT FALSE,
  data        JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at     TIMESTAMPTZ
);

CREATE INDEX idx_notifications_user_addr   ON notifications (user_addr);
CREATE INDEX idx_notifications_read        ON notifications (user_addr, read) WHERE read = FALSE;
CREATE INDEX idx_notifications_created_at  ON notifications (created_at DESC);
CREATE INDEX idx_notifications_entity      ON notifications (entity_type, entity_id)
                                            WHERE entity_id IS NOT NULL;
```

**Key decisions:**
- `BIGSERIAL` for ordering — notifications are consumed in insertion order
- Partial index on `read = FALSE` for fast unread-count queries
- `data JSONB` holds type-specific payload (e.g., amount, task title) for rendering without joins
- `entity_type` + `entity_id` enable deep-linking to the referenced object

---

### 3.9 Audit log table

```sql
CREATE TABLE audit_log (
  id          BIGSERIAL PRIMARY KEY,
  table_name  TEXT NOT NULL,
  row_id      TEXT NOT NULL,  -- stringified UUID or integer PK
  action      TEXT NOT NULL CHECK (action IN ('INSERT','UPDATE','DELETE')),
  actor_addr  CITEXT,  -- wallet address of the person who triggered the change
  actor_type  TEXT CHECK (actor_type IN ('user','worker','system','admin')),
  old_data    JSONB,
  new_data    JSONB,
  diff        JSONB,  -- only the changed keys
  ip_address  INET,
  user_agent  TEXT,
  request_id  TEXT,  -- trace ID from API layer
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Audit log is append-only; disable UPDATE and DELETE via policy
CREATE INDEX idx_audit_log_table_row   ON audit_log (table_name, row_id);
CREATE INDEX idx_audit_log_actor_addr  ON audit_log (actor_addr);
CREATE INDEX idx_audit_log_created_at  ON audit_log (created_at DESC);
CREATE INDEX idx_audit_log_action      ON audit_log (action);
```

Populate via a generic trigger function:

```sql
CREATE OR REPLACE FUNCTION audit_log_trigger()
RETURNS TRIGGER AS $$
DECLARE
  diff_data JSONB := '{}';
  key TEXT;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Build diff: only keys that changed
    FOR key IN SELECT jsonb_object_keys(to_jsonb(NEW))
    LOOP
      IF to_jsonb(OLD) -> key IS DISTINCT FROM to_jsonb(NEW) -> key THEN
        diff_data := diff_data || jsonb_build_object(key, to_jsonb(NEW) -> key);
      END IF;
    END LOOP;
  END IF;

  INSERT INTO audit_log (table_name, row_id, action, old_data, new_data, diff, created_at)
  VALUES (
    TG_TABLE_NAME,
    CASE TG_OP WHEN 'DELETE' THEN OLD.id::TEXT ELSE NEW.id::TEXT END,
    TG_OP,
    CASE TG_OP WHEN 'INSERT' THEN NULL ELSE to_jsonb(OLD) END,
    CASE TG_OP WHEN 'DELETE' THEN NULL ELSE to_jsonb(NEW) END,
    CASE TG_OP WHEN 'UPDATE' THEN diff_data ELSE NULL END,
    NOW()
  );

  RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;

-- Attach to each important table
CREATE TRIGGER audit_tasks   AFTER INSERT OR UPDATE OR DELETE ON tasks   FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();
CREATE TRIGGER audit_claims  AFTER INSERT OR UPDATE OR DELETE ON claims  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();
CREATE TRIGGER audit_payouts AFTER INSERT OR UPDATE OR DELETE ON payouts FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();
```

---

## 4. Indexes and Query Optimization

### 4.1 Index coverage rules

Every foreign key column must have an index. PostgreSQL does not create indexes on foreign keys automatically. Missing FK indexes cause full table scans during joins and cascade checks.

```sql
-- Required pattern: if you have this FK...
task_id UUID REFERENCES tasks(id)
-- ...you MUST have this index:
CREATE INDEX idx_claims_task_id ON claims (task_id);
```

### 4.2 Composite index ordering

Put the most selective column first, or the equality column first when mixed with range columns.

```sql
-- Marketplace browse: filter by status (equality), sort by date (range)
CREATE INDEX idx_tasks_status_created ON tasks (status, created_at DESC);

-- Reputation leaderboard: filter by level, sort by score
CREATE INDEX idx_rep_level_score ON reputation (level, score DESC);
```

### 4.3 Partial indexes

Use partial indexes to reduce index size and improve write throughput when only a subset of rows is queried.

```sql
-- Only index active gigs for browse queries
CREATE INDEX idx_gigs_active_category ON gigs (category, price_usdc)
  WHERE status = 'active';

-- Only index pending payouts for the settlement worker
CREATE INDEX idx_payouts_pending ON payouts (initiated_at)
  WHERE status IN ('pending','broadcast');

-- Only index unread notifications
CREATE INDEX idx_notifications_unread ON notifications (user_addr, created_at DESC)
  WHERE read = FALSE;
```

### 4.4 GIN indexes for arrays and JSONB

```sql
-- Tag search: WHERE 'solidity' = ANY(tags)
CREATE INDEX idx_tasks_tags ON tasks USING GIN (tags);

-- JSONB containment: WHERE metadata @> '{"chain_id": 8453}'
CREATE INDEX idx_tasks_metadata ON tasks USING GIN (metadata);

-- JSONB path operator (jsonb_path_ops is smaller and faster for @> only)
CREATE INDEX idx_tasks_metadata_path ON tasks USING GIN (metadata jsonb_path_ops);
```

### 4.5 EXPLAIN ANALYZE workflow

Before deploying any new query, run:

```sql
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT t.id, t.title, t.reward_usdc, r.score
FROM tasks t
LEFT JOIN reputation r ON r.address = t.requester_addr
WHERE t.status = 'open'
  AND t.category = 'development'
ORDER BY t.created_at DESC
LIMIT 20;
```

Red flags in the output:
- `Seq Scan on tasks` when the table has > 10K rows
- `Rows Removed by Filter: 50000` — index is not selective enough
- `Loops: 1000` on a nested loop join — missing index on the inner table
- `Buffers: shared hit=0 read=50000` — data not in cache, index not helping

### 4.6 Connection pooling

Agent workers must not open a new pg connection per request. Use PgBouncer in transaction mode, or use the connection pool built into your runtime:

```typescript
// Node.js — pg pool, sized for your worker count
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,                // match PgBouncer pool size
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});
```

---

## 5. Migrations and Versioning

### 5.1 Numbered SQL migration files

Never run raw `ALTER TABLE` in a REPL. Every schema change is a numbered SQL file, committed to git, and run by a migration runner.

Directory structure:
```
db/
  migrations/
    001_initial_schema.sql
    002_add_gigs_table.sql
    003_add_reputation_badges.sql
    004_add_payouts_chain_id.sql
    005_add_notifications_data_jsonb.sql
  seed/
    001_categories.sql
  migrate.ts
```

### 5.2 Migration file format

```sql
-- db/migrations/003_add_reputation_badges.sql
-- Description: Add badges TEXT[] column to reputation table
-- Author: blue-agent
-- Date: 2026-05-14

BEGIN;

ALTER TABLE reputation
  ADD COLUMN IF NOT EXISTS badges TEXT[] DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_reputation_badges
  ON reputation USING GIN (badges);

-- Update migration version tracker
INSERT INTO schema_migrations (version, applied_at)
VALUES ('003', NOW());

COMMIT;
```

### 5.3 Migration tracker table

```sql
CREATE TABLE schema_migrations (
  version     TEXT PRIMARY KEY,
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  description TEXT
);
```

### 5.4 Migration runner (Node.js)

```typescript
// db/migrate.ts
import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { pool } from './pool';

async function migrate() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const { rows } = await pool.query(
    `SELECT version FROM schema_migrations ORDER BY version`
  );
  const applied = new Set(rows.map((r: { version: string }) => r.version));

  const migrationsDir = join(__dirname, 'migrations');
  const files = (await readdir(migrationsDir)).sort();

  for (const file of files) {
    const version = file.split('_')[0];
    if (applied.has(version)) {
      console.log(`skip ${file}`);
      continue;
    }
    console.log(`apply ${file}`);
    const sql = await readFile(join(migrationsDir, file), 'utf-8');
    await pool.query(sql);
    console.log(`done  ${file}`);
  }

  await pool.end();
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
```

Run with: `npx ts-node db/migrate.ts`

### 5.5 Migration rules

1. Never edit an already-applied migration file. Create a new one.
2. Always wrap each migration in `BEGIN; ... COMMIT;` — if it fails, nothing is applied.
3. Use `IF NOT EXISTS` / `IF EXISTS` on all `CREATE`/`DROP` statements for idempotency.
4. Long-running migrations (adding indexes on large tables) should use `CREATE INDEX CONCURRENTLY` and must not be wrapped in a transaction.
5. Test each migration on a copy of production data before deploying.

```sql
-- Safe index creation on large table (no table lock)
-- CANNOT be inside BEGIN/COMMIT block
CREATE INDEX CONCURRENTLY idx_tasks_status_new ON tasks (status, category);
```

---

## 6. Transactions and Consistency

### 6.1 Claim race prevention

When two workers try to claim the same task simultaneously, only one should succeed. Use the partial unique index from Section 3.3 as the primary enforcement, with `INSERT ... ON CONFLICT` to handle the race cleanly.

```typescript
async function claimTask(taskId: string, workerAddr: string, clientAddr: string) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Lock the task row to prevent concurrent reads seeing stale status
    const { rows: tasks } = await client.query(
      `SELECT id, status, reward_usdc FROM tasks WHERE id = $1 FOR UPDATE`,
      [taskId]
    );

    if (tasks.length === 0) throw new Error('Task not found');
    if (tasks[0].status !== 'open') throw new Error('Task is not open');

    // Insert claim — partial unique index prevents double-claim
    const { rows: claims } = await client.query(
      `INSERT INTO claims (task_id, worker_addr, client_addr, agreed_price_usdc, status)
       VALUES ($1, $2, $3, $4, 'active')
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [taskId, workerAddr, clientAddr, tasks[0].reward_usdc]
    );

    if (claims.length === 0) throw new Error('Task already claimed');

    // Update task status
    await client.query(
      `UPDATE tasks SET status = 'claimed', claimed_at = NOW() WHERE id = $1`,
      [taskId]
    );

    await client.query('COMMIT');
    return claims[0].id;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
```

### 6.2 Payout and reputation update in one transaction

When a submission is approved, the payout record is created and reputation is updated atomically. Never do these in separate HTTP calls.

```typescript
async function approveAndPay(claimId: string, txHash: string) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Get claim details
    const { rows } = await client.query(
      `SELECT c.*, t.id AS task_id, t.requester_addr
       FROM claims c
       LEFT JOIN tasks t ON t.id = c.task_id
       WHERE c.id = $1 FOR UPDATE`,
      [claimId]
    );
    if (rows.length === 0) throw new Error('Claim not found');
    const claim = rows[0];

    // Update claim status
    await client.query(
      `UPDATE claims SET status = 'approved', updated_at = NOW() WHERE id = $1`,
      [claimId]
    );

    // Update task status
    if (claim.task_id) {
      await client.query(
        `UPDATE tasks SET status = 'paid', paid_at = NOW() WHERE id = $1`,
        [claim.task_id]
      );
    }

    // Insert payout record
    await client.query(
      `INSERT INTO payouts
         (claim_id, recipient_addr, payer_addr, amount_usdc, chain_id, tx_hash, status, confirmed_at)
       VALUES ($1, $2, $3, $4, 8453, $5, 'confirmed', NOW())`,
      [claimId, claim.worker_addr, claim.client_addr, claim.agreed_price_usdc, txHash]
    );

    // Upsert reputation
    await client.query(
      `INSERT INTO reputation (address, total_completed, total_earned_usdc, last_active_at)
       VALUES ($1, 1, $2, NOW())
       ON CONFLICT (address) DO UPDATE SET
         total_completed   = reputation.total_completed + 1,
         total_earned_usdc = reputation.total_earned_usdc + EXCLUDED.total_earned_usdc,
         last_active_at    = NOW(),
         updated_at        = NOW()`,
      [claim.worker_addr, claim.agreed_price_usdc]
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
```

### 6.3 Transaction isolation levels

Use the right isolation level for the operation:

```sql
-- Default (READ COMMITTED): fine for most reads and simple writes
BEGIN;

-- REPEATABLE READ: use when you read a row and make a decision based on it
-- in the same transaction (prevents phantom reads)
BEGIN ISOLATION LEVEL REPEATABLE READ;

-- SERIALIZABLE: use for financial operations where ordering matters
-- (prevents all anomalies but has higher contention)
BEGIN ISOLATION LEVEL SERIALIZABLE;
```

For claim races and payout creation: use `REPEATABLE READ` with `SELECT ... FOR UPDATE`. For simple status reads: `READ COMMITTED` is fine.

### 6.4 Idempotency via unique constraints

Payouts must be idempotent — if the worker fires the payout twice due to a retry, the second insert must fail gracefully.

```sql
-- tx_hash UNIQUE ensures no double-insert
INSERT INTO payouts (claim_id, recipient_addr, payer_addr, amount_usdc, tx_hash, status)
VALUES ($1, $2, $3, $4, $5, 'confirmed')
ON CONFLICT (tx_hash) DO NOTHING;
```

---

## 7. Audit Logs

### 7.1 Why audit logs matter for agent marketplaces

Agent marketplaces handle real money and reputation. When a dispute arises — "I submitted my work but didn't get paid" — you need a complete reconstruction of every state transition. The audit log is that reconstruction.

The audit log must be:
- **Append-only**: never update or delete rows
- **Comprehensive**: every INSERT/UPDATE/DELETE on financial tables
- **Timestamped**: to the microsecond
- **Attributed**: who made the change (wallet address, system process)

### 7.2 Protecting the audit log

Apply a row security policy to prevent any role (including the app's own DB user) from deleting or updating audit rows:

```sql
-- Create a dedicated read-only audit role
CREATE ROLE audit_reader;
GRANT SELECT ON audit_log TO audit_reader;

-- Revoke DELETE and UPDATE from application role
REVOKE DELETE, UPDATE ON audit_log FROM app_user;

-- Optional: RLS policy (requires superuser to bypass)
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY audit_insert_only ON audit_log
  AS RESTRICTIVE
  FOR ALL
  USING (TRUE)
  WITH CHECK (TRUE);
```

### 7.3 Querying audit history for a specific task

```sql
-- Full history of a task
SELECT
  created_at,
  action,
  actor_addr,
  old_data ->> 'status'  AS old_status,
  new_data ->> 'status'  AS new_status,
  diff
FROM audit_log
WHERE table_name = 'tasks'
  AND row_id = '550e8400-e29b-41d4-a716-446655440000'
ORDER BY created_at ASC;
```

### 7.4 Actor attribution from the API layer

Pass the wallet address and request ID from the API layer into the PostgreSQL session so triggers can capture them:

```typescript
// In your API middleware, before every DB operation:
await client.query(`
  SELECT set_config('app.actor_addr', $1, TRUE),
         set_config('app.request_id', $2, TRUE)
`, [walletAddress, requestId]);
```

Then in the audit trigger function:
```sql
-- Inside audit_log_trigger(), read session config:
actor_addr  = current_setting('app.actor_addr', TRUE),
request_id  = current_setting('app.request_id', TRUE)
```

---

## 8. JSON to SQL Migration Path

### 8.1 Current JSON file layout

Blue Agent stores state in `~/.blue-agent/*.json`. A typical task file looks like:

```json
{
  "id": "task-abc123",
  "title": "Write a Solidity token contract",
  "status": "claimed",
  "reward": "5.00",
  "claimedBy": "0xabc...def",
  "claimedAt": "2026-05-10T14:22:00Z",
  "tags": ["solidity", "erc20", "base"],
  "meta": {
    "chainId": 8453,
    "priority": "high"
  }
}
```

### 8.2 Migration script (Node.js: JSON → INSERT)

```typescript
// db/seed/migrate-json-tasks.ts
import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import { pool } from '../pool';

interface JsonTask {
  id: string;
  title: string;
  description?: string;
  status: string;
  reward: string;
  requesterAddr?: string;
  claimedBy?: string;
  claimedAt?: string;
  tags?: string[];
  meta?: Record<string, unknown>;
  createdAt?: string;
}

async function migrateJsonTasks() {
  const dir = join(homedir(), '.blue-agent');
  const files = (await readdir(dir)).filter(f => f.endsWith('.json'));

  let imported = 0;
  let skipped = 0;

  for (const file of files) {
    const raw = await readFile(join(dir, file), 'utf-8');
    let data: JsonTask;
    try {
      data = JSON.parse(raw);
    } catch {
      console.warn(`skip ${file}: invalid JSON`);
      skipped++;
      continue;
    }

    // Normalize status from JSON convention to DB enum
    const statusMap: Record<string, string> = {
      'open': 'open',
      'claimed': 'claimed',
      'done': 'approved',
      'paid': 'paid',
      'cancelled': 'expired',
    };
    const status = statusMap[data.status] ?? 'open';

    // Parse reward — strip currency symbols, convert to NUMERIC
    const rewardUsdc = parseFloat((data.reward ?? '0').replace(/[^0-9.]/g, ''));

    try {
      await pool.query(
        `INSERT INTO tasks (
           title, description, category, requester_addr,
           reward_usdc, status, tags, metadata,
           created_at, claimed_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT DO NOTHING`,
        [
          data.title,
          data.description ?? '',
          (data.meta?.category as string) ?? 'general',
          data.requesterAddr ?? '0x0000000000000000000000000000000000000000',
          rewardUsdc,
          status,
          data.tags ?? [],
          JSON.stringify(data.meta ?? {}),
          data.createdAt ? new Date(data.createdAt) : new Date(),
          data.claimedAt ? new Date(data.claimedAt) : null,
        ]
      );
      imported++;
    } catch (err) {
      console.error(`failed ${file}:`, (err as Error).message);
      skipped++;
    }
  }

  console.log(`Migration complete: ${imported} imported, ${skipped} skipped`);
  await pool.end();
}

migrateJsonTasks().catch(console.error);
```

### 8.3 Migration checklist

Before running the migration:
- [ ] Back up the JSON files: `cp -r ~/.blue-agent ~/.blue-agent.bak`
- [ ] Run migration on a test DB first
- [ ] Validate row counts match file counts
- [ ] Check for NULL requester_addr rows after migration (means JSON had no address)
- [ ] Verify no duplicate IDs imported
- [ ] Run `blue validate --db` after migration to confirm schema health

After migration:
- [ ] Keep JSON files as archive — do not delete for 30 days
- [ ] Switch all read/write paths to DB
- [ ] Confirm `blue chat` and `blue build` can query the new DB

---

## 9. API and Worker Alignment with DB Tables

### 9.1 API route to table mapping

Every API route should map to exactly one primary table. Avoid routes that write to more than two tables unless they are explicitly transaction-wrapped.

```
GET    /tasks                  → SELECT FROM tasks WHERE status='open'
POST   /tasks                  → INSERT INTO tasks
GET    /tasks/:id              → SELECT FROM tasks + LEFT JOIN claims
POST   /tasks/:id/claim        → BEGIN; INSERT claims; UPDATE tasks; COMMIT
POST   /tasks/:id/submit       → BEGIN; INSERT submissions; UPDATE claims; COMMIT
POST   /tasks/:id/approve      → BEGIN; UPDATE claims; UPDATE tasks; INSERT payouts; UPSERT reputation; COMMIT

GET    /gigs                   → SELECT FROM gigs WHERE status='active'
POST   /gigs                   → INSERT INTO gigs
GET    /gigs/:id               → SELECT FROM gigs + reputation JOIN

GET    /profile/:addr          → SELECT FROM reputation + recent claims + ratings
GET    /profile/:addr/history  → SELECT FROM claims + submissions JOIN

GET    /notifications          → SELECT FROM notifications WHERE user_addr=? AND read=false
PATCH  /notifications/:id/read → UPDATE notifications SET read=true
```

### 9.2 Worker process to table mapping

Background workers must only touch their designated tables:

```
payout-worker       → reads payouts WHERE status='pending'
                      writes payouts (status, tx_hash, block_number)
                      writes notifications (payout confirmed)
                      NEVER touches tasks or claims directly

expire-worker       → reads tasks WHERE status='open' AND expires_at < NOW()
                      writes tasks (status='expired')
                      writes notifications (task expired)

reputation-worker   → reads ratings (new unprocessed)
                      writes reputation (recalculate score, level)
                      NEVER touches payouts

dispute-worker      → reads claims WHERE status='disputed'
                      writes claims, tasks, payouts depending on resolution
```

Workers should use advisory locks to prevent two instances running the same job:

```sql
-- Acquire advisory lock before processing payout job
SELECT pg_try_advisory_xact_lock(hashtext('payout-worker-' || id::text))
FROM payouts
WHERE status = 'pending'
LIMIT 1;
```

### 9.3 Example: marketplace browse query

```sql
-- Browse open tasks with requester reputation and tag filter
SELECT
  t.id,
  t.title,
  t.category,
  t.reward_usdc,
  t.tags,
  t.expires_at,
  t.created_at,
  COALESCE(r.score, 0)            AS requester_score,
  COALESCE(r.level, 'newcomer')   AS requester_level,
  COALESCE(r.total_completed, 0)  AS requester_jobs_done
FROM tasks t
LEFT JOIN reputation r ON r.address = t.requester_addr
WHERE t.status = 'open'
  AND ($1::text IS NULL OR t.category = $1)
  AND ($2::text[] IS NULL OR t.tags && $2::text[])
  AND (t.expires_at IS NULL OR t.expires_at > NOW())
ORDER BY t.created_at DESC
LIMIT $3 OFFSET $4;
```

### 9.4 Example: reputation profile query

```sql
-- Full reputation profile for a wallet address
WITH recent_work AS (
  SELECT
    c.id,
    c.status,
    c.agreed_price_usdc,
    COALESCE(t.title, g.title)    AS title,
    COALESCE(t.category, g.category) AS category,
    c.created_at
  FROM claims c
  LEFT JOIN tasks t ON t.id = c.task_id
  LEFT JOIN gigs  g ON g.id = c.gig_id
  WHERE c.worker_addr = $1
  ORDER BY c.created_at DESC
  LIMIT 10
),
recent_ratings AS (
  SELECT score, comment, rater_addr, created_at
  FROM ratings
  WHERE rated_addr = $1
  ORDER BY created_at DESC
  LIMIT 5
)
SELECT
  r.*,
  (SELECT json_agg(w) FROM recent_work w)    AS recent_work,
  (SELECT json_agg(rt) FROM recent_ratings rt) AS recent_ratings
FROM reputation r
WHERE r.address = $1;
```

---

## 10. Tradeoffs and Best Practices

### 10.1 JSONB vs columns

Use JSONB for:
- Fields where the schema is genuinely unknown at design time (user-supplied metadata, onchain event payloads)
- Optional fields that apply to fewer than 30% of rows
- Configuration blobs that are read/written as a unit and never filtered on individually

Use typed columns for:
- Any field you `WHERE`, `ORDER BY`, `GROUP BY`, or `JOIN` on
- Any field you aggregate (`SUM`, `COUNT`, `AVG`)
- Any field you display individually in a list view
- Timestamps, amounts, addresses, statuses — always typed columns

Decision table:
```
Field                              Use column?   Use JSONB?
------------------------------------------------------
task.status                        YES           NO
task.reward_usdc                   YES           NO
task.tags (array of strings)       YES (TEXT[])  NO
task.metadata.chainId              NO            YES (metadata JSONB)
task.metadata.priority             NO            YES (metadata JSONB)
task.metadata.customField_007      NO            YES (metadata JSONB)
claim.agreed_price_usdc            YES           NO
claim.note (free text)             YES (TEXT)    NO
payout.tx_hash                     YES           NO
payout.onchain_receipt (full blob) NO            YES
```

### 10.2 Soft delete vs hard delete

For marketplace data, never hard-delete. Use a `deleted_at TIMESTAMPTZ` column and filter it in all queries.

```sql
ALTER TABLE tasks ADD COLUMN deleted_at TIMESTAMPTZ;
CREATE INDEX idx_tasks_not_deleted ON tasks (status) WHERE deleted_at IS NULL;

-- All standard queries add:
WHERE deleted_at IS NULL
```

Hard delete removes audit trail and breaks FK integrity checks. Use it only for GDPR erasure requests, and even then: pseudonymize the address rather than deleting the row.

### 10.3 Denormalization decisions

Denormalize when the read pattern is very hot and the source data changes infrequently:

```
reputation.total_completed   — denormalized count; source is claims
reputation.avg_rating        — denormalized avg; source is ratings
gigs.order_count             — denormalized count; source is claims
tasks.updated_at             — denormalized; set by trigger
```

Always update denormalized fields in the same transaction as the source event. If a transaction fails and rolls back, the denormalized field is never updated.

### 10.4 Pagination

Never use `OFFSET` for large datasets. OFFSET is O(n) — it reads and discards all preceding rows. Use cursor-based pagination instead.

```sql
-- Cursor pagination: caller passes last seen (created_at, id)
SELECT id, title, reward_usdc, created_at
FROM tasks
WHERE status = 'open'
  AND (created_at, id) < ($1::timestamptz, $2::uuid)
ORDER BY created_at DESC, id DESC
LIMIT 20;
```

For the first page, omit the `WHERE (created_at, id) < ...` clause.

---

## 11. Common Mistakes and Red Flags

### 11.1 No indexes on foreign keys

**Mistake:**
```sql
CREATE TABLE claims (
  task_id UUID REFERENCES tasks(id)
  -- No index on task_id
);
```

**What happens:** Every `SELECT FROM tasks JOIN claims ON claims.task_id = tasks.id` causes a sequential scan of the entire claims table.

**Fix:** Every FK column gets an index. Non-negotiable. Run this query to find missing FK indexes in your database:

```sql
SELECT
  tc.table_name,
  kcu.column_name,
  tc.constraint_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND NOT EXISTS (
    SELECT 1 FROM pg_index i
    JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
    WHERE i.indrelid = (tc.table_name)::regclass
      AND a.attname = kcu.column_name
  );
```

---

### 11.2 Storing everything as JSONB too early

**Mistake:**
```sql
CREATE TABLE tasks (
  id   UUID PRIMARY KEY,
  data JSONB NOT NULL  -- everything in here
);
```

**What happens:** Every query requires a JSONB extraction. You can't index individual fields efficiently. `WHERE data->>'status' = 'open'` cannot use a B-tree index — only a GIN index on the full column, which is slower and larger. Aggregations (`SUM(data->>'reward_usdc'::numeric)`) are slow and require casting.

**Fix:** Start with typed columns for all known fields. Add a `metadata JSONB` column for the unknown remainder. Migrate JSONB to columns when you find yourself querying a JSONB field more than twice a week.

---

### 11.3 Missing foreign keys

**Mistake:**
```sql
CREATE TABLE claims (
  task_id UUID NOT NULL  -- no REFERENCES constraint
);
```

**What happens:** The DB allows claims to reference nonexistent tasks. You get orphaned records, broken joins, and confusing API responses.

**Fix:** Always declare FK constraints. If you're on a shared DB and worried about cascade behavior, use `ON DELETE RESTRICT` (the default) — it prevents deleting referenced rows without explicitly resolving the children first.

---

### 11.4 Not tracking timestamps

**Mistake:**
```sql
CREATE TABLE tasks (
  id     UUID PRIMARY KEY,
  title  TEXT,
  status TEXT
  -- No created_at, updated_at
);
```

**What happens:** You cannot sort by creation time. You cannot tell when a task changed status. You cannot debug "why did this go wrong" without the timestamps. You cannot build a feed or activity log.

**Fix:** Every table gets `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()` and `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`. Add the `touch_updated_at` trigger. This is non-negotiable.

---

### 11.5 Mixing task state and payout state in the same table

**Mistake:**
```sql
CREATE TABLE tasks (
  status       TEXT,  -- 'open', 'claimed', 'done', 'paid'
  tx_hash      TEXT,  -- payout tx hash stored here
  payout_status TEXT  -- 'pending', 'confirmed', 'failed'
);
```

**What happens:** Task completion and payment are different events with different failure modes. A task can be approved but payment can fail. A payment can be broadcast but not yet confirmed. Putting both lifecycles in one table creates impossible state combinations (`status='open'` but `payout_status='confirmed'`?).

**Fix:** Task state lives in `tasks.status`. Payout state lives in `payouts.status`. They are linked via `claims`. Update them in the same transaction but keep them in separate tables.

---

### 11.6 Using application-level UUIDs for ordering

**Mistake:**
```sql
-- Sorting by UUID as if it were time-ordered
SELECT * FROM tasks ORDER BY id DESC;
```

**What happens:** UUIDs generated by `gen_random_uuid()` are random — they have no time ordering. Sorting by them gives an arbitrary order that changes between queries.

**Fix:** Always sort by `created_at DESC, id DESC` for stable pagination. Use `created_at` as the primary sort key.

---

### 11.7 Unbounded LIMIT queries in workers

**Mistake:**
```typescript
// Fetch ALL pending payouts every 10 seconds
const { rows } = await pool.query(`SELECT * FROM payouts WHERE status='pending'`);
```

**What happens:** As the queue grows, this query gets slower and transfers more data. Eventually it times out or OOMs.

**Fix:** Always use `LIMIT` in worker queries. Process in batches:

```sql
SELECT id, claim_id, recipient_addr, amount_usdc
FROM payouts
WHERE status = 'pending'
  AND initiated_at < NOW() - INTERVAL '30 seconds'
ORDER BY initiated_at ASC
LIMIT 50
FOR UPDATE SKIP LOCKED;  -- prevents other workers from processing the same rows
```

---

### 11.8 Forgetting to release connections

**Mistake:**
```typescript
async function doWork() {
  const client = await pool.connect();
  await client.query('BEGIN');
  const result = await riskyOperation(); // throws
  await client.query('COMMIT');
  client.release(); // never reached
}
```

**What happens:** The connection is never returned to the pool. After enough calls, the pool is exhausted and all queries hang.

**Fix:** Always use `try/finally`:
```typescript
const client = await pool.connect();
try {
  await client.query('BEGIN');
  // ...
  await client.query('COMMIT');
} catch (err) {
  await client.query('ROLLBACK');
  throw err;
} finally {
  client.release(); // always runs
}
```

---

## 12. Blue Agent CLI Integration Patterns

### 12.1 `blue validate --db`

Runs a series of schema health checks against the connected PostgreSQL database. This command is safe to run in any environment — it only reads, never writes.

```bash
blue validate --db
blue validate --db --connection postgres://user:pass@localhost/blueagent
blue validate --db --strict  # fail on warnings too
```

Checks performed:
1. All tables in the expected list exist
2. All required columns are present with correct types
3. All FK columns have indexes
4. All timestamp columns (`created_at`, `updated_at`) are present
5. No orphaned claims (claims with no matching task or gig)
6. No payouts with status='settled' missing a tx_hash
7. Reputation rows exist for all active worker addresses
8. No tasks in status='paid' without a corresponding confirmed payout

Example output:
```
blue validate --db
Connecting to postgres://localhost/blueagent...
[PASS] tables: tasks, gigs, claims, submissions, payouts, reputation, notifications, audit_log
[PASS] foreign key indexes: all 8 FK columns have indexes
[WARN] tasks: 3 rows with status='claimed' but no matching active claim
[FAIL] payouts: 1 row with status='settled' and tx_hash IS NULL
[PASS] reputation: 142 active addresses have reputation rows
Schema health: 1 failure, 1 warning. Run with --fix to attempt auto-repair.
```

### 12.2 `blue build --category infra --db postgres`

When a user runs `blue build` with the `infra` category and `postgres` DB flag, the command generates:

1. A complete `db/migrations/` directory with numbered SQL files
2. A `db/pool.ts` connection pool module
3. A `db/migrate.ts` runner script
4. Environment variable stubs for `DATABASE_URL`
5. A `db/seed/` directory with category and tag seed data
6. A `package.json` dependency addition for `pg` and `@types/pg`

```bash
blue build --category infra --db postgres
blue build --category marketplace --db postgres --with-audit-log
blue build --category infra --db postgres --output ./backend/db
```

Generated output structure:
```
db/
  migrations/
    001_initial_schema.sql
    002_indexes.sql
    003_audit_log.sql
  pool.ts
  migrate.ts
  seed/
    001_categories.sql
```

### 12.3 `blue audit --check schema-consistency`

Audits the schema for consistency issues that are security or correctness risks.

```bash
blue audit --check schema-consistency
blue audit --check schema-consistency --schema-dir ./db/migrations
blue audit --check schema-consistency --report json > audit-report.json
```

Checks performed:
1. Status columns have CHECK constraints (not just application-level validation)
2. Amount columns are NUMERIC, not FLOAT or TEXT
3. Address columns have format CHECK constraints
4. `chain_id` columns default to 8453 (Base)
5. All tables have `created_at` and `updated_at`
6. `updated_at` columns have triggers
7. No `TEXT DEFAULT ''` on address columns (masked NULL problem)
8. `payouts.tx_hash` is UNIQUE
9. No tables without primary keys
10. Audit log triggers are attached to all financial tables

Example output:
```
blue audit --check schema-consistency
[PASS] tasks: status CHECK constraint present
[PASS] tasks: reward_usdc is NUMERIC(36,6)
[FAIL] payouts: chain_id column missing DEFAULT 8453
[PASS] payouts: tx_hash is UNIQUE
[FAIL] claims: updated_at trigger not found
[PASS] audit_log: triggers attached to tasks, claims, payouts
Schema audit: 2 failures. Fix before deploying.
```

### 12.4 `blue chat` — inline DB context

When a user is chatting with Blue Agent about their marketplace and asks data questions, the agent can pull live schema context:

```bash
# User says: "How many open tasks are there and what categories?"
blue chat --db-context

# Agent runs internally:
# SELECT category, COUNT(*) FROM tasks WHERE status='open' GROUP BY category ORDER BY count DESC;
# ...and includes the result in the response
```

The `--db-context` flag enables read-only SQL introspection during chat. The agent never executes writes during chat sessions.

### 12.5 Environment configuration

Blue Agent CLI reads DB config from environment or `.blue-agent/config.json`:

```bash
# Environment variable (preferred)
export DATABASE_URL="postgres://user:password@localhost:5432/blueagent"

# Or in .blue-agent/config.json:
{
  "db": {
    "url": "postgres://user:password@localhost:5432/blueagent",
    "pool_size": 10,
    "ssl": true
  }
}
```

Run `blue validate --db` after setting config to confirm connectivity before running any `blue build` or `blue audit` commands.

---

## 13. Resources and References

### PostgreSQL documentation
- Row-level locking: https://www.postgresql.org/docs/current/explicit-locking.html
- JSONB operators: https://www.postgresql.org/docs/current/functions-json.html
- GIN indexes: https://www.postgresql.org/docs/current/gin.html
- Transaction isolation: https://www.postgresql.org/docs/current/transaction-iso.html
- `SKIP LOCKED` (worker queue pattern): https://www.postgresql.org/docs/current/sql-select.html

### Base / EVM context
- Base chain ID: 8453
- USDC on Base: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` (verified on Basescan)
- All onchain references in payout tables should use Base chain ID 8453

### Schema tooling
- `node-postgres` (pg): https://node-postgres.com
- `pg-boss` (job queue backed by PostgreSQL): https://github.com/timgit/pg-boss — recommended for the payout-worker and expire-worker patterns
- `dbmate` (migration runner, alternative to the custom runner in Section 5.4): https://github.com/amacneil/dbmate
- `pgcli` (better psql REPL with autocomplete): https://www.pgcli.com

### Blue Agent commands that use this skill
- `blue build --category infra --db postgres` — generates full DB scaffold
- `blue build --category marketplace` — generates API routes aligned to the table map in Section 9.1
- `blue audit --check schema-consistency` — validates schema health
- `blue validate --db` — runtime schema health check
- `blue chat --db-context` — live schema introspection during conversation
