export function graphNotFoundError() {
  return {
    content: [
      {
        type: 'text' as const,
        text: 'No graph found. Run `harness graph scan` or use `ingest_source` tool first.',
      },
    ],
    isError: true,
  };
}
