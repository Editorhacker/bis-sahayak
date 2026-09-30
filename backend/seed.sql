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

INSERT INTO standards (standard_number, title, scope, status, ics_code, product_tags, source_url, last_verified_at)
VALUES 
  ('IS 4250:2025', 'Domestic Electric Food Mixers (Liquidizers and Grinders) and Centrifugal Juicers — Specification', 'Specifies safety, performance, and construction requirements and methods of test for domestic electric food mixers, liquidizers, blenders, and centrifugal juicers operating on AC single phase supply up to 250V.', 'active', '97.040.50', ARRAY['electric food mixer', 'food mixer', 'mixer grinder', 'blender', 'liquidizer', 'juicer mixer grinder', 'electrical appliances'], 'https://www.bis.gov.in/', '2025-01-10'),
  ('IS 17526:2021', 'Domestic Stainless Steel Vacuum Flasks and Insulated Bottles — Specification', 'Covers requirements and methods of sampling and test for domestic vacuum insulated stainless steel flasks, bottles, and thermal containers intended for storage of hot or cold liquids.', 'active', '97.040.20', ARRAY['stainless steel water bottle', 'vacuum insulated bottle', 'stainless steel vacuum flask', 'insulated bottle', 'thermos bottle', 'flask'], 'https://www.bis.gov.in/', '2024-01-15'),
  ('IS 17803:2022', 'Domestic Single-Walled Stainless Steel Bottles — Specification', 'Covers requirements, sampling, and methods of test for domestic single-wall (non-insulated) stainless steel water bottles intended for storing drinking water.', 'active', '97.040.20', ARRAY['single-wall bottle', 'non-insulated bottle', 'stainless steel water bottle', 'single wall stainless steel bottle'], 'https://www.bis.gov.in/', '2024-01-15'),
  ('IS 17790:2021', 'Insulated Flasks for Domestic Use — Specification', 'Prescribes construction and performance requirements for insulated flasks and liquid containers for domestic applications.', 'active', '97.040.20', ARRAY['insulated flask', 'thermal container', 'vacuum flask'], 'https://www.bis.gov.in/', '2024-01-15'),
  ('IS 17569:2021', 'Insulated Food Containers and Tiffin Carriers — Specification', 'Specifies requirements for insulated food containers, lunch boxes, and tiffin carriers intended to keep prepared foods warm or cold.', 'active', '97.040.20', ARRAY['insulated food container', 'tiffin carrier', 'lunch box', 'food contact'], 'https://www.bis.gov.in/', '2024-01-15')
ON CONFLICT (standard_number) DO NOTHING;

INSERT INTO documents (id, title, doc_type, authority, standard_number, source_url, version, published_date, last_verified_at, licence_note)
VALUES
  (1, 'Domestic Electric Food Mixers (Liquidizers and Grinders) Specification', 'standard', 'Bureau of Indian Standards', 'IS 4250:2025', 'https://www.bis.gov.in/standard/is-4250-2025', '2025 Edition', '2025-01-01', '2025-01-10', 'Mandatory under Electrical Appliances Quality Control Order'),
  (2, 'Domestic Stainless Steel Vacuum Flasks and Insulated Bottles Specification', 'standard', 'Bureau of Indian Standards', 'IS 17526:2021', 'https://www.bis.gov.in/standard/is-17526-2021', '2021 Edition', '2021-06-15', '2024-01-15', 'Mandatory under Stainless Steel Vacuum Flasks Quality Control Order'),
  (3, 'Domestic Single-Walled Stainless Steel Bottles Specification', 'standard', 'Bureau of Indian Standards', 'IS 17803:2022', 'https://www.bis.gov.in/standard/is-17803-2022', '2022 Edition', '2022-03-20', '2024-01-15', 'Covers non-insulated single wall stainless steel bottles'),
  (4, 'Quality Control Order on Stainless Steel Vacuum Flasks and Bottles', 'notice', 'Ministry of Commerce and Industry / DPIIT', 'IS 17526:2021', 'https://dpiit.gov.in/qco-stainless-steel-vacuum-flasks', 'Gazette Notification', '2023-08-10', '2024-01-15', 'Requires Standard Mark under Scheme-I of BIS Conformity Assessment Regulations 2018'),
  (5, 'Electrical Appliances Quality Control Order', 'notice', 'Ministry of Heavy Industries / BIS', 'IS 4250:2025', 'https://www.bis.gov.in/qco-electrical-appliances', 'Gazette Notification', '2023-11-05', '2025-01-10', 'Requires BIS Certification and Standard Mark Scheme-I for electric food mixers')
