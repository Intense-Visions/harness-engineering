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
  { to: '/ci', label: 'CI' },
  { to: '/impact', label: 'Impact' },
  { to: '/orchestrator', label: 'Agents' },
  { to: '/orchestrator/attention', label: 'Attention' },
] as const;

export function Layout({ children }: Props) {
  return (
    <div className="min-h-screen bg-neutral-bg text-neutral-text">
      <header className="border-b border-neutral-border bg-neutral-surface">
        <div className="mx-auto flex max-w-7xl items-center gap-8 px-6 py-3">
          <span className="text-sm font-semibold tracking-tight text-neutral-text">Harness</span>
          <nav className="flex gap-4">
            {NAV_ITEMS.map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  [
                    'text-sm transition-colors',
                    isActive ? 'text-primary-500' : 'text-neutral-muted hover:text-neutral-text',
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
