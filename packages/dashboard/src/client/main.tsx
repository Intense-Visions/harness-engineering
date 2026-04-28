import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router';
import { Layout } from './components/Layout';
import { legacyRedirectRoutes } from './components/LegacyRedirects';
import { Overview } from './pages/Overview';
import { Roadmap } from './pages/Roadmap';
import { Health } from './pages/Health';
import { Graph } from './pages/Graph';
import { Impact } from './pages/Impact';
import { Orchestrator } from './pages/Orchestrator';
import { Attention } from './pages/Attention';
import { Analyze } from './pages/Analyze';
import { Adoption } from './pages/Adoption';
import { Traceability } from './pages/Traceability';
import { DecayTrends } from './pages/DecayTrends';
import { Maintenance } from './pages/Maintenance';
import { Streams } from './pages/Streams';
import { ProjectPulseProvider } from './hooks/useProjectPulse';
import './index.css';

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <ProjectPulseProvider>
        <BrowserRouter>
          <Layout>
            <Routes>
              {/* Overview — triage feed */}
              <Route path="/" element={<Overview />} />

              {/* Intelligence domain */}
              <Route path="/intelligence/health" element={<Health />} />
              <Route path="/intelligence/graph" element={<Graph />} />
              <Route path="/intelligence/impact" element={<Impact />} />
              <Route path="/intelligence/decay" element={<DecayTrends />} />
              <Route path="/intelligence/traceability" element={<Traceability />} />

              {/* Agents domain */}
              <Route path="/agents" element={<Orchestrator />} />
              <Route path="/agents/attention" element={<Attention />} />
              <Route path="/agents/analyze" element={<Analyze />} />
              <Route path="/agents/maintenance" element={<Maintenance />} />
              <Route path="/agents/streams" element={<Streams />} />

              {/* Roadmap domain */}
              <Route path="/roadmap" element={<Roadmap />} />
              <Route path="/roadmap/adoption" element={<Adoption />} />

              {/* Legacy redirects for old URLs */}
              {legacyRedirectRoutes}
            </Routes>
          </Layout>
        </BrowserRouter>
      </ProjectPulseProvider>
    </StrictMode>
  );
}
