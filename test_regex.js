const str = `spawn_instance("commander_alpha", "master planner / project manager", "Break down Neuronix AI into tasks, assign to agents, define folder structure, create milestone plan")`;
const re = /spawn_instance\s*\(\s*(['"])(.*?)\1\s*,\s*(['"])(.*?)\3\s*,\s*(['"])([\s\S]*?)\5\s*\)/gi;
console.log([...str.matchAll(re)]);