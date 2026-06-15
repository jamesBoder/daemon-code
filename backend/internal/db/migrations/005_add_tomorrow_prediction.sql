ALTER TABLE shadow_profiles
ADD COLUMN IF NOT EXISTS tomorrow_prediction         TEXT NOT NULL DEFAULT '',
ADD COLUMN IF NOT EXISTS tomorrow_prediction_pattern TEXT NOT NULL DEFAULT '';
