require('dotenv').config();
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const flash = require('connect-flash');
const path = require('path');
const { createServer } = require('http');
const { Server } = require('socket.io');
const { PrismaClient } = require('@prisma/client');
const methodOverride = require('method-override');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);
const prisma = new PrismaClient();

// Make io accessible to routes
app.set('io', io);

// Security middleware
require('./middleware/security')(app);

// Middleware
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(methodOverride('_method')); // For PUT/DELETE requests

// Session configuration with secure settings
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Passport configuration
require('./config/passport');
app.use(passport.initialize());
app.use(passport.session());
app.use(flash());

// Socket.IO connection handling with authentication
io.use(app.get('socketIOAuth'));

io.on('connection', (socket) => {
  console.log('A user connected');
  
  // Join user to their personal room
  if (socket.decoded && socket.decoded.id) {
    socket.join(`user_${socket.decoded.id}`);
  }
  
  socket.on('disconnect', () => {
    console.log('User disconnected');
  });
});

// Global variables middleware
app.use((req, res, next) => {
  res.locals.user = req.user;
  res.locals.messages = {
    success: req.flash('success'),
    error: req.flash('error')
  };
  next();
});

// Routes
app.use('/auth', require('./routes/auth'));
app.use('/services', require('./routes/services'));
app.use('/transactions', require('./routes/transactions'));
app.use('/admin', require('./routes/admin'));

// Home route
app.get('/', (req, res) => {
  res.render('index');
});

// Error handling middleware
app.use((req, res, next) => {
  const error = new Error('Not Found');
  error.status = 404;
  next(error);
});

app.use((err, req, res, next) => {
  res.status(err.status || 500);
  res.render('error', {
    message: err.message,
    error: process.env.NODE_ENV === 'development' ? err : {}
  });
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
}); 