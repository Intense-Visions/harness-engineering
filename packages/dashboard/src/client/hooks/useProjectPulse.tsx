import React, { createContext, useContext, useState, ReactNode } from 'react';

interface ProjectPulse {
  stressLevel: number; // 0 to 1
  isHealthy: boolean;
  totalIssues: number;
}

const ProjectPulseContext = createContext<{
  pulse: ProjectPulse;
  setPulse: (pulse: ProjectPulse) => void;
}>({
  pulse: { stressLevel: 0, isHealthy: true, totalIssues: 0 },
  setPulse: () => {},
});

export function ProjectPulseProvider({ children }: { children: ReactNode }) {
  const [pulse, setPulse] = useState<ProjectPulse>({
    stressLevel: 0,
    isHealthy: true,
    totalIssues: 0,
  });

  return (
    <ProjectPulseContext.Provider value={{ pulse, setPulse }}>
      {children}
    </ProjectPulseContext.Provider>
  );
}

export const useProjectPulse = () => useContext(ProjectPulseContext);
