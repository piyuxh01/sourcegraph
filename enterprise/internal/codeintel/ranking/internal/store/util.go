package store

import "time"

// TODO - configure these via envvar
const (
	vacuumBatchSize = 100
	threshold       = time.Duration(1) * time.Hour
)

func batchChannel[T any](ch <-chan T, batchSize int) <-chan []T {
	batches := make(chan []T)
	go func() {
		defer close(batches)

		batch := make([]T, 0, batchSize)
		for value := range ch {
			batch = append(batch, value)

			if len(batch) == batchSize {
				batches <- batch
				batch = make([]T, 0, batchSize)
			}
		}

		if len(batch) > 0 {
			batches <- batch
		}
	}()

	return batches
}
