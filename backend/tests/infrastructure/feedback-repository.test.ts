import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { describe, expect, it, vi } from 'vitest';
import { Feedback } from '../../src/modules/feedback/domain/feedback.js';
import {
  DynamoFeedbackRepository,
  toFeedback,
} from '../../src/modules/feedback/infrastructure/dynamodb/dynamo-feedback-repository.js';
import { previousMonth } from '../../src/shared/infrastructure/dynamodb/monthly-reader.js';

function stubClient(responses: unknown[] = []) {
  const sent: { name: string; input: Record<string, unknown> }[] = [];
  let index = 0;

  const send = vi.fn(
    (command: { constructor: { name: string }; input: Record<string, unknown> }) => {
      sent.push({ name: command.constructor.name, input: command.input });
      const response = responses[index] ?? {};
      index += 1;
      return Promise.resolve(response);
    },
  );

  return { client: { send } as unknown as DynamoDBDocumentClient, sent };
}

function storedFeedback(id: string, submittedAt: string) {
  return { feedbackId: id, author: 'Pedro', message: `Feedback ${id}`, submittedAt };
}

describe('previousMonth', () => {
  it('walks back inside the year', () => {
    expect(previousMonth('2026-10')).toBe('2026-09');
  });

  it('crosses the year boundary', () => {
    expect(previousMonth('2026-01')).toBe('2025-12');
  });
});

describe('toFeedback', () => {
  it('reads a stored item and ignores unknown attributes', () => {
    const feedback = toFeedback({
      feedbackId: 'abc',
      author: 'Pedro',
      message: 'Oi',
      submittedAt: '2026-10-19T15:30:00.000Z',
      entityType: 'Feedback',
      PK: 'FEEDBACK#2026-10',
    });

    expect(feedback.id).toBe('abc');
    expect(feedback.author).toBe('Pedro');
    expect(feedback.message).toBe('Oi');
    expect(feedback.submittedAt).toEqual(new Date('2026-10-19T15:30:00.000Z'));
  });
});

