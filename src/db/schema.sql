-- ===========================================================================
-- Car Rental Management System — Neon (PostgreSQL) schema
-- Run this once in the Neon SQL Editor (or via `psql`) before pointing the
-- app at Neon: set DATABASE_URL on the server. Production builds use the API.
-- Every table is scoped by company_id for multi-tenant support.
-- ===========================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ------------------------------------------------------------------ enums
DO $$ BEGIN
  CREATE TYPE user_role     AS ENUM ('admin', 'member');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE user_status   AS ENUM ('active', 'inactive');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE car_status    AS ENUM ('available', 'rented', 'maintenance', 'inactive');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE rental_status AS ENUM ('active', 'completed', 'overdue', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE payment_method AS ENUM (
    'cash', 'card', 'ecocash', 'paynow', 'bank_transfer', 'mobile_money', 'stripe'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- --------------------------------------------------------------- companies
CREATE TABLE IF NOT EXISTS companies (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  text        NOT NULL,
  email                 text,
  phone                 text,
  address               text,
  city                  text,
  country               text,
  logo_url              text,
  currency              text        NOT NULL DEFAULT 'USD',
  timezone              text        NOT NULL DEFAULT 'UTC',
  members_see_all_rentals     boolean NOT NULL DEFAULT false,
  members_edit_own_rentals    boolean NOT NULL DEFAULT true,
  members_manage_fleet       boolean NOT NULL DEFAULT false,
  password_reset_enabled boolean NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------------- users
CREATE TABLE IF NOT EXISTS users (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  full_name      text        NOT NULL,
  email          text        NOT NULL,
  phone          text,
  password_hash  text        NOT NULL,
  role           user_role   NOT NULL DEFAULT 'member',
  status         user_status NOT NULL DEFAULT 'active',
  avatar_url     text,
  last_login_at  timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_key ON users (lower(email));

-- password reset tokens (short lived, single use)
CREATE TABLE IF NOT EXISTS password_resets (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  text        NOT NULL UNIQUE,
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS password_resets_user_idx ON password_resets (user_id);

-- What the credential is for: the emailed sign-in link for a new account is
-- not a password reset, and the two must never be accepted interchangeably.
-- `attempts` counts wrong codes so a six digit OTP cannot be guessed online.
ALTER TABLE password_resets ADD COLUMN IF NOT EXISTS purpose text        NOT NULL DEFAULT 'password_reset';
ALTER TABLE password_resets ADD COLUMN IF NOT EXISTS attempts integer   NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS password_resets_live_idx
  ON password_resets (user_id, purpose, created_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'password_resets_purpose_check'
  ) THEN
    ALTER TABLE password_resets
      ADD CONSTRAINT password_resets_purpose_check
      CHECK (purpose IN ('password_reset', 'email_confirm'));
  END IF;
END $$;

-- -------------------------------------------------------------------- cars
CREATE TABLE IF NOT EXISTS cars (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  make           text        NOT NULL,
  model          text        NOT NULL,
  year           int         NOT NULL CHECK (year BETWEEN 1980 AND 2100),
  registration   text        NOT NULL,
  color          text,
  category       text        NOT NULL DEFAULT 'sedan',
  daily_rate     numeric(12,2) NOT NULL DEFAULT 0 CHECK (daily_rate >= 0),
  status         car_status  NOT NULL DEFAULT 'available',
  photo_url      text,
  notes          text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS cars_registration_key ON cars (company_id, lower(registration));
CREATE INDEX IF NOT EXISTS cars_company_status_idx ON cars (company_id, status);

-- ------------------------------------------------- ownership + Zinara licence
-- A vehicle is either owned outright (`owned`) or taken from a third party on
-- sub-lease. For a sub-lease the owner's name and the percentage of revenue the
-- company keeps are recorded, so both sides can be paid their share.
-- `license_valid_from` / `license_valid_to` drive the dashboard renewal alert.
ALTER TABLE cars ADD COLUMN IF NOT EXISTS ownership             text        NOT NULL DEFAULT 'owned';
ALTER TABLE cars ADD COLUMN IF NOT EXISTS owner_first_name      text;
ALTER TABLE cars ADD COLUMN IF NOT EXISTS owner_last_name       text;
ALTER TABLE cars ADD COLUMN IF NOT EXISTS company_share_percent numeric(5,2) NOT NULL DEFAULT 100;
ALTER TABLE cars ADD COLUMN IF NOT EXISTS license_valid_from    date;
ALTER TABLE cars ADD COLUMN IF NOT EXISTS license_valid_to      date;
ALTER TABLE cars ADD COLUMN IF NOT EXISTS license_renewed_at    timestamptz;

DO $$ BEGIN
  ALTER TABLE cars ADD CONSTRAINT cars_ownership_check
    CHECK (ownership IN ('owned', 'sub_lease'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE cars ADD CONSTRAINT cars_company_share_check
    CHECK (company_share_percent BETWEEN 0 AND 100);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- --------------------------------------------------------------- customers
CREATE TABLE IF NOT EXISTS customers (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           uuid        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  full_name            text        NOT NULL,
  phone                text,
  email                text,
  id_number            text,
  driver_license       text,
  address              text,
  notes                text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS customers_company_idx ON customers (company_id);
CREATE INDEX IF NOT EXISTS customers_name_idx   ON customers (lower(full_name));

-- ----------------------------------------------------------------- rentals
CREATE TABLE IF NOT EXISTS rentals (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  car_id              uuid        NOT NULL REFERENCES cars(id) ON DELETE RESTRICT,
  customer_id         uuid        NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  created_by          uuid        NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reference           text        NOT NULL,
  pickup_at           timestamptz NOT NULL,
  expected_return_at  timestamptz NOT NULL,
  actual_return_at    timestamptz,
  daily_rate          numeric(12,2) NOT NULL DEFAULT 0 CHECK (daily_rate >= 0),
  days                int         NOT NULL DEFAULT 1 CHECK (days >= 0),
  total_amount        numeric(12,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  deposit_amount      numeric(12,2) NOT NULL DEFAULT 0 CHECK (deposit_amount >= 0),
  additional_charges  jsonb       NOT NULL DEFAULT '[]'::jsonb,
  status              rental_status NOT NULL DEFAULT 'active',
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS rentals_reference_key ON rentals (company_id, reference);
CREATE INDEX IF NOT EXISTS rentals_company_status_idx ON rentals (company_id, status);
CREATE INDEX IF NOT EXISTS rentals_company_pickup_idx  ON rentals (company_id, pickup_at);
CREATE INDEX IF NOT EXISTS rentals_car_idx             ON rentals (car_id);
CREATE INDEX IF NOT EXISTS rentals_customer_idx        ON rentals (customer_id);
CREATE INDEX IF NOT EXISTS rentals_created_by_idx      ON rentals (created_by);

-- ---------------------------------------------------------------- payments
CREATE TABLE IF NOT EXISTS payments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid           NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  rental_id    uuid           NOT NULL REFERENCES rentals(id) ON DELETE CASCADE,
  amount       numeric(12,2)  NOT NULL CHECK (amount > 0),
  method       payment_method NOT NULL DEFAULT 'cash',
  reference    text,
  note         text,
  received_by  uuid           REFERENCES users(id) ON DELETE SET NULL,
  received_at  timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payments_rental_idx  ON payments (rental_id);
CREATE INDEX IF NOT EXISTS payments_company_idx ON payments (company_id, received_at);

-- ----------------------------------------------------------- activity log
CREATE TABLE IF NOT EXISTS activity_log (
  id          bigserial PRIMARY KEY,
  company_id  uuid        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id     uuid        REFERENCES users(id) ON DELETE SET NULL,
  action      text        NOT NULL,
  entity      text        NOT NULL,
  entity_id   text,
  summary     text        NOT NULL,
  metadata    jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS activity_company_idx ON activity_log (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS activity_user_idx    ON activity_log (user_id, created_at DESC);

-- --------------------------------------------------- overdue flag (view)
-- Keeps "overdue" derived from data rather than trusted from a cached column.
CREATE OR REPLACE VIEW rentals_with_balance AS
SELECT
  r.*,
  COALESCE(p.paid, 0)                                                   AS amount_paid,
  GREATEST(0,
    r.total_amount
    + COALESCE((SELECT SUM((c->>'amount')::numeric)
                FROM jsonb_array_elements(r.additional_charges) AS c), 0)
    - COALESCE(p.paid, 0)
  )                                                                     AS balance,
  (r.actual_return_at IS NULL
   AND r.status IN ('active', 'overdue')
   AND r.expected_return_at < now())                                    AS is_overdue
FROM rentals r
LEFT JOIN (
  SELECT rental_id, SUM(amount) AS paid FROM payments GROUP BY rental_id
) p ON p.rental_id = r.id;

-- ------------------------------------------------------------ demo helper
-- Seeds a company, owner, staff, cars, customers and rentals for a fresh Neon
-- database. Run only on an empty project.
--
-- INSERT INTO companies (id, name, email, currency) VALUES
--   ('11111111-1111-1111-1111-111111111111', 'Falcon Car Hire', 'hello@falconcarhire.test', 'USD');
--
-- Passwords below are PBKDF2-SHA256, 120000 iterations, and are identical to
-- the ones generated by the app's own hashPassword() helper for "Admin@123"
-- and "Member@123" only when generated at runtime — replace them by creating
-- the owner through the in-app setup screen instead.