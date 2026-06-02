package lambda

import (
	"context"
	"encoding/base64"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"

	"github.com/aws/aws-lambda-go/events"
	awslambda "github.com/aws/aws-lambda-go/lambda"
)

// Start wires an http.Handler into a Lambda Function URL handler.
func Start(mux http.Handler) {
	awslambda.Start(func(ctx context.Context, req events.LambdaFunctionURLRequest) (events.LambdaFunctionURLResponse, error) {
		return handle(ctx, mux, req)
	})
}

func handle(ctx context.Context, mux http.Handler, req events.LambdaFunctionURLRequest) (events.LambdaFunctionURLResponse, error) {
	body := req.Body
	if req.IsBase64Encoded {
		decoded, err := base64.StdEncoding.DecodeString(body)
		if err != nil {
			return events.LambdaFunctionURLResponse{StatusCode: 400}, nil
		}
		body = string(decoded)
	}

	httpReq, err := http.NewRequestWithContext(ctx, req.RequestContext.HTTP.Method, req.RawPath, strings.NewReader(body))
	if err != nil {
		return events.LambdaFunctionURLResponse{StatusCode: 500}, nil
	}
	for k, v := range req.Headers {
		httpReq.Header.Set(k, v)
	}
	if req.RawQueryString != "" {
		httpReq.URL.RawQuery = req.RawQueryString
	}

	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, httpReq)

	resp := rec.Result()
	respBody, _ := io.ReadAll(resp.Body)

	headers := make(map[string]string)
	for k := range resp.Header {
		headers[k] = resp.Header.Get(k)
	}

	return events.LambdaFunctionURLResponse{
		StatusCode: resp.StatusCode,
		Headers:    headers,
		Body:       string(respBody),
	}, nil
}
