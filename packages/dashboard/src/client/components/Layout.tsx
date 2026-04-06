import type { ReactNode } from 'react';
import { NavLink } from 'react-router';

interface Props {
  children: ReactNode;
}

const NAV_ITEMS = [
  { to: '/', label: 'Overview' },
  { to: '/roadmap', label: 'Roadmap' },
  { to: '/health', label: 'Health' },
  { to: '/graph', label: 'Graph' },
] as const;

export function Layout({ children }: Props) {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <header className="border-b border-gray-800 bg-gray-900">
        <div className="mx-auto flex max-w-7xl items-center gap-8 px-6 py-3">
          <span className="text-sm font-semibold tracking-tight text-white">Harness</span>
          <nav className="flex gap-4">
            {NAV_ITEMS.map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  [
                    'text-sm transition-colors',
                    isActive ? 'text-white' : 'text-gray-400 hover:text-gray-200',
                  ].join(' ')
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
    </div>
  );
}
