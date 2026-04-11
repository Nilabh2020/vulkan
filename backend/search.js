import * as cheerio from 'cheerio';

/**
 * Performs an API-less web search using DuckDuckGo's HTML version.
 * This avoids needing any search engine API keys.
 */
export async function performWebSearch(query) {
  try {
    const response = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      }
    });

    if (!response.ok) {
      throw new Error(`Search request failed with status: ${response.status}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    const results = [];

    $('.result').each((i, el) => {
      if (i >= 5) return false; // Limit to top 5 results to save context window

      const title = $(el).find('.result__title').text().trim();
      const snippet = $(el).find('.result__snippet').text().trim();
      const link = $(el).find('.result__url').attr('href');
      
      // Clean up the URL format from DuckDuckGo's redirect format
      let actualUrl = link;
      if (link && link.startsWith('//duckduckgo.com/l/?uddg=')) {
        actualUrl = decodeURIComponent(link.split('uddg=')[1].split('&')[0]);
      }

      if (title && snippet) {
        results.push(`[${i + 1}] Title: ${title}\nURL: ${actualUrl}\nSnippet: ${snippet}`);
      }
    });

    if (results.length === 0) {
      return "No results found for exactly that query.";
    }

    return "Web Search Results:\n\n" + results.join('\n\n');
  } catch (error) {
    console.error('[Search] Web Search Error:', error);
    return `Web search failed: ${error.message}`;
  }
}
