// Authentication middleware
const isAuthenticated = (req, res, next) => {
  if (req.isAuthenticated()) {
    return next();
  }
  req.flash('error', 'You must be logged in to access this page');
  res.redirect('/');
};

// Admin middleware
const isAdmin = (req, res, next) => {
  if (req.isAuthenticated() && req.user.role === 'ADMIN') {
    return next();
  }
  req.flash('error', 'You must be an administrator to access this page');
  res.redirect('/');
};

module.exports = {
  isAuthenticated,
  isAdmin
}; 