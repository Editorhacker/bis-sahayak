-- ─────────────────────────────────────────────────────────────────────────────
-- BIS SAHAYAK – Full Database Schema
-- Generated from server/src/db/schema.ts
-- Run with: docker compose exec postgres psql -U postgres -d business_saarthi -f /tmp/init-schema.sql
-- ─────────────────────────────────────────────────────────────────────────────

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";

-- ── Enums ─────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('USER', 'ADMIN');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE status AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'NOT_APPLICABLE', 'NEEDS_VERIFICATION');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE priority AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE confidence AS ENUM ('HIGH', 'MEDIUM', 'LOW', 'INSUFFICIENT_EVIDENCE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE business_type AS ENUM ('manufacturing', 'trading', 'online_seller', 'service');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE business_structure AS ENUM ('proprietorship', 'partnership', 'llp', 'private_limited', 'not_decided');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE premises_type AS ENUM ('home', 'shop', 'factory_unit', 'warehouse');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE applicability AS ENUM ('REQUIRED', 'CONDITIONAL', 'VERIFY');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE doc_type AS ENUM ('standard', 'scheme', 'faq', 'guideline', 'notice');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE standard_status AS ENUM ('active', 'withdrawn', 'superseded');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE scheme AS ENUM ('ISI', 'CRS', 'HALLMARKING');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Tables ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT,
  email       TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role        user_role NOT NULL DEFAULT 'USER',
  preferred_language TEXT NOT NULL DEFAULT 'en',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS businesses (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id),
  business_name     TEXT,
  business_type     business_type,
  structure         business_structure,
  state             TEXT,
  city              TEXT,
  premises_type     premises_type,
  employee_count    INTEGER,
  expected_turnover NUMERIC,
  profile_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS businesses_user_idx ON businesses(user_id);

CREATE TABLE IF NOT EXISTS products (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id),
  name        TEXT NOT NULL,
  description TEXT,
  category    TEXT,
  material    TEXT,
  usage       TEXT,
  attributes  JSONB
);
CREATE INDEX IF NOT EXISTS products_business_idx ON products(business_id);

CREATE TABLE IF NOT EXISTS documents (
  id              SERIAL PRIMARY KEY,
  title           TEXT NOT NULL,
  doc_type        doc_type NOT NULL,
  authority       TEXT,
  standard_number TEXT,
  source_url      TEXT,
  storage_path    TEXT,
  version         TEXT,
  published_date  DATE,
  last_verified_at DATE,
  checksum        TEXT,
  licence_note    TEXT
);
CREATE INDEX IF NOT EXISTS documents_standard_idx ON documents(standard_number);
CREATE INDEX IF NOT EXISTS documents_type_idx ON documents(doc_type);

CREATE TABLE IF NOT EXISTS chunks (
  id          SERIAL PRIMARY KEY,
  document_id INTEGER NOT NULL REFERENCES documents(id),
  section     TEXT,
  clause      TEXT,
  page        INTEGER,
  content     TEXT NOT NULL,
  metadata    JSONB,
  tsv         TSVECTOR GENERATED ALWAYS AS (to_tsvector('simple', content)) STORED,
  embedding   vector(768)
);
CREATE INDEX IF NOT EXISTS chunks_document_idx ON chunks(document_id);
CREATE INDEX IF NOT EXISTS chunks_tsv_idx ON chunks USING gin(tsv);
CREATE INDEX IF NOT EXISTS chunks_vec_idx ON chunks USING hnsw(embedding vector_cosine_ops);

CREATE TABLE IF NOT EXISTS standards (
  id              SERIAL PRIMARY KEY,
  standard_number TEXT UNIQUE NOT NULL,
  title           TEXT,
  scope           TEXT,
  status          standard_status,
  ics_code        TEXT,
  product_tags    TEXT[],
  source_url      TEXT,
  last_verified_at DATE
);
CREATE INDEX IF NOT EXISTS standards_number_idx ON standards(standard_number);
CREATE INDEX IF NOT EXISTS standards_tags_idx ON standards USING gin(product_tags);

CREATE TABLE IF NOT EXISTS requirements (
  id                 TEXT PRIMARY KEY,
  title              TEXT NOT NULL,
  category           TEXT NOT NULL,
  phase              TEXT NOT NULL,
  authority          TEXT NOT NULL,
  description        TEXT,
  procedure_steps    JSONB,
  documents_required TEXT[],
  apply_url          TEXT,
  status_url         TEXT,
  source_url         TEXT NOT NULL,
  source_quote       TEXT,
  last_verified_at   DATE NOT NULL,
  priority           priority NOT NULL DEFAULT 'MEDIUM'
);

CREATE TABLE IF NOT EXISTS applicability_rules (
  requirement_id TEXT NOT NULL REFERENCES requirements(id),
  conditions     JSONB NOT NULL,
  applicability  applicability NOT NULL DEFAULT 'REQUIRED',
  PRIMARY KEY (requirement_id)
);

CREATE TABLE IF NOT EXISTS requirement_deps (
  requirement_id TEXT NOT NULL REFERENCES requirements(id),
  depends_on     TEXT NOT NULL REFERENCES requirements(id),
  PRIMARY KEY (requirement_id, depends_on)
);

