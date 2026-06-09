ALTER TABLE shadow_profiles
ADD COLUMN IF NOT EXISTS profile_dimensions           JSONB,
ADD COLUMN IF NOT EXISTS daemon_accuracy_last_compile INT  NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS profile_dimensions_prev      JSONB;

-- Initialize the last-compile baseline for existing users so the first post-migration
-- Analyst run doesn't compute a false grim-trigger delta against 0.
-- WHERE guards idempotency: only touches rows not yet initialized by the Analyst.
UPDATE shadow_profiles
SET daemon_accuracy_last_compile = daemon_accuracy
WHERE daemon_accuracy > 0
  AND daemon_accuracy_last_compile = 0;
