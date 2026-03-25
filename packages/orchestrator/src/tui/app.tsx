import React, { useState, useEffect } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import { Orchestrator } from '../orchestrator';
import { Header } from './components/Header';
import { Stats } from './components/Stats';
import { AgentsTable } from './components/AgentsTable';

export interface DashboardProps {
  orchestrator: Orchestrator;
}

export const Dashboard: React.FC<DashboardProps> = ({ orchestrator }) => {
  const [state, setState] = useState<any>(orchestrator.getSnapshot());
  const { exit } = useApp();

  useEffect(() => {
    const handleStateChange = (newState: any) => {
      setState(newState);
    };

    orchestrator.on('state_change', handleStateChange);

    return () => {
      orchestrator.off('state_change', handleStateChange);
    };
  }, [orchestrator]);

  useInput((input, key) => {
    if (input === 'q' || (key.ctrl && input === 'c')) {
      orchestrator.stop();
      exit();
    }
  });

  const runningAgents = state.running.map(([_, entry]: [string, any]) => entry);

  return (
    <Box flexDirection="column" padding={1}>
      <Header />
      <Stats
        tokenTotals={state.tokenTotals}
        runningCount={state.running.length}
        maxConcurrency={state.maxConcurrentAgents}
      />
      <AgentsTable agents={runningAgents} />
      <Box marginTop={1}>
        <Text color="gray">Press 'q' to quit</Text>
      </Box>
    </Box>
  );
};
