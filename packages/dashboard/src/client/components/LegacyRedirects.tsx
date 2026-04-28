import { Navigate, Route } from 'react-router';

/**
 * Redirect routes for old flat URLs to their new domain-prefixed equivalents.
 * Preserves bookmarks and external links.
 */
export const legacyRedirectRoutes = (
  <>
    {/* Intelligence domain */}
    <Route path="/health" element={<Navigate to="/intelligence/health" replace />} />
    <Route path="/graph" element={<Navigate to="/intelligence/graph" replace />} />
    <Route path="/impact" element={<Navigate to="/intelligence/impact" replace />} />
    <Route path="/decay-trends" element={<Navigate to="/intelligence/decay" replace />} />
    <Route path="/traceability" element={<Navigate to="/intelligence/traceability" replace />} />

    {/* Agents domain */}
    <Route path="/orchestrator" element={<Navigate to="/agents" replace />} />
    <Route path="/orchestrator/attention" element={<Navigate to="/agents/attention" replace />} />
    <Route path="/orchestrator/analyze" element={<Navigate to="/agents/analyze" replace />} />
    <Route path="/orchestrator/chat" element={<Navigate to="/" replace />} />
    <Route
      path="/orchestrator/maintenance"
      element={<Navigate to="/agents/maintenance" replace />}
    />
    <Route path="/orchestrator/streams" element={<Navigate to="/agents/streams" replace />} />

    {/* Adoption moved under roadmap */}
    <Route path="/adoption" element={<Navigate to="/roadmap/adoption" replace />} />
  </>
);
