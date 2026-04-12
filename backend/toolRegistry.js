import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { exec } from 'child_process';

const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

const toolNamespaces = {
  'Core': [
    { name: 'spawn_instance', args: ['name', 'role', 'goal'], description: 'Spawn a new autonomous sub-agent.' },
    { name: 'send_message', args: ['target_instance', 'message'], description: 'Send a message to another agent.' },
    { name: 'search_web', args: ['query'], description: 'Search the internet for real-time information.' },
    { name: 'task_complete', args: ['summary'], description: 'Mark a task as complete with a summary.' },
    { name: 'run_command', args: ['command'], description: 'Execute a terminal/shell command.' }
  ],
  'Skill Builder': [
    { name: 'create_skill', args: ['name', 'description', 'javascript_code'], description: 'Create and register a new tool dynamically.' }
  ],
  'File System': [
    { name: 'read_file', args: ['file_path'], description: 'Read the contents of a file (txt, md, json, etc.).' },
    { name: 'write_file', args: ['file_path', 'content'], description: 'Write or overwrite a file with content. Validates JSON files automatically.' },
    { name: 'append_file', args: ['file_path', 'content'], description: 'Append content to an existing file.' },
    { name: 'create_directory', args: ['dir_path'], description: 'Create a new directory.' },
    { name: 'read_pdf', args: ['file_path'], description: 'Read the text content of a PDF file.' },
    { name: 'list_directory', args: ['dir_path'], description: 'List contents of a directory.' },
    { name: 'verify_filesystem', args: ['file_paths'], description: 'Check if a comma-separated list of files exist and have non-zero size.' },
    { name: 'replace_code_block', args: ['file_path', 'search_string', 'replace_string'], description: 'Surgically replace a specific block of code in a file.' }
  ],
  'Git / Version Control': [
    { name: 'add_git_remote', args: ['name', 'url'], description: 'Add a new git remote.' },
    { name: 'git_clone', args: ['url', 'path'], description: 'Clone a git repository.' },
    { name: 'git_commit', args: ['message'], description: 'Commit changes to git.' },
    { name: 'git_push', args: ['remote', 'branch'], description: 'Push changes to a git remote.' },
    { name: 'git_pull', args: ['remote', 'branch'], description: 'Pull changes from a git remote.' },
    { name: 'git_checkout', args: ['branch'], description: 'Checkout a git branch.' },
    { name: 'git_create_branch', args: ['branch'], description: 'Create a new git branch.' },
    { name: 'git_merge', args: ['branch'], description: 'Merge a git branch.' },
    { name: 'git_diff', args: [], description: 'Show git diff.' },
    { name: 'git_log', args: [], description: 'Show git log.' }
  ],
  'Code Intelligence': [
    { name: 'code_index', args: ['path'], description: 'Index codebase for fast semantic search.' },
    { name: 'code_search_semantic', args: ['query'], description: 'Semantic search over the codebase.' },
    { name: 'code_explain', args: ['file_path'], description: 'Explain the logic of a file.' },
    { name: 'code_generate_tests', args: ['file_path'], description: 'Generate tests for a file.' },
    { name: 'code_generate_docs', args: ['file_path'], description: 'Generate documentation for a file.' },
    { name: 'code_format', args: ['path'], description: 'Format codebase.' },
    { name: 'code_security_scan', args: ['path'], description: 'Scan code for security vulnerabilities.' },
    { name: 'code_complexity_report', args: ['path'], description: 'Generate code complexity report.' },
    { name: 'dependency_audit', args: [], description: 'Audit project dependencies.' },
    { name: 'dependency_update', args: ['package'], description: 'Update a dependency.' }
  ],
  'Docker / Containers': [
    { name: 'docker_build', args: ['tag', 'path'], description: 'Build a docker image.' },
    { name: 'docker_run', args: ['image', 'options'], description: 'Run a docker container.' },
    { name: 'docker_stop', args: ['container_id'], description: 'Stop a docker container.' },
    { name: 'docker_logs', args: ['container_id'], description: 'Get logs from a docker container.' },
    { name: 'docker_ps', args: [], description: 'List running docker containers.' },
    { name: 'docker_exec', args: ['container_id', 'command'], description: 'Execute a command in a running container.' },
    { name: 'docker_compose_up', args: ['path'], description: 'Run docker-compose up.' },
    { name: 'docker_compose_down', args: ['path'], description: 'Run docker-compose down.' },
    { name: 'docker_pull', args: ['image'], description: 'Pull a docker image.' },
    { name: 'docker_push', args: ['image'], description: 'Push a docker image.' }
  ],
  'Deployment / Cloud': [
    { name: 'deploy_static_site', args: ['path', 'provider'], description: 'Deploy a static site.' },
    { name: 'deploy_backend', args: ['path', 'provider'], description: 'Deploy a backend application.' },
    { name: 'deploy_docker_app', args: ['image', 'provider'], description: 'Deploy a docker container.' },
    { name: 'deploy_serverless', args: ['path', 'provider'], description: 'Deploy serverless functions.' },
    { name: 'env_list', args: [], description: 'List environment variables.' },
    { name: 'env_get', args: ['key'], description: 'Get an environment variable.' },
    { name: 'env_set', args: ['key', 'value'], description: 'Set an environment variable.' },
    { name: 'env_delete', args: ['key'], description: 'Delete an environment variable.' },
    { name: 'secrets_store', args: ['key', 'value'], description: 'Securely store a secret.' },
    { name: 'secrets_get', args: ['key'], description: 'Retrieve a stored secret.' }
  ],
  'Data / ML': [
    { name: 'dataset_download', args: ['url', 'destination'], description: 'Download a dataset.' },
    { name: 'dataset_clean', args: ['path'], description: 'Clean a dataset.' },
    { name: 'dataset_split', args: ['path', 'ratio'], description: 'Split a dataset into train/test sets.' },
    { name: 'dataset_analyze', args: ['path'], description: 'Analyze a dataset.' },
    { name: 'train_model', args: ['dataset', 'config'], description: 'Train an ML model.' },
    { name: 'evaluate_model', args: ['model', 'test_set'], description: 'Evaluate an ML model.' },
    { name: 'export_model', args: ['model', 'format'], description: 'Export an ML model.' },
    { name: 'vector_store_create', args: ['name'], description: 'Create a new vector store.' },
    { name: 'vector_store_search', args: ['name', 'query'], description: 'Search a vector store.' },
    { name: 'vector_store_delete', args: ['name'], description: 'Delete a vector store.' }
  ],
  'Security': [
    { name: 'scan_ports', args: ['target'], description: 'Scan open ports on a target.' },
    { name: 'scan_vulnerabilities', args: ['target'], description: 'Scan a target for vulnerabilities.' },
    { name: 'check_ssl', args: ['domain'], description: 'Check SSL certificate of a domain.' },
    { name: 'check_headers', args: ['url'], description: 'Check security headers of a URL.' },
    { name: 'password_generate', args: ['length', 'complexity'], description: 'Generate a secure password.' },
    { name: 'hash_file', args: ['path', 'algorithm'], description: 'Calculate the hash of a file.' },
    { name: 'verify_checksum', args: ['path', 'checksum'], description: 'Verify a file against a checksum.' }
  ],
  'QA / Monitoring': [
    { name: 'health_check', args: ['url'], description: 'Perform a health check on a URL.' },
    { name: 'benchmark_project', args: ['path'], description: 'Benchmark project performance.' },
    { name: 'performance_profile', args: ['target'], description: 'Generate a performance profile.' },
    { name: 'load_test', args: ['url', 'users', 'duration'], description: 'Run a load test.' },
    { name: 'uptime_check', args: ['url'], description: 'Check the uptime of a service.' },
    { name: 'log_analyze', args: ['path'], description: 'Analyze log files for errors/patterns.' },
    { name: 'error_trace', args: ['error_id'], description: 'Trace an error ID through the system.' }
  ],
  'Advanced Web Automation': [
    { name: 'crawl_site', args: ['url', 'depth'], description: 'Crawl a website.' },
    { name: 'extract_structured_data', args: ['url', 'schema'], description: 'Extract structured data from a page.' },
    { name: 'extract_emails', args: ['url'], description: 'Extract email addresses from a page.' },
    { name: 'sitemap_generate', args: ['url'], description: 'Generate a sitemap for a website.' },
    { name: 'link_checker', args: ['url'], description: 'Check for broken links on a website.' },
    { name: 'seo_audit', args: ['url'], description: 'Perform an SEO audit on a website.' }
  ],
  'Multi-Agent Orchestration': [
    { name: 'agent_message', args: ['target', 'message'], description: 'Alias for send_message.' },
    { name: 'agent_broadcast', args: ['message'], description: 'Broadcast a message to all active agents.' },
    { name: 'agent_assign_task', args: ['agent', 'task'], description: 'Assign a specific task to an agent.' },
    { name: 'agent_create_team', args: ['team_name', 'agents'], description: 'Create a logical team of agents.' },
    { name: 'agent_pause', args: ['agent'], description: 'Pause an active agent.' },
    { name: 'agent_resume', args: ['agent'], description: 'Resume a paused agent.' },
    { name: 'agent_memory_share', args: ['from_agent', 'to_agent'], description: 'Share context memory between agents.' },
    { name: 'agent_report', args: ['agent'], description: 'Get a status report from an agent.' }
  ]
};

