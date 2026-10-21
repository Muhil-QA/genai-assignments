import test from 'node:test';
import assert from 'node:assert/strict';
import { AIMessage, HumanMessage } from '@langchain/core/messages';
import {
  appendIngestionHistory,
  createIngestionRecords,
  getMemoryDatabaseName,
  normalizeConversationId
} from '../src/scripts/utilities/generationMemory.js';

test('creates a conversation ID and validates supplied identifiers', () => {
  const first = normalizeConversationId();
  const second = normalizeConversationId();
  const supplied = '73b97ee3-0062-49ef-9f13-2a2a4879c942';

  assert.match(first, /^[0-9a-f-]{36}$/i);
  assert.notEqual(first, second);
  assert.equal(normalizeConversationId(supplied), supplied);
  assert.throws(() => normalizeConversationId('not-a-uuid'), /conversationId must be a UUID/);
});

test('stores ingestion request and completion as LangChain chat messages', async () => {
  const appended = [];
  const history = { addMessage: async message => appended.push(message) };
  const memoryRecordIds = await appendIngestionHistory(history, {
    query: 'Ingest test cases from cases.json',
    summary: 'Ingestion completed: 12 inserted, 0 failed.',
    executionId: 'eff10bc4-25a3-497a-b9e8-1779738c1c2c'
  });

  assert.equal(appended.length, 2);
  assert.ok(appended[0] instanceof HumanMessage);
  assert.ok(appended[1] instanceof AIMessage);
  assert.equal(appended[0].content, 'Ingest test cases from cases.json');
  assert.equal(appended[1].content, 'Ingestion completed: 12 inserted, 0 failed.');
  assert.notEqual(memoryRecordIds.userMemoryRecordId, memoryRecordIds.assistantMemoryRecordId);
  assert.equal(appended[0].additional_kwargs.executionId, appended[1].additional_kwargs.executionId);
});

test('creates linked summary and full test-case history records', () => {
  const completedAt = new Date('2026-10-20T12:00:00.000Z');
  const records = createIngestionRecords({
    conversationId: '73b97ee3-0062-49ef-9f13-2a2a4879c942',
    executionId: 'eff10bc4-25a3-497a-b9e8-1779738c1c2c',
    query: 'Ingest test cases from cases.json',
    sourceFiles: ['cases.json'],
    targetCollection: 'testcases',
    recordsProcessed: 12,
    recordsInserted: 11,
    recordsFailed: 1,
    ingestedRecords: [{
      sourceFile: 'cases.json',
      testCase: { id: 'TC-001', title: 'Sign-in succeeds', steps: ['Open page', 'Submit form'] }
    }],
    startedAt: new Date('2026-10-20T11:59:00.000Z'),
    completedAt
  });

  assert.equal(records.length, 2);
  const [summary, testcase] = records;
  assert.match(summary.memoryRecordId, /^[0-9a-f-]{36}$/i);
  assert.match(testcase.memoryRecordId, /^[0-9a-f-]{36}$/i);
  assert.notEqual(summary.memoryRecordId, testcase.memoryRecordId);
  assert.equal(summary.recordType, 'execution-summary');
  assert.equal(summary.activityType, 'test-case-ingestion');
  assert.equal(summary.conversationId, '73b97ee3-0062-49ef-9f13-2a2a4879c942');
  assert.equal(summary.executionId, 'eff10bc4-25a3-497a-b9e8-1779738c1c2c');
  assert.deepEqual(summary.sourceFiles, ['cases.json']);
  assert.equal(summary.recordsInserted, 11);
  assert.equal(testcase.recordType, 'test-case');
  assert.deepEqual(testcase.testCase, { id: 'TC-001', title: 'Sign-in succeeds', steps: ['Open page', 'Submit form'] });
  assert.equal(testcase.completedAt, completedAt);
});

test('uses dedicated memory database and falls back to RAG database', () => {
  assert.equal(getMemoryDatabaseName({ MEMORY_DB_NAME: 'langchain_memory', DB_NAME: 'Rag_testcases' }), 'langchain_memory');
  assert.equal(getMemoryDatabaseName({ DB_NAME: 'Rag_testcases' }), 'Rag_testcases');
  assert.equal(getMemoryDatabaseName({}), 'db_stories_tests');
});