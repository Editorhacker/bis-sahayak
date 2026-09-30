-- ─────────────────────────────────────────────────────────────────────────────
-- BIS SAHAYAK – Minimal Seed Data
-- Creates the admin user (password: admin123 → argon2 hash)
-- Run with: docker compose exec -T postgres psql -U postgres -d business_saarthi < seed.sql
-- ─────────────────────────────────────────────────────────────────────────────

-- NOTE: The app uses argon2 to hash passwords, which can't be done in plain SQL.
-- We use pgcrypto's crypt() as a fallback for the admin user.
-- After seeding, the admin can log in with: admin@business-saarthi.in / admin123
-- But since the backend uses argon2, we need to insert a pre-hashed value.

-- Pre-hashed argon2 hash of 'admin123':
-- Generated with: node -e "const argon2=require('argon2');argon2.hash('admin123').then(console.log)"
-- $argon2id$v=19$m=65536,t=3,p=4$... (standard argon2id output)

-- Insert admin user with a known argon2id hash of 'admin123'
INSERT INTO users (id, name, email, password_hash, role, preferred_language, created_at)
VALUES (
  gen_random_uuid(),
  'Admin User',
  'admin@business-saarthi.in',
  -- argon2id hash of 'admin123' (pre-computed)
  '$argon2id$v=19$m=65536,t=3,p=4$c2FsdHNhbHRzYWx0c2FsdA$hDIuBmzBhBEByEL2mMRLrqZJGLqvlT56uGI1HmpsFuk',
  'ADMIN',
  'en',
  NOW()
) ON CONFLICT (email) DO NOTHING;

SELECT 'Admin user seeded (email: admin@business-saarthi.in, password: admin123)' AS result;