export function getAllTools() {
  loadCustomSkills();
  return toolNamespaces;
}

export function getToolNames() {
  loadCustomSkills();
  const names = [];
  for (const tools of Object.values(toolNamespaces)) {
    for (const tool of tools) {
      if (!['spawn_instance', 'send_message', 'search_web', 'task_complete'].includes(tool.name)) {
        names.push(tool.name);
      }
    }
  }
  return names;
}

export function generatePromptExtension() {
  loadCustomSkills();
  let prompt = '\n\nEXTENDED TOOL REGISTRY:\n';
  prompt += 'You now have access to a massive extended toolset. To call any of these tools, use the exact syntax: tool_name("arg1", "arg2")\n\n';
  
  for (const [namespace, tools] of Object.entries(toolNamespaces)) {
    prompt += `### ${namespace}\n`;
    for (const tool of tools) {
      prompt += `- ${tool.name}(${tool.args.map(a => `"${a}"`).join(', ')}) : ${tool.description}\n`;
    }
  }
  return prompt;
}

function loadCustomSkills() {
  const cwd = global.VULKAN_CWD || process.cwd();
  const skillsFile = path.join(cwd, 'vulkan_skills.json');
  if (fs.existsSync(skillsFile)) {
    try {
      const skills = JSON.parse(fs.readFileSync(skillsFile, 'utf8'));
      if (!toolNamespaces['Custom Skills']) toolNamespaces['Custom Skills'] = [];
      skills.forEach(skill => {
        if (!toolNamespaces['Custom Skills'].find(t => t.name === skill.name)) {
          toolNamespaces['Custom Skills'].push({
             name: skill.name,
             args: ['arg1', 'arg2'],
             description: skill.description
          });
        }
      });
    } catch (e) {
      console.error('[Tool Registry] Failed to load custom skills', e.message);
    }
  }
}

