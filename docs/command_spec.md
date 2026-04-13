# Vulkan Command Specification

## Syntax
Commands must be plain text, ideally on their own lines. 
Arguments should be enclosed in double quotes (`"`) for single lines or triple quotes (`"""` or `'''`) for multi-line content.

## Core Commands

### `spawn_instance(name, role, goal)`
Creates a new autonomous sub-agent in the swarm.
- `name`: Unique identifier (string)
- `role`: Agent's specialized role (string)
- `goal`: Specific objective for the agent (string)

### `send_message(target_agent, message)`
Transmits a message to a specific agent (or the 'orchestrator').
- `target_agent`: Name of the target agent (string)
- `message`: Content of the transmission (string). Supports triple quotes for multi-line content.

### `available_agents()`
Returns a list of all currently active agents in the swarm, their roles, goals, and status.

### `search_web(query)`
Performs a web search to gather real-time information.
- `query`: The search string (string)

### `task_complete(summary)`
Used by sub-agents to signal that their objective has been met.
- `summary`: A detailed report of what was accomplished (string)

## Extended Tools
Vulkan supports a wide range of extended tools for file system operations, git, docker, and more. 
See the `EXTENDED TOOL REGISTRY` in your system prompt for the full list.
