import { NavLink, useLocation } from 'react-router';
import { motion, AnimatePresence } from 'framer-motion';

interface NavChild {
  to: string;
  label: string;
  end?: boolean;
}

interface NavDomain {
  id: string;
  label: string;
  to: string;
  end?: boolean;
  children?: NavChild[];
}

export const NAV_DOMAINS: NavDomain[] = [
  {
    id: 'overview',
    label: 'Overview',
    to: '/',
    end: true,
  },
  {
    id: 'intelligence',
    label: 'Intelligence',
    to: '/intelligence/health',
    children: [
      { to: '/intelligence/health', label: 'Health' },
      { to: '/intelligence/graph', label: 'Graph' },
      { to: '/intelligence/impact', label: 'Impact' },
      { to: '/intelligence/decay', label: 'Decay' },
      { to: '/intelligence/traceability', label: 'Traceability' },
    ],
  },
  {
    id: 'agents',
    label: 'Agents',
    to: '/agents',
    children: [
      { to: '/agents', label: 'Dashboard', end: true },
      { to: '/agents/attention', label: 'Attention' },
      { to: '/agents/analyze', label: 'Analyze' },
      { to: '/agents/maintenance', label: 'Maintenance' },
      { to: '/agents/streams', label: 'Streams' },
    ],
  },
  {
    id: 'roadmap',
    label: 'Roadmap',
    to: '/roadmap',
    children: [
      { to: '/roadmap', label: 'Roadmap', end: true },
      { to: '/roadmap/adoption', label: 'Adoption' },
    ],
  },
];

function isDomainActive(domain: NavDomain, pathname: string): boolean {
  if (domain.end) return pathname === domain.to;
  if (domain.children) {
    return domain.children.some((child) =>
      child.end ? pathname === child.to : pathname.startsWith(child.to)
    );
  }
  return pathname.startsWith(domain.to);
}

export function DomainNav() {
  const location = useLocation();

  return (
    <nav className="flex gap-1 relative">
      {NAV_DOMAINS.map((domain) => {
        const active = isDomainActive(domain, location.pathname);
        const hasChildren = domain.children && domain.children.length > 0;

        return (
          <div key={domain.id} className="relative flex items-center">
            {/* Domain pill */}
            <NavLink
              to={domain.to}
              {...(domain.end ? { end: true } : {})}
              className={[
                'relative rounded-full px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-all duration-300',
                active ? 'text-white' : 'text-neutral-muted hover:text-neutral-text',
              ].join(' ')}
            >
              <span className="relative z-10">{domain.label}</span>
              {active && (
                <motion.div
                  layoutId="domain-pill"
                  className="absolute inset-0 z-0 rounded-full bg-white/5 border border-white/10"
                  transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                />
              )}
            </NavLink>

            {/* Expanded sub-tabs */}
            <AnimatePresence>
              {active && hasChildren && (
                <motion.div
                  initial={{ width: 0, opacity: 0 }}
                  animate={{ width: 'auto', opacity: 1 }}
                  exit={{ width: 0, opacity: 0 }}
                  transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                  className="flex items-center overflow-hidden"
                >
                  <div className="h-4 w-px bg-white/10 mx-1 flex-shrink-0" />
                  <div className="flex gap-0.5 flex-shrink-0">
                    {domain.children!.map((child) => (
                      <NavLink
                        key={child.to}
                        to={child.to}
                        {...(child.end ? { end: true } : {})}
                        className={({ isActive }) =>
                          [
                            'rounded-full px-3 py-1 text-[9px] font-bold uppercase tracking-wider transition-all duration-200 whitespace-nowrap',
                            isActive
                              ? 'text-white bg-white/10'
                              : 'text-neutral-muted/70 hover:text-neutral-text hover:bg-white/5',
                          ].join(' ')
                        }
                      >
                        {child.label}
                      </NavLink>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </nav>
  );
}
