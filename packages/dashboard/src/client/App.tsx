import { BrowserRouter, Routes, Route } from 'react-router';
import { Layout } from './components/Layout';
import { Overview } from './pages/Overview';

function Placeholder({ title }: { title: string }) {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">{title}</h1>
      <p className="text-sm text-gray-500">Coming in a future phase.</p>
    </div>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Overview />} />
          <Route path="/roadmap" element={<Placeholder title="Roadmap" />} />
          <Route path="/health" element={<Placeholder title="Health" />} />
          <Route path="/graph" element={<Placeholder title="Graph" />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
