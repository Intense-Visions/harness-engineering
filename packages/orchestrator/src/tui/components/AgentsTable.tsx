import React from 'react';
import { Box, Text } from 'ink';
import { RunningEntry } from '../../types/internal';

export interface AgentsTableProps {
  agents: RunningEntry[];
}

export const AgentsTable: React.FC<AgentsTableProps> = ({ agents }) => {
  if (agents.length === 0) {
    return (
      <Box paddingX={1} marginY={1}>
        <Text color="gray" italic>
          No active agents.
        </Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" marginY={1}>
      <Text bold underline>
        Active Agents
      </Text>

      {/* Header */}
      <Box flexDirection="row" borderStyle="single" borderColor="gray">
        <Box width={30}>
          <Text bold>Identifier</Text>
        </Box>
        <Box width={12}>
          <Text bold>Backend</Text>
        </Box>
        <Box width={20}>
          <Text bold>Phase</Text>
        </Box>
        <Box width={10}>
          <Text bold>Tokens</Text>
        </Box>
        <Box flexGrow={1}>
          <Text bold>Message</Text>
        </Box>
      </Box>

      {/* Rows */}
      {agents.map((agent) => (
        <Box key={agent.issueId} flexDirection="row">
          <Box width={30}>
            <Text wrap="truncate-end">{agent.identifier}</Text>
          </Box>
          <Box width={12}>
            <Text color="blue">{agent.session?.backendName || '-'}</Text>
          </Box>
          <Box width={20}>
            <Text color="cyan">{agent.phase}</Text>
          </Box>
          <Box width={10}>
            <Text color="yellow">{agent.session?.totalTokens || 0}</Text>
          </Box>
          <Box flexGrow={1}>
            <Text wrap="truncate-end">{agent.session?.lastMessage || '-'}</Text>
          </Box>
        </Box>
      ))}
    </Box>
  );
};