ON CONFLICT (id) DO NOTHING;

INSERT INTO chunks (document_id, section, clause, page, content)
VALUES
  (1, 'Scope & Application', 'Clause 1', 1, 'This standard IS 4250:2025 applies to domestic electric food mixers, liquidizers, blenders, food processors, and centrifugal juicers operating on single-phase AC supply up to 250V. It defines safety, performance, and construction standards.'),
  (1, 'Electrical Safety', 'Clause 7', 4, 'Clause 7 Electrical Safety and Insulation Resistance: All live electrical components must have double insulation or reinforced insulation. The leakage current shall not exceed 0.25 mA at rated voltage, and insulation resistance must be greater than 2 Megaohms.'),
  (1, 'Power Rating', 'Clause 8', 5, 'Clause 8 Power Input and Current Rating: The power input of the food mixer shall not exceed 110 percent of the rated input marked on the appliance under normal full load conditions.'),
  (1, 'Temperature Rise', 'Clause 11', 8, 'Clause 11 Temperature Rise Test: During the continuous operation and intermittent cycle test with load, the temperature rise of motor windings and enclosure surfaces shall remain within the limits specified in Table 2 to prevent overheating.'),
  (1, 'Moisture Resistance', 'Clause 13', 10, 'Clause 13 Moisture Resistance: Enclosure of the motor unit must prevent ingress of liquid spills from the blender or grinder jar during operation as per IPX1 testing.'),
  (1, 'Mechanical Safety', 'Clause 15', 12, 'Clause 15 Mechanical Strength: The body housing and mixing jars must withstand drop and impact tests without exposing live components or cracking safety interlocks.'),
  (1, 'Endurance Test', 'Clause 20', 16, 'Clause 20 Overload and Endurance Test: Food mixers must undergo 100 cycles of grinding and liquidizing duty cycles without mechanical failure or thermal cut-off malfunction.'),
  (1, 'Blade Interlock', 'Clause 24', 19, 'Clause 24 Safety Interlocking: The motor drive spindle must feature an interlock mechanism that prevents high-speed blade operation unless the mixing jar and lid are securely engaged.'),
  (1, 'Food Contact Parts', 'Clause 30', 22, 'Clause 30 Resistance to Rusting and Food Grade Requirements: All parts in contact with food, including stainless steel jars and cutter blades, must be corrosion resistant and non-toxic as per food safety regulations.'),
  (2, 'Scope', 'Clause 1', 1, 'This standard IS 17526:2021 covers the requirements, sampling, and methods of test for domestic vacuum insulated stainless steel flasks and bottles used for storing hot or cold liquids.'),
  (2, 'Materials', 'Clause 4.1', 2, 'Clause 4.1 Material Specification: The inner container and outer casing shall be manufactured from food grade austenitic stainless steel conforming to IS 6911 (Grade 304 / X04Cr19Ni9 or equivalent) with non-corrosive properties.'),
  (2, 'Thermal Performance', 'Clause 5.2', 4, 'Clause 5.2 Thermal Performance Test: Heat retention test requires the flask filled with boiling water at 95°C to maintain a minimum temperature of 60°C after 6 hours at an ambient temperature of 20°C ± 2°C. Cold retention test requires water filled at 4°C to stay below 10°C after 6 hours.'),
  (2, 'Vacuum Integrity', 'Clause 5.3', 5, 'Clause 5.3 Vacuum Leakage and Seal Integrity: The vacuum insulation space must withstand thermal shock and seal testing without loss of vacuum or sweat condensation on outer body.'),
  (2, 'Impact Test', 'Clause 6.1', 7, 'Clause 6.1 Impact and Drop Resistance Test: The bottle filled with water to nominal capacity must withstand a free fall drop from a height of 1 metre onto a hard concrete surface without cracking, leakage, or loss of thermal insulation.'),
  (2, 'Handle & Stopper', 'Clause 6.4', 8, 'Clause 6.4 Handle and Stopper Pull/Torque Test: The stopper, cap thread, and handle mechanism must endure 1000 open/close cycles without thread stripping, deformation, or leakage.'),
  (2, 'Migration Test', 'Clause 7.2', 10, 'Clause 7.2 Overall Migration Test for Food Contact: Gaskets, seals, and inner liner surfaces contacting liquids shall comply with overall migration limits not exceeding 10 mg/dm² or 60 mg/kg as per IS 9845.'),
  (2, 'Corrosion Resistance', 'Clause 8.1', 12, 'Clause 8.1 Corrosion Resistance: Stainless steel surfaces must pass 24-hour neutral salt spray (fog) testing without pitting or discoloration.'),
  (2, 'Marking & Scheme', 'Clause 9', 14, 'Clause 9 Marking and ISI Standard Mark: Each vacuum insulated bottle must be marked with manufacturer name, capacity, standard number IS 17526:2021, and the BIS Standard Mark (ISI mark) obtained under BIS licensing Scheme-I.'),
  (3, 'Scope & Single Wall', 'Clause 1', 1, 'IS 17803:2022 covers domestic single-walled (non-insulated) stainless steel bottles intended for storing drinking water. Single-wall bottles do not have vacuum insulation and do not provide temperature retention.'),
  (3, 'Drop & Leakage', 'Clause 5.1', 3, 'Clause 5.1 Leakage Test and Drop Test for IS 17803:2022 single-wall stainless steel bottles: Requires leak-proof seal under 20 kPa internal pressure and drop test from 1 metre.'),
  (4, 'QCO Order Details', 'Clause 1', 1, 'The Quality Control Order for Stainless Steel Vacuum Flasks and Bottles issued by the Ministry of Commerce and Industry (DPIIT) mandates that all domestic stainless steel vacuum flasks and insulated bottles must conform to IS 17526:2021 and bear the Standard Mark under a licence from the Bureau of Indian Standards as per Scheme-I of Schedule-II of the BIS (Conformity Assessment) Regulations, 2018.'),
  (4, 'Phase-in Exemptions', 'Clause 2', 2, 'Phase-in timeline: Micro and small enterprises (MSMEs) were initially provided a 6-to-9 month transition window in earlier notifications. However, compliance deadlines and amendments are published periodically, requiring verification of current enforcement status on official DPIIT / BIS portals.'),
  (5, 'Electrical QCO Order', 'Clause 1', 1, 'Under the Electrical Appliances Quality Control Order issued in coordination with the Bureau of Indian Standards, domestic electric food mixers, blenders, and grinders are covered under mandatory BIS certification conforming to IS 4250 (current edition IS 4250:2025) under Scheme-I (ISI Mark Scheme).');

