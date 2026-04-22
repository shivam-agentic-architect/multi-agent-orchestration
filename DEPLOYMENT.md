# Enterprise AI Delivery Co-Pilot Deployment Guide

## 🚀 Overview
The Enterprise AI Delivery Co-Pilot is a multi-agent system designed for automated software delivery. It utilizes a swarm of specialized agents (Requirement, Planning, Risk, Dev, QA, DevOps) coordinated via a real-time event-driven architecture using Firestore.

## 🛠 Tech Stack
- **Dashboard:** React 19 + Vite + Tailwind CSS + Framer Motion
- **Backend:** Node.js (Express) using `tsx` for high-performance TypeScript execution.
- **AI Engine:** Google Gemini (via `@google/genai` TypeScript SDK).
- **Communication:** Real-time event-bus implemented over Firebase Firestore.
- **Storage:** Firestore (NoSQL) for project state and agent memory.
- **Containerization:** Docker (Multi-stage build).

## 📡 Agent Orchestration
We use a **Swarm-based Orchestration** pattern:
1. **Event Trigger:** User submits intent.
2. **Requirement Agent:** Analyzes and posts structured requirements to `/projects/{id}/requirements`.
3. **Planning Agent:** Triggered by requirements; posts tasks to `/projects/{id}/tasks`.
4. **Risk Agent:** Concurrent analysis of data to provide mitigation strategies.

## 📦 Deployment (GCP / AWS)
1. **Containerize:** `docker build -t ai-copilot .`
2. **Push:** Push to Google Artifact Registry or AWS ECR.
3. **Run:** Deploy to Cloud Run (GCP) or ECS (AWS).
4. **Environment:** Ensure `GEMINI_API_KEY` is set in the production environment.

## 🔍 RAG Design
For enterprise document ingestion:
1. **Ingestion API:** `/api/ingest` handles PDF/MD/Docx uploads.
2. **Embedding:** System uses `text-embedding-004` to vectorise content.
3. **Vector Store:** ChromaDB or Pinecone for retrieval-augmented generation during agent planning.
