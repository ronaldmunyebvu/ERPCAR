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

-- --------------------------------------------------- platform approval + fees
-- Every publicly-created company starts as `pending` and cannot sign in until a
-- super admin approves it. Existing rows (and the demo seed) default to
-- `approved`, so adding these columns never locks an established tenant out.
ALTER TABLE companies ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'approved';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS approved_at timestamptz;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS approved_by text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS rejected_at timestamptz;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS rejection_reason text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS platform_notes text;

-- Commercial terms captured when the company registers. The super admin
-- dashboard records payments against these amounts.
ALTER TABLE companies ADD COLUMN IF NOT EXISTS initial_fee_amount numeric(12,2) NOT NULL DEFAULT 250 CHECK (initial_fee_amount >= 0);
ALTER TABLE companies ADD COLUMN IF NOT EXISTS initial_fee_paid boolean NOT NULL DEFAULT false;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS initial_fee_paid_at timestamptz;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS subscription_amount numeric(12,2) NOT NULL DEFAULT 7.50 CHECK (subscription_amount >= 0);
ALTER TABLE companies ADD COLUMN IF NOT EXISTS subscription_status text NOT NULL DEFAULT 'inactive';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS subscription_next_due date;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS last_payment_at timestamptz;

DO $$ BEGIN
  ALTER TABLE companies ADD CONSTRAINT companies_approval_status_check
    CHECK (approval_status IN ('pending', 'approved', 'rejected', 'suspended'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE companies ADD CONSTRAINT companies_subscription_status_check
    CHECK (subscription_status IN ('inactive', 'active', 'overdue', 'cancelled'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ------------------------------------------------------------------- users
CREATE TABLE IF NOT EXISTS users (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  full_name      text        NOT NULL,
  email          text        NOT NULL,
  phone          text,
  -- Nullable: staff created before their first sign-in have no password yet.
  password_hash  text,
  role           user_role   NOT NULL DEFAULT 'member',
  status         user_status NOT NULL DEFAULT 'active',
  avatar_url     text,
  last_login_at  timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_key ON users (lower(email));

-- Databases created before staff chose their own password require a hash, so
-- drop the old NOT NULL on upgrade. (A no-op when it is already nullable.)
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

-- A new owner cannot sign in until they open the emailed confirmation link.
-- Everyone else (staff added by an admin, demo data) is already trusted, so
-- the column defaults to true and company setup is the only writer of false.
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified boolean NOT NULL DEFAULT true;

-- Which sections of the app a staff member may use. Empty (or null on older
-- rows) is treated as full access, so no account is ever locked out by the
-- migration; the app fills it in on the next save.
ALTER TABLE users ADD COLUMN IF NOT EXISTS duties text[] NOT NULL DEFAULT '{}';

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

-- Recreate (idempotently) so an older two-value check gains the new purpose.
DO $$
BEGIN
  ALTER TABLE password_resets DROP CONSTRAINT IF EXISTS password_resets_purpose_check;
  ALTER TABLE password_resets
    ADD CONSTRAINT password_resets_purpose_check
    CHECK (purpose IN ('password_reset', 'email_confirm', 'member_setup', 'company_setup'));
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
  -- Default kilometres included per rental day when this vehicle is booked.
  daily_mileage_limit int    NOT NULL DEFAULT 0 CHECK (daily_mileage_limit >= 0),
  status         car_status  NOT NULL DEFAULT 'available',
  -- Odometer reading kept up to date on every completed rental return.
  mileage        int         NOT NULL DEFAULT 0 CHECK (mileage >= 0),
  photo_url      text,
  notes          text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS cars_registration_key ON cars (company_id, lower(registration));
CREATE INDEX IF NOT EXISTS cars_company_status_idx ON cars (company_id, status);

-- Odometer upgrade: databases created before mileage tracking need the column
-- added to the existing table (CREATE TABLE IF NOT EXISTS skips it otherwise).
ALTER TABLE cars
  ADD COLUMN IF NOT EXISTS mileage int NOT NULL DEFAULT 0 CHECK (mileage >= 0);

ALTER TABLE cars
  ADD COLUMN IF NOT EXISTS daily_mileage_limit int NOT NULL DEFAULT 0 CHECK (daily_mileage_limit >= 0);

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
  -- Kilometres the customer is allowed per rental day. Excess distance is
  -- charged at daily_rate / expected_km_per_day per kilometre on return.
  expected_km_per_day int         CHECK (expected_km_per_day >= 0),
  days                int         NOT NULL DEFAULT 1 CHECK (days >= 0),
  total_amount        numeric(12,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  deposit_amount      numeric(12,2) NOT NULL DEFAULT 0 CHECK (deposit_amount >= 0),
  additional_charges  jsonb       NOT NULL DEFAULT '[]'::jsonb,
  status              rental_status NOT NULL DEFAULT 'active',
  -- Odometer readings at pickup and return; distance covered is derived.
  start_mileage       int,
  end_mileage         int,
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

-- Odometer readings captured at pickup and return (see cars.mileage above).
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS start_mileage int;
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS end_mileage   int;
ALTER TABLE rentals
  ADD COLUMN IF NOT EXISTS expected_km_per_day int CHECK (expected_km_per_day >= 0);

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

-- ------------------------------------------------------------- cashbook
-- Manual money movements that are not rental payments: company overheads,
-- fleet running costs, and non-rental income. Rental inflows stay in
-- `payments`; the Cashbook page merges both views.
CREATE TABLE IF NOT EXISTS cashbook_entries (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid           NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  direction    text           NOT NULL CHECK (direction IN ('inflow', 'expense')),
  -- Expenses are either general company overhead or a cost on one vehicle.
  expense_scope text          NOT NULL DEFAULT 'company' CHECK (expense_scope IN ('company', 'fleet')),
  car_id       uuid           REFERENCES cars(id) ON DELETE SET NULL,
  category     text           NOT NULL,
  description  text,
  amount       numeric(12,2)  NOT NULL CHECK (amount > 0),
  method       payment_method NOT NULL DEFAULT 'cash',
  reference    text,
  occurred_at  timestamptz    NOT NULL DEFAULT now(),
  recorded_by  uuid           REFERENCES users(id) ON DELETE SET NULL,
  created_at   timestamptz    NOT NULL DEFAULT now(),
  -- A fleet-scope expense must point at the vehicle it belongs to.
  CONSTRAINT cashbook_entries_fleet_car_check
    CHECK (direction <> 'expense' OR expense_scope <> 'fleet' OR car_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS cashbook_company_idx   ON cashbook_entries (company_id, occurred_at);
CREATE INDEX IF NOT EXISTS cashbook_car_idx       ON cashbook_entries (car_id);
CREATE INDEX IF NOT EXISTS cashbook_scope_idx     ON cashbook_entries (company_id, direction, expense_scope);

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
-- Dropped first: CREATE OR REPLACE cannot reorder columns, and rentals gained
-- start_mileage/end_mileage after this view was first created. Nothing depends
-- on the view, so recreating it is safe.
DROP VIEW IF EXISTS rentals_with_balance;
CREATE VIEW rentals_with_balance AS
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