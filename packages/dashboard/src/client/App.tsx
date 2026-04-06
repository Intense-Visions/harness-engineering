import { BrowserRouter, Routes, Route, Link } from 'react-router';

function Home() {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-8">
      <h1 className="text-3xl font-bold mb-4">Harness Dashboard</h1>
      <p className="text-gray-400 mb-6">Project health and roadmap visualization.</p>
      <nav className="flex gap-4">
        <Link to="/" className="text-blue-400 hover:underline">
          Overview
        </Link>
        <Link to="/roadmap" className="text-blue-400 hover:underline">
          Roadmap
        </Link>
        <Link to="/health" className="text-blue-400 hover:underline">
          Health
        </Link>
        <Link to="/graph" className="text-blue-400 hover:underline">
          Graph
        </Link>
      </nav>
      <div className="mt-8 p-4 bg-gray-900 rounded-lg border border-gray-800">
        <p className="text-sm text-gray-500">
          Dashboard scaffolding complete. Pages will be built in subsequent phases.
        </p>
      </div>
    </div>
  );
}

function Placeholder({ title }: { title: string }) {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-8">
      <h1 className="text-3xl font-bold mb-4">{title}</h1>
      <Link to="/" className="text-blue-400 hover:underline">
        Back to Overview
      </Link>
      <p className="mt-4 text-gray-500">Coming in a future phase.</p>
    </div>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/roadmap" element={<Placeholder title="Roadmap" />} />
        <Route path="/health" element={<Placeholder title="Health" />} />
        <Route path="/graph" element={<Placeholder title="Graph" />} />
      </Routes>
    </BrowserRouter>
  );
}