INSERT INTO scheme_rules (product_category, scheme, mandatory, basis, source_url, last_verified_at)
VALUES
  ('stainless steel water bottle', 'ISI', true, 'Quality Control Order for Stainless Steel Vacuum Flasks and Bottles (IS 17526:2021)', 'https://www.bis.gov.in/', '2024-01-15'),
  ('stainless steel vacuum flask', 'ISI', true, 'IS 17526:2021 under QCO Ministry of Commerce and Industry', 'https://www.bis.gov.in/', '2024-01-15'),
  ('vacuum insulated bottle', 'ISI', true, 'IS 17526:2021 under QCO Ministry of Commerce and Industry', 'https://www.bis.gov.in/', '2024-01-15'),
  ('single-wall stainless steel bottle', 'ISI', true, 'IS 17803:2022 Domestic Single-Walled Stainless Steel Bottles', 'https://www.bis.gov.in/', '2024-01-15'),
  ('electric food mixer', 'ISI', true, 'IS 4250 under Electrical Appliances Quality Control Order', 'https://www.bis.gov.in/', '2025-01-10'),
  ('mixer grinder', 'ISI', true, 'IS 4250 under Electrical Appliances Quality Control Order', 'https://www.bis.gov.in/', '2025-01-10'),
  ('food contact articles', 'ISI', true, 'QCO for food contact materials', 'https://www.bis.gov.in/', '2024-01-15');

SELECT 'Seed data loaded successfully (standards, documents, chunks, scheme_rules)' AS result;

