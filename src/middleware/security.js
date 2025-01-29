const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const xss = require('xss-clean');
const hpp = require('hpp');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});

// API rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again after 15 minutes'
});

// Authentication rate limiting
const authLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour window
  max: 5, // start blocking after 5 requests
  message: 'Too many login attempts from this IP, please try again after an hour'
});

module.exports = (app) => {
  // Generate nonce for each request
  app.use((req, res, next) => {
    res.locals.nonce = crypto.randomBytes(16).toString('base64');
    next();
  });

  // Security HTTP headers with CSP configuration
  // app.use(
  //   helmet({
  //     contentSecurityPolicy: {
  //       directives: {
  //         defaultSrc: ["'self'"],
  //         scriptSrc: [
  //           "'self'",
  //           (req, res) => `'nonce-${res.locals.nonce}'`,
  //           'https://cdn.jsdelivr.net',
  //           'https://code.jquery.com'
  //         ],
  //         styleSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net'],
  //         imgSrc: ["'self'", 'data:', 'https:'],
  //         connectSrc: ["'self'"],
  //         fontSrc: ["'self'", 'https://cdn.jsdelivr.net'],
  //         objectSrc: ["'none'"],
  //         mediaSrc: ["'self'"],
  //         frameSrc: ["'none'"]
  //       }
  //     }
  //   })
  // );

  // Rate limiting
  app.use(limiter);
  app.use('/api/', apiLimiter);
  app.use('/auth/', authLimiter);

  // Data sanitization against XSS
  app.use(xss());

  // Prevent parameter pollution
  app.use(hpp());

  // CORS configuration
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', process.env.FRONTEND_URL || '*');
    res.setHeader(
      'Access-Control-Allow-Methods',
      'GET, POST, PUT, DELETE, OPTIONS'
    );
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization'
    );
    next();
  });

  // Security middleware for Socket.IO
  app.set('socketIOAuth', (socket, next) => {
    if (socket.handshake.auth && socket.handshake.auth.token) {
      // Verify JWT token
      jwt.verify(
        socket.handshake.auth.token,
        process.env.JWT_SECRET,
        (err, decoded) => {
          if (err) return next(new Error('Authentication error'));
          socket.decoded = decoded;
          next();
        }
      );
    } else {
      next(new Error('Authentication error'));
    }
  });
};

// Role-based access control middleware
const checkRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        message: 'Unauthorized'
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        message: 'Forbidden - You do not have permission to perform this action'
      });
    }

    next();
  };
};

// Input validation middleware
const validateInput = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({
        message: 'Invalid input',
        details: error.details.map(detail => detail.message)
      });
    }
    next();
  };
};

module.exports.checkRole = checkRole;
module.exports.validateInput = validateInput; 