package dynamo

import (
	"context"
	"fmt"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
)

const pulseSortKey = "pulse"

// PulseScenario is the daily Map scenario with its pre-generated daemon text.
type PulseScenario struct {
	ScenarioID          string `dynamodbav:"scenario_id"`
	Type                string `dynamodbav:"type"`
	Tier                string `dynamodbav:"tier"`
	Text                string `dynamodbav:"text"`
	DaemonObs           string `dynamodbav:"daemon_observation"`
	DaemonPrediction    string `dynamodbav:"daemon_prediction"`
	ObservationAudioURL string `dynamodbav:"observation_audio_url"` // S3 key for the spoken observation (8b); empty when synthesis was skipped
}

// PulseNodeSignal is one directional dimension tag on a node.
type PulseNodeSignal struct {
	Direction string `dynamodbav:"direction"`
}

// PulseNode is one of the 6 selected Map nodes.
// DimensionSignals are server-only — the handler strips them before responding.
// NodeID is the stable library node ID from signal/scenarios.go, never positional.
type PulseNode struct {
	NodeID           string                     `dynamodbav:"node_id"`
	Text             string                     `dynamodbav:"text"`
	DimensionSignals map[string]PulseNodeSignal `dynamodbav:"dimension_signals"`
}

// PulseItem is the daily Map stored in tableDecks with sort key "pulse".
// Full replacement of the old stimulus/word_options schema; old items are
// detected by Scenario.ScenarioID == "" and treated as not-found (they expire
// within the 26h TTL).
type PulseItem struct {
	UserID      string        `dynamodbav:"user_id"`
	Date        string        `dynamodbav:"date"`
	Scenario    PulseScenario `dynamodbav:"scenario"`
	Nodes       []PulseNode   `dynamodbav:"nodes"`
	CompletedAt string        `dynamodbav:"completed_at"` // ISO timestamp; empty = not yet completed
	TTL         int64         `dynamodbav:"ttl"`
}

const pulseTTL = 26 * time.Hour

func (c *Client) GetPulse(ctx context.Context, userID string) (*PulseItem, error) {
	out, err := c.ddb.GetItem(ctx, &dynamodb.GetItemInput{
		TableName: aws.String(c.tableDecks),
		Key: map[string]types.AttributeValue{
			"user_id": &types.AttributeValueMemberS{Value: userID},
			"date":    &types.AttributeValueMemberS{Value: pulseSortKey},
		},
	})
	if err != nil {
		return nil, err
	}
	if out.Item == nil {
		return nil, nil
	}
	var item PulseItem
	if err := attributevalue.UnmarshalMap(out.Item, &item); err != nil {
		return nil, fmt.Errorf("unmarshal pulse: %w", err)
	}
	return &item, nil
}

func (c *Client) PutPulse(ctx context.Context, item PulseItem) error {
	item.Date = pulseSortKey
	item.TTL = time.Now().Add(pulseTTL).Unix()
	av, err := attributevalue.MarshalMap(item)
	if err != nil {
		return fmt.Errorf("marshal pulse: %w", err)
	}
	_, err = c.ddb.PutItem(ctx, &dynamodb.PutItemInput{
		TableName: aws.String(c.tableDecks),
		Item:      av,
	})
	return err
}

// SetPulseCompleted marks the pulse as completed by setting completed_at to now.
// Non-fatal if the item no longer exists (TTL expiry edge case).
func (c *Client) SetPulseCompleted(ctx context.Context, userID string) error {
	_, err := c.ddb.UpdateItem(ctx, &dynamodb.UpdateItemInput{
		TableName: aws.String(c.tableDecks),
		Key: map[string]types.AttributeValue{
			"user_id": &types.AttributeValueMemberS{Value: userID},
			"date":    &types.AttributeValueMemberS{Value: pulseSortKey},
		},
		UpdateExpression: aws.String("SET completed_at = :ts"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":ts": &types.AttributeValueMemberS{Value: time.Now().UTC().Format(time.RFC3339)},
		},
	})
	return err
}
