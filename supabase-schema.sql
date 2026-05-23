-- Supabase PostgreSQL Schema
-- Replaces SQLite backend for personal finance app

-- ============================================================
-- TABLES
-- ============================================================

-- Users table
CREATE TABLE users (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name        TEXT NOT NULL,
    avatar      TEXT DEFAULT 'avatars/avatar-01.png',
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Accounts table
CREATE TABLE accounts (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id     BIGINT NOT NULL DEFAULT 1 REFERENCES users(id) ON DELETE CASCADE,
    category    TEXT NOT NULL CHECK(category IN ('liquid','invest','fixed','recv','debt')),
    name        TEXT NOT NULL,
    type        TEXT NOT NULL,
    balance     DOUBLE PRECISION NOT NULL DEFAULT 0,
    description TEXT DEFAULT '',
    dot_color   TEXT DEFAULT '#1db954',
    stat        BOOLEAN NOT NULL DEFAULT TRUE,
    group_name  TEXT,
    stock_data  JSONB,
    loan_data   JSONB,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Transactions table
CREATE TABLE transactions (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id     BIGINT NOT NULL DEFAULT 1 REFERENCES users(id) ON DELETE CASCADE,
    date        TEXT NOT NULL,
    name        TEXT NOT NULL,
    category    TEXT NOT NULL,
    amount      DOUBLE PRECISION NOT NULL,
    note        TEXT DEFAULT '',
    icon        TEXT DEFAULT '',
    recurring   BOOLEAN NOT NULL DEFAULT FALSE,
    account_id  BIGINT REFERENCES accounts(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Groups table
CREATE TABLE groups (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id     BIGINT NOT NULL DEFAULT 1 REFERENCES users(id) ON DELETE CASCADE,
    category    TEXT NOT NULL,
    name        TEXT NOT NULL,
    UNIQUE(user_id, category, name)
);

-- Categories table
CREATE TABLE categories (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id     BIGINT NOT NULL DEFAULT 1 REFERENCES users(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    icon        TEXT DEFAULT '',
    sort_order  INTEGER DEFAULT 0,
    cat_group   TEXT DEFAULT ''
);

-- Retirement config (one per user)
CREATE TABLE retirement_config (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    initial_principal DOUBLE PRECISION NOT NULL,
    withdrawal_rate   DOUBLE PRECISION NOT NULL,
    inflation_rate    DOUBLE PRECISION NOT NULL DEFAULT 2,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id)
);

-- Retirement yearly records
CREATE TABLE retirement_years (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    year        INTEGER NOT NULL,
    end_assets  DOUBLE PRECISION NOT NULL,
    return_rate DOUBLE PRECISION,
    suggested_withdrawal DOUBLE PRECISION,
    actual_withdrawal    DOUBLE PRECISION DEFAULT 0,
    rule_triggered       TEXT DEFAULT '',
    calc_detail          JSONB,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, year)
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX idx_accounts_user_id ON accounts(user_id);
CREATE INDEX idx_transactions_user_id ON transactions(user_id);
CREATE INDEX idx_transactions_date ON transactions(date);
CREATE INDEX idx_transactions_account_id ON transactions(account_id);
CREATE INDEX idx_groups_user_id ON groups(user_id);
CREATE INDEX idx_categories_user_id ON categories(user_id);
CREATE INDEX idx_retirement_config_user_id ON retirement_config(user_id);
CREATE INDEX idx_retirement_years_user_id ON retirement_years(user_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE retirement_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE retirement_years ENABLE ROW LEVEL SECURITY;

-- Permissive policies allowing all operations for anon role
-- (personal app, single user, no multi-tenancy)

CREATE POLICY "Allow all access for anon" ON users
    FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY "Allow all access for anon" ON accounts
    FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY "Allow all access for anon" ON transactions
    FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY "Allow all access for anon" ON groups
    FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY "Allow all access for anon" ON categories
    FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY "Allow all access for anon" ON retirement_config
    FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY "Allow all access for anon" ON retirement_years
    FOR ALL TO anon USING (true) WITH CHECK (true);

-- ============================================================
-- SEED DATA
-- ============================================================

-- Default user
INSERT INTO users (id, name, avatar)
OVERRIDING SYSTEM VALUE
VALUES (1, '我', 'avatars/avatar-01.png');

-- Reset identity sequence after explicit id insert
SELECT setval(pg_get_serial_sequence('users', 'id'), (SELECT MAX(id) FROM users));

-- Default categories for user 1 (matching original app)
INSERT INTO categories (user_id, name, icon, sort_order, cat_group) VALUES
    (1, '飲食',       '🍜', 1,  '生活'),
    (1, '交通',       '🚗', 2,  '生活'),
    (1, '娛樂',       '🎮', 3,  '生活'),
    (1, '通訊',       '📱', 4,  '生活'),
    (1, '進貨',       '📦', 5,  '工作'),
    (1, '信貸還款',   '🏦', 6,  '財務'),
    (1, '負債沖銷',   '🏛️', 7,  '財務'),
    (1, '財務費用',   '💸', 8,  '財務'),
    (1, '薪資',       '💰', 9,  '收入'),
    (1, '收入',       '💵', 10, '收入'),
    (1, '其他',       '📝', 11, '');
