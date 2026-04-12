import * as cheerio from 'cheerio';

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1'
];

/**
 * Performs an API-less web search using DuckDuckGo's HTML version.
 */
export async function performWebSearch(query, retryCount = 0) {
  try {
    const randomUA = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
    const response = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
      headers: {
        'User-Agent': randomUA,
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      }
    });

    if (!response.ok) {
      if (response.status === 403 || response.status === 429) {
        if (retryCount < 2) {
          console.warn(`[Search] Rate limited. Retrying in ${1000 * (retryCount + 1)}ms...`);
          await new Promise(r => setTimeout(r, 1000 * (retryCount + 1)));
          return performWebSearch(query, retryCount + 1);
        }
        return "Web search failed: Access denied/Rate limited. Please try a more specific query later.";
      }
      throw new Error(`Search request failed with status: ${response.status}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    const results = [];

    $('.result').each((i, el) => {
      if (i >= 5) return false;

      const title = $(el).find('.result__title').text().trim();
      const snippet = $(el).find('.result__snippet').text().trim();
      const link = $(el).find('.result__url').attr('href');
      
      let actualUrl = link;
      if (link && link.startsWith('//duckduckgo.com/l/?uddg=')) {
        const parts = link.split('uddg=')[1];
        if (parts) actualUrl = decodeURIComponent(parts.split('&')[0]);
      }

      if (title && snippet) {
        results.push(`[${i + 1}] Title: ${title}\nURL: ${actualUrl}\nSnippet: ${snippet}`);
      }
    });

    if (results.length === 0) {
      return "No results found for exactly that query. Suggestion: Broaden keywords or check another source.";
    }

    return "Web Search Results:\n\n" + results.join('\n\n');
  } catch (error) {
    console.error('[Search] Web Search Error:', error);
    if (error.name === 'TypeError' && error.message === 'fetch failed') {
       return "Web search failed: The search engine is currently unavailable or your connection was reset. Please try again later or use alternative sources.";
    }
    return `Web search failed: ${error.message}`;
  }
}
