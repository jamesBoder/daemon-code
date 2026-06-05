#!/usr/bin/env bash
# Generate and upload voice preview clips to S3.
# Run once. Clips are immutable — never regenerated.
#
# Prerequisites: aws CLI configured, AUDIO_BUCKET env var set.
# Usage: AUDIO_BUCKET=your-bucket-name ./scripts/generate_voice_samples.sh

set -euo pipefail

BUCKET="${AUDIO_BUCKET:?set AUDIO_BUCKET}"
REGION="${AWS_REGION:-us-east-1}"
TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT

# ── Sample text ──────────────────────────────────────────────────────────────
# Used for both settings previews and onboarding clips.
# Same prose, different voices — that is the mechanic.
SAMPLE_PROSE="Something has been running beneath the surface for a long time. The daemon has been watching. It does not yet have a name for what it sees. But it is close."

# Warm SSML rate — consistent for all preview clips.
SAMPLE_SSML="<speak><prosody rate=\"80%\">$(echo "$SAMPLE_PROSE" | sed 's|\. |<break time="400ms"/> |g')</prosody></speak>"

# ── Settings preview clips — all six voices ──────────────────────────────────
declare -A SETTINGS_VOICES=(
  [Matthew]="en-US"
  [Ruth]="en-US"
  [Stephen]="en-US"
  [Kendra]="en-US"
  [Amy]="en-GB"
  [Brian]="en-GB"
)

echo "Generating settings preview clips..."
for VOICE in "${!SETTINGS_VOICES[@]}"; do
  OUT="$TMPDIR/${VOICE}.mp3"
  echo "  $VOICE → voice-samples/${VOICE}.mp3"
  aws polly synthesize-speech \
    --region "$REGION" \
    --engine neural \
    --voice-id "$VOICE" \
    --output-format mp3 \
    --text-type ssml \
    --text "$SAMPLE_SSML" \
    "$OUT" > /dev/null
  aws s3 cp "$OUT" "s3://${BUCKET}/voice-samples/${VOICE}.mp3" \
    --content-type "audio/mpeg" \
    --cache-control "max-age=31536000, immutable" \
    --region "$REGION"
done

# ── Onboarding clips — Matthew, Ruth, Stephen only ──────────────────────────
declare -a ONBOARDING_VOICES=(Matthew Ruth Stephen)

echo "Generating onboarding clips..."
for VOICE in "${ONBOARDING_VOICES[@]}"; do
  LOWER=$(echo "$VOICE" | tr '[:upper:]' '[:lower:]')
  OUT="$TMPDIR/onboarding_${LOWER}.mp3"
  echo "  $VOICE → voice-samples/onboarding/${LOWER}.mp3"
  aws polly synthesize-speech \
    --region "$REGION" \
    --engine neural \
    --voice-id "$VOICE" \
    --output-format mp3 \
    --text-type ssml \
    --text "$SAMPLE_SSML" \
    "$OUT" > /dev/null
  aws s3 cp "$OUT" "s3://${BUCKET}/voice-samples/onboarding/${LOWER}.mp3" \
    --content-type "audio/mpeg" \
    --cache-control "max-age=31536000, immutable" \
    --region "$REGION"
done

echo "Done. 9 clips uploaded to s3://${BUCKET}/voice-samples/"
