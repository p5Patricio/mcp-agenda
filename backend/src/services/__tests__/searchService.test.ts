import { Event } from '../../types';

// Mock the database module before importing the service
const mockAll = jest.fn();
jest.mock('../../config/database', () => ({
  db: {
    prepare: jest.fn(() => ({
      all: mockAll,
    })),
  },
}));

import { searchEvents } from '../searchService';

const mockEvent: Event = {
  id: 'evt-001',
  userId: 'user1',
  agentId: 'agent-1',
  title: 'Dentista',
  description: 'Cita con el dentista',
  date: '2026-07-10',
  startTime: '2026-07-10T10:00:00',
  endTime: '2026-07-10T11:00:00',
  color: '#4A90D9',
  reminderMinutes: 15,
  createdVia: 'manual',
  createdAt: '2026-07-10T00:00:00',
  updatedAt: '2026-07-10T00:00:00',
};

describe('searchEvents', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('searches by title with LIKE query', () => {
    mockAll.mockReturnValue([mockEvent]);

    const result = searchEvents('agent-1', 'dentista');

    expect(mockAll).toHaveBeenCalledWith('agent-1', '%dentista%', '%dentista%', 20);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('evt-001');
  });

  test('empty query returns empty array', () => {
    const result = searchEvents('agent-1', '');

    expect(result).toEqual([]);
    expect(mockAll).not.toHaveBeenCalled();
  });

  test('custom limit parameter', () => {
    mockAll.mockReturnValue([mockEvent]);

    searchEvents('agent-1', 'dentista', 5);

    expect(mockAll).toHaveBeenCalledWith('agent-1', '%dentista%', '%dentista%', 5);
  });

  test('no results returns empty array', () => {
    mockAll.mockReturnValue([]);

    const result = searchEvents('agent-1', 'nonexistent');

    expect(result).toEqual([]);
  });

  test('whitespace-only query returns empty array', () => {
    const result = searchEvents('agent-1', '   ');

    expect(result).toEqual([]);
    expect(mockAll).not.toHaveBeenCalled();
  });

  test('matches description when title does not match', () => {
    mockAll.mockReturnValue([mockEvent]);

    const result = searchEvents('agent-1', 'dentista');

    expect(result).toHaveLength(1);
    // The mockEvent has both title 'Dentista' and description 'Cita con el dentista'
    // both contain 'dentista'
    expect(mockAll).toHaveBeenCalledWith('agent-1', '%dentista%', '%dentista%', 20);
  });

  test('multiple results ordered by date desc', () => {
    const earlier = { ...mockEvent, id: 'evt-002', date: '2026-07-05' };
    const later = { ...mockEvent, id: 'evt-003', date: '2026-07-15' };
    mockAll.mockReturnValue([later, earlier]); // DB returns ordered

    const result = searchEvents('agent-1', 'test');

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('evt-003'); // later date first
    expect(result[1].id).toBe('evt-002');
  });
});
