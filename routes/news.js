const express = require('express');
const router = express.Router();
const axios = require('axios');
const authMiddleware = require('../middleware/auth');

const PYTHON_API_URL = process.env.PYTHON_API_URL || 'http://172.23.2.8:5000';
const NEWS_API_KEY = process.env.NEWS_API_KEY;

// Categories configuration
const CATEGORIES = {
  general: { name: 'General', keywords: ['news', 'latest', 'headlines'] },
  business: { name: 'Business', keywords: ['business', 'economy', 'finance'] },
  technology: { name: 'Technology', keywords: ['technology', 'tech', 'ai'] },
  sports: { name: 'Sports', keywords: ['sports', 'sport', 'game'] },
  entertainment: { name: 'Entertainment', keywords: ['entertainment', 'movie', 'film'] },
  health: { name: 'Health', keywords: ['health', 'medical', 'fitness'] },
  science: { name: 'Science', keywords: ['science', 'research', 'space'] }
};

// Countries configuration
const COUNTRIES = {
  us: { name: 'United States', code: 'us' },
  gb: { name: 'United Kingdom', code: 'gb' },
  in: { name: 'India', code: 'in' },
  ca: { name: 'Canada', code: 'ca' },
  au: { name: 'Australia', code: 'au' },
  de: { name: 'Germany', code: 'de' },
  fr: { name: 'France', code: 'fr' },
  jp: { name: 'Japan', code: 'jp' },
  cn: { name: 'China', code: 'cn' },
  ru: { name: 'Russia', code: 'ru' },
  br: { name: 'Brazil', code: 'br' },
  za: { name: 'South Africa', code: 'za' }
};

// ========== IMAGE HANDLING IMPROVEMENTS ==========
// Array of reliable fallback images (using different placeholder services)
const FALLBACK_IMAGES = [
  'https://placehold.co/600x400/2a4365/ffffff?text=News+Article',
  'https://placehold.co/600x400/1e3a5f/ffffff?text=Breaking+News',
  'https://placehold.co/600x400/2c5282/ffffff?text=Latest+News',
  'https://placehold.co/600x400/225577/ffffff?text=Top+Story',
  'https://placehold.co/600x400/2d3748/ffffff?text=Headlines',
  'https://picsum.photos/600/400?random=1',
  'https://picsum.photos/600/400?random=2',
  'https://picsum.photos/600/400?random=3',
  'https://picsum.photos/600/400?random=4',
  'https://picsum.photos/600/400?random=5'
];

// Category-specific fallback images
const CATEGORY_IMAGES = {
  general: 'https://placehold.co/600x400/2a4365/ffffff?text=General+News',
  business: 'https://placehold.co/600x400/2c5282/ffffff?text=Business+News',
  technology: 'https://placehold.co/600x400/1e3a5f/ffffff?text=Technology+News',
  sports: 'https://placehold.co/600x400/225577/ffffff?text=Sports+News',
  entertainment: 'https://placehold.co/600x400/2d3748/ffffff?text=Entertainment',
  health: 'https://placehold.co/600x400/276749/ffffff?text=Health+News',
  science: 'https://placehold.co/600x400/44337a/ffffff?text=Science+News'
};

// Helper function to check if image URL is valid
const isValidImageUrl = (url) => {
  if (!url) return false;
  if (typeof url !== 'string') return false;
  if (url === 'null' || url === 'undefined' || url === 'removed') return false;
  if (url.includes('placeholder') || url.includes('dummy')) return false;
  if (!url.startsWith('http://') && !url.startsWith('https://')) return false;
  if (url.includes('example.com') || url.includes('localhost')) return false;
  return true;
};

// Helper function to get random fallback image
const getRandomFallbackImage = () => {
  return FALLBACK_IMAGES[Math.floor(Math.random() * FALLBACK_IMAGES.length)];
};

// Helper function to get category-based fallback image
const getCategoryFallbackImage = (category = 'general') => {
  return CATEGORY_IMAGES[category] || CATEGORY_IMAGES.general;
};

// Helper function to process article image
const processArticleImage = (article, index = 0) => {
  // Try to get image from various sources
  let imageUrl = null;
  
  // Check urlToImage
  if (article.urlToImage && isValidImageUrl(article.urlToImage)) {
    imageUrl = article.urlToImage;
  }
  // Check image field
  else if (article.image && isValidImageUrl(article.image)) {
    imageUrl = article.image;
  }
  // Check if there's a valid image in multimedia (for some APIs)
  else if (article.multimedia && article.multimedia.length > 0) {
    const validImage = article.multimedia.find(m => isValidImageUrl(m.url));
    if (validImage) {
      imageUrl = validImage.url;
    }
  }
  
  // If still no image, try to generate from URL (some services provide og:image)
  if (!imageUrl && article.url) {
    try {
      const urlObj = new URL(article.url);
      // Try to get favicon or logo as fallback
      imageUrl = `https://logo.clearbit.com/${urlObj.hostname}?size=200`;
    } catch (e) {
      // Ignore URL parsing errors
    }
  }
  
  // If still no image, use category-based or random fallback
  if (!imageUrl) {
    // Use index to make it semi-deterministic
    const useRandom = index % 2 === 0;
    if (useRandom) {
      imageUrl = getRandomFallbackImage();
    } else {
      // Try to determine category from article or use general
      const category = article.category || 'general';
      imageUrl = getCategoryFallbackImage(category);
    }
  }
  
  return imageUrl;
};
// ========== END IMAGE HANDLING ==========

// Get categories
router.get('/categories', (req, res) => {
  const categoriesList = Object.entries(CATEGORIES).map(([id, info]) => ({
    id,
    name: info.name,
    keywords: info.keywords
  }));
  res.json({ categories: categoriesList });
});

// Get countries
router.get('/countries', (req, res) => {
  const countriesList = Object.entries(COUNTRIES).map(([code, info]) => ({
    code,
    name: info.name
  }));
  res.json({ countries: countriesList });
});

// Get news by country - UPDATED with better image handling
router.get('/country/:countryCode', authMiddleware, async (req, res) => {
  try {
    const { countryCode } = req.params;
    
    if (!COUNTRIES[countryCode]) {
      return res.status(400).json({ error: 'Invalid country code' });
    }

    const response = await axios.get(`https://newsapi.org/v2/top-headlines`, {
      params: {
        apiKey: NEWS_API_KEY,
        country: countryCode,
        pageSize: 20,
        language: 'en'
      }
    });

    const articles = response.data.articles
      .filter(article => article.title && article.title !== '[Removed]')
      .map((article, index) => ({
        title: article.title,
        description: article.description || 'No description available',
        url: article.url,
        source: { name: article.source?.name || "Unknown Source" },
        publishedAt: article.publishedAt,
        // IMPROVED: Better image handling
        urlToImage: processArticleImage(article, index),
        author: article.author || 'Unknown'
      }));

    res.json({
      success: true,
      articles,
      country: COUNTRIES[countryCode].name
    });
  } catch (error) {
    console.error('Country news error:', error);
    res.status(500).json({ error: 'Failed to fetch country news' });
  }
});

// Get news by category - UPDATED with better image handling
router.get('/category/:category', authMiddleware, async (req, res) => {
  try {
    const { category } = req.params;
    
    if (!CATEGORIES[category]) {
      return res.status(400).json({ error: 'Invalid category' });
    }

    const response = await axios.get(`https://newsapi.org/v2/top-headlines`, {
      params: {
        apiKey: NEWS_API_KEY,
        category: category,
        pageSize: 20,
        language: 'en'
      }
    });

    const articles = response.data.articles
      .filter(article => article.title && article.title !== '[Removed]')
      .map((article, index) => ({
        title: article.title,
        description: article.description || 'No description available',
        url: article.url,
        source: { name: article.source?.name || "Unknown Source" },
        publishedAt: article.publishedAt,
        // IMPROVED: Better image handling with category context
        urlToImage: processArticleImage({ ...article, category }, index),
        author: article.author || 'Unknown'
      }));

    res.json({
      success: true,
      articles,
      category: CATEGORIES[category].name
    });
  } catch (error) {
    console.error('Category news error:', error);
    res.status(500).json({ error: 'Failed to fetch category news' });
  }
});

// Get news based on query - UPDATED with better image handling
router.post('/chat', authMiddleware, async (req, res) => {
  try {
    const { message, country = 'us', category = 'general' } = req.body;
    
    console.log('Chat request:', { message, country, category });

    // Try Python API first
    try {
      const pythonResponse = await axios.post(`${PYTHON_API_URL}/api/chat`, {
        message: message
      }, {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 5000
      });
      
      // IMPROVED: Process images from Python API response
      if (pythonResponse.data.articles) {
        pythonResponse.data.articles = pythonResponse.data.articles.map((article, index) => ({
          ...article,
          urlToImage: processArticleImage({ ...article, category }, index)
        }));
      }
      
      return res.json(pythonResponse.data);
    } catch (pythonError) {
      console.log('Python API failed, using fallback:', pythonError.message);
    }

    // Fallback to direct NewsAPI
    const query = (message || '').toLowerCase();
    let detectedCategory = category;
    let keywords = [];

    // Detect category from message if not specified
    if (category === 'general') {
      for (const [catId, catInfo] of Object.entries(CATEGORIES)) {
        if (catInfo.keywords.some(keyword => query.includes(keyword))) {
          detectedCategory = catId;
          break;
        }
      }
    }

    // Extract keywords
    const commonWords = ['show', 'get', 'tell', 'me', 'about', 'news', 'latest', 'what', 'is', 'are'];
    keywords = query.split(' ')
      .filter(word => word.length > 2 && !commonWords.includes(word));

    let articles = [];

    // Try keyword search first
    if (keywords.length > 0) {
      const searchQuery = keywords.join(' ');
      const response = await axios.get(`https://newsapi.org/v2/everything`, {
        params: {
          apiKey: NEWS_API_KEY,
          q: searchQuery,
          pageSize: 10,
          language: 'en',
          sortBy: 'relevancy'
        }
      });
      articles = response.data.articles;
    }

    // If no results, try category with country
    if (articles.length === 0) {
      const response = await axios.get(`https://newsapi.org/v2/top-headlines`, {
        params: {
          apiKey: NEWS_API_KEY,
          category: detectedCategory,
          country: country,
          pageSize: 10,
          language: 'en'
        }
      });
      articles = response.data.articles;
    }

    // Fallback to general news
    if (articles.length === 0) {
      const response = await axios.get(`https://newsapi.org/v2/top-headlines`, {
        params: {
          apiKey: NEWS_API_KEY,
          pageSize: 10,
          language: 'en'
        }
      });
      articles = response.data.articles;
    }

    const formattedArticles = articles
      .filter(article => article.title && article.title !== '[Removed]')
      .map((article, index) => ({
        title: article.title,
        description: article.description || 'No description available',
        url: article.url,
       source: { name: article.source?.name || "Unknown Source" },
        publishedAt: article.publishedAt,
        // IMPROVED: Better image handling with context
        urlToImage: processArticleImage({ ...article, category: detectedCategory }, index),
        author: article.author || 'Unknown'
      }))
      .slice(0, 10);

    let responseText = '';
    if (keywords.length > 0) {
      responseText = `Here are the latest articles about "${keywords.join(' ')}":`;
    } else if (detectedCategory !== 'general') {
      responseText = `Here are the latest ${CATEGORIES[detectedCategory].name} news from ${COUNTRIES[country].name}:`;
    } else {
      responseText = `Here are the latest news headlines from ${COUNTRIES[country].name}:`;
    }

    const suggestions = [
      'Technology news',
      'Sports news',
      'Business headlines',
      'News about AI',
      'Health news'
    ];

    res.json({
      success: true,
      response: responseText,
      articles: formattedArticles,
      suggestions,
      queryInfo: { category: detectedCategory, keywords, country },
      source: 'nodejs-fallback'
    });

  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: 'Failed to fetch news' });
  }
});

// Search news by keyword - UPDATED with better image handling
router.get('/search', authMiddleware, async (req, res) => {
  try {
    const { q } = req.query;
    
    if (!q || q.length < 2) {
      return res.status(400).json({ error: 'Search query too short' });
    }

    // Try Python API first
    try {
      const pythonResponse = await axios.get(`${PYTHON_API_URL}/api/search`, {
        params: { q },
        timeout: 5000
      });
      
      // IMPROVED: Process images from Python API response
      if (pythonResponse.data.articles) {
        pythonResponse.data.articles = pythonResponse.data.articles.map((article, index) => ({
          ...article,
          urlToImage: processArticleImage(article, index)
        }));
      }
      
      return res.json(pythonResponse.data);
    } catch (pythonError) {
      console.log('Python search failed, using fallback');
    }

    // Fallback to direct NewsAPI
    const response = await axios.get(`https://newsapi.org/v2/everything`, {
      params: {
        apiKey: NEWS_API_KEY,
        q: q,
        pageSize: 20,
        language: 'en',
        sortBy: 'relevancy'
      }
    });

    const articles = response.data.articles
      .filter(article => article.title && article.title !== '[Removed]')
      .map((article, index) => ({
        title: article.title,
        description: article.description || 'No description available',
        url: article.url,
        source: { name: article.source?.name || "Unknown Source" },
        publishedAt: article.publishedAt,
        // IMPROVED: Better image handling
        urlToImage: processArticleImage(article, index),
        author: article.author || 'Unknown'
      }));

    res.json({
      success: true,
      articles,
      total: articles.length,
      source: 'fallback'
    });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Failed to search news' });
  }
});

module.exports = router;