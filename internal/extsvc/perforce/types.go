package perforce

import (
	"time"
)

// TODO: this was just blindly copied from the ADO implementation in order to make things "work" initially
// need to probably switch most of this out for Changelist vernacular

type PullRequestStatus string

type CreatorInfo struct {
	ID          string `json:"id"`
	DisplayName string `json:"displayName"`
	UniqueName  string `json:"uniqueName"`
	URL         string `json:"url"`
	ImageURL    string `json:"imageUrl"`
}

type Repository struct {
	ID         string  `json:"id"`
	Name       string  `json:"name"`
	CloneURL   string  `json:"remoteURL"`
	APIURL     string  `json:"url"`
	SSHURL     string  `json:"sshUrl"`
	WebURL     string  `json:"webUrl"`
	IsDisabled bool    `json:"isDisabled"`
	IsFork     bool    `json:"isFork"`
	Project    Project `json:"project"`
}

func (p Repository) Namespace() string {
	return p.Project.Name
}

type Project struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	State      string `json:"state"`
	Revision   int    `json:"revision"`
	Visibility string `json:"visibility"`
	URL        string `json:"url"`
}

type PullRequestCommit struct {
	CommitID string `json:"commitId"`
	URL      string `json:"url"`
}

type ForkRef struct {
	Repository Repository `json:"repository"`
	Name       string     `json:"name"`
	URl        string     `json:"url"`
}

type Reviewer struct {
	// Vote represents the status of a review on Azure DevOps. Here are possible values for Vote:
	//
	//   10: approved
	//   5 : approved with suggestions
	//   0 : no vote
	//  -5 : waiting for author
	//  -10: rejected
	Vote        int    `json:"vote"`
	ID          string `json:"id"`
	HasDeclined bool   `json:"hasDeclined"`
	IsRequired  bool   `json:"isRequired"`
	UniqueName  string `json:"uniqueName"`
}

type PullRequest struct {
	Repository            Repository        `json:"repository"`
	ID                    int               `json:"pullRequestId"`
	CodeReviewID          int               `json:"codeReviewId"`
	Status                PullRequestStatus `json:"status"`
	CreationDate          time.Time         `json:"creationDate"`
	Title                 string            `json:"title"`
	Description           string            `json:"description"`
	CreatedBy             CreatorInfo       `json:"createdBy"`
	SourceRefName         string            `json:"sourceRefName"`
	TargetRefName         string            `json:"targetRefName"`
	MergeStatus           string            `json:"mergeStatus"`
	MergeID               string            `json:"mergeId"`
	LastMergeSourceCommit PullRequestCommit `json:"lastMergeSourceCommit"`
	LastMergeTargetCommit PullRequestCommit `json:"lastMergeTargetCommit"`
	SupportsIterations    bool              `json:"supportsIterations"`
	ArtifactID            string            `json:"artifactId"`
	Reviewers             []Reviewer        `json:"reviewers"`
	ForkSource            *ForkRef          `json:"forkSource"`
	URL                   string            `json:"url"`
	IsDraft               bool              `json:"isDraft"`
}

type PullRequestBuildStatus struct {
	ID           int                    `json:"id"`
	State        PullRequestStatusState `json:"state"`
	Description  string                 `json:"description"`
	CreationDate time.Time              `json:"creationDate"`
	UpdateDate   time.Time              `json:"updatedDate"`
	CreatedBy    CreatorInfo            `json:"createdBy"`
}

type PullRequestStatusState string
