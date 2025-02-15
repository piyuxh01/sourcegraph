package internalerrs

import (
	"strings"

	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// callBackClientStream is a grpc.ClientStream that calls a function after SendMsg and RecvMsg.
type callBackClientStream struct {
	grpc.ClientStream

	postMessageSend    func(error)
	postMessageReceive func(error)
}

func (c *callBackClientStream) SendMsg(m interface{}) error {
	err := c.ClientStream.SendMsg(m)
	c.postMessageSend(err)

	return err
}

func (c *callBackClientStream) RecvMsg(m interface{}) error {
	err := c.ClientStream.RecvMsg(m)
	c.postMessageReceive(err)

	return err
}

var _ grpc.ClientStream = &callBackClientStream{}

// probablyInternalGRPCError checks if a gRPC status likely represents an error that comes from
// the go-grpc library.
//
// Note: this is a heuristic and may not be 100% accurate.
// From a cursory glance at the go-grpc source code, it seems most errors are prefixed with "grpc:". This may break in the future, but
// it's better than nothing.
// Some other ad-hoc errors that we traced back to the go-grpc library are also checked for.
func probablyInternalGRPCError(s *status.Status, checkers []internalGRPCErrorChecker) bool {
	if s.Code() == codes.OK {
		return false
	}

	for _, checker := range checkers {
		if checker(s) {
			return true
		}
	}

	return false
}

// internalGRPCErrorChecker is a function that checks if a gRPC status likely represents an error that comes from
// the go-grpc library.
type internalGRPCErrorChecker func(*status.Status) bool

// allCheckers is a list of functions that check if a gRPC status likely represents an
// error that comes from the go-grpc library.
var allCheckers = []internalGRPCErrorChecker{
	gRPCPrefixChecker,
	gRPCResourceExhaustedChecker,
}

// gRPCPrefixChecker checks if a gRPC status likely represents an error that comes from the go-grpc library, by checking if the error message
// is prefixed with "grpc: ".
func gRPCPrefixChecker(s *status.Status) bool {
	return s.Code() != codes.OK && strings.HasPrefix(s.Message(), "grpc: ")
}

// gRPCResourceExhaustedChecker checks if a gRPC status likely represents an error that comes from the go-grpc library, by checking if the error message
// is prefixed with "trying to send message larger than max".
func gRPCResourceExhaustedChecker(s *status.Status) bool {
	// Observed from https://github.com/grpc/grpc-go/blob/756119c7de49e91b6f3b9d693b9850e1598938eb/stream.go#L884
	return s.Code() == codes.ResourceExhausted && strings.HasPrefix(s.Message(), "trying to send message larger than max (")
}

// splitMethodName splits a full gRPC method name in to its components (service, method)
//
// Copied from github.com/grpc-ecosystem/go-grpc-middleware/v2/interceptors/reporter.go
func splitMethodName(fullMethod string) (string, string) {
	fullMethod = strings.TrimPrefix(fullMethod, "/") // remove leading slash
	if i := strings.Index(fullMethod, "/"); i >= 0 {
		return fullMethod[:i], fullMethod[i+1:]
	}
	return "unknown", "unknown"
}
