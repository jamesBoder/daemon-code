package dynamo

import (
	"context"
	"fmt"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
	appconfig "github.com/jamesboder/daemon-code/internal/config"
)

type Client struct {
	ddb        *dynamodb.Client
	tableDecks string
	tableState string
}

func NewClient(cfg *appconfig.Config) *Client {
	awsCfg, err := awsconfig.LoadDefaultConfig(context.Background(),
		awsconfig.WithRegion(cfg.AWSRegion))
	if err != nil {
		panic("dynamo: failed to load AWS config: " + err.Error())
	}
	return &Client{
		ddb:        dynamodb.NewFromConfig(awsCfg),
		tableDecks: cfg.DynamoTableDecks,
		tableState: cfg.DynamoTableState,
	}
}

// ShadowState holds the nightly compile output for a user (prose + audio URL).
// TTL is set to now+24h so stale records self-delete.
type ShadowState struct {
	UserID       string `dynamodbav:"user_id"`
	Date         string `dynamodbav:"date"`
	DaemonProse  string `dynamodbav:"daemon_prose"`
	AudioURL     string `dynamodbav:"audio_url"`
	CompileStats string `dynamodbav:"compile_stats"` // JSON
	TTL          int64  `dynamodbav:"ttl"`
}

func (c *Client) GetShadowState(ctx context.Context, userID string) (*ShadowState, error) {
	date := time.Now().UTC().Format("2006-01-02")
	out, err := c.ddb.GetItem(ctx, &dynamodb.GetItemInput{
		TableName: aws.String(c.tableState),
		Key: map[string]types.AttributeValue{
			"user_id": &types.AttributeValueMemberS{Value: userID},
			"date":    &types.AttributeValueMemberS{Value: date},
		},
	})
	if err != nil {
		return nil, err
	}
	if out.Item == nil {
		return nil, nil
	}
	var s ShadowState
	if err := attributevalue.UnmarshalMap(out.Item, &s); err != nil {
		return nil, fmt.Errorf("unmarshal: %w", err)
	}
	return &s, nil
}

func (c *Client) PutShadowState(ctx context.Context, s ShadowState) error {
	item, err := attributevalue.MarshalMap(s)
	if err != nil {
		return fmt.Errorf("marshal: %w", err)
	}
	_, err = c.ddb.PutItem(ctx, &dynamodb.PutItemInput{
		TableName: aws.String(c.tableState),
		Item:      item,
	})
	return err
}

// DailyDeck holds the fragment queue for a user for a given date.
// TTL is set to now+48h.
type DailyDeck struct {
	UserID    string     `dynamodbav:"user_id"`
	Date      string     `dynamodbav:"date"`
	Fragments []Fragment `dynamodbav:"fragments"`
	TTL       int64      `dynamodbav:"ttl"`
}

// Fragment is a single card in a DailyDeck.
type Fragment struct {
	ID         string `dynamodbav:"id"          json:"id"`
	Type       string `dynamodbav:"type"         json:"type"`
	Payload    string `dynamodbav:"payload"      json:"payload"`
	DaemonNote string `dynamodbav:"daemon_note"  json:"daemon_note"`
	Order      int    `dynamodbav:"order"        json:"order"`
}

func (c *Client) GetDailyDeck(ctx context.Context, userID string) (*DailyDeck, error) {
	date := time.Now().UTC().Format("2006-01-02")
	out, err := c.ddb.GetItem(ctx, &dynamodb.GetItemInput{
		TableName: aws.String(c.tableDecks),
		Key: map[string]types.AttributeValue{
			"user_id": &types.AttributeValueMemberS{Value: userID},
			"date":    &types.AttributeValueMemberS{Value: date},
		},
	})
	if err != nil {
		return nil, err
	}
	if out.Item == nil {
		return nil, nil
	}
	var d DailyDeck
	if err := attributevalue.UnmarshalMap(out.Item, &d); err != nil {
		return nil, fmt.Errorf("unmarshal: %w", err)
	}
	return &d, nil
}

func (c *Client) PutDailyDeck(ctx context.Context, deck DailyDeck) error {
	item, err := attributevalue.MarshalMap(deck)
	if err != nil {
		return fmt.Errorf("marshal: %w", err)
	}
	_, err = c.ddb.PutItem(ctx, &dynamodb.PutItemInput{
		TableName: aws.String(c.tableDecks),
		Item:      item,
	})
	return err
}

// PushSubscription stores the browser Web Push subscription for a user.
// Keyed by user_id in the shadow_state table under a separate item type.
type PushSubscription struct {
	Endpoint string `dynamodbav:"endpoint" json:"endpoint"`
	Keys     struct {
		P256dh string `dynamodbav:"p256dh" json:"p256dh"`
		Auth   string `dynamodbav:"auth"   json:"auth"`
	} `dynamodbav:"keys" json:"keys"`
}

func (c *Client) GetPushSubscription(ctx context.Context, userID string) (*PushSubscription, error) {
	out, err := c.ddb.GetItem(ctx, &dynamodb.GetItemInput{
		TableName: aws.String(c.tableState),
		Key: map[string]types.AttributeValue{
			"user_id": &types.AttributeValueMemberS{Value: userID},
			"date":    &types.AttributeValueMemberS{Value: "push_subscription"},
		},
	})
	if err != nil {
		return nil, err
	}
	if out.Item == nil {
		return nil, nil
	}
	var sub PushSubscription
	if err := attributevalue.UnmarshalMap(out.Item, &sub); err != nil {
		return nil, fmt.Errorf("unmarshal: %w", err)
	}
	return &sub, nil
}

func (c *Client) PutPushSubscription(ctx context.Context, userID string, sub PushSubscription) error {
	type item struct {
		PushSubscription
		UserID string `dynamodbav:"user_id"`
		Date   string `dynamodbav:"date"`
	}
	i := item{PushSubscription: sub, UserID: userID, Date: "push_subscription"}
	av, err := attributevalue.MarshalMap(i)
	if err != nil {
		return fmt.Errorf("marshal: %w", err)
	}
	_, err = c.ddb.PutItem(ctx, &dynamodb.PutItemInput{
		TableName: aws.String(c.tableState),
		Item:      av,
	})
	return err
}
