-- Users
CREATE TABLE IF NOT EXISTS users (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email                TEXT UNIQUE NOT NULL,
    password_hash        TEXT NOT NULL,
    timezone             TEXT NOT NULL DEFAULT 'UTC',
    onboarding_complete  BOOLEAN NOT NULL DEFAULT FALSE,
    push_endpoint_id     TEXT,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Shadow profiles — the daemon's understanding of the user
CREATE TABLE IF NOT EXISTS shadow_profiles (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id              UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    primary_archetype    TEXT NOT NULL DEFAULT 'default'
                           CHECK (primary_archetype IN ('abandoned_child','unworthy_self','caged_rage','grief_carrier','default')),
    signal_confidence    NUMERIC(4,3) NOT NULL DEFAULT 0.000
                           CHECK (signal_confidence BETWEEN 0 AND 1),
    kernel_access        INTEGER NOT NULL DEFAULT 0
                           CHECK (kernel_access BETWEEN 0 AND 100),
    stage                TEXT NOT NULL DEFAULT 'cold'
                           CHECK (stage IN ('cold','warming','running','deep')),
    posture              NUMERIC(4,3) NOT NULL DEFAULT 0.500
                           CHECK (posture BETWEEN 0 AND 1),
    environment          TEXT NOT NULL DEFAULT 'neutral'
                           CHECK (environment IN ('neutral','water','fire')),
    texture              TEXT NOT NULL DEFAULT 'smooth'
                           CHECK (texture IN ('smooth','fractured')),
    fragments_decoded    INTEGER NOT NULL DEFAULT 0,
    compile_count        INTEGER NOT NULL DEFAULT 0,
    analyst_notes        TEXT,
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id)
);

-- Pattern library — the process log
CREATE TABLE IF NOT EXISTS pattern_library (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name           TEXT,
    state          TEXT NOT NULL DEFAULT 'new',
    strength       INTEGER NOT NULL DEFAULT 0,
    unnamed        BOOLEAN NOT NULL DEFAULT TRUE,
    first_detected DATE NOT NULL DEFAULT CURRENT_DATE,
    last_seen      DATE,
    daemon_note    TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Card responses — raw behavioral data
CREATE TABLE IF NOT EXISTS card_responses (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    fragment_id     TEXT NOT NULL,
    fragment_type   TEXT NOT NULL,
    response_data   JSONB NOT NULL,
    session_date    DATE NOT NULL DEFAULT CURRENT_DATE,
    responded_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Mood logs
CREATE TABLE IF NOT EXISTS mood_logs (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    mood_score   INTEGER NOT NULL CHECK (mood_score BETWEEN 1 AND 5),
    note         TEXT,
    logged_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    log_date     DATE NOT NULL DEFAULT CURRENT_DATE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_card_responses_user_date ON card_responses(user_id, session_date);
CREATE INDEX IF NOT EXISTS idx_mood_logs_user_date ON mood_logs(user_id, log_date);
CREATE INDEX IF NOT EXISTS idx_pattern_library_user ON pattern_library(user_id);
CREATE INDEX IF NOT EXISTS idx_shadow_profiles_user ON shadow_profiles(user_id);
