import React, { useState, useEffect } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import { Orchestrator } from '../orchestrator';
import { Header } from './components/Header';
import { Stats } from './components/Stats';
import { AgentsTable } from './components/AgentsTable';
import { TokenTotals } from '../types/internal';

export interface DashboardProps {
  orchestrator: Orchestrator;
}

interface DashboardState {
  running: [string, any][];
  retryAttempts: [string, any][];
  claimed: string[];
  tokenTotals: TokenTotals;
  maxConcurrentAgents: number;
  globalCooldownUntilMs: number | null;
  recentRequestTimestamps: number[];
  recentInputTokens: { timestamp: number; tokens: number }[];
  recentOutputTokens: { timestamp: number; tokens: number }[];
  maxRequestsPerMinute: number;
  maxRequestsPerSecond: number;
  maxInputTokensPerMinute: number;
  maxOutputTokensPerMinute: number;
}

export const Dashboard: React.FC<DashboardProps> = ({ orchestrator }) => {
  const [state, setState] = useState<DashboardState>(orchestrator.getSnapshot() as any);
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
        globalCooldownUntilMs={state.globalCooldownUntilMs}
        recentRequestTimestampsCount={state.recentRequestTimestamps.length}
        recentInputTokensCount={
          state.recentInputTokens
            ?.filter((t) => Date.now() - t.timestamp < 60000)
            .reduce((sum, t) => sum + t.tokens, 0) || 0
        }
        recentOutputTokensCount={
          state.recentOutputTokens
            ?.filter((t) => Date.now() - t.timestamp < 60000)
            .reduce((sum, t) => sum + t.tokens, 0) || 0
        }
        maxRequestsPerMinute={state.maxRequestsPerMinute}
        maxRequestsPerSecond={state.maxRequestsPerSecond}
        maxInputTokensPerMinute={state.maxInputTokensPerMinute}
        maxOutputTokensPerMinute={state.maxOutputTokensPerMinute}
      />
      <AgentsTable agents={runningAgents} />
      <Box marginTop={1}>
        <Text color="gray">Press 'q' to quit</Text>
      </Box>
    </Box>
  );
};
