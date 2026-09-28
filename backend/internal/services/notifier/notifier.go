package notifier

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
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

	// Load the freshest shadow state for the prose opening line. The Narrator
	// stamps items with the date they serve (tomorrow for the nightly run), so
	// an exact-today read here would miss the prose just written.
	state, err := n.ddb.GetLatestShadowState(ctx, userID.String())
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
	gone, err := n.sendPush(ctx, userID, *sub, opening)
	if gone {
		log.Printf("notifier: push subscription for user %s was dead, cleaned up (not delivered)", userID)
	}
	return err
}

func (n *Notifier) sendPush(ctx context.Context, userID uuid.UUID, sub dynamo.PushSubscription, proseOpening string) (gone bool, err error) {
	payload, _ := json.Marshal(map[string]string{
		"title": "daemon compiled",
		"body":  proseOpening + "...",
		"url":   "/play", // the service worker reads url; the old "screen" key was ignored
	})
	return n.push(ctx, userID, sub, payload)
}

// push reports whether the subscription turned out to be dead (gone=true,
// cleaned up, err=nil) as distinct from a real delivery (gone=false, err=nil)
// -- callers must not treat "no error" alone as "delivered": a caller that
// counted both the same way (e.g. an aggregate sent/failed tally) would
// silently report 100% success on a night every subscription went stale,
// hiding a real delivery outage behind the only observability this Lambda
// has (found during a full-PR review).
func (n *Notifier) push(ctx context.Context, userID uuid.UUID, sub dynamo.PushSubscription, payload []byte) (gone bool, err error) {
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
		return false, fmt.Errorf("vapid push: %w", err)
	}
	defer resp.Body.Close()

	dead, err := classifyPushStatus(resp.StatusCode)
	if dead {
		// Permanently expired/unsubscribed: drop it so it isn't retried nightly.
		if delErr := n.ddb.DeletePushSubscription(ctx, userID.String()); delErr != nil {
			return false, fmt.Errorf("delete expired push subscription: %w", delErr)
		}
		return true, nil
	}
	return false, err
}

// classifyPushStatus maps a push service HTTP status to an outcome: gone
// (404/410 — the subscription is permanently dead) or an error for any other
// non-2xx (transient, worth surfacing in the logs).
func classifyPushStatus(status int) (gone bool, err error) {
	switch {
	case status >= 200 && status < 300:
		return false, nil
	case status == http.StatusNotFound || status == http.StatusGone:
		return true, nil
	default:
		return false, fmt.Errorf("push service returned status %d", status)
	}
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

// Reminder copy — a plain system nudge, deliberately not the daemon's voice
// (the daemon never comments on engagement; see docs/simplify-pass.md).
const (
	reminderTitle = "daemon code"
	reminderBody  = "Today's session is ready."
	reminderURL   = "/play"
)

// Remind sends the "haven't played today" push to one user. A user with no
// push subscription is skipped silently — they never opted in. gone=true
// means the subscription was found dead and cleaned up, not delivered to --
// callers doing aggregate sent/failed counting must track this as its own
// bucket, not fold it into either one (see push's own doc comment).
func (n *Notifier) Remind(ctx context.Context, userID uuid.UUID) (gone bool, err error) {
	sub, err := n.ddb.GetPushSubscription(ctx, userID.String())
	if err != nil {
		return false, fmt.Errorf("get push subscription: %w", err)
	}
	if sub == nil {
		return false, nil
	}
	payload, _ := json.Marshal(map[string]string{
		"title": reminderTitle,
		"body":  reminderBody,
		"url":   reminderURL,
	})
	return n.push(ctx, userID, *sub, payload)
}
