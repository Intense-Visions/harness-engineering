import React from 'react';
import { Box, Text } from 'ink';
import { TokenTotals } from '../../types/internal';

export interface StatsProps {
  tokenTotals: TokenTotals;
  runningCount: number;
  maxConcurrency: number;
}

export const Stats: React.FC<StatsProps> = ({ tokenTotals, runningCount, maxConcurrency }) => {
  return (
    <Box flexDirection="row" paddingX={1} gap={4}>
      <Box flexDirection="column">
        <Text bold>Concurrency</Text>
        <Text>
          Active: <Text color={runningCount > 0 ? 'green' : 'gray'}>{runningCount}</Text> /{' '}
          {maxConcurrency}
        </Text>
      </Box>

      <Box flexDirection="column">
        <Text bold>Token Usage</Text>
        <Text>
          Input: <Text color="yellow">{tokenTotals.inputTokens.toLocaleString()}</Text>
        </Text>
        <Text>
          Output: <Text color="yellow">{tokenTotals.outputTokens.toLocaleString()}</Text>
        </Text>
        <Text>
          Total: <Text color="yellow">{tokenTotals.totalTokens.toLocaleString()}</Text>
        </Text>
      </Box>

      <Box flexDirection="column">
        <Text bold>Efficiency</Text>
        <Text>
          Time Running: <Text color="blue">{Math.round(tokenTotals.secondsRunning)}s</Text>
        </Text>
      </Box>
    </Box>
  );
};
