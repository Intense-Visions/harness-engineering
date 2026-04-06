import { BrowserRouter, Routes, Route } from 'react-router';
import { Layout } from './components/Layout';
import { Overview } from './pages/Overview';
import { Roadmap } from './pages/Roadmap';
import { Health } from './pages/Health';
import { Graph } from './pages/Graph';
import { CI } from './pages/CI';

export function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Overview />} />
          <Route path="/roadmap" element={<Roadmap />} />
          <Route path="/health" element={<Health />} />
          <Route path="/graph" element={<Graph />} />
          <Route path="/ci" element={<CI />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
