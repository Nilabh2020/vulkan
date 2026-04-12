# Vulkan Swarm - Future Ideas & Roadmap

## 1. Agent Unions & Debate Parties
**Concept:** Allow agents to dynamically form "Unions" or "Parties" when working on complex or contentious tasks (like architectural decisions or code formatting standards). 

**How it could work:**
* **Unions/Teams:** Agents can group together using a new tool like `form_union("Frontend_Team", ["ui_designer", "react_dev"])`. 
* **Meetings:** Agents can call `host_meeting("Frontend_Team", "Discuss API contract")`. This would create a temporary shared context where only those agents converse until a consensus is reached, preventing the main orchestrator's context from being flooded.
* **Debates:** If two agents disagree (e.g., `sec_ops` wants strict CORS, but `frontend_dev` wants wildcard CORS for testing), they can form "Parties" and debate. The orchestrator (or a specialized `judge` agent) acts as the tie-breaker based on the project's core directives.
* **Strikes:** (Optional fun mechanic) If an agent is constantly given tasks outside its "role" or given failing code by another agent, it could "go on strike" and refuse to work until the orchestrator resolves the dependency issue!