describe('DynamoFeedbackRepository', () => {
  it('writes into the partition of the month, keyed by the instant', async () => {
    const { client, sent } = stubClient();
    const repository = new DynamoFeedbackRepository(client, 'pontocoleta-test');

    await repository.save(
      Feedback.create({
        id: 'abc',
        author: 'Pedro',
        message: 'Muito útil.',
        submittedAt: new Date('2026-10-19T15:30:00.000Z'),
      }),
    );

    expect(sent[0]?.name).toBe('PutCommand');
    expect(sent[0]?.input.Item).toMatchObject({
      PK: 'FEEDBACK#2026-10',
      SK: 'AT#2026-10-19T15:30:00.000Z#abc',
      entityType: 'Feedback',
      author: 'Pedro',
    });
    expect(sent[0]?.input.ConditionExpression).toBe('attribute_not_exists(PK)');
  });

  it('writes no index attribute, staying out of both sparse GSIs', async () => {
    const { client, sent } = stubClient();
    const repository = new DynamoFeedbackRepository(client, 'pontocoleta-test');

    await repository.save(
      Feedback.create({
        id: 'abc',
        message: 'Muito útil.',
        submittedAt: new Date('2026-10-19T15:30:00.000Z'),
      }),
    );

    expect(Object.keys(sent[0]?.input.Item as object)).not.toContain('GSI1PK');
    expect(Object.keys(sent[0]?.input.Item as object)).not.toContain('GSI2PK');
  });

  it('reads the latest month first, newest to oldest', async () => {
    const { client, sent } = stubClient([
      { Items: [storedFeedback('b', '2026-10-19T10:00:00.000Z')] },
    ]);
    const repository = new DynamoFeedbackRepository(client, 'pontocoleta-test');

    const page = await repository.findRecent({ limit: 1, latestMonth: '2026-10' });

    expect(sent[0]?.name).toBe('QueryCommand');
    expect(sent[0]?.input.ExpressionAttributeValues).toMatchObject({
      ':partition': 'FEEDBACK#2026-10',
    });
    expect(sent[0]?.input.ScanIndexForward).toBe(false);
    expect(page.items.map((item) => item.id)).toEqual(['b']);
  });

  it('continues into the previous month when the page is not full', async () => {
    const { client, sent } = stubClient([
      { Items: [storedFeedback('b', '2026-10-19T10:00:00.000Z')] },
      { Items: [] },
      { Items: [storedFeedback('a', '2026-08-01T10:00:00.000Z')] },
    ]);
    const repository = new DynamoFeedbackRepository(client, 'pontocoleta-test');

    const page = await repository.findRecent({ limit: 3, latestMonth: '2026-10' });

    // Mês a mês, para trás: o mês vazio no meio não interrompe a leitura. A
    // página nunca enche, então a busca segue até o fim da janela.
    expect(sent.slice(0, 3).map((command) => command.input.ExpressionAttributeValues)).toMatchObject(
      [
        { ':partition': 'FEEDBACK#2026-10' },
        { ':partition': 'FEEDBACK#2026-09' },
        { ':partition': 'FEEDBACK#2026-08' },
      ],
    );
    expect(page.items.map((item) => item.id)).toEqual(['b', 'a']);
    expect(page.nextCursor).toBeNull();
  });

  it('resumes inside the same month when that month has more items', async () => {
    const lastKey = { PK: 'FEEDBACK#2026-10', SK: 'AT#2026-10-19T10:00:00.000Z#b' };
    const { client } = stubClient([
      { Items: [storedFeedback('b', '2026-10-19T10:00:00.000Z')], LastEvaluatedKey: lastKey },
    ]);
    const repository = new DynamoFeedbackRepository(client, 'pontocoleta-test');

    const page = await repository.findRecent({ limit: 1, latestMonth: '2026-10' });
    expect(page.nextCursor).not.toBeNull();

    const { client: second, sent } = stubClient([{ Items: [] }]);
    await new DynamoFeedbackRepository(second, 'pontocoleta-test').findRecent({
      limit: 1,
      latestMonth: '2026-10',
      cursor: page.nextCursor ?? undefined,
    });

    expect(sent[0]?.input.ExclusiveStartKey).toEqual(lastKey);
    expect(sent[0]?.input.ExpressionAttributeValues).toMatchObject({
      ':partition': 'FEEDBACK#2026-10',
    });
  });

  it('points the cursor at the previous month when a full page ends a month', async () => {
    const { client } = stubClient([
      { Items: [storedFeedback('b', '2026-10-19T10:00:00.000Z')] },
    ]);
    const repository = new DynamoFeedbackRepository(client, 'pontocoleta-test');

    const page = await repository.findRecent({ limit: 1, latestMonth: '2026-10' });

    const { client: second, sent } = stubClient([{ Items: [] }]);
    await new DynamoFeedbackRepository(second, 'pontocoleta-test').findRecent({
      limit: 1,
      latestMonth: '2026-10',
      cursor: page.nextCursor ?? undefined,
    });

    // Sem isto a página seguinte releria outubro e devolveria o mesmo item.
    expect(sent[0]?.input.ExpressionAttributeValues).toMatchObject({
      ':partition': 'FEEDBACK#2026-09',
    });
    expect(sent[0]?.input.ExclusiveStartKey).toBeUndefined();
  });

  it('stops after a bounded window of empty months instead of reading forever', async () => {
    const { client, sent } = stubClient();
    const repository = new DynamoFeedbackRepository(client, 'pontocoleta-test');

    const page = await repository.findRecent({ limit: 20, latestMonth: '2026-10' });

    expect(sent).toHaveLength(12);
    expect(page.items).toHaveLength(0);
    expect(page.nextCursor).toBeNull();
  });

  it('asks only for what is still missing from the page', async () => {
    const { client, sent } = stubClient([
      { Items: [storedFeedback('c', '2026-10-19T10:00:00.000Z')] },
      { Items: [storedFeedback('b', '2026-09-10T10:00:00.000Z')] },
      { Items: [storedFeedback('a', '2026-08-01T10:00:00.000Z')] },
    ]);
    const repository = new DynamoFeedbackRepository(client, 'pontocoleta-test');

    await repository.findRecent({ limit: 3, latestMonth: '2026-10' });

    expect(sent.map((command) => command.input.Limit)).toEqual([3, 2, 1]);
  });
});
