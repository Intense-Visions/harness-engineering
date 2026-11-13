"""Fixture corpus for multi-language craft extraction — the test-shaped Python file.

`test-craft` ALREADY extracts Python tests in production (`extractPythonTests`,
routed at test-craft/index.ts), so widening its `supportedLanguages` to include
python is a legitimate Phase 2b change. Without this fixture the capability
subset law reddens that widening with "no fixture" — a law that blocks a legal
change rather than an illegal one. Measured during the Phase 3 Task 7 drill.
"""


def test_compute_total():
    assert compute_total([1, 2]) == 3
