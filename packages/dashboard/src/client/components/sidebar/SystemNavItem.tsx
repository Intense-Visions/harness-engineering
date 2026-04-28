import { NavLink } from 'react-router';
import {
  Activity,
  Share2,
  Zap,
  TrendingDown,
  Link2,
  Bot,
  Wrench,
  Radio,
  Map,
  BarChart3,
} from 'lucide-react';

const PAGE_ICONS: Record<string, typeof Activity> = {
  health: Activity,
  graph: Share2,
  impact: Zap,
  decay: TrendingDown,
  traceability: Link2,
  orchestrator: Bot,
  maintenance: Wrench,
  streams: Radio,
  roadmap: Map,
  adoption: BarChart3,
};

interface Props {
  page: string;
  label: string;
  route: string;
}

export function SystemNavItem({ page, label, route }: Props) {
  const Icon = PAGE_ICONS[page] ?? Activity;

  return (
    <NavLink
      to={route}
      className={({ isActive }) =>
        [
          'flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-200',
          isActive
            ? 'bg-white/[0.08] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'
            : 'text-neutral-muted hover:text-neutral-text hover:bg-white/[0.04]',
        ].join(' ')
      }
    >
      <Icon size={14} className="flex-shrink-0 opacity-60" />
      <span>{label}</span>
    </NavLink>
  );
}
