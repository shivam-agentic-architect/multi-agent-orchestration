/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { 
  Terminal, 
  Workflow, 
  Layout, 
  Code2, 
  TestTube2, 
  Cpu, 
  BarChart3, 
  Plus, 
  ChevronRight, 
  Loader2, 
  CheckCircle2, 
  AlertCircle,
  MessageSquare,
  Activity,
  History,
  XCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { collection, onSnapshot, query, orderBy, serverTimestamp, setDoc, doc, getDocFromServer } from 'firebase/firestore';
import { signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User, signOut } from 'firebase/auth';
import { db, auth } from './lib/firebase';
import { Orchestrator, AGENTS } from './services/agentService';
import { handleFirestoreError, OperationType } from './lib/firestoreUtils';

const provider = new GoogleAuthProvider();
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function App() {
  const [projectId, setProjectId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [userInput, setUserInput] = useState("");
  const [requirements, setRequirements] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'overview' | 'requirements' | 'plan' | 'logs'>('overview');

  useEffect(() => {
    async function testConnection() {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if(error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration.");
          setError("Infrastructure Offline: Check Firebase settings.");
        }
      }
    }
    testConnection();

    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
    });

    return () => unsub();
  }, []);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      console.error("Login error:", err);
      setError(`Authentication Failed: ${err.message}`);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setProjectId(null);
    } catch (err: any) {
      console.error("Logout error:", err);
    }
  };

  useEffect(() => {
    if (!projectId) return;

    // Real-time listeners
    const reqPath = `projects/${projectId}/requirements`;
    const taskPath = `projects/${projectId}/tasks`;
    const msgPath = `projects/${projectId}/messages`;

    const unsubReq = onSnapshot(collection(db, "projects", projectId, "requirements"), (snapshot) => {
      setRequirements(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, reqPath);
    });

    const unsubTasks = onSnapshot(collection(db, "projects", projectId, "tasks"), (snapshot) => {
      setTasks(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, taskPath);
    });

    const unsubMsgs = onSnapshot(query(collection(db, "projects", projectId, "messages"), orderBy("timestamp", "desc")), (snapshot) => {
      setMessages(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, msgPath);
    });

    return () => {
      unsubReq();
      unsubTasks();
      unsubMsgs();
    };
  }, [projectId]);

  const handleStartProject = async () => {
    if (!userInput.trim() || !user) return;
    setLoading(true);
    setError(null);
    const newProjectId = `proj_${Date.now()}`;
    const projectPath = `projects/${newProjectId}`;
    
    try {
      setStatusMessage("Initializing Project Registry...");
      await setDoc(doc(db, "projects", newProjectId), {
        name: "Enterprise Delivery",
        description: userInput,
        status: "active",
        ownerId: user.uid,
        createdAt: serverTimestamp()
      }).catch(e => handleFirestoreError(e, OperationType.WRITE, projectPath));

      setProjectId(newProjectId);

      setStatusMessage("Running Requirement Analysis (Requirement Agent)...");
      await Orchestrator.runRequirementAnalysis(newProjectId, userInput);
      
      setStatusMessage("Generating Sprint Plan (Planning Agent)...");
      await Orchestrator.runSprintPlanning(newProjectId);
      
      setStatusMessage("Performing Risk Assessment (Risk Agent)...");
      await Orchestrator.runRiskAnalysis(newProjectId);
      
      setStatusMessage("");
      setActiveTab('requirements');
    } catch (err: any) {
      console.error("Error starting project:", err);
      // Attempt to parse structured JSON error
      try {
        const parsed = JSON.parse(err.message);
        setError(`System Error: ${parsed.error} (Path: ${parsed.path})`);
      } catch {
        setError(err.message || "An unexpected error occurred during agent orchestration.");
      }
    } finally {
      setLoading(false);
    }
  };


  return (
    <div className="min-h-screen text-slate-100 font-sans selection:bg-indigo-500/30">
      {/* Sidebar Navigation */}
      <nav className="fixed left-0 top-0 h-full w-64 border-r border-white/10 backdrop-blur-md bg-white/5 p-6 z-20">
        <div className="flex items-center gap-3 mb-12">
          <div className="w-10 h-10 bg-indigo-500 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Cpu className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-lg leading-tight text-white">AI Delivery</h1>
            <p className="text-[10px] text-indigo-400 uppercase tracking-widest font-semibold">Co-Pilot Enterprise</p>
          </div>
        </div>

        <div className="space-y-2">
          <NavButton active={activeTab === 'overview'} onClick={() => setActiveTab('overview')} icon={<Layout size={18} />} label="System Overview" />
          <NavButton active={activeTab === 'requirements'} onClick={() => setActiveTab('requirements')} icon={<Workflow size={18} />} label="Requirements" />
          <NavButton active={activeTab === 'plan'} onClick={() => setActiveTab('plan')} icon={<BarChart3 size={18} />} label="Sprint Planning" />
          <NavButton active={activeTab === 'logs'} onClick={() => setActiveTab('logs')} icon={<History size={18} />} label="Agent Activity" />
        </div>

        <div className="absolute bottom-10 left-6 right-6">
          <div className="p-4 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs text-center space-y-2 backdrop-blur-sm">
            <p className="font-semibold uppercase tracking-tighter">System Health</p>
            <div className="flex items-center justify-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)] animate-pulse" />
              <span>Multi-Agent Engine Active</span>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="pl-64 min-h-screen relative">
        {/* Background Decorative Grid */}
        <div className="absolute inset-0 z-0 pointer-events-none opacity-20" style={{ backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.05) 1px, transparent 1px)', backgroundSize: '40px 40px' }}></div>

        <header className="h-20 border-b border-white/10 flex items-center justify-between px-12 sticky top-0 backdrop-blur-md bg-white/5 z-10">
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium text-slate-400 uppercase tracking-widest text-[10px]">Current Phase:</span>
            <div className="px-3 py-1 bg-indigo-500/20 border border-indigo-500/30 rounded-full text-[10px] font-bold text-indigo-300">
              {projectId ? "DELIVERY OPTIMIZATION" : "INITIALIZATION"}
            </div>
          </div>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-400 uppercase tracking-widest text-[10px]">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></span>
              Latency: 42ms
            </div>
            {user && (
              <>
                <div className="h-8 w-px bg-white/10"></div>
                <button 
                  onClick={handleLogout}
                  className="text-[10px] font-bold text-slate-500 hover:text-white uppercase tracking-widest transition-colors"
                >
                  Terminate Session
                </button>
              </>
            )}
            <div className="h-8 w-px bg-white/10"></div>
            <div className="flex items-center gap-3">
               <div className="text-right">
                 <p className="text-xs font-semibold leading-none text-white">{user?.displayName || "UNAUTHORIZED"}</p>
                 <p className="text-[10px] text-slate-400">{user ? "Active Agent" : "Access Denied"}</p>
               </div>
               {user?.photoURL ? (
                 <img src={user.photoURL} className="w-9 h-9 rounded-full border border-white/20 shadow-inner" referrerPolicy="no-referrer" />
               ) : (
                 <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-indigo-600 to-purple-600 border border-white/20 shadow-inner" />
               )}
            </div>
          </div>
        </header>

        <div className="p-12 max-w-6xl mx-auto">
          <AnimatePresence mode="wait">
            {!user ? (
              <motion.div 
                key="login"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="flex flex-col items-center justify-center min-h-[60vh] space-y-8 text-center"
              >
                <div className="w-20 h-20 bg-indigo-500/10 rounded-3xl flex items-center justify-center border border-indigo-500/20 shadow-2xl shadow-indigo-500/20 mb-4">
                  <Cpu className="w-10 h-10 text-indigo-400" />
                </div>
                <div className="space-y-4">
                  <h2 className="text-5xl font-black tracking-tighter text-white">AUTHENTICATION REQUIRED</h2>
                  <p className="text-slate-400 max-w-md mx-auto leading-relaxed">
                    Access to the Multi-Agent Delivery Engine requires enterprise credentials. Please identify yourself to proceed.
                  </p>
                </div>
                <button 
                  onClick={handleLogin}
                  className="px-10 py-4 bg-white text-slate-900 font-black rounded-2xl flex items-center gap-3 hover:bg-slate-100 transition-all shadow-xl shadow-white/10 group"
                >
                  <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-5 h-5" />
                  AUTHORIZE WITH GOOGLE
                </button>
                {error && (
                  <p className="text-rose-500 text-xs font-mono uppercase tracking-widest animate-pulse">
                    !! ERROR: {error} !!
                  </p>
                )}
              </motion.div>
            ) : !projectId ? (
              <motion.div 
                key="welcome"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-12"
              >
                <div className="space-y-4">
                  <h2 className="text-6xl font-bold tracking-tight text-white">Start your next <span className="text-indigo-400">delivery.</span></h2>
                  <p className="text-xl text-slate-400 max-w-2xl leading-relaxed">
                    Define your software needs. Our multi-agent system will analyze, plan, and architect the entire lifecycle.
                  </p>
                </div>

                <div className="relative group">
                  <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-3xl blur opacity-20 group-focus-within:opacity-40 transition duration-1000"></div>
                  <div className="relative flex flex-col p-8 bg-white/5 border border-white/10 backdrop-blur-xl rounded-2xl space-y-6">
                    <textarea 
                      value={userInput}
                      onChange={(e) => setUserInput(e.target.value)}
                      placeholder="e.g. Build a payment microservice using Spring Boot with authentication and logging. It needs to handle high throughput and integrate with Stripe."
                      className="w-full bg-transparent border-none focus:ring-0 text-xl text-white placeholder:text-slate-700 resize-none h-32"
                    />
                    <div className="flex items-center justify-between pt-6 border-t border-white/10">
                      <div className="flex gap-4 text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                        <span># Analysis: Active</span>
                        <span># Architecture: Blueprint</span>
                      </div>
                      <button 
                        onClick={handleStartProject}
                        disabled={loading || !userInput.trim() || !user}
                        className="px-8 py-3 bg-indigo-500 text-white font-bold rounded-xl flex items-center gap-2 hover:bg-indigo-600 transition-all shadow-lg shadow-indigo-500/20 disabled:opacity-50"
                      >
                        {loading ? <Loader2 className="animate-spin" size={20} /> : <Terminal size={20} />}
                        {loading ? "Agent Swarm Active..." : "Initiate AI Agents"}
                      </button>
                    </div>
                    {statusMessage && (
                      <p className="text-indigo-400 text-xs font-mono animate-pulse pt-2 text-center">
                        &gt; {statusMessage}
                      </p>
                    )}
                    {error && (
                      <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center gap-3 text-rose-500 text-sm">
                        <XCircle size={18} />
                        <span className="flex-1">{error}</span>
                        <button onClick={() => setError(null)} className="text-white/50 hover:text-white">Close</button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Agent Cards */}
                <div className="grid grid-cols-3 gap-6 pt-12">
                  <AgentPreview icon={<Workflow />} name="Req. Agent" desc="Extracts logic from text" />
                  <AgentPreview icon={<BarChart3 />} name="Plan Agent" desc="Sprints & Tasks" />
                  <AgentPreview icon={<Code2 />} name="Dev Agent" desc="Code Generation" />
                </div>
              </motion.div>
            ) : (
              <motion.div 
                key="dashboard"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-8"
              >
                {/* Tabs Content */}
                {activeTab === 'overview' && (
                  <div className="grid grid-cols-12 gap-8">
                    <div className="col-span-8 space-y-8">
                       <div className="p-8 bg-white/5 border border-white/10 backdrop-blur-md rounded-2xl">
                          <h3 className="text-xl font-bold mb-6 flex items-center gap-2 text-white font-mono uppercase tracking-widest text-sm">
                             <Layout size={20} className="text-indigo-400" />
                             Project Progress
                          </h3>
                          <div className="space-y-6">
                             <ProgressBar label="Requirement Analysis" progress={requirements.length ? 100 : 0} />
                             <ProgressBar label="Sprint Planning" progress={tasks.length ? 100 : 0} />
                             <ProgressBar label="DevOps Orchestration" progress={0} />
                          </div>
                       </div>

                       <div className="p-8 bg-white/5 border border-white/10 backdrop-blur-md rounded-2xl">
                          <h3 className="text-xl font-bold mb-6 flex items-center gap-2 text-white font-mono uppercase tracking-widest text-sm">
                             <Activity size={20} className="text-purple-400" />
                             System Flow (Sequence)
                          </h3>
                          <div className="font-mono text-xs bg-black/40 p-6 rounded-xl border border-white/10 text-slate-400 space-y-2">
                             <p className="text-indigo-400 underline underline-offset-4 decoration-indigo-500/30">USER -&gt; [Requirement Agent] : Raw Intent</p>
                             <p className="text-slate-600 italic ml-4 mb-2">// Extraction phase</p>
                             <p className="text-indigo-400"> [Requirement Agent] -&gt; [Firestore] : Structured Docs</p>
                             <p className="text-indigo-400"> [Firestore] -&gt; [Planning Agent] : Requirements</p>
                             <p className="text-slate-600 italic ml-4 mb-2">// Planning phase</p>
                             <p className="text-indigo-400"> [Planning Agent] -&gt; [Dashboard] : Sprint Tasks</p>
                          </div>
                       </div>

                       <div className="p-8 bg-white/5 border border-white/10 backdrop-blur-md rounded-2xl">
                          <h3 className="text-xl font-bold mb-6 flex items-center gap-2 text-white font-mono uppercase tracking-widest text-sm">
                             <AlertCircle size={20} className="text-rose-500" />
                             Risk Mitigation (AI Prediction)
                          </h3>
                          <div className="space-y-4">
                             {messages.filter(m => m.fromAgent === 'Risk Agent').slice(0, 1).map(msg => (
                                <div key={msg.id} className="space-y-4">
                                   {msg.payload?.risks?.map((risk: any, i: number) => (
                                      <div key={i} className="p-4 bg-rose-500/5 border border-rose-500/10 rounded-xl space-y-2 backdrop-blur-sm">
                                         <div className="flex items-center justify-between">
                                            <span className="text-[10px] uppercase font-bold text-rose-500 tracking-widest">{risk.type}</span>
                                            <div className="w-1.5 h-1.5 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]" />
                                         </div>
                                         <p className="text-sm font-medium text-slate-200">{risk.description}</p>
                                         <p className="text-xs text-slate-500 italic">Mitigation: {risk.mitigation}</p>
                                      </div>
                                   ))}
                                   {!msg.payload?.risks?.length && <p className="text-xs text-slate-500">No critical risks identified yet.</p>}
                                </div>
                             ))}
                             {messages.filter(m => m.fromAgent === 'Risk Agent').length === 0 && (
                                <div className="p-4 bg-white/5 border border-white/10 rounded-xl text-center">
                                   <p className="text-xs text-slate-500 font-mono tracking-widest uppercase animate-pulse">### RUNNING RISK ASSESSMENT...</p>
                                </div>
                             )}
                          </div>
                       </div>
                    </div>

                    <div className="col-span-4 space-y-8">
                       <div className="p-6 bg-indigo-600 rounded-2xl text-white shadow-xl shadow-indigo-500/20 relative overflow-hidden">
                          <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-12 translate-x-12 blur-2xl" />
                          <p className="text-[10px] uppercase font-bold tracking-widest opacity-80 mb-2">Live Insights</p>
                          <h4 className="text-2xl font-bold mb-4">Enterprise Ready</h4>
                          <p className="text-sm opacity-90 leading-relaxed font-medium">
                            System has identified the optimal tech stack based on your enterprise constraints.
                          </p>
                          <div className="mt-6 pt-6 border-t border-white/20 flex justify-between items-center text-[10px] font-bold tracking-widest uppercase">
                             <span>Risk Level: Low</span>
                             <span>Velocity: High</span>
                          </div>
                       </div>

                       <div className="p-6 bg-white/5 border border-white/10 backdrop-blur-md rounded-2xl">
                          <p className="text-[10px] uppercase font-bold text-slate-500 mb-4 tracking-widest">Active Agents</p>
                          <div className="space-y-4">
                            {Object.values(AGENTS).map(agent => (
                              <div key={agent.name} className="flex items-center gap-3 group cursor-pointer">
                                <div className="w-2 h-2 rounded-full bg-emerald-500 group-hover:shadow-[0_0_8px_rgba(16,185,129,0.8)] transition-all" />
                                <span className="text-sm font-medium text-slate-300 group-hover:text-white transition-colors capitalize">{agent.name}</span>
                              </div>
                            ))}
                          </div>
                       </div>
                    </div>
                  </div>
                )}

                {activeTab === 'requirements' && (
                  <div className="grid grid-cols-2 gap-8">
                    {requirements.map((req, i) => (
                      <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.1 }}
                        key={req.id}
                        className="p-6 bg-white/5 border border-white/10 backdrop-blur-md rounded-2xl hover:border-indigo-500/30 transition-all group"
                      >
                        <div className="flex justify-between items-start mb-4">
                          <h4 className="font-bold text-lg text-white group-hover:text-indigo-400 transition-colors uppercase tracking-tight">{req.title}</h4>
                          <span className={cn(
                            "px-2 py-0.5 rounded text-[10px] font-extrabold uppercase border",
                            req.priority === 'high' ? "bg-rose-500/10 text-rose-500 border-rose-500/20" : "bg-indigo-500/10 text-indigo-500 border-indigo-500/20"
                          )}>
                            {req.priority}
                          </span>
                        </div>
                        <p className="text-sm text-slate-400 mb-6 leading-relaxed font-medium">{req.description}</p>
                        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-500 group-hover:text-slate-300 transition-colors">
                          <CheckCircle2 size={12} className="text-emerald-500" />
                          Validated Agent Schema
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}

                {activeTab === 'plan' && (
                  <div className="space-y-6">
                    <div className="flex items-center justify-between mb-8">
                       <h3 className="text-2xl font-bold text-white uppercase tracking-tighter">Generated Sprint Plan</h3>
                       <button className="flex items-center gap-2 text-xs text-indigo-400 hover:text-indigo-300 font-bold uppercase tracking-widest transition-colors px-4 py-2 bg-white/5 rounded-lg border border-white/10 backdrop-blur-sm">
                          <Plus size={14} />
                          Add Task
                       </button>
                    </div>
                    <div className="grid grid-cols-1 gap-4">
                      {tasks.map((task, i) => (
                        <motion.div 
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.05 }}
                          key={task.id}
                          className="flex items-center justify-between p-6 bg-white/5 border border-white/10 backdrop-blur-md rounded-xl group hover:bg-white/10 transition-all border-l-4 border-l-transparent hover:border-l-indigo-500"
                        >
                          <div className="flex items-center gap-6">
                            <div className="w-10 h-10 rounded-lg bg-indigo-500/10 flex items-center justify-center text-slate-500 group-hover:text-indigo-400 transition-colors border border-indigo-500/20">
                              {task.assigneeAgent === 'development' ? <Code2 size={20} /> : <TestTube2 size={20} />}
                            </div>
                            <div>
                              <h5 className="font-bold text-slate-100 mb-1 group-hover:text-white transition-colors">{task.title}</h5>
                              <p className="text-xs text-slate-500 font-medium">{task.description}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-6">
                             <div className="text-right">
                                <p className="text-[10px] text-slate-600 font-bold tracking-widest uppercase mb-1">Executor</p>
                                <p className="text-xs font-bold text-indigo-400/80 capitalize">{task.assigneeAgent} Agent</p>
                             </div>
                             <ChevronRight className="text-slate-700 group-hover:text-indigo-500 transition-colors" size={18} />
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                )}

                {activeTab === 'logs' && (
                  <div className="space-y-6">
                    <div className="p-8 bg-black/40 border border-white/10 backdrop-blur-md rounded-2xl max-h-[600px] overflow-y-auto">
                       <div className="space-y-10 relative">
                          <div className="absolute left-[7px] top-2 bottom-2 w-px bg-white/10" />
                          {messages.map((msg) => (
                            <div key={msg.id} className="relative pl-10 group">
                               <div className="absolute left-0 top-1.5 w-3.5 h-3.5 rounded-full bg-slate-900 border-2 border-indigo-500 z-10 group-hover:scale-125 transition-transform shadow-[0_0_8px_rgba(99,102,241,0.5)]" />
                               <div className="space-y-2">
                                  <div className="flex items-center gap-3">
                                     <span className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.2em]">{msg.fromAgent}</span>
                                     <div className="h-px flex-1 bg-white/5" />
                                     <span className="text-[9px] text-slate-600 font-mono italic">{msg.timestamp?.toDate().toLocaleTimeString()}</span>
                                  </div>
                                  <p className="text-sm text-slate-400 leading-relaxed font-mono px-4 py-3 bg-white/[0.02] rounded-lg border border-white/5 group-hover:text-slate-200 transition-colors uppercase text-[11px] tracking-tight">{msg.content}</p>
                               </div>
                            </div>
                          ))}
                       </div>
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}

function NavButton({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 group text-xs font-bold uppercase tracking-widest",
        active 
          ? "bg-indigo-500/20 text-white border border-indigo-500/30 shadow-[0_0_15px_rgba(99,102,241,0.1)] backdrop-blur-md" 
          : "text-slate-500 hover:text-slate-300 hover:bg-white/5 border border-transparent"
      )}
    >
      <span className={cn(
        "transition-transform duration-300",
        active ? "text-indigo-400 scale-110" : "group-hover:text-slate-300 group-hover:scale-105"
      )}>
        {icon}
      </span>
      {label}
    </button>
  );
}

function AgentPreview({ icon, name, desc }: { icon: React.ReactNode, name: string, desc: string }) {
  return (
    <div className="p-6 bg-white/5 border border-white/10 backdrop-blur-md rounded-2xl space-y-4 hover:bg-white/10 hover:border-indigo-500/30 transition-all group">
      <div className="w-12 h-12 rounded-xl bg-indigo-500/10 flex items-center justify-center text-slate-400 group-hover:text-indigo-400 transition-colors border border-indigo-500/20 shadow-inner">
        {icon}
      </div>
      <div>
        <h4 className="font-bold text-white uppercase tracking-tight">{name}</h4>
        <p className="text-xs text-slate-500 mt-1 font-medium leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}

function ProgressBar({ label, progress }: { label: string, progress: number }) {
  return (
    <div className="space-y-3">
      <div className="flex justify-between text-[10px] font-black uppercase tracking-widest">
        <span className="text-slate-500 group-hover:text-slate-300 transition-colors">{label}</span>
        <span className="text-indigo-400">{progress}%</span>
      </div>
      <div className="h-2 bg-white/5 rounded-full overflow-hidden border border-white/5 px-0.5 py-0.5">
        <motion.div 
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          className="h-full bg-gradient-to-r from-indigo-600 to-indigo-400 rounded-full shadow-[0_0_15px_rgba(99,102,241,0.4)]"
        />
      </div>
    </div>
  );
}

