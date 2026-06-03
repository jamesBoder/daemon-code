package config

import (
	"context"
	"encoding/json"
	"os"
	"strconv"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/secretsmanager"
)

type Config struct {
	AWSRegion        string
	DBHost           string
	DBPort           string
	DBName           string
	DBUser           string
	DBPassword       string
	JWTSecret        string
	AnthropicAPIKey  string
	AudioBucket      string
	SQSQueueURL      string // orchestrator → per-user Analyst fan-out
	DynamoTableDecks string
	DynamoTableState string
	VAPIDPublicKey   string
	VAPIDPrivateKey  string
	EventBusName     string // custom EventBridge bus name for inter-Lambda events
	Environment      string
	AllowedOrigin    string // CORS allowed origin; empty = "*" (local dev)
}

type dbSecret struct {
	Host     string `json:"host"`
	Port     int    `json:"port"` // RDS managed secrets emit port as integer
	DBName   string `json:"dbname"`
	Username string `json:"username"`
	Password string `json:"password"`
}

type vapidSecret struct {
	PublicKey  string `json:"public_key"`
	PrivateKey string `json:"private_key"`
}

func Load() *Config {
	region := os.Getenv("AWS_REGION")
	if region == "" {
		region = "us-east-1"
	}

	cfg := &Config{
		AWSRegion:        region,
		AudioBucket:      os.Getenv("AUDIO_BUCKET"),
		SQSQueueURL:      os.Getenv("SQS_ANALYST_QUEUE_URL"),
		DynamoTableDecks: os.Getenv("DYNAMO_TABLE_DECKS"),
		DynamoTableState: os.Getenv("DYNAMO_TABLE_STATE"),
		EventBusName:     os.Getenv("EVENT_BUS_NAME"),
		Environment:      os.Getenv("ENVIRONMENT"),
		AllowedOrigin:    os.Getenv("ALLOWED_ORIGIN"),
	}

	awsCfg, err := awsconfig.LoadDefaultConfig(context.Background(), awsconfig.WithRegion(region))
	if err != nil {
		panic("failed to load AWS config: " + err.Error())
	}
	sm := secretsmanager.NewFromConfig(awsCfg)

	type secretResult struct {
		name  string
		value string
		err   error
	}

	arns := map[string]string{
		"db":        os.Getenv("DB_SECRET_ARN"),
		"jwt":       os.Getenv("JWT_SECRET_ARN"),
		"anthropic": os.Getenv("ANTHROPIC_API_KEY_ARN"),
		"vapid":     os.Getenv("VAPID_SECRET_ARN"),
	}

	// Count only non-empty ARNs to avoid deadlock waiting on goroutines never started.
	var goroutineCount int
	for _, arn := range arns {
		if arn != "" {
			goroutineCount++
		}
	}

	results := make(chan secretResult, goroutineCount)
	for name, arn := range arns {
		if arn == "" {
			continue
		}
		go func(name, arn string) {
			out, err := sm.GetSecretValue(context.Background(), &secretsmanager.GetSecretValueInput{
				SecretId: aws.String(arn),
			})
			if err != nil || out.SecretString == nil {
				results <- secretResult{name: name, err: err}
				return
			}
			results <- secretResult{name: name, value: *out.SecretString}
		}(name, arn)
	}

	fetched := 0
	for fetched < goroutineCount {
		r := <-results
		fetched++
		if r.err != nil || r.value == "" {
			continue
		}
		switch r.name {
		case "db":
			var s dbSecret
			if json.Unmarshal([]byte(r.value), &s) == nil {
				cfg.DBHost = s.Host
				cfg.DBPort = strconv.Itoa(s.Port)
				cfg.DBName = s.DBName
				cfg.DBUser = s.Username
				cfg.DBPassword = s.Password
			}
		case "jwt":
			cfg.JWTSecret = r.value
		case "anthropic":
			cfg.AnthropicAPIKey = r.value
		case "vapid":
			var v vapidSecret
			if json.Unmarshal([]byte(r.value), &v) == nil {
				cfg.VAPIDPublicKey = v.PublicKey
				cfg.VAPIDPrivateKey = v.PrivateKey
			}
		}
	}

	// Local dev fallbacks: when secret ARNs are not set, read secrets directly
	// from plain env vars. In Lambda the ARNs are always present; locally they are not.
	if cfg.DBHost == "" {
		cfg.DBHost = os.Getenv("DB_HOST")
		cfg.DBPort = os.Getenv("DB_PORT")
		if cfg.DBPort == "" {
			cfg.DBPort = "5432"
		}
		cfg.DBName = os.Getenv("DB_NAME")
		cfg.DBUser = os.Getenv("DB_USER")
		cfg.DBPassword = os.Getenv("DB_PASSWORD")
	}
	if cfg.JWTSecret == "" {
		cfg.JWTSecret = os.Getenv("JWT_SECRET")
	}
	if cfg.AnthropicAPIKey == "" {
		cfg.AnthropicAPIKey = os.Getenv("ANTHROPIC_API_KEY")
	}
	if cfg.VAPIDPublicKey == "" {
		cfg.VAPIDPublicKey = os.Getenv("VAPID_PUBLIC_KEY")
		cfg.VAPIDPrivateKey = os.Getenv("VAPID_PRIVATE_KEY")
	}

	return cfg
}
