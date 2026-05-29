import type { ForgePlugin } from '../src/lib/forge-plugin-loader';
import type { BuiltinToolDefinition } from '../src/lib/forge-tool-catalog';

async function performWebSearch(query: string): Promise<string> {
  try {
    const response = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });
    if (!response.ok) return `Failed to fetch search results: ${response.statusText}`;

    const html = await response.text();
    const results: string[] = [];
    
    // Extract results using simple regex matching for duckduckgo html
    const resultPattern = /<a class="result__url" href="([^"]+)">(.*?)<\/a>.*?<a class="result__snippet[^>]*>(.*?)<\/a>/gs;
    let match;
    let count = 0;
    while ((match = resultPattern.exec(html)) !== null && count < 10) {
      const url = match[1];
      const snippet = match[3].replace(/<[^>]*>?/gm, '').trim(); // Remove HTML tags
      results.push(`URL: ${url}\nSnippet: ${snippet}\n`);
      count++;
    }

    return results.length > 0 ? results.join('\n') : 'No results found.';
  } catch (err: any) {
    return `Error performing web search: ${err.message}`;
  }
}

async function performWebExtract(url: string): Promise<string> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });
    if (!response.ok) return `Failed to fetch webpage: ${response.statusText}`;

    const html = await response.text();
    // Simple HTML to text extraction (strips script/style tags and then all other tags)
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]*>?/gm, ' ')
      .replace(/\s\s+/g, ' ')
      .trim();
      
    return text.substring(0, 8000) + (text.length > 8000 ? '\n... (truncated)' : '');
  } catch (err: any) {
    return `Error extracting webpage: ${err.message}`;
  }
}

const WebModule: ForgePlugin = {
  name: 'module-web',
  version: '1.0.0',
  tools: [
    {
      name: 'web_search',
      displayName: 'Recherche Web',
      description: 'Effectue une recherche sur Internet via DuckDuckGo et retourne les meilleurs résultats (URL et résumé).',
      category: 'network',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'La requête de recherche' },
        },
        required: ['query'],
      },
      implementationKind: 'builtin',
      implementationConfig: { handler: 'web_search' },
      classification: { isReadOnly: true, isConcurrencySafe: true, runtimeProfile: 'both' },
    },
    {
      name: 'web_extract',
      displayName: 'Extraire page Web',
      description: 'Télécharge une page web et extrait son contenu textuel brut. Pratique pour lire un article ou une documentation en ligne.',
      category: 'network',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'L\'URL absolue de la page' },
        },
        required: ['url'],
      },
      implementationKind: 'builtin',
      implementationConfig: { handler: 'web_extract' },
      classification: { isReadOnly: true, isConcurrencySafe: true, runtimeProfile: 'both' },
    }
  ],
  initialize: async () => {
    // Inject custom tool handlers into global or a registry if needed.
    // For Forge, since we use 'builtin', we should register the handler in forge-tool-bus.ts
    // but we can hack it by attaching it to a global map that forge-tool-bus can read, 
    // or we can export a hook.
    (globalThis as any).__forgePluginHandlers = (globalThis as any).__forgePluginHandlers || {};
    (globalThis as any).__forgePluginHandlers['web_search'] = performWebSearch;
    (globalThis as any).__forgePluginHandlers['web_extract'] = performWebExtract;
  }
};

export default WebModule;
