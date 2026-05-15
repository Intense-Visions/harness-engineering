import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router';
import { ChatLayout } from './components/layout/ChatLayout';
import { HomeRoute, ThreadRoute, SystemRoute } from './components/layout/ThreadView';
import { ProjectPulseProvider } from './hooks/useProjectPulse';
import './index.css';

// Legacy route redirects: map old domain-prefixed and flat routes to /s/:page
const LEGACY_REDIRECTS: Array<{ from: string; to: string }> = [
  // Intelligence domain
  { from: '/intelligence/health', to: '/s/health' },
  { from: '/intelligence/graph', to: '/s/graph' },
  { from: '/intelligence/impact', to: '/s/impact' },
  { from: '/intelligence/decay', to: '/s/decay' },
  { from: '/intelligence/traceability', to: '/s/traceability' },
  // Agents domain
  { from: '/agents', to: '/s/orchestrator' },
  { from: '/agents/attention', to: '/s/attention' },
  { from: '/agents/analyze', to: '/s/analyze' },
  { from: '/agents/maintenance', to: '/s/maintenance' },
  { from: '/agents/streams', to: '/s/streams' },
  // Roadmap domain
  { from: '/roadmap', to: '/s/roadmap' },
  { from: '/roadmap/adoption', to: '/s/adoption' },
  // Flat legacy routes
  { from: '/health', to: '/s/health' },
  { from: '/graph', to: '/s/graph' },
  { from: '/impact', to: '/s/impact' },
  { from: '/decay-trends', to: '/s/decay' },
  { from: '/traceability', to: '/s/traceability' },
  { from: '/orchestrator', to: '/s/orchestrator' },
  { from: '/orchestrator/attention', to: '/s/attention' },
  { from: '/orchestrator/analyze', to: '/s/analyze' },
  { from: '/orchestrator/chat', to: '/' },
  { from: '/orchestrator/maintenance', to: '/s/maintenance' },
  { from: '/orchestrator/streams', to: '/s/streams' },
  { from: '/adoption', to: '/s/adoption' },
  // Phase 5: prompt-cache insights surface — preferred URL is `/insights/cache`
  // per the plan; the actual page lives at the SystemRoute-style `/s/insights-cache`.
  { from: '/insights/cache', to: '/s/insights-cache' },
];

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <ProjectPulseProvider>
        <BrowserRouter>
          <ChatLayout>
            <Routes>
              {/* Core chat-first routes */}
              <Route path="/" element={<HomeRoute />} />
              <Route path="/t/:threadId" element={<ThreadRoute />} />
              <Route path="/s/:systemPage" element={<SystemRoute />} />

              {/* Legacy redirects */}
              {LEGACY_REDIRECTS.map(({ from, to }) => (
                <Route key={from} path={from} element={<Navigate to={to} replace />} />
              ))}
            </Routes>
          </ChatLayout>
        </BrowserRouter>
      </ProjectPulseProvider>
    </StrictMode>
  );
}
