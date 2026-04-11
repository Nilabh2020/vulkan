# Vulkan Command Specification

## Syntax
Commands must be plain text, one per line.

## Commands

### `spawn_agent(name, role, goal)`
Creates a new autonomous agent.
- `name`: Unique identifier (string)
- `role`: Agent's specialized role (string)
- `goal`: Specific objective for the agent (string)

### `send_message(agent, message)`
Transmits a message to a specific agent.
- `agent`: Name of the target agent (string)
- `message`: Content of the transmission (string)

### `list_agents()`
Returns a list of all active agents in the swarm.

### `terminate_agent(name)`
Deactivates and removes an agent from the swarm.
- `name`: Name of the agent to terminate (string)
