-- name: CreateShadowProfile :one
INSERT INTO shadow_profiles (user_id)
VALUES ($1)
RETURNING *;

-- name: GetShadowProfile :one
SELECT * FROM shadow_profiles WHERE user_id = $1;

-- name: UpdateShadowProfile :one
UPDATE shadow_profiles
SET primary_archetype  = $2,
    signal_confidence  = $3,
    kernel_access      = $4,
    stage              = $5,
    posture            = $6,
    environment        = $7,
    texture            = $8,
    fragments_decoded  = $9,
    compile_count      = $10,
    analyst_notes      = $11,
    updated_at         = NOW()
WHERE user_id = $1
RETURNING *;
