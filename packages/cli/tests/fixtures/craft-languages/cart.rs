//! Fixture corpus for multi-language craft extraction.
//!
//! One substantive free function, one type with one substantive method, and one
//! one-line trivial function. `compute_total` lives INSIDE a `mod` on purpose:
//! `mod_item` maps to `variable` and nothing recursed into it, so every item in
//! any Rust module was invisible before this phase.

pub mod totals {
    pub fn compute_total(items: &[i32]) -> i32 {
        let mut total = 0;
        for item in items {
            total += item;
        }
        total
    }
}

pub struct Cart {
    items: Vec<i32>,
}

impl Cart {
    pub fn add(&mut self, n: i32) {
        self.items.push(n);
        self.items.sort();
    }
}

fn tiny() -> i32 { 1 }
