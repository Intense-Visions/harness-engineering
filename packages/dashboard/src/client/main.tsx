import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router';
import { Layout } from './components/Layout';
import { Overview } from './pages/Overview';
import { Roadmap } from './pages/Roadmap';
import { Health } from './pages/Health';
import { Graph } from './pages/Graph';
import { Impact } from './pages/Impact';
import { Orchestrator } from './pages/Orchestrator';
import { Attention } from './pages/Attention';
import { Analyze } from './pages/Analyze';
import { Chat } from './pages/Chat';
import { Adoption } from './pages/Adoption';
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
              <Route path="/" element={<Overview />} />
              <Route path="/roadmap" element={<Roadmap />} />
              <Route path="/health" element={<Health />} />
              <Route path="/graph" element={<Graph />} />
              <Route path="/impact" element={<Impact />} />
              <Route path="/orchestrator" element={<Orchestrator />} />
              <Route path="/orchestrator/attention" element={<Attention />} />
              <Route path="/orchestrator/analyze" element={<Analyze />} />
              <Route path="/orchestrator/chat" element={<Chat />} />
              <Route path="/adoption" element={<Adoption />} />
            </Routes>
          </Layout>
        </BrowserRouter>
      </ProjectPulseProvider>
    </StrictMode>
  );
}