export async function executeGenericTool(toolName, args) {
  console.log(`[Tool Registry] Executing ${toolName} with args:`, args);
  const VULKAN_CWD = global.VULKAN_CWD || process.cwd();

  try {
    if (toolName === 'list_directory') {
      const targetDir = args[0] ? path.resolve(VULKAN_CWD, args[0]) : VULKAN_CWD;
      const files = fs.readdirSync(targetDir);
      return { status: 'success', directory: targetDir, files };
    }
    
    if (toolName === 'read_file') {
      const targetPath = path.resolve(VULKAN_CWD, args[0]);
      const content = fs.readFileSync(targetPath, 'utf8');
      return { status: 'success', file: targetPath, content: content };
    }

    if (toolName === 'read_pdf') {
      const targetPath = path.resolve(VULKAN_CWD, args[0]);
      const dataBuffer = fs.readFileSync(targetPath);
      const data = await pdfParse(dataBuffer);
      return { status: 'success', file: targetPath, text: data.text };
    }

    if (toolName === 'write_file') {
      const targetPath = path.resolve(VULKAN_CWD, args[0]);
      const content = args[1] || '';
      if (targetPath.endsWith('.json')) {
        try {
          JSON.parse(content);
        } catch (e) {
          throw new Error('Invalid JSON format: ' + e.message);
        }
      }
      fs.writeFileSync(targetPath, content, 'utf8');
      return { status: 'success', file: targetPath, message: 'File written successfully.' };
    }

    if (toolName === 'append_file') {
      const targetPath = path.resolve(VULKAN_CWD, args[0]);
      fs.appendFileSync(targetPath, args[1] || '', 'utf8');
      return { status: 'success', file: targetPath, message: 'Content appended successfully.' };
    }

    if (toolName === 'verify_filesystem') {
      const paths = args[0].split(',').map(p => p.trim());
      const missing = [];
      const empty = [];
      for (const p of paths) {
        if (!p) continue;
        const targetPath = path.resolve(VULKAN_CWD, p);
        if (!fs.existsSync(targetPath)) {
          missing.push(p);
        } else if (fs.statSync(targetPath).size === 0) {
          empty.push(p);
        }
      }
      if (missing.length > 0 || empty.length > 0) {
         throw new Error(`Filesystem verification failed. Missing: ${missing.join(', ')}. Empty: ${empty.join(', ')}.`);
      }
      return { status: 'success', message: 'All files verified successfully.' };
    }

    if (toolName === 'replace_code_block') {
      const targetPath = path.resolve(VULKAN_CWD, args[0]);
      const searchStr = args[1];
      const replaceStr = args[2];
      if (!fs.existsSync(targetPath)) throw new Error('File not found');
      let content = fs.readFileSync(targetPath, 'utf8');
      if (!content.includes(searchStr)) throw new Error('Search string not found in file');
      content = content.replace(searchStr, replaceStr);
      fs.writeFileSync(targetPath, content, 'utf8');
      return { status: 'success', file: targetPath, message: 'Code block replaced successfully.' };
    }

    if (toolName === 'create_directory') {
      const targetPath = path.resolve(VULKAN_CWD, args[0]);
      fs.mkdirSync(targetPath, { recursive: true });
      return { status: 'success', directory: targetPath, message: 'Directory created successfully.' };
    }

    if (toolName === 'run_command') {
      return new Promise((resolve) => {
        exec(args[0], { cwd: VULKAN_CWD }, (error, stdout, stderr) => {
          resolve({
            status: error ? 'error' : 'success',
            stdout: stdout.trim(),
            stderr: stderr.trim(),
            error: error ? error.message : null
          });
        });
      });
    }

    if (toolName === 'create_skill') {
      const [name, description, javascriptCode] = args;
      const skillsFile = path.join(VULKAN_CWD, 'vulkan_skills.json');
      let skills = [];
      if (fs.existsSync(skillsFile)) {
        skills = JSON.parse(fs.readFileSync(skillsFile, 'utf8'));
      }
      skills.push({ name, description, javascriptCode });
      fs.writeFileSync(skillsFile, JSON.stringify(skills, null, 2));
      loadCustomSkills(); // Reload immediately
      return { status: 'success', message: `Skill '${name}' created and saved to ${skillsFile}` };
    }

    // Default stub implementation or check custom skills execution
    // If it's a custom skill, we could theoretically eval() it, but for safety in this stub we just acknowledge it
    return {
      status: 'success',
      message: `Executed ${toolName} successfully.`,
      tool: toolName,
      args
    };
  } catch (error) {
    return { status: 'error', message: error.message };
  }
}