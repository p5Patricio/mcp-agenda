const mockAll = jest.fn();
jest.mock('../../config/database', () => ({
  db: {
    prepare: jest.fn(() => ({
      all: mockAll,
    })),
  },
}));

import { findFreeSlots } from '../slotService';

describe('findFreeSlots', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('events at 9-11 and 14-15 → free slots at 8-9, 11-14 and 15-20', () => {
    mockAll.mockReturnValue([
      {
        id: 'evt-1',
        userId: 'agent-1',
        agentId: 'agent-1',
        title: 'Morning meeting',
        date: '2026-03-20',
        startTime: '2026-03-20T09:00:00',
        endTime: '2026-03-20T11:00:00',
      },
      {
        id: 'evt-2',
        userId: 'agent-1',
        agentId: 'agent-1',
        title: 'Lunch',
        date: '2026-03-20',
        startTime: '2026-03-20T14:00:00',
        endTime: '2026-03-20T15:00:00',
      },
    ]);

    const slots = findFreeSlots('agent-1', '2026-03-20', 60);
    expect(slots).toHaveLength(3);
    expect(slots[0]).toEqual({ start: '2026-03-20T08:00:00', end: '2026-03-20T09:00:00' });
    expect(slots[1]).toEqual({ start: '2026-03-20T11:00:00', end: '2026-03-20T14:00:00' });
    expect(slots[2]).toEqual({ start: '2026-03-20T15:00:00', end: '2026-03-20T20:00:00' });
  });

  test('no events → one slot covering full business hours', () => {
    mockAll.mockReturnValue([]);

    const slots = findFreeSlots('agent-1', '2026-03-20', 60);
    expect(slots).toHaveLength(1);
    expect(slots[0]).toEqual({ start: '2026-03-20T08:00:00', end: '2026-03-20T20:00:00' });
  });

  test('events fill entire day → no slots', () => {
    mockAll.mockReturnValue([
      {
        id: 'evt-1',
        userId: 'agent-1',
        agentId: 'agent-1',
        title: 'All day',
        date: '2026-03-20',
        startTime: '2026-03-20T08:00:00',
        endTime: '2026-03-20T20:00:00',
      },
    ]);

    const slots = findFreeSlots('agent-1', '2026-03-20', 60);
    expect(slots).toHaveLength(0);
  });

  test('custom durationMinutes filters short gaps', () => {
    mockAll.mockReturnValue([
      {
        id: 'evt-1',
        userId: 'agent-1',
        agentId: 'agent-1',
        title: 'Morning',
        date: '2026-03-20',
        startTime: '2026-03-20T09:00:00',
        endTime: '2026-03-20T10:00:00',
      },
    ]);

    // Gap is 10:00-20:00 = 600 minutes, so 120 min slots should exist
    const slots = findFreeSlots('agent-1', '2026-03-20', 120);
    expect(slots).toHaveLength(1);
    expect(slots[0]).toEqual({ start: '2026-03-20T10:00:00', end: '2026-03-20T20:00:00' });

    // 600 minute gap, so 601 min slots should NOT exist
    const noSlots = findFreeSlots('agent-1', '2026-03-20', 601);
    expect(noSlots).toHaveLength(0);
  });

  test('custom startHour/endHour', () => {
    mockAll.mockReturnValue([]);

    const slots = findFreeSlots('agent-1', '2026-03-20', 60, 10, 18);
    expect(slots).toHaveLength(1);
    expect(slots[0]).toEqual({ start: '2026-03-20T10:00:00', end: '2026-03-20T18:00:00' });
  });
});
