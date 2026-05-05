const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const authMiddleware = require('../middleware/auth');

// Register route
router.post('/register', [
  body('username').trim().isLength({ min: 3 }).withMessage('Username must be at least 3 characters'),
  body('email').isEmail().withMessage('Please enter a valid email'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('fullName').trim().notEmpty().withMessage('Full name is required')
], async (req, res) => {
  try {
    console.log('Registration request received:', req.body.email);
    
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { username, email, password, fullName } = req.body;

    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      return res.status(400).json({ 
        error: existingUser.email === email ? 'Email already registered' : 'Username already taken' 
      });
    }

    const user = new User({
      username,
      email,
      password,
      fullName,
      preferences: {
        preferredCountry: 'us',
        preferredCategory: 'general',
        theme: 'light',
        language: 'en',
        notifications: true
      }
    });

    await user.save();
    console.log('User created successfully:', user._id);

    req.session.userId = user._id;
    req.session.username = user.username;

    const token = jwt.sign(
      { userId: user._id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: user.toJSON()
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Server error during registration' });
  }
});

// Login route
router.post('/login', [
  body('email').isEmail().withMessage('Please enter a valid email'),
  body('password').notEmpty().withMessage('Password is required')
], async (req, res) => {
  try {
    console.log('Login request received:', req.body.email);
    
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    user.lastLogin = new Date();
    await user.save();

    req.session.userId = user._id;
    req.session.username = user.username;

    const token = jwt.sign(
      { userId: user._id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      message: 'Login successful',
      token,
      user: user.toJSON()
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error during login' });
  }
});

// Logout route
router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Error logging out' });
    }
    res.clearCookie('connect.sid');
    res.json({ message: 'Logged out successfully' });
  });
});

// Get current user
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('-password');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ user });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update user profile
router.put('/profile', authMiddleware, [
  body('fullName').optional().trim().notEmpty(),
  body('preferences').optional().isObject()
], async (req, res) => {
  try {
    const updates = {};
    if (req.body.fullName) updates.fullName = req.body.fullName;
    if (req.body.preferences) updates.preferences = req.body.preferences;

    const user = await User.findByIdAndUpdate(
      req.userId,
      updates,
      { new: true, runValidators: true }
    ).select('-password');

    res.json({ user });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update preferences
router.put('/preferences', authMiddleware, async (req, res) => {
  try {
    const { preferredCountry, preferredCategory, theme, language, notifications } = req.body;
    
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Update preferences
    if (preferredCountry) user.preferences.preferredCountry = preferredCountry;
    if (preferredCategory) user.preferences.preferredCategory = preferredCategory;
    if (theme) user.preferences.theme = theme;
    if (language) user.preferences.language = language;
    if (notifications !== undefined) user.preferences.notifications = notifications;

    await user.save();

    res.json({ 
      message: 'Preferences updated successfully',
      preferences: user.preferences 
    });
  } catch (error) {
    console.error('Update preferences error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get user preferences
router.get('/preferences', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('preferences');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ preferences: user.preferences });
  } catch (error) {
    console.error('Get preferences error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Add bookmark
router.post('/bookmarks', authMiddleware, async (req, res) => {
  try {
    const { title, description, url, source, urlToImage, publishedAt, author } = req.body;
    
    // Validate required fields
    if (!title || !url) {
      return res.status(400).json({ error: 'Title and URL are required' });
    }

    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if already bookmarked
    const exists = user.bookmarks.some(b => b.url === url);
    if (exists) {
      return res.status(400).json({ error: 'Article already bookmarked' });
    }

    // Add new bookmark
    user.bookmarks.unshift({ 
      title, 
      description: description || 'No description',
      url, 
      source: source || { name: 'Unknown' },
      image: urlToImage || '',
      publishedAt: publishedAt || new Date().toISOString(),
      author: author || 'Unknown',
      savedAt: new Date()
    });
    
    // Keep only last 50 bookmarks
    if (user.bookmarks.length > 50) {
      user.bookmarks = user.bookmarks.slice(0, 50);
    }
    
    await user.save();

    res.json({ 
      message: 'Bookmark added successfully',
      bookmarks: user.bookmarks 
    });
  } catch (error) {
    console.error('Add bookmark error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// Remove bookmark
router.delete('/bookmarks/:url', authMiddleware, async (req, res) => {
  try {
    const url = decodeURIComponent(req.params.url);
    
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    user.bookmarks = user.bookmarks.filter(b => b.url !== url);
    await user.save();

    res.json({ 
      message: 'Bookmark removed successfully',
      bookmarks: user.bookmarks 
    });
  } catch (error) {
    console.error('Remove bookmark error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get all bookmarks
router.get('/bookmarks', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('bookmarks');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ bookmarks: user.bookmarks });
  } catch (error) {
    console.error('Get bookmarks error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Add search history
router.post('/history', authMiddleware, async (req, res) => {
  try {
    const { query } = req.body;
    
    if (!query || query.trim().length === 0) {
      return res.status(400).json({ error: 'Query is required' });
    }

    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Remove duplicate if exists
    user.searchHistory = user.searchHistory.filter(item => item.query !== query.trim());
    
    // Add new search
    user.searchHistory.unshift({ 
      query: query.trim(),
      timestamp: new Date()
    });
    
    // Keep only last 20 searches
    if (user.searchHistory.length > 20) {
      user.searchHistory = user.searchHistory.slice(0, 20);
    }
    
    await user.save();

    res.json({ 
      message: 'Search history updated',
      history: user.searchHistory 
    });
  } catch (error) {
    console.error('Add history error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// Get search history
router.get('/history', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('searchHistory');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ history: user.searchHistory });
  } catch (error) {
    console.error('Get history error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Clear history
router.delete('/history', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    user.searchHistory = [];
    await user.save();

    res.json({ message: 'History cleared' });
  } catch (error) {
    console.error('Clear history error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;