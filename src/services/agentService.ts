import { GoogleGenAI, Type } from "@google/genai";
import { db } from "../lib/firebase";
import { collection, addDoc, serverTimestamp, getDocs, doc, setDoc } from "firebase/firestore";
import { handleFirestoreError, OperationType } from "../lib/firestoreUtils";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export interface Agent {
  name: string;
  role: string;
  description: string;
  promptTemplate: string;
}

export const AGENTS: Record<string, Agent> = {
  requirement: {
    name: "Requirement Agent",
    role: "Business Analyst",
    description: "Extracts structured software requirements from raw user descriptions.",
    promptTemplate: `You are a Senior Business Analyst. Analyze the following project description and extract a list of functional and technical requirements.
    Return the response in the following JSON format:
    {
      "requirements": [
        { "title": "...", "description": "...", "priority": "low|medium|high" }
      ],
      "analysis": "Brief summary of the architectural vision"
    }
    
    User Input: {{input}}`
  },
  planning: {
    name: "Planning Agent",
    role: "Project Manager",
    description: "Creates a sprint plan and breaks down requirements into actionable tasks.",
    promptTemplate: `You are a Senior Project Manager. Given a list of requirements, generate a sprint plan with specific tasks.
    Return the response in the following JSON format:
    {
      "tasks": [
        { "title": "...", "description": "...", "requirementId": "...", "assignee": "Development Agent|QA Agent|DevOps Agent" }
      ]
    }
    
    Requirements: {{requirements}}`
  },
  risk: {
    name: "Risk Agent",
    role: "Risk Specialist",
    description: "Predicts potential delivery risks based on requirements and tasks.",
    promptTemplate: `You are a Senior Risk Assessment Officer. Analyze the following requirements and tasks for a software project. Identify potential technical, business, or delivery risks.
    Return the response in the following JSON format:
    {
      "risks": [
        { "type": "technical|business|delivery", "description": "...", "mitigation": "..." }
      ]
    }
    
    Data: {{data}}`
  },
  development: {
    name: "Development Agent",
    role: "Senior Engineer",
    description: "Generates production-grade code based on task specifications.",
    promptTemplate: "Generate clean, scalable code for: {{task}}"
  },
  qa: {
    name: "QA Agent",
    role: "Test Architect",
    description: "Generates test suites and identifies edge cases.",
    promptTemplate: "Create comprehensive test plan for: {{component}}"
  },
  devops: {
    name: "DevOps Agent",
    role: "SRE",
    description: "Orchestrates CI/CD pipelines and infrastructure as code.",
    promptTemplate: "Generate Docker and Kubernetes config for: {{architecture}}"
  },
  reporting: {
    name: "Reporting Agent",
    role: "Delivery Lead",
    description: "Synthesizes agent data into executive summaries.",
    promptTemplate: "Summarize delivery status for: {{project}}"
  }
};

