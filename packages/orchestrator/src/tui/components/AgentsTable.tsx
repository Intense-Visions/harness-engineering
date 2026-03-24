import React from 'react';
import { Box, Text } from 'ink';
import Table from 'ink-table';
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

  const data = agents.map((agent) => ({
    Identifier: agent.identifier,
    Phase: agent.phase,
    Message: agent.session?.lastMessage?.slice(0, 50) || '-',
    Tokens: agent.session?.totalTokens || 0,
    Started: new Date(agent.startedAt).toLocaleTimeString(),
  }));

  return (
    <Box flexDirection="column" marginY={1}>
      <Text bold underline>
        Active Agents
      </Text>
      <Table data={data} />
    </Box>
  );
};
