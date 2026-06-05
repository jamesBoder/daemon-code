ALTER TABLE shadow_profiles
ADD COLUMN polly_voice TEXT
    CHECK (polly_voice IN ('Matthew','Ruth','Stephen','Kendra','Amy','Brian'));
