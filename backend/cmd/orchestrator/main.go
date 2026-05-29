package main

import (
	"context"
	"encoding/json"
	"log"

	awslambda "github.com/aws/aws-lambda-go/lambda"
	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/sqs"
	appconfig "github.com/jamesboder/daemon-code/internal/config"
	"github.com/jamesboder/daemon-code/internal/db"
)

func main() {
	cfg := appconfig.Load()

	pool, err := db.NewPool(cfg)
	if err != nil {
		log.Fatalf("db pool: %v", err)
	}
	queries := db.New(pool)

	awsCfg, err := awsconfig.LoadDefaultConfig(context.Background(), awsconfig.WithRegion(cfg.AWSRegion))
	if err != nil {
		log.Fatalf("aws config: %v", err)
	}
	sqsClient := sqs.NewFromConfig(awsCfg)

	awslambda.Start(func(ctx context.Context) error {
		users, err := queries.GetAllActiveUsers(ctx)
		if err != nil {
			return err
		}

		for _, u := range users {
			msg, _ := json.Marshal(map[string]string{"user_id": u.ID.String()})
			_, err := sqsClient.SendMessage(ctx, &sqs.SendMessageInput{
				QueueUrl:    aws.String(cfg.SQSQueueURL),
				MessageBody: aws.String(string(msg)),
			})
			if err != nil {
				log.Printf("failed to enqueue user %s: %v", u.ID, err)
			}
		}
		return nil
	})
}
