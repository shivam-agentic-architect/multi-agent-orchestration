import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import App from './App';
import * as agentService from './services/agentService';

// Mock dependencies
const { mockAuth } = vi.hoisted(() => {
  const onAuthStateChanged = vi.fn((auth, cb) => {
    cb({ uid: 'test-user', displayName: 'Test User', photoURL: 'https://test.com/photo.jpg' });
    return () => {};
  });
  return {
    mockAuth: {
      currentUser: { uid: 'test-user', displayName: 'Test User' },
      onAuthStateChanged
    }
  };
});

vi.mock('firebase/auth', () => ({
  getAuth: () => mockAuth,
  signInWithPopup: vi.fn(),
  GoogleAuthProvider: vi.fn(),
  onAuthStateChanged: (auth, cb) => mockAuth.onAuthStateChanged(auth, cb),
  signOut: vi.fn()
}));

vi.mock('./lib/firebase', () => ({
  auth: mockAuth,
  db: {}
}));

vi.mock('motion/react', () => ({
  motion: new Proxy({}, {
    get: (target, prop) => {
      return ({ children, ...props }: any) => {
        const Tag = prop as string;
        return <Tag {...props}>{children}</Tag>;
      };
    }
  }),
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

vi.mock('framer-motion', () => ({
  motion: new Proxy({}, {
    get: (target, prop) => {
      return ({ children, ...props }: any) => {
        const Tag = prop as string;
        return <Tag {...props}>{children}</Tag>;
      };
    }
  }),
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  onSnapshot: vi.fn(() => () => {}),
  query: vi.fn(),
  orderBy: vi.fn(),
  serverTimestamp: vi.fn(),
  setDoc: vi.fn(),
  doc: vi.fn(),
  getDocFromServer: vi.fn(() => Promise.resolve({ exists: () => true }))
}));

vi.mock('./services/agentService', () => ({
  Orchestrator: {
    runRequirementAnalysis: vi.fn(() => Promise.resolve({ requirements: [] })),
    runSprintPlanning: vi.fn(() => Promise.resolve({ tasks: [] })),
    runRiskAnalysis: vi.fn(() => Promise.resolve({ risks: [] })),
    runQATesting: vi.fn(() => Promise.resolve({ testcases: [] }))
  },
  AGENTS: {
    requirement: { name: 'Requirement Agent' },
    planning: { name: 'Planning Agent' },
    risk: { name: 'Risk Agent' }
  }
}));

describe('App Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (agentService.Orchestrator.runRequirementAnalysis as any).mockResolvedValue({ requirements: [] });
    (agentService.Orchestrator.runSprintPlanning as any).mockResolvedValue({ tasks: [] });
    (agentService.Orchestrator.runRiskAnalysis as any).mockResolvedValue({ risks: [] });
  });

  it('renders login screen when not authenticated', async () => {
    mockAuth.onAuthStateChanged.mockImplementationOnce((auth, cb) => {
      cb(null);
      return () => {};
    });

    render(<App />);
    expect(await screen.findByText(/AUTHENTICATION REQUIRED/i)).toBeInTheDocument();
  });

  it('renders main dashboard when authenticated', async () => {
    // Default mock handles this
    render(<App />);
    expect(await screen.findByText(/Start your next/i)).toBeInTheDocument();
  });

  it('initiates project flow when clicking Initiate AI Agents', async () => {
    render(<App />);
    
    // Wait for dashboard to appear
    await screen.findByText(/Start your next/i);
    
    // Find input
    const input = await screen.findByPlaceholderText(/Build a payment microservice/i);
    fireEvent.change(input, { target: { value: 'Build a chess app' } });
    
    // Find button
    const button = screen.getByText(/Initiate AI Agents/i);
    fireEvent.click(button);

    await waitFor(() => {
      expect(agentService.Orchestrator.runRequirementAnalysis).toHaveBeenCalled();
    });
  });

  it('calls signInWithPopup when AUTHORIZE WITH GOOGLE is clicked', async () => {
    const { signInWithPopup } = await import('firebase/auth');
    mockAuth.onAuthStateChanged.mockImplementationOnce((auth, cb) => {
      cb(null);
      return () => {};
    });

    render(<App />);
    
    const loginButton = await screen.findByText(/AUTHORIZE WITH GOOGLE/i);
    fireEvent.click(loginButton);

    expect(signInWithPopup).toHaveBeenCalled();
  });

  it('calls signOut when Log Out is clicked', async () => {
    const { signOut } = await import('firebase/auth');
    render(<App />);
    
    // There are two "Log Out" / "Sign Out" buttons, let's find the header one
    const logoutButton = await screen.findByText(/Log Out/i);
    fireEvent.click(logoutButton);

    expect(signOut).toHaveBeenCalled();
  });
});
