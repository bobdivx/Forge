import { describe, it, expect } from 'vitest';
import {
  columnForRequest,
  columnForAppIssue,
  columnForTechSuggestion,
} from '../../src/lib/forge-mission-board';

describe('forge-mission-board mapping', () => {
  describe('Request → column', () => {
    it('pending sans assignée → backlog', () => {
      expect(columnForRequest({ status: 'pending' })).toBe('backlog');
    });
    it('pending avec assignée → triaged', () => {
      expect(columnForRequest({ status: 'pending', assigneeAgentId: 'VEILLE_TECH' })).toBe('triaged');
    });
    it('in_progress → in_progress', () => {
      expect(columnForRequest({ status: 'in_progress' })).toBe('in_progress');
    });
    it('review → review', () => {
      expect(columnForRequest({ status: 'review' })).toBe('review');
    });
    it('completed → done', () => {
      expect(columnForRequest({ status: 'completed' })).toBe('done');
      expect(columnForRequest({ status: 'cancelled' })).toBe('done');
      expect(columnForRequest({ status: 'rejected' })).toBe('done');
    });
  });

  describe('AppIssue + task → column', () => {
    it('open sans task → backlog', () => {
      expect(columnForAppIssue({ status: 'open' }, null)).toBe('backlog');
    });
    it('open avec task pending → triaged', () => {
      expect(columnForAppIssue({ status: 'open' }, { status: 'pending' })).toBe('triaged');
    });
    it('task running → in_progress', () => {
      expect(columnForAppIssue({ status: 'open' }, { status: 'running' })).toBe('in_progress');
    });
    it('in_review → review', () => {
      expect(columnForAppIssue({ status: 'in_review' }, null)).toBe('review');
    });
    it('resolved/wont_fix/fixed → done', () => {
      expect(columnForAppIssue({ status: 'resolved' }, null)).toBe('done');
      expect(columnForAppIssue({ status: 'wont_fix' }, null)).toBe('done');
      expect(columnForAppIssue({ status: 'fixed' }, null)).toBe('done');
    });
  });

  describe('TechWatchSuggestion → column', () => {
    it('open impact low → backlog', () => {
      expect(columnForTechSuggestion({ status: 'open', impact: 'low' })).toBe('backlog');
      expect(columnForTechSuggestion({ status: 'open', impact: 'medium' })).toBe('backlog');
    });
    it('open impact high/critical → triaged', () => {
      expect(columnForTechSuggestion({ status: 'open', impact: 'high' })).toBe('triaged');
      expect(columnForTechSuggestion({ status: 'open', impact: 'critical' })).toBe('triaged');
    });
    it('converted_to_request → in_progress', () => {
      expect(columnForTechSuggestion({ status: 'converted_to_request', impact: 'high' })).toBe('in_progress');
    });
    it('dismissed → done', () => {
      expect(columnForTechSuggestion({ status: 'dismissed', impact: 'low' })).toBe('done');
    });
  });
});
