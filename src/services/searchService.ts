import { logger } from '../utils/logger';

// Retrieve configurations from env
const SERPER_API_KEY = process.env.SERPER_API_KEY;

export interface SearchResultItem {
  title: string;
  link: string;
  snippet: string;
  source?: string;
}

/**
 * Helper to fetch search results from Serper.dev API
 */
const fetchSerper = async (q: string): Promise<SearchResultItem[]> => {
  try {
    if (!SERPER_API_KEY) {
      logger.warn('⚠️ SERPER_API_KEY is not defined. Serper search is skipped.');
      return [];
    }

    const response = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'X-API-KEY': SERPER_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        q,
        gl: 'id', // country: Indonesia
        hl: 'id', // language: Indonesian
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(`❌ Serper API error for query "${q}":`, response.status, errorText);
      return [];
    }

    const data = await response.json() as any;
    const organicResults = data.organic || [];
    
    return organicResults.map((item: any) => {
      let source = '';
      try {
        const url = new URL(item.link);
        source = url.hostname.replace('www.', '');
      } catch {
        source = 'Pencarian Web';
      }
      return {
        title: item.title,
        link: item.link,
        snippet: item.snippet || '',
        source,
      };
    });
  } catch (err) {
    logger.error(`❌ Fetch Serper failed for query "${q}":`, err);
    return [];
  }
};

/**
 * Helper to remove common Indonesian stopwords to optimize search query performance
 */
export const removeStopwords = (text: string): string => {
  const stopwords = [
    /\badalah\b/gi, /\borang\b/gi, /\byang\b/gi, /\bdan\b/gi, /\bdi\b/gi, /\bke\b/gi,
    /\bdari\b/gi, /\bselama\b/gi, /\buntuk\b/gi, /\bdengan\b/gi, /\bsecara\b/gi,
    /\bpada\b/gi, /\boleh\b/gi, /\bbahwa\b/gi, /\bsebagai\b/gi, /\batau\b/gi,
    /\bini\b/gi, /\bitu\b/gi, /\btelah\b/gi, /\bsudah\b/gi, /\bakan\b/gi,
    /\bdalam\b/gi, /\btentang\b/gi, /\bterhadap\b/gi, /\bseorang\b/gi,
    /\biya\b/gi, /\bdia\b/gi, /\bmereka\b/gi, /\bkamu\b/gi, /\bkami\b/gi, /\bsaya\b/gi
  ];
  let res = text;
  for (const regex of stopwords) {
    res = res.replace(regex, ' ');
  }
  return res.replace(/\s+/g, ' ').trim();
};

/**
 * Helper to clean/optimize Indonesian conversational query into focused search keywords
 */
export const cleanSearchQuery = (query: string): string => {
  let cleaned = query.trim();
  
  // Remove common question marks at the end
  cleaned = cleaned.replace(/[?]+$/, '');
  
  // Indonesian conversational prefixes to remove
  const prefixes = [
    /^(apakah\s+)?benar\s+tentang\s+berita\s+/i,
    /^(apakah\s+)?benar\s+berita\s+/i,
    /^(apakah\s+)?benar\s+bahwa\s+/i,
    /^tolong\s+cek\s+apakah\s+/i,
    /^tolong\s+cek\s+berita\s+/i,
    /^tolong\s+cek\s+/i,
    /^apakah\s+betul\s+bahwa\s+/i,
    /^apakah\s+betul\s+tentang\s+/i,
    /^apakah\s+betul\s+/i,
    /^apakah\s+benar\s+/i,
    /^benarkah\s+tentang\s+/i,
    /^benarkah\s+bahwa\s+/i,
    /^benarkah\s+/i,
    /^berita\s+tentang\s+/i,
    /^tahu(kah)?\s+kamu\s+tentang\s+/i,
    /^tahu(kah)?\s+kamu\s+/i,
    /^apakah\s+/i,
  ];
  
  for (const prefix of prefixes) {
    if (prefix.test(cleaned)) {
      cleaned = cleaned.replace(prefix, '');
      break; // only strip one primary prefix
    }
  }
  
  return cleaned.trim();
};

/**
 * Multi-phase Google Search using Serper.dev API
 * Targeted to Indonesian regional results (gl=id, hl=id)
 * Phase 1: 15 Fact check & government sites (e.g. turnbackhoax.id, kominfo.go.id, etc.)
 * Phase 2: 50+ news and major media outlets (e.g. detik.com, kompas.com, and general query)
 */
export const searchMultiPhase = async (
  query: string,
  onProgress?: (event: { phase: number; count: number; sites: string[] }) => void
): Promise<SearchResultItem[]> => {
  try {
    if (!SERPER_API_KEY) {
      logger.warn('⚠️ SERPER_API_KEY is not defined. Google Search grounding is skipped.');
      return [];
    }

    const cleanQuery = cleanSearchQuery(query);
    const keywordQuery = removeStopwords(cleanQuery) || cleanQuery;
    logger.info(`🔍 Cleaned query from "${query}" to "${cleanQuery}" (keywords: "${keywordQuery}")`);

    const seenLinks = new Set<string>();
    const allResults: SearchResultItem[] = [];

    // --- PHASE 1 ---
    const phase1Sites = [
      'turnbackhoax.id', 'kominfo.go.id', 'cekfakta.com', 'mafindo.or.id',
      'kpai.go.id', 'kemkes.go.id', 'kemsos.go.id', 'komnasham.go.id',
      'pmi.or.id', 'bps.go.id', 'polri.go.id', 'saberhoaks.jabarprov.go.id',
      'lapor.go.id', 'liputan6.com/cek-fakta', 'tempo.co/cekfakta'
    ];

    if (onProgress) {
      onProgress({
        phase: 1,
        count: phase1Sites.length,
        sites: phase1Sites,
      });
    }

    const phase1Queries = [
      `site:turnbackhoax.id ${keywordQuery}`,
      `site:kominfo.go.id ${keywordQuery}`,
      `site:cekfakta.com OR site:mafindo.or.id ${keywordQuery}`,
      `site:kpai.go.id OR site:kemkes.go.id OR site:kemsos.go.id ${keywordQuery}`,
      `site:komnasham.go.id OR site:pmi.or.id OR site:bps.go.id ${keywordQuery}`,
      `site:saberhoaks.jabarprov.go.id OR site:polri.go.id OR site:lapor.go.id ${keywordQuery}`
    ];

    const phase1Results = await Promise.all(
      phase1Queries.map(q => fetchSerper(q))
    );

    // Collect Phase 1 results (prioritize TurnBackHoax.id)
    for (const resultsList of phase1Results) {
      for (const item of resultsList) {
        if (!seenLinks.has(item.link)) {
          seenLinks.add(item.link);
          allResults.push(item);
        }
      }
    }

    // --- PHASE 2 ---
    const phase2Sites = [
      'detik.com', 'kompas.com', 'tribunnews.com', 'cnnindonesia.com', 'tempo.co',
      'antaranews.com', 'kumparan.com', 'okezone.com', 'sindonews.com', 'jawapos.com',
      'liputan6.com', 'merdeka.com', 'viva.co.id', 'republika.co.id', 'suara.com',
      'tirto.id', 'idntimes.com', 'cnbcindonesia.com', 'medcom.id', 'jpnn.com',
      'beritasatu.com', 'kompas.tv', 'metrotvnews.com', 'tvonenews.com', 'inews.id',
      'rtv.co.id', 'radarjogja.jawapos.com', 'harianjogja.com', 'solopos.com', 
      'suarasurabaya.net', 'pikiran-rakyat.com', 'fajar.co.id', 'kaltimpost.id',
      'balipost.com', 'analisadaily.com', 'riaupos.co', 'sumeks.co', 'kaskus.co.id', 
      'kompasiana.com', 'harianhaluan.com', 'bisnis.com', 'suaramerdeka.com', 
      'bantenraya.com', 'tribunnews.com/regional', 'jogja.tribunnews.com', 
      'jabar.tribunnews.com', 'jateng.tribunnews.com', 'jatim.tribunnews.com',
      'medan.tribunnews.com', 'makassar.tribunnews.com'
    ]; // 50 news & media websites

    if (onProgress) {
      onProgress({
        phase: 2,
        count: phase1Sites.length + phase2Sites.length,
        sites: [...phase1Sites, ...phase2Sites],
      });
    }

    const phase2Queries = [
      `site:detik.com ${keywordQuery}`,
      `site:kompas.com ${keywordQuery}`,
      `site:tribunnews.com ${keywordQuery}`,
      `site:cnnindonesia.com ${keywordQuery}`,
      `site:tempo.co OR site:antaranews.com OR site:kumparan.com ${keywordQuery}`,
      `${keywordQuery}`, // General keyword search
      `${cleanQuery}`    // General full query search
    ];

    const phase2Results = await Promise.all(
      phase2Queries.map(q => fetchSerper(q))
    );

    // Collect Phase 2 results
    for (const resultsList of phase2Results) {
      for (const item of resultsList) {
        if (!seenLinks.has(item.link)) {
          seenLinks.add(item.link);
          allResults.push(item);
        }
      }
    }

    logger.info(`✅ Multi-phase search retrieved ${allResults.length} unique results`);
    return allResults;

  } catch (error) {
    logger.error('❌ Multi-phase Google Search failed:', error);
    return [];
  }
};

/**
 * Backward compatible search Google helper
 */
export const searchGoogle = async (query: string): Promise<SearchResultItem[]> => {
  try {
    if (!SERPER_API_KEY) {
      return [];
    }
    // Call multi-phase search without progress callback, and limit results to top 8
    const results = await searchMultiPhase(query);
    return results.slice(0, 8);
  } catch (error) {
    logger.error('❌ Google Search failed:', error);
    return [];
  }
};