CREATE TABLE IF NOT EXISTS fees (
  id             SERIAL PRIMARY KEY,
  requirement_id TEXT NOT NULL REFERENCES requirements(id),
  amount         NUMERIC,
  currency       TEXT NOT NULL DEFAULT 'INR',
  condition      JSONB,
  note           TEXT,
  source_url     TEXT NOT NULL,
  last_verified_at DATE NOT NULL
);
CREATE INDEX IF NOT EXISTS fees_requirement_idx ON fees(requirement_id);

CREATE TABLE IF NOT EXISTS tax_rules (
  id              SERIAL PRIMARY KEY,
  level           TEXT NOT NULL,
  state           TEXT,
  tax_name        TEXT NOT NULL,
  applies_when    JSONB NOT NULL,
  rate_or_note    TEXT NOT NULL,
  threshold       JSONB,
  source_url      TEXT NOT NULL,
  last_verified_at DATE NOT NULL
);

CREATE TABLE IF NOT EXISTS labs (
  id              SERIAL PRIMARY KEY,
  name            TEXT NOT NULL,
  state           TEXT,
  city            TEXT,
  capabilities    TEXT[],
  contact         JSONB,
  source_url      TEXT,
  last_verified_at DATE
);
CREATE INDEX IF NOT EXISTS labs_state_idx ON labs(state);
CREATE INDEX IF NOT EXISTS labs_city_idx ON labs(city);

CREATE TABLE IF NOT EXISTS scheme_rules (
  id               SERIAL PRIMARY KEY,
  product_category TEXT NOT NULL,
  scheme           scheme NOT NULL,
  mandatory        BOOLEAN NOT NULL,
  basis            TEXT,
  source_url       TEXT NOT NULL,
  last_verified_at DATE NOT NULL
);
CREATE INDEX IF NOT EXISTS scheme_rules_category_idx ON scheme_rules(product_category);

CREATE TABLE IF NOT EXISTS roadmaps (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id),
  version     INTEGER NOT NULL DEFAULT 1,
  progress    NUMERIC NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS roadmaps_business_idx ON roadmaps(business_id);

CREATE TABLE IF NOT EXISTS conversations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id),
  business_id UUID REFERENCES businesses(id),
  language    TEXT NOT NULL DEFAULT 'en',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS conversations_user_idx ON conversations(user_id);
CREATE INDEX IF NOT EXISTS conversations_business_idx ON conversations(business_id);

CREATE TABLE IF NOT EXISTS messages (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id      UUID NOT NULL REFERENCES conversations(id),
  role                 TEXT NOT NULL,
  content              TEXT NOT NULL,
  intent               TEXT,
  detected_language    TEXT,
  normalized_query     TEXT,
  retrieved_chunk_ids  INTEGER[],
  confidence           confidence NOT NULL DEFAULT 'LOW',
  validated            BOOLEAN NOT NULL DEFAULT FALSE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS messages_conversation_idx ON messages(conversation_id);

CREATE TABLE IF NOT EXISTS roadmap_steps (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  roadmap_id     UUID NOT NULL REFERENCES roadmaps(id),
  requirement_id TEXT REFERENCES requirements(id),
  step_order     INTEGER NOT NULL,
  phase          TEXT NOT NULL,
  title          TEXT NOT NULL,
  reason         TEXT,
  status         status NOT NULL DEFAULT 'NOT_STARTED',
  priority       priority NOT NULL DEFAULT 'MEDIUM',
  confidence     confidence NOT NULL DEFAULT 'LOW',
  depends_on     UUID[],
  payload        JSONB
);
CREATE INDEX IF NOT EXISTS roadmap_steps_roadmap_idx ON roadmap_steps(roadmap_id);
CREATE INDEX IF NOT EXISTS roadmap_steps_order_idx ON roadmap_steps(step_order);

CREATE TABLE IF NOT EXISTS citations (
  id              SERIAL PRIMARY KEY,
  roadmap_step_id UUID REFERENCES roadmap_steps(id),
  message_id      UUID REFERENCES messages(id),
  chunk_id        INTEGER REFERENCES chunks(id),
  requirement_id  TEXT REFERENCES requirements(id),
  excerpt         TEXT,
  source_url      TEXT
);

CREATE TABLE IF NOT EXISTS applications (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id      UUID NOT NULL REFERENCES businesses(id),
  requirement_id   TEXT REFERENCES requirements(id),
  reference_number TEXT,
  submitted_on     DATE,
  status           TEXT,
  notes            TEXT,
  reminder_date    DATE
);
CREATE INDEX IF NOT EXISTS applications_business_idx ON applications(business_id);
CREATE INDEX IF NOT EXISTS applications_requirement_idx ON applications(requirement_id);

CREATE TABLE IF NOT EXISTS feedback (
  id         SERIAL PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES users(id),
  message_id UUID NOT NULL REFERENCES messages(id),
  rating     INTEGER NOT NULL,
  reason     TEXT,
  comment    TEXT
);
CREATE INDEX IF NOT EXISTS feedback_user_idx ON feedback(user_id);
CREATE INDEX IF NOT EXISTS feedback_message_idx ON feedback(message_id);

-- Done
SELECT 'Schema created successfully' AS result;
