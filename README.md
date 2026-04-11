<div align="center">
  <h1>🌋 Vulkan Command Center</h1>
  <p><b>An Autonomous Parallel AI Agent Swarm Interface</b></p>
  <p>
    <a href="https://react.dev/"><img src="https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB" /></a>
    <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white" /></a>
    <a href="#"><img src="https://img.shields.io/badge/Ollama-black?style=for-the-badge&logo=ollama&logoColor=white" /></a>
  </p>
</div>

---

Vulkan is a powerful visual interface and backend orchestration system for spawning real, parallel AI sub-agents that collaborate to solve complex objectives. It is entirely provider-agnostic, seamlessly linking local reasoning models together with flagship cloud models.

## ✨ Features

- **True Parallel Inference:** When the orchestrator commands agents to spawn, they do not just simulate activity. Independent, asynchronous background sessions spark to life with real LLM inference running completely in parallel.
- **Agent Inter-communication:** Agents establish dialogues with one another. If one agent finds data during its execution cycle, it uses the built-in `send_message("peer_name", "message")` command to instantly hand it off to another active agent's inference stream.
- **Provider Agnostic:** Hook up your `Ollama` or `LM Studio` locally, or drop in API keys for `Claude`, `OpenAI`, `Gemini`, `OpenRouter`, and `Nvidia NIM`.
- **Live Visual Swarm Graph:** An interactive nodal map of the swarm visualizing real-time agent statuses (🟢 Active, 🔵 Thinking, 🟣 Completed, 🔴 Error, ⚫ Terminated) alongside dynamic inter-swarm communication edges.
- **Model Tolerance & Robust Parsing:** Built specifically to handle reasoning models (like `Qwen` and `DeepSeek`) which output complex chain-of-thought blocks before yielding explicit programmatic commands.

## 🚀 Quick Start

### 1. Requirements
- [Node.js](https://nodejs.org/) (v16+)
- A local AI provider ([Ollama](https://ollama.ai) or [LM Studio](https://lmstudio.ai)) OR an API key for a cloud provider.

### 2. Launch
The easiest way to start Vulkan is to run the built-in startup script:
```bash
./start_vulkan.bat
```
This script will automatically:
1. Install all required dependencies for both frontend and backend.
2. Launch the Node backend server on port `3001`.
3. Launch the Vite frontend on port `5173`.
4. Open the Vulkan UI in your default browser.

### Manual Boot
If you prefer to start components manually:
```bash
# Terminal 1: Backend
cd backend
npm install
npm start

# Terminal 2: Frontend
npm install
npm run dev
```

## 🛠 Usage & Prompting

Once loaded, click **PROVIDER** in the top navigation to select your AI endpoint. 
*Note: Make sure your underlying provider handles CORS if you are running locally (LM Studio has this enabled by default in settings).*

### Invoking the Swarm
The main console acts as the "Orchestrator". When you give it complex tasks, it outputs programmatic code. Ask it to initialize a swarm using simple language:
> *"Deploy 3 agents to research advanced propulsion concepts. Make one a physicist, one a materials engineer, and one a lead summarizer."*

The orchestrator will automatically reply with commands, kicking off the swarm initialization protocol.

## ⚙️ Architecture 

Vulkan communicates purely via structural commands:
- `spawn_instance("name", "role", "goal")` - Eaten by the dashboard to spin up a server-side session.
- `send_message("worker_node", "your message")` - Injects text straight into the target agent's live context window and forces an immediate response stream.
- `task_complete("summary")` - Used by sub-agents to signal completion and turn their nodal indicator green.

The backend parses standard chat streams using highly-tolerant regex patterns combined with EventSource (`SSE`) streams, pushing live status events continuously to the React frontend graph.
