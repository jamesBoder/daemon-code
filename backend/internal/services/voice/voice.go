// Package voice is the shared daemon speech synthesizer: Polly Neural SSML
// delivery tuned to the daemon's stage, uploaded to the audio bucket. It is
// consumed by the Narrator (nightly prose, naming ceremony) and the
// PulseGenerator (Map observation) so synthesis lives in one place.
package voice

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/polly"
	pollytypes "github.com/aws/aws-sdk-go-v2/service/polly/types"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	appconfig "github.com/jamesboder/daemon-code/internal/config"
)

// Synthesizer turns daemon text into MP3 in the audio bucket.
type Synthesizer struct {
	polly  *polly.Client
	s3     *s3.Client
	bucket string
}

// NewSynthesizer builds a Synthesizer from app config, loading its own AWS
// config (matching the panic-on-failure pattern of the other service clients).
func NewSynthesizer(cfg *appconfig.Config) *Synthesizer {
	awsCfg, err := awsconfig.LoadDefaultConfig(context.Background(), awsconfig.WithRegion(cfg.AWSRegion))
	if err != nil {
		panic("voice: failed to load AWS config: " + err.Error())
	}
	return &Synthesizer{
		polly:  polly.NewFromConfig(awsCfg),
		s3:     s3.NewFromConfig(awsCfg),
		bucket: cfg.AudioBucket,
	}
}

// archetypeVoice maps each archetype to its default Polly Neural voice.
var archetypeVoice = map[string]pollytypes.VoiceId{
	"grief_carrier":   pollytypes.VoiceIdMatthew,
	"abandoned_child": pollytypes.VoiceIdRuth,
	"caged_rage":      pollytypes.VoiceIdStephen,
	"unworthy_self":   pollytypes.VoiceIdKendra,
}

// ResolveVoice returns the user's preferred voice (empty = none chosen),
// falling back to the archetype default and then to Matthew as the universal
// fallback.
func ResolveVoice(preferred, archetype string) pollytypes.VoiceId {
	if preferred != "" {
		return pollytypes.VoiceId(preferred)
	}
	if v, ok := archetypeVoice[archetype]; ok {
		return v
	}
	return pollytypes.VoiceIdMatthew
}

// stageRates and stagePauses tune Polly Neural delivery to the daemon's stage —
// slower and more spaced when the model is young, tighter as it gains certainty.
var (
	stageRates  = map[string]string{"cold": "72%", "warming": "80%", "running": "85%", "deep": "88%"}
	stagePauses = map[string]string{"cold": "600ms", "warming": "400ms", "running": "300ms", "deep": "200ms"}
)

// fallbackRate/Pause cover registers outside the four orb stages (e.g. the
// Pulse "early"/"mid"/"deep" profile_stage), so an unknown stage still speaks.
const (
	fallbackRate  = "82%"
	fallbackPause = "350ms"
)

// Synthesize voices text at the given stage register and uploads the MP3 to
// s3Key in the audio bucket, returning the key.
func (s *Synthesizer) Synthesize(ctx context.Context, text, stage string, voiceID pollytypes.VoiceId, s3Key string) (string, error) {
	rate, ok := stageRates[stage]
	if !ok {
		rate = fallbackRate
	}
	pause, ok := stagePauses[stage]
	if !ok {
		pause = fallbackPause
	}
	ssml := buildSSML(text, rate, pause)

	out, err := s.polly.SynthesizeSpeech(ctx, &polly.SynthesizeSpeechInput{
		Engine:       pollytypes.EngineNeural,
		VoiceId:      voiceID,
		OutputFormat: pollytypes.OutputFormatMp3,
		TextType:     pollytypes.TextTypeSsml,
		Text:         aws.String(ssml),
	})
	if err != nil {
		return "", fmt.Errorf("polly: %w", err)
	}
	defer out.AudioStream.Close()
	audio, err := io.ReadAll(out.AudioStream)
	if err != nil {
		return "", fmt.Errorf("read polly stream: %w", err)
	}

	sz := int64(len(audio))
	_, err = s.s3.PutObject(ctx, &s3.PutObjectInput{
		Bucket:        aws.String(s.bucket),
		Key:           aws.String(s3Key),
		Body:          bytes.NewReader(audio),
		ContentLength: &sz,
		ContentType:   aws.String("audio/mpeg"),
		CacheControl:  aws.String("max-age=86400, immutable"),
	})
	if err != nil {
		return "", fmt.Errorf("s3 put: %w", err)
	}

	return s3Key, nil
}

// buildSSML wraps daemon prose in stage-aware SSML for Polly Neural.
// Neural engine does not support <amazon:auto-breaths/> or prosody pitch —
// only rate, volume, and <break> are supported.
func buildSSML(prose, rate, pause string) string {
	sentences := strings.Split(prose, ". ")
	var parts []string
	for i, sentence := range sentences {
		parts = append(parts, strings.TrimSpace(sentence))
		if i < len(sentences)-1 {
			parts = append(parts, fmt.Sprintf(`<break time="%s"/>`, pause))
		}
	}
	inner := strings.Join(parts, " ")
	return fmt.Sprintf(`<speak><prosody rate="%s">%s</prosody></speak>`, rate, inner)
}
