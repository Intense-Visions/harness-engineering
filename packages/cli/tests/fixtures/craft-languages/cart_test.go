package cart

import "testing"

func TestComputeTotal(t *testing.T) {
	got := computeTotal([]int{1, 2})
	if got != 3 {
		t.Fatalf("want 3, got %d", got)
	}
}
