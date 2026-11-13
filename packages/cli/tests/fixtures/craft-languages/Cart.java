// Fixture corpus for multi-language craft extraction.
//
// One substantive static method, one substantive instance method, and one
// one-line trivial method. Java emits ONE top-level symbol for this file: a
// flat read of `outline.symbols` returns only `class:Cart` and reads as broken
// extraction.
package cart;

import java.util.ArrayList;
import java.util.List;

public class Cart {
    private final List<Integer> items = new ArrayList<>();

    public static int computeTotal(List<Integer> values) {
        int total = 0;
        for (int value : values) {
            total += value;
        }
        return total;
    }

    public void add(int n) {
        this.items.add(n);
        this.items.sort(null);
    }

    int tiny() { return 1; }
}
