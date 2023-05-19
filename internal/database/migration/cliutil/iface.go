package cliutil

import (
	"github.com/sourcegraph/sourcegraph/internal/database/migration/runner"
	"github.com/sourcegraph/sourcegraph/lib/output"
)

// OutputFactory allows providing global output that might not be instantiated at compile time.
type OutputFactory func() *output.Output

type RunnerFactory func(schemaNames []string) (*runner.Runner, error)
