package perforce

// TODO: review. BCC'd from ADO implementation to make it "work" initially

import (
	"time"
)

type PerforceEvent string

// BaseEvent is used to parse Azure DevOps events into the correct event struct.
type BaseEvent struct {
	EventType PerforceEvent `json:"eventType"`
}

type PullRequestEvent struct {
	ID          string                  `json:"id"`
	EventType   PerforceEvent           `json:"eventType"`
	PullRequest PullRequest             `json:"resource"`
	Message     PullRequestEventMessage `json:"message"`
	CreatedDate time.Time               `json:"createdDate"`
}

type PullRequestMergedEvent PullRequestEvent
type PullRequestUpdatedEvent PullRequestEvent
type PullRequestApprovedEvent PullRequestEvent
type PullRequestApprovedWithSuggestionsEvent PullRequestEvent
type PullRequestRejectedEvent PullRequestEvent
type PullRequestWaitingForAuthorEvent PullRequestEvent

type PullRequestEventMessage struct {
	Text string `json:"text"`
}
