export async function ollamaChat(model, messages) {
  const url = process.env.OLLAMA_URL || 'http://localhost:11434';
  const response = await fetch(`${url}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: model || 'llama3',
      messages,
      stream: false,
    }),
  });
  const data = await response.json();
  return data.message.content;
}
