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

// PulseStimulus is the behavioral probe generated nightly.
// All type-specific fields use omitempty — only the fields for the given Type are populated.
type PulseStimulus struct {
	StimulusID       string            `dynamodbav:"stimulus_id"                  json:"stimulus_id"`
	Type             string            `dynamodbav:"type"                         json:"type"`
	Word             string            `dynamodbav:"word,omitempty"               json:"word,omitempty"`
	Left             string            `dynamodbav:"left,omitempty"               json:"left,omitempty"`
	Right            string            `dynamodbav:"right,omitempty"              json:"right,omitempty"`
	Scenario         string            `dynamodbav:"scenario,omitempty"           json:"scenario,omitempty"`
	DaemonPrediction string            `dynamodbav:"daemon_prediction,omitempty"  json:"daemon_prediction,omitempty"`
	DimensionProbed  string            `dynamodbav:"dimension_probed"             json:"dimension_probed"`
	DaemonObs        map[string]string `dynamodbav:"daemon_observations"          json:"daemon_observations"`
}

// PulseWordOption is a word chip for Pick a Word, with its two signal axes.
type PulseWordOption struct {
	Word     string `dynamodbav:"word"     json:"word"`
	Approach bool   `dynamodbav:"approach" json:"approach"`
	Abstract bool   `dynamodbav:"abstract" json:"abstract"`
}

// PulseItem is the daily pulse stored in tableDecks with sort key "pulse".
type PulseItem struct {
	UserID      string            `dynamodbav:"user_id"`
	Date        string            `dynamodbav:"date"`
	Stimulus    PulseStimulus     `dynamodbav:"stimulus"`
	WordOptions []PulseWordOption `dynamodbav:"word_options"`
	CompletedAt string            `dynamodbav:"completed_at"` // ISO timestamp; empty = not yet completed
	TTL         int64             `dynamodbav:"ttl"`
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
