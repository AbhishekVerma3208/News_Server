const jwt = require('jsonwebtoken');

const authMiddleware = async (req, res, next) => {
  try {
    // Get token from header
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      // Check session as fallback
      if (req.session && req.session.userId) {
        req.userId = req.session.userId;
        return next();
      }
      return res.status(401).json({ error: 'Please authenticate' });
    }

    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.userId;
    
    // Set session for consistency (optional)
    if (req.session) {
      req.session.userId = decoded.userId;
    }
    
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(401).json({ error: 'Please authenticate' });
  }
};

module.exports = authMiddleware;