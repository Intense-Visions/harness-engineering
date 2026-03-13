# JSON Output Parsing

## Standard Response Format

```json
{
  "valid": true|false,
  "issues": [
    {
      "file": "path/to/file.ts",
      "line": 42,
      "message": "Description of issue",
      "severity": "error|warning|info",
      "suggestion": "How to fix"
    }
  ],
  "summary": {
    "total": 5,
    "errors": 2,
    "warnings": 3
  }
}
```

## Handling Results

1. Check `valid` field first
2. If `false`, iterate through `issues` array
3. Report each issue with file location
4. Provide actionable fix suggestions
