// Package cart is a fixture corpus for multi-language craft extraction.
//
// One substantive free function, one struct with one substantive method, and
// one one-line trivial function. The struct is the Go kind-normalization case:
// code-nav emits `type` for it, and every code-craft rubric selects on
// 'function' | 'method' | 'class'.
package cart

func computeTotal(items []int) int {
	total := 0
	for _, item := range items {
		total += item
	}
	return total
}

type Cart struct {
	items []int
	total int
}

func (c *Cart) Add(n int) {
	c.items = append(c.items, n)
	c.total += n
}

func tiny() int { return 1 }
