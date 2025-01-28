// Import routes
const authRoutes = require('./routes/auth');
const servicesRoutes = require('./routes/services');
const transactionsRoutes = require('./routes/transactions');
const invoicesRoutes = require('./routes/invoices');
const adminRoutes = require('./routes/admin');

// ... middleware setup ...

// Use routes
app.use('/', authRoutes);
app.use('/services', servicesRoutes);
app.use('/transactions', transactionsRoutes);
app.use('/invoices', invoicesRoutes);
app.use('/admin', adminRoutes);

// ... rest of the existing code ... 