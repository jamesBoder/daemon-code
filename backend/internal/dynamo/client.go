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

// ShadowState holds the nightly compile output for a user (prose + audio URL + shadow prompt).
// TTL is set to now+365d so entries persist in the Chronicle for one year.
type ShadowState struct {
	UserID       string `dynamodbav:"user_id"`
	Date         string `dynamodbav:"date"`
	DayNumber    int    `dynamodbav:"day_number"` // compile count at time of write; used by Chronicle
	OrbState     string `dynamodbav:"orb_state"`  // profile.Stage at time of compile; used by Chronicle
	DaemonProse  string `dynamodbav:"daemon_prose"`
	ShadowPrompt string `dynamodbav:"shadow_prompt"` // Mirror Method question; written by Narrator
	AudioURL     string `dynamodbav:"audio_url"`
	CompileStats string `dynamodbav:"compile_stats"` // JSON []CompileStat
	RecentDiff   string `dynamodbav:"recent_diff"`   // JSON []ProcessDiff; written by Analyst
	SignalQuote  string `dynamodbav:"signal_quote"`  // written by SignalSelector (Step 7)
	SignalAuthor string `dynamodbav:"signal_author"` // written by SignalSelector (Step 7)
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

// GetChronicle returns all nightly prose entries for a user, newest first.
// Uses begins_with on the sort key to exclude non-date items (e.g. "push_subscription").
func (c *Client) GetChronicle(ctx context.Context, userID string, limit int32) ([]ShadowState, error) {
	out, err := c.ddb.Query(ctx, &dynamodb.QueryInput{
		TableName:                aws.String(c.tableState),
		KeyConditionExpression:   aws.String("user_id = :uid AND begins_with(#d, :prefix)"),
		ExpressionAttributeNames: map[string]string{"#d": "date"},
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":uid":    &types.AttributeValueMemberS{Value: userID},
			":prefix": &types.AttributeValueMemberS{Value: "20"},
		},
		ScanIndexForward: aws.Bool(false),
		Limit:            &limit,
	})
	if err != nil {
		return nil, fmt.Errorf("chronicle query: %w", err)
	}
	var entries []ShadowState
	if err := attributevalue.UnmarshalListOfMaps(out.Items, &entries); err != nil {
		return nil, fmt.Errorf("unmarshal chronicle: %w", err)
	}
	return entries, nil
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

// PutSignalFields writes signal_quote and signal_author onto an existing ShadowState
// item without overwriting other fields. Returns ConditionalCheckFailedException
// (from types package) if the item does not exist yet.
func (c *Client) PutSignalFields(ctx context.Context, userID, date, quote, author string) error {
	_, err := c.ddb.UpdateItem(ctx, &dynamodb.UpdateItemInput{
		TableName: aws.String(c.tableState),
		Key: map[string]types.AttributeValue{
			"user_id": &types.AttributeValueMemberS{Value: userID},
			"date":    &types.AttributeValueMemberS{Value: date},
		},
		UpdateExpression: aws.String("SET signal_quote = :q, signal_author = :a"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":q": &types.AttributeValueMemberS{Value: quote},
			":a": &types.AttributeValueMemberS{Value: author},
		},
		ConditionExpression: aws.String("attribute_exists(user_id)"),
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
