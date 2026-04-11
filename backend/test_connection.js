const testLMStudio = async () => {
  const baseUrl = 'http://127.0.0.1:1234';
  const url = `${baseUrl}/v1/models`;
  const headers = { 'Content-Type': 'application/json' };

  console.log(`[Test] Attempting fetch to: ${url}`);
  
  try {
    const response = await fetch(url, { headers });
    console.log(`[Test] Status: ${response.status}`);
    const data = await response.json();
    console.log(`[Test] Models found: ${data.data.map(m => m.id).join(', ')}`);
  } catch (error) {
    console.error(`[Test] Fetch failed:`, error.message);
  }
};

testLMStudio();
