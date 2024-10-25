const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());

// Middleware to check for AUTHORIZATION header
app.use((req, res, next) => {
  const apiKey = req.headers['authorization'];
  if (!apiKey) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});

class LubimyCzytacProvider {
  constructor() {
    this.id = 'lubimyczytac';
    this.name = 'Lubimy Czytać';
    this.baseUrl = 'https://lubimyczytac.pl';
    this.textDecoder = new TextDecoder('utf-8');
  }

  decodeText(text) {
    return this.textDecoder.decode(new TextEncoder().encode(text));
  }

  async searchBooks(query, author = '') {
    try {
      console.log(`Searching for: "${query}" by "${author}"`);
      let searchUrl = `${this.baseUrl}/szukaj/ksiazki?phrase=${encodeURIComponent(query)}`;
      
      if (author) {
        searchUrl += `&author=${encodeURIComponent(author)}`;
      }
      
      const response = await axios.get(searchUrl, { responseType: 'arraybuffer' });
      const decodedData = this.decodeText(response.data);
      const $ = cheerio.load(decodedData);
  
      console.log('Search URL:', searchUrl);
  
      const matches = [];
      const $books = $('.authorAllBooks__single');
      console.log('Number of books found:', $books.length);
  
      $books.each((index, element) => {
        const $book = $(element);
        const $bookInfo = $book.find('.authorAllBooks__singleText');
  
        const title = this.cleanTitle($bookInfo.find('.authorAllBooks__singleTextTitle').text().trim());
        const bookUrl = $bookInfo.find('.authorAllBooks__singleTextTitle').attr('href');
        const authors = $bookInfo.find('a[href*="/autor/"]').map((i, el) => $(el).text().trim()).get();
  
        console.log('Book title:', title);
        console.log('Book URL:', bookUrl);
        console.log('Authors:', authors);
  
        if (title && bookUrl && authors.length > 0) {
          matches.push({
            id: bookUrl.split('/').pop(),
            title: this.decodeUnicode(title),
            authors: authors.map(author => this.decodeUnicode(author)),
            url: `${this.baseUrl}${bookUrl}`,
            source: {
              id: this.id,
              description: this.name,
              link: this.baseUrl,
            },
          });
        }
      });
  
      const fullMetadata = await Promise.all(matches.map(match => this.getFullMetadata(match)));
  
      console.log('Final search results:', JSON.stringify(fullMetadata, null, 2));
      return { matches: fullMetadata };
    } catch (error) {
      console.error('Error searching books:', error.message, error.stack);
      return { matches: [] };
    }
  }

  async getFullMetadata(match) {
    try {
      console.log(`Fetching full metadata for: ${match.title}`);
      const response = await axios.get(match.url, { responseType: 'arraybuffer' });
      const decodedData = this.decodeText(response.data);
      const $ = cheerio.load(decodedData);

      const cover = $('meta[property="og:image"]').attr('content') || '';
      const publisher = $('dt:contains("Wydawnictwo:")').next('dd').find('a').text().trim() || '';
      const languages = $('dt:contains("Język:")').next('dd').text().trim().split(', ') || [];
      const description = $('.collapse-content').html() || $('meta[property="og:description"]').attr('content') || '';
      const seriesElement = $('span.d-none.d-sm-block.mt-1:contains("Cykl:") a').text().trim();
      const series = this.extractSeriesName(seriesElement);
      const seriesIndex = this.extractSeriesIndex(seriesElement);
      const genres = this.extractGenres($);
      const tags = this.extractTags($);
      const rating = parseFloat($('meta[property="books:rating:value"]').attr('content')) / 2 || null;
      const isbn = $('meta[property="books:isbn"]').attr('content') || '';

      let publishedDate, pages;
      try {
        publishedDate = this.extractPublishedDate($);
        pages = this.extractPages($);
      } catch (error) {
        console.error('Error extracting published date or pages:', error.message);
      }

      const translator = this.extractTranslator($);

      const fullMetadata = {
        ...match,
        cover,
        description: this.enrichDescription(description, pages, publishedDate, translator),
        languages: languages.map(lang => this.getLanguageName(lang)),
        publisher,
        publishedDate,
        rating,
        series,
        seriesIndex,
        genres,
        tags,
        isbn,
        identifiers: {
          lubimyczytac: match.id,
        },
      };

      console.log(`Full metadata for ${match.title}:`, JSON.stringify(fullMetadata, null, 2));
      return fullMetadata;
    } catch (error) {
      console.error(`Error fetching full metadata for ${match.title}:`, error.message, error.stack);
      return match; // Return basic metadata if full metadata fetch fails
    }
  }

  cleanTitle(title) {
    // Replace dots, hyphens, and slashes with spaces
    return title
      .replace(/(\.|\-|\/)/g, ' ') // Replace dots, hyphens, and slashes with spaces
      .replace(/(?:\(czyta [^\)]+\)|\[\d+\]|-\s*\d+\s*kbps|\d+\s*kbps)?/g, '') // Remove extraneous info
      .replace(/\s+/g, ' ') // Replace multiple spaces with a single space
      .trim(); // Trim leading/trailing spaces
  }

  extractSeriesName(seriesElement) {
    if (!seriesElement) return null;
    return seriesElement.replace(/\s*\(tom \d+.*?\)\s*$/, '').trim();
  }

  extractSeriesIndex(seriesElement) {
    if (!seriesElement) return null;
    const match = seriesElement.match(/\(tom (\d+)/);
    return match ? parseInt(match[1]) : null;
  }

  extractPublishedDate($) {
    const dateText = $('dt[title*="Data pierwszego wydania"]').next('dd').text().trim();
    return dateText ? new Date(dateText) : null;
  }

  extractPages($) {
    try {
      const pagesText = $('script[type="application/ld+json"]').text();
      if (pagesText) {
        const data = JSON.parse(pagesText);
        return data.numberOfPages || null;
      }
    } catch (error) {
      console.error('Error parsing JSON for pages:', error.message);
    }
    return null;
  }

  extractTranslator($) {
    return $('dt:contains("Tłumacz:")').next('dd').find('a').text().trim() || null;
  }

  extractGenres($) {
    const genreText = $('.book__category.d-sm-block.d-none').text().trim();
    return genreText ? genreText.split(',').map(genre => genre.trim()) : [];
  }

  extractTags($) {
    return $('a[href*="/ksiazki/t/"]').map((i, el) => $(el).text().trim()).get() || [];
  }

  stripHtmlTags(html) {
    return html.replace(/<[^>]*>/g, '');
  }

  enrichDescription(description, pages, publishedDate, translator) {
    let enrichedDescription = this.stripHtmlTags(description);

    if (pages) {
      enrichedDescription += `\n\nKsiążka ma ${pages} stron.`;
    }

    if (publishedDate) {
      enrichedDescription += `\n\nData pierwszego wydania: ${publishedDate.toLocaleDateString()}`;
    }

    if (translator) {
      enrichedDescription += `\n\nTłumacz: ${translator}`;
    }

    return enrichedDescription;
  }

  getLanguageName(language) {
    const languageMap = {
      polski: 'pol',
      angielski: 'eng',
      // Add more language mappings as needed
    };
    return languageMap[language.toLowerCase()] || language;
  }

  decodeUnicode(str) {
    return str.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16))
    );
  }
}

const provider = new LubimyCzytacProvider();

app.get('/search', async (req, res) => {
  try {
    console.log('Received search request:', req.query);
    const query = req.query.query;
    const author = req.query.author;

    if (!query) {
      return res.status(400).json({ error: 'Query parameter is required' });
    }

    const results = await provider.searchBooks(query, author);
    
    const formattedResults = {
      matches: results.matches.map(book => ({
        title: book.title,
        subtitle: book.subtitle || undefined,
        author: book.authors.join(', '),
        narrator: book.narrator || undefined,
        publisher: book.publisher || undefined,
        publishedYear: book.publishedDate ? new Date(book.publishedDate).getFullYear() : undefined,
        description: book.description,
        cover: book.cover,
        url: book.url,
        source: book.source,
        tags: book.tags,
        rating: book.rating,
        genres: book.genres,
		isbn: book.isbn,
      })),
    };
    
    res.json(formattedResults);
  } catch (error) {
    console.error('Error handling search request:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
