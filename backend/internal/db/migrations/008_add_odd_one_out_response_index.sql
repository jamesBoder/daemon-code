-- The Odd One Out's GetRecentResponsesByType filters on (user_id,
-- fragment_type) ordered by responded_at -- not covered by the existing
-- (user_id, session_date) index, so it would degrade to a sequential scan
-- as card_responses grows.
CREATE INDEX IF NOT EXISTS idx_card_responses_user_type_time
    ON card_responses(user_id, fragment_type, responded_at DESC);