export class Orchestrator {
  static async runRiskAnalysis(projectId: string) {
    const reqPath = `projects/${projectId}/requirements`;
    const taskPath = `projects/${projectId}/tasks`;
    const msgPath = `projects/${projectId}/messages`;

    try {
      const reqCol = collection(db, "projects", projectId, "requirements");
      const taskCol = collection(db, "projects", projectId, "tasks");
      
      const [reqSnap, taskSnap] = await Promise.all([
        getDocs(reqCol).catch(e => handleFirestoreError(e, OperationType.LIST, reqPath)),
        getDocs(taskCol).catch(e => handleFirestoreError(e, OperationType.LIST, taskPath))
      ]) as any[];
      
      const requirements = reqSnap.docs.map((d: any) => d.data());
      const tasks = taskSnap.docs.map((d: any) => d.data());

      const model = "gemini-3-flash-preview";
      const prompt = AGENTS.risk.promptTemplate.replace("{{data}}", JSON.stringify({ requirements, tasks }));

      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              risks: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    type: { type: Type.STRING },
                    description: { type: Type.STRING },
                    mitigation: { type: Type.STRING }
                  }
                }
              }
            }
          }
        }
      });

      const data = JSON.parse(response.text || "{}");
      
      await addDoc(collection(db, "projects", projectId, "messages"), {
        fromAgent: "Risk Agent",
        content: `Assessed ${data.risks.length} potential delivery risks with mitigation strategies.`,
        timestamp: serverTimestamp(),
        payload: data
      }).catch(e => handleFirestoreError(e, OperationType.WRITE, msgPath));

      return data;
    } catch (error) {
      console.error("Risk Agent Error:", error);
      throw error;
    }
  }

  static async runRequirementAnalysis(projectId: string, input: string) {
    const reqPath = `projects/${projectId}/requirements`;
    const msgPath = `projects/${projectId}/messages`;

    try {
      const model = "gemini-3-flash-preview";
      const prompt = AGENTS.requirement.promptTemplate.replace("{{input}}", input);

      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              requirements: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING },
                    description: { type: Type.STRING },
                    priority: { type: Type.STRING }
                  }
                }
              },
              analysis: { type: Type.STRING }
            }
          }
        }
      });

      const data = JSON.parse(response.text || "{}");
      const reqCol = collection(db, "projects", projectId, "requirements");
      
      for (const req of data.requirements) {
        await addDoc(reqCol, {
          ...req,
          projectId,
          status: "approved",
          aiAnalysis: data.analysis,
          createdAt: serverTimestamp()
        }).catch(e => handleFirestoreError(e, OperationType.WRITE, reqPath));
      }

      await addDoc(collection(db, "projects", projectId, "messages"), {
        fromAgent: "Requirement Agent",
        content: `Extracted ${data.requirements.length} requirements. Architectural Vision: ${data.analysis}`,
        timestamp: serverTimestamp()
      }).catch(e => handleFirestoreError(e, OperationType.WRITE, msgPath));

      return data;
    } catch (error) {
      console.error("Requirement Agent Error:", error);
      throw error;
    }
  }

  static async runSprintPlanning(projectId: string) {
    const reqPath = `projects/${projectId}/requirements`;
    const taskPath = `projects/${projectId}/tasks`;
    const msgPath = `projects/${projectId}/messages`;

    try {
      const reqCol = collection(db, "projects", projectId, "requirements");
      const snapshot = await getDocs(reqCol).catch(e => handleFirestoreError(e, OperationType.LIST, reqPath)) as any;
      const requirements = snapshot.docs.map((d: any) => ({ id: d.id, ...d.data() }));

      const model = "gemini-3-flash-preview";
      const prompt = AGENTS.planning.promptTemplate.replace("{{requirements}}", JSON.stringify(requirements));

      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              tasks: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING },
                    description: { type: Type.STRING },
                    requirementId: { type: Type.STRING },
                    assignee: { type: Type.STRING }
                  }
                }
              }
            }
          }
        }
      });

      const data = JSON.parse(response.text || "{}");
      const taskCol = collection(db, "projects", projectId, "tasks");
      
      for (const task of data.tasks) {
        await addDoc(taskCol, {
          ...task,
          projectId,
          status: "todo",
          createdAt: serverTimestamp()
        }).catch(e => handleFirestoreError(e, OperationType.WRITE, taskPath));
      }

      await addDoc(collection(db, "projects", projectId, "messages"), {
        fromAgent: "Planning Agent",
        content: `Generated sprint plan with ${data.tasks.length} tasks.`,
        timestamp: serverTimestamp()
      }).catch(e => handleFirestoreError(e, OperationType.WRITE, msgPath));

      return data;
    } catch (error) {
      console.error("Planning Agent Error:", error);
      throw error;
    }
  }

  static async runQATesting(projectId: string) {
    const taskPath = `projects/${projectId}/tasks`;
    const msgPath = `projects/${projectId}/messages`;

    try {
      const taskCol = collection(db, "projects", projectId, "tasks");
      const snapshot = await getDocs(taskCol).catch(e => handleFirestoreError(e, OperationType.LIST, taskPath)) as any;
      const tasks = snapshot.docs.map((d: any) => ({ id: d.id, ...d.data() }));

      const model = "gemini-3-flash-preview";
      const prompt = AGENTS.qa.promptTemplate.replace("{{component}}", JSON.stringify(tasks));

      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              testcases: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING },
                    steps: { type: Type.STRING },
                    expectedResult: { type: Type.STRING },
                    taskId: { type: Type.STRING }
                  }
                }
              }
            }
          }
        }
      });

      const data = JSON.parse(response.text || "{}");
      
      await addDoc(collection(db, "projects", projectId, "messages"), {
        fromAgent: "QA Agent",
        content: `Generated ${data.testcases.length} test cases for the sprint backlog.`,
        timestamp: serverTimestamp(),
        payload: data
      }).catch(e => handleFirestoreError(e, OperationType.WRITE, msgPath));

      return data;
    } catch (error) {
      console.error("QA Agent Error:", error);
      throw error;
    }
  }
}

