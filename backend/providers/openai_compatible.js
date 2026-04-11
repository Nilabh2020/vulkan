async function openAIChat(model, messages, apiKey, url) {
  const response = await fetch(`${url}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, messages }),
  });
  const data = await response.json();
  return data.choices[0].message.content;
}

export async function openaiChat(model, messages) {
  return openAIChat(model, messages, process.env.OPENAI_API_KEY, 'https://api.openai.com');
}

export async function openrouterChat(model, messages) {
  return openAIChat(model, messages, process.env.OPENROUTER_API_KEY, 'https://openrouter.ai/api');
}

export async function nvidiaChat(model, messages) {
  return openAIChat(model, messages, process.env.NVIDIA_API_KEY, 'https://integrate.api.nvidia.com');
}
