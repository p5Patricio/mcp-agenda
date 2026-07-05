export interface Event {
  id: string;
  userId: string;
  agentId: string;
  title: string;
  description?: string;
  startTime: string;         // ISO 8601
  endTime: string;           // ISO 8601
  date: string;              // "YYYY-MM-DD" para queries por día
  color: string;             // hex color del evento
  reminderMinutes: number;   // default 15
  pushToken?: string;        // Expo push token (deprecated)
  createdVia: 'voice' | 'manual';
  rawTranscription?: string; // texto original de voz
  createdAt: string;
  updatedAt: string;
}

export interface ParsedVoiceEvent {
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  confidence: number;        // 0-1, qué tan seguro del parseo
  rawText: string;
}

export interface DailySummary {
  date: string;
  events: Event[];
  totalEvents: number;
  firstEventTime: string;
  lastEventTime: string;
}
