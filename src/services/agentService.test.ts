import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Orchestrator } from './agentService';
import { db } from '../lib/firebase';
import { collection, addDoc, getDocs } from 'firebase/firestore';

// Mock dependencies
const { mockGenerateContent } = vi.hoisted(() => ({
  mockGenerateContent: vi.fn(),
}));

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = {
      generateContent: mockGenerateContent
    };
  },
  Type: {
    OBJECT: 'OBJECT',
    ARRAY: 'ARRAY',
    STRING: 'STRING'
  }
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((db, ...path) => `col:${path.join('/')}`),
  addDoc: vi.fn().mockReturnValue(Promise.resolve({ id: 'mock-doc-id' })),
  getDocs: vi.fn().mockReturnValue(Promise.resolve({ docs: [] })),
  serverTimestamp: vi.fn(() => ({ seconds: 0, nanoseconds: 0 })), 
  doc: vi.fn(),
  setDoc: vi.fn().mockReturnValue(Promise.resolve())
}));

vi.mock('../lib/firebase', () => ({
  db: {}
}));

vi.mock('../lib/firestoreUtils', () => ({
  handleFirestoreError: vi.fn(),
  OperationType: {
    WRITE: 'WRITE',
    LIST: 'LIST'
  }
}));

describe('Orchestrator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('runRequirementAnalysis', () => {
    it('should successfully extract requirements and save to Firestore', async () => {
      const mockProjectId = 'test-project';
      const mockInput = 'I want a task management app';
      const mockResponse = {
        text: JSON.stringify({
          requirements: [
            { title: 'Task Creation', description: 'User can create tasks', priority: 'high' }
          ],
          analysis: 'A productivity app focus.'
        })
      };

      mockGenerateContent.mockResolvedValue(mockResponse);

      await Orchestrator.runRequirementAnalysis(mockProjectId, mockInput);

      expect(collection).toHaveBeenCalledWith(expect.anything(), 'projects', mockProjectId, 'requirements');
      expect(addDoc).toHaveBeenCalledTimes(2); // One for requirement, one for message
    });
  });

  describe('runSprintPlanning', () => {
    it('should break down requirements into tasks', async () => {
      const mockProjectId = 'test-project';
      
      // Mock getDocs to return one requirement
      (getDocs as any).mockResolvedValue({
        docs: [
          { id: 'req1', data: () => ({ title: 'Req 1', description: 'Desc 1' }) }
        ]
      });

      const mockResponse = {
        text: JSON.stringify({
          tasks: [
            { title: 'Frontend Setup', description: 'Init react', requirementId: 'req1', assignee: 'Development Agent' }
          ]
        })
      };

      mockGenerateContent.mockResolvedValue(mockResponse);

      await Orchestrator.runSprintPlanning(mockProjectId);

      expect(addDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ title: 'Frontend Setup', status: 'todo' })
      );
    });
  });
});
