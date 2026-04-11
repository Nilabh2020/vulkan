export async function lmstudioChat(model, messages) {
  const url = process.env.LMSTUDIO_URL || 'http://localhost:1234';
  const response = await fetch(`${url}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: model || 'local-model',
      messages,
    }),
  });
  const data = await response.json();
  return data.choices[0].message.content;
}
