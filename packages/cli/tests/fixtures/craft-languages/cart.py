"""Fixture corpus for multi-language craft extraction.

One substantive free function, one type with one substantive method, and one
one-line trivial function. The method is DECORATED on purpose: a decorated
`def` is wrapped in a `decorated_definition` node, and before this phase it
was invisible to the outline.
"""


def compute_total(items):
    total = 0
    for item in items:
        total += item
    return total


class Cart:
    @staticmethod
    def add(items, n):
        updated = list(items)
        updated.append(n)
        return updated


def tiny(): return 1
