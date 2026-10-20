import {
  chatMessageSchema,
  chatTypingSchema,
  chatHistorySchema,
  sanitizeText,
} from '../src/sockets/chat.js';
import {
  taskInitSchema,
  taskAddSchema,
  taskUpdateSchema,
  taskDeleteSchema,
} from '../src/sockets/tasks.js';

describe('Chat and Task Socket Payloads Validation & Sanitization Tests', () => {
  describe('Chat Validation & Sanitization', () => {
    test('chatMessageSchema - Validates valid chat payload', () => {
      const payload = { roomCode: 'ROOM12', text: 'Hello study group!' };
      const res = chatMessageSchema.safeParse(payload);
      expect(res.success).toBe(true);
      expect(res.data.text).toBe('Hello study group!');
    });

    test('chatMessageSchema - Rejects empty message text', () => {
      const payload = { roomCode: 'ROOM12', text: '   ' };
      const res = chatMessageSchema.safeParse(payload);
      expect(res.success).toBe(false);
    });

    test('chatMessageSchema - Rejects message exceeding 500 characters', () => {
      const longText = 'a'.repeat(501);
      const res = chatMessageSchema.safeParse({ roomCode: 'ROOM12', text: longText });
      expect(res.success).toBe(false);
    });

    test('chatTypingSchema - Validates boolean isTyping payload', () => {
      const resTrue = chatTypingSchema.safeParse({ roomCode: 'ABCDEF', isTyping: true });
      expect(resTrue.success).toBe(true);

      const resBad = chatTypingSchema.safeParse({ roomCode: 'ABCDEF', isTyping: 'yes' });
      expect(resBad.success).toBe(false);
    });

    test('sanitizeText - Escapes HTML tags and malicious injection', () => {
      const dangerous = '<script>alert("xss")</script> & <b>bold</b>';
      const clean = sanitizeText(dangerous);
      expect(clean).not.toContain('<script>');
      expect(clean).toContain('&lt;script&gt;');
      expect(clean).toContain('&amp;');
    });
  });

  describe('Task Validation', () => {
    test('taskAddSchema - Validates legitimate task addition', () => {
      const payload = {
        roomCode: 'STUDY1',
        text: 'Review Chapter 4 Data Structures',
        assignedTo: null,
      };
      const res = taskAddSchema.safeParse(payload);
      expect(res.success).toBe(true);
      expect(res.data.text).toBe('Review Chapter 4 Data Structures');
    });

    test('taskAddSchema - Rejects empty task text', () => {
      const res = taskAddSchema.safeParse({ roomCode: 'STUDY1', text: '  ' });
      expect(res.success).toBe(false);
    });

    test('taskAddSchema - Rejects task text longer than 250 characters', () => {
      const tooLong = 'x'.repeat(251);
      const res = taskAddSchema.safeParse({ roomCode: 'STUDY1', text: tooLong });
      expect(res.success).toBe(false);
    });

    test('taskUpdateSchema - Validates completed toggle and Pomodoro focus link', () => {
      const res = taskUpdateSchema.safeParse({
        roomCode: 'STUDY1',
        taskId: '60d0fe4f5311236168a109ca',
        completed: true,
        isPomodoroFocus: true,
      });
      expect(res.success).toBe(true);
      expect(res.data.isPomodoroFocus).toBe(true);
      expect(res.data.completed).toBe(true);
    });

    test('taskDeleteSchema - Requires taskId and roomCode', () => {
      const valid = taskDeleteSchema.safeParse({
        roomCode: 'STUDY1',
        taskId: '60d0fe4f5311236168a109ca',
      });
      expect(valid.success).toBe(true);

      const invalid = taskDeleteSchema.safeParse({ roomCode: 'STUDY1' });
      expect(invalid.success).toBe(false);
    });
  });
});
