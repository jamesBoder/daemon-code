ALTER TABLE shadow_profiles
ADD COLUMN IF NOT EXISTS polly_voice TEXT
    CHECK (polly_voice IN ('Matthew','Ruth','Stephen','Kendra','Amy','Brian'));
