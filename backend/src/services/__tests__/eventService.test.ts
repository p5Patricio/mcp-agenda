jest.mock('../../config/database', () => {
  const mockDb = {
    all: jest.fn(),
    get: jest.fn(),
    run: jest.fn(),
  };
  return {
    db: {
      prepare: jest.fn(() => mockDb),
    },
    __mockDb: mockDb,
  };
});

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'test-uuid'),
}));

import * as eventService from '../eventService';

// Access the shared mock DB instance
function getMockDb(): { all: jest.Mock; get: jest.Mock; run: jest.Mock } {
  return (jest.requireMock('../../config/database') as any).__mockDb;
}

describe('getEventsByDate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('queries with agentId and date (SQL uses agentId column)', async () => {
    getMockDb().all.mockReturnValue([]);

    await eventService.getEventsByDate('agent-xyz', '2026-07-10');

    // Check the SQL passed to prepare for getEventsByDate
    const db = jest.requireMock('../../config/database') as any;
    const prepareCalls = db.db.prepare.mock.calls as string[][];

    // Find the most recent SELECT...WHERE call (getEventsByDate is the first SELECT stmt)
    const selectCall = prepareCalls.find((args: string[]) =>
      args[0].startsWith('SELECT') && args[0].includes('WHERE'),
    );
    expect(selectCall).toBeDefined();
    expect(selectCall![0]).toContain('agentId');
    expect(selectCall![0]).not.toContain('userId');

    // Check params passed to .all()
    expect(getMockDb().all).toHaveBeenCalledWith('agent-xyz', '2026-07-10');
  });
});

describe('getEventsByDateRange', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('queries with agentId and date range', async () => {
    getMockDb().all.mockReturnValue([]);

    await eventService.getEventsByDateRange('agent-xyz', '2026-07-01', '2026-07-07');

    const db = jest.requireMock('../../config/database') as any;
    const prepareCalls = db.db.prepare.mock.calls as string[][];

    // Find the SELECT that includes >= (range query)
    const rangeCall = prepareCalls.find((args: string[]) =>
      args[0].includes('>='),
    );
    expect(rangeCall).toBeDefined();
    expect(rangeCall![0]).toContain('agentId');
    expect(rangeCall![0]).not.toContain('userId');
  });
});

describe('getDailySummary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns summary for agentId on date', async () => {
    getMockDb().all.mockReturnValue([
      { id: '1', startTime: '2026-07-10T10:00:00' },
      { id: '2', startTime: '2026-07-10T14:00:00' },
    ]);

    const result = await eventService.getDailySummary('agent-xyz', '2026-07-10');

    expect(result.totalEvents).toBe(2);
    expect(result.date).toBe('2026-07-10');
    expect(result.firstEventTime).toBe('2026-07-10T10:00:00');
    expect(result.lastEventTime).toBe('2026-07-10T14:00:00');
  });
});

describe('getUpcomingAgenda', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns events from now until default 7 days ahead', async () => {
    getMockDb().all.mockReturnValue([
      { id: '1', title: 'Meeting', startTime: '2026-07-10T10:00:00' },
    ]);

    const result = await eventService.getUpcomingAgenda('agent-xyz');

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('1');
  });

  test('uses custom limitDays parameter', async () => {
    getMockDb().all.mockReturnValue([]);

    await eventService.getUpcomingAgenda('agent-xyz', 14);

    // Verify the query includes agentId
    const db = jest.requireMock('../../config/database') as any;
    const prepareCalls = db.db.prepare.mock.calls as string[][];
    const agendaCall = prepareCalls.find((args: string[]) =>
      args[0].includes('date >='),
    );
    expect(agendaCall![0]).toContain('agentId');
  });

  test('no upcoming events returns empty array', async () => {
    getMockDb().all.mockReturnValue([]);

    const result = await eventService.getUpcomingAgenda('agent-xyz', 7);

    expect(result).toEqual([]);
  });
});
