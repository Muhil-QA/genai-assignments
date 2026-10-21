import { randomUUID } from 'node:crypto';
import { AIMessage, HumanMessage } from '@langchain/core/messages';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function getMemoryDatabaseName(env = process.env) {
  return env.MEMORY_DB_NAME || env.DB_NAME || 'db_stories_tests';
}

export function normalizeConversationId(conversationId) {
  if (conversationId !== undefined && (typeof conversationId !== 'string' || !UUID_PATTERN.test(conversationId))) {
    throw new TypeError('conversationId must be a UUID');
  }
  return conversationId || randomUUID();
}

export function recentHistoryMessages(messages, limit = 10) {
  return messages.slice(-limit).map(message => ({
    role: message.getType() === 'human' ? 'user' : 'assistant',
    content: typeof message.content === 'string'
      ? message.content
      : message.content.filter(part => part.type === 'text').map(part => part.text).join('')
  }));
}

export async function appendIngestionHistory(history, { query, summary, executionId }) {
  const userMemoryRecordId = randomUUID();
  const assistantMemoryRecordId = randomUUID();
  await history.addMessage(new HumanMessage({
    content: query,
    additional_kwargs: { memoryRecordId: userMemoryRecordId, executionId, messageType: 'test-case-ingestion-request' }
  }));
  await history.addMessage(new AIMessage({
    content: summary,
    additional_kwargs: { memoryRecordId: assistantMemoryRecordId, executionId, messageType: 'test-case-ingestion-result' }
  }));
  return { userMemoryRecordId, assistantMemoryRecordId };
}

export function createIngestionRecords({
  conversationId,
  executionId,
  query,
  sourceFiles,
  targetCollection,
  recordsProcessed,
  recordsInserted,
  recordsFailed,
  ingestedRecords,
  startedAt,
  completedAt = new Date(),
  memoryRecordIds = {}
}) {
  const shared = {
    conversationId,
    executionId,
    query,
    activityType: 'test-case-ingestion',
    sourceFiles,
    targetCollection,
    recordsProcessed,
    recordsInserted,
    recordsFailed,
    startedAt,
    completedAt
  };

  return [
    {
      ...shared,
      memoryRecordId: randomUUID(),
      memoryRecordIds,
      recordType: 'execution-summary'
    },
    ...ingestedRecords.map(({ sourceFile, testCase }) => ({
      ...shared,
      memoryRecordId: randomUUID(),
      recordType: 'test-case',
      sourceFile,
      testCase
    }))
  ];
}
