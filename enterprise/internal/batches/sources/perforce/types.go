package perforce

import "github.com/sourcegraph/sourcegraph/internal/extsvc/perforce"

// just a shell because Perforce doesn't do pull requests
type AnnotatedPullRequest struct {
	*perforce.PullRequest
	Statuses []*perforce.PullRequestBuildStatus
}
