---
'@harness-engineering/graph': patch
---

Enhance external connectors

- Enhance JiraConnector with comments, acceptance criteria, custom fields, and condenseContent
- Enhance ConfluenceConnector with hierarchy edges, labels, and condenseContent
- Enhance SlackConnector with thread replies, reactions, and condenseContent
- Add retry with exponential backoff to all connectors
- Wire KnowledgeLinker into SyncManager post-processing
