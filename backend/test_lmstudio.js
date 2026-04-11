// Test the user's exact model with the reasoning_content fix
const url = 'http://127.0.0.1:1234/v1/chat/completions';

const body = {
  model: 'qwen3.5-9b-claude-4.6-opus-reasoning-distilled-v2',
  messages: [
    { role: 'system', content: 'You ONLY output commands. No prose. Available: spawn_instance("name", "role", "goal")' },
    { role: 'user', content: 'deploy 2 workers' }
  ],
  temperature: 0.6,
  top_p: 0.9,
  max_tokens: 4096
};

console.log('[Test] Sending to LM Studio with max_tokens=4096...');

try {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  const data = await response.json();
  const msg = data?.choices?.[0]?.message;
  
  console.log('[Test] HTTP Status:', response.status);
  console.log('[Test] finish_reason:', data?.choices?.[0]?.finish_reason);
  console.log('[Test] content:', JSON.stringify(msg?.content));
  console.log('[Test] reasoning_content:', JSON.stringify(msg?.reasoning_content?.slice(0, 300)));
  console.log('[Test] tokens used:', JSON.stringify(data?.usage));
  
  // This is what Vulkan will now use:
  const finalReply = msg?.content || msg?.reasoning_content || '';
  console.log('\n[Result] Final reply Vulkan will see:');
  console.log(finalReply);
} catch (err) {
  console.error('[Test] FAILED:', err.message);
}
