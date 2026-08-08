import type { DeploymentFsPort, DeploymentSurface } from '../../src/deployment/types';

export function memFs(files: Record<string, string>): DeploymentFsPort {
  const keys = Object.keys(files);
  return {
    exists: (p) => keys.some((k) => k === p || k.startsWith(p.replace(/\/$/, '') + '/')),
    readFile: (p) => (p in files ? files[p]! : null),
    listDir: (p) => {
      const prefix = p === '.' || p === '' ? '' : p.replace(/\/$/, '') + '/';
      const seen = new Set<string>();
      for (const k of keys) {
        if (!k.startsWith(prefix)) continue;
        const rest = k.slice(prefix.length).split('/')[0];
        if (rest) seen.add(rest);
      }
      return [...seen];
    },
  };
}

export function surface(p: Partial<DeploymentSurface> = {}): DeploymentSurface {
  return {
    pipelineFiles: [],
    deployScripts: [],
    envFiles: [],
    detectedEnvironments: [],
    hasProductionTarget: false,
    productionUngated: false,
    rollbackSignalInFiles: false,
    hasHealthCheck: false,
    presentStages: [],
    ...p,
  };
}
