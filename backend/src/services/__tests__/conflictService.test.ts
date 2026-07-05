const mockAll = jest.fn();
jest.mock('../../config/database', () => ({
  db: {
    prepare: jest.fn(() => ({
      all: mockAll,
    })),
  },
}));

import { checkConflicts } from '../conflictService';

const existingEvent = {
  id: 'evt-existing',
  userId: 'agent-1',
  agentId: 'agent-1',
  title: 'Existing Meeting',
  date: '2026-03-20',
  startTime: '2026-03-20T14:00:00',
  endTime: '2026-03-20T15:00:00',
};

describe('checkConflicts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('overlapping intervals → hasConflict true', () => {
    mockAll.mockReturnValue([existingEvent]);

    const result = checkConflicts('agent-1', '2026-03-20T14:30:00', '2026-03-20T15:30:00');

    expect(result.hasConflict).toBe(true);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].id).toBe('evt-existing');
  });

  test('non-overlapping intervals → hasConflict false', () => {
    mockAll.mockReturnValue([]);

    const result = checkConflicts('agent-1', '2026-03-20T15:00:00', '2026-03-20T16:00:00');

    expect(result.hasConflict).toBe(false);
    expect(result.conflicts).toEqual([]);
  });

  test('exact containment → hasConflict true', () => {
    mockAll.mockReturnValue([existingEvent]);

    const result = checkConflicts('agent-1', '2026-03-20T13:00:00', '2026-03-20T16:00:00');

    expect(result.hasConflict).toBe(true);
    expect(result.conflicts).toHaveLength(1);
  });

  test('excludeEventId works', () => {
    mockAll.mockReturnValue([]);

    const result = checkConflicts('agent-1', '2026-03-20T14:30:00', '2026-03-20T15:30:00', 'evt-existing');

    expect(result.hasConflict).toBe(false);
    // SQL params: [agentId, endTime, startTime, excludeEventId]
    expect(mockAll).toHaveBeenCalledWith('agent-1', '2026-03-20T15:30:00', '2026-03-20T14:30:00', 'evt-existing');
  });
});
