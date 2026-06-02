package notifier

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/SherClockHolmes/webpush-go"
	"github.com/aws/aws-lambda-go/events"
	"github.com/google/uuid"
	appconfig "github.com/jamesboder/daemon-code/internal/config"
	"github.com/jamesboder/daemon-code/internal/dynamo"
)

type Notifier struct {
	cfg *appconfig.Config
	ddb *dynamo.Client
}

func New(cfg *appconfig.Config, ddb *dynamo.Client) *Notifier {
	return &Notifier{cfg: cfg, ddb: ddb}
}

func (n *Notifier) Run(ctx context.Context, event events.EventBridgeEvent) error {
	var detail struct {
		UserID string `json:"user_id"`
	}
	if err := json.Unmarshal([]byte(event.Detail), &detail); err != nil {
		return fmt.Errorf("parse event detail: %w", err)
	}

	userID, err := uuid.Parse(detail.UserID)
	if err != nil {
		return fmt.Errorf("parse user_id: %w", err)
	}

	// Load today's shadow state for the prose opening line
	state, err := n.ddb.GetShadowState(ctx, userID.String())
	if err != nil || state == nil {
		return fmt.Errorf("get shadow state: %w", err)
	}

	// Load push subscription
	sub, err := n.ddb.GetPushSubscription(ctx, userID.String())
	if err != nil || sub == nil {
		// No push subscription — user hasn't opted in, not an error
		return nil
	}

	opening := firstSentence(state.DaemonProse)
	return n.sendPush(ctx, *sub, opening)
}

func (n *Notifier) sendPush(_ context.Context, sub dynamo.PushSubscription, proseOpening string) error {
	payload, _ := json.Marshal(map[string]string{
		"title":  "daemon compiled",
		"body":   proseOpening + "...",
		"screen": "home",
	})

	resp, err := webpush.SendNotification(payload, &webpush.Subscription{
		Endpoint: sub.Endpoint,
		Keys: webpush.Keys{
			P256dh: sub.Keys.P256dh,
			Auth:   sub.Keys.Auth,
		},
	}, &webpush.Options{
		VAPIDPublicKey:  n.cfg.VAPIDPublicKey,
		VAPIDPrivateKey: n.cfg.VAPIDPrivateKey,
		TTL:             60 * 60 * 12, // 12 hours
	})
	if err != nil {
		return fmt.Errorf("vapid push: %w", err)
	}
	defer resp.Body.Close()
	return nil
}

func firstSentence(prose string) string {
	if i := strings.Index(prose, ". "); i != -1 {
		return prose[:i]
	}
	if len(prose) > 120 {
		return prose[:120]
	}
	return prose
}
