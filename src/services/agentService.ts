import { GoogleGenAI, Type } from "@google/genai";
import { db } from "../lib/firebase";
import { collection, addDoc, serverTimestamp, getDocs, query, where, doc, updateDoc } from "firebase/firestore";

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
        { "title": "...", "description": "...", "requirementId": "...", "assigneeAgent": "development|qa|devops" }
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
    // Get all data
    const reqCol = collection(db, "projects", projectId, "requirements");
    const taskCol = collection(db, "projects", projectId, "tasks");
    
    const [reqSnap, taskSnap] = await Promise.all([getDocs(reqCol), getDocs(taskCol)]);
    const requirements = reqSnap.docs.map(d => d.data());
    const tasks = taskSnap.docs.map(d => d.data());

    const model = "gemini-3-flash-preview";
    const prompt = AGENTS.risk.promptTemplate.replace("{{data}}", JSON.stringify({ requirements, tasks }));

    try {
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
      
      // Log activity
      await addDoc(collection(db, "projects", projectId, "messages"), {
        fromAgent: "Risk Agent",
        content: `Assessed ${data.risks.length} potential delivery risks with mitigation strategies.`,
        timestamp: serverTimestamp(),
        payload: data
      });

      return data;
    } catch (error) {
      console.error("Risk Agent Error:", error);
      throw error;
    }
  }

  static async runRequirementAnalysis(projectId: string, input: string) {
    const model = "gemini-3-flash-preview";
    const prompt = AGENTS.requirement.promptTemplate.replace("{{input}}", input);

    try {
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
      
      // Persist to Firestore
      const reqCol = collection(db, "projects", projectId, "requirements");
      for (const req of data.requirements) {
        await addDoc(reqCol, {
          ...req,
          projectId,
          status: "approved",
          aiAnalysis: data.analysis,
          createdAt: serverTimestamp()
        });
      }

      // Log activity
      await addDoc(collection(db, "projects", projectId, "messages"), {
        fromAgent: "Requirement Agent",
        content: `Extracted ${data.requirements.length} requirements.`,
        timestamp: serverTimestamp()
      });

      return data;
    } catch (error) {
      console.error("Requirement Agent Error:", error);
      throw error;
    }
  }

  static async runSprintPlanning(projectId: string) {
    // Get requirements from Firestore
    const reqCol = collection(db, "projects", projectId, "requirements");
    const snapshot = await getDocs(reqCol);
    const requirements = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

    const model = "gemini-3-flash-preview";
    const prompt = AGENTS.planning.promptTemplate.replace("{{requirements}}", JSON.stringify(requirements));

    try {
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
                    assigneeAgent: { type: Type.STRING }
                  }
                }
              }
            }
          }
        }
      });

      const data = JSON.parse(response.text || "{}");
      
      // Persist tasks
      const taskCol = collection(db, "projects", projectId, "tasks");
      for (const task of data.tasks) {
        await addDoc(taskCol, {
          ...task,
          projectId,
          status: "todo",
          createdAt: serverTimestamp()
        });
      }

      // Log activity
      await addDoc(collection(db, "projects", projectId, "messages"), {
        fromAgent: "Planning Agent",
        content: `Generated sprint plan with ${data.tasks.length} tasks.`,
        timestamp: serverTimestamp()
      });

      return data;
    } catch (error) {
      console.error("Planning Agent Error:", error);
      throw error;
    }
  }
}
