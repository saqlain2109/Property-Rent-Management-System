const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '.env') });
const connectDB = require('./config/db');
const { noSqlInjectionProtection } = require('./middleware/security');

const app = express();

// Security Headers with Helmet
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

// Middleware to ensure DB is connected for serverless invocations
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    console.error('[DB Middleware Error]', err);
    res.status(500).json({ 
      success: false, 
      message: 'Database connection failed: ' + (err.message || 'Unknown error'),
      envConfigured: !!(process.env.MONGODB_URI || process.env.MONGO_URI || process.env.MONGODB_URL || process.env.DATABASE_URL)
    });
  }
});

// CORS configuration
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Body parsers with payload size limit (DoS prevention)
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// NoSQL Injection Protection
app.use(noSqlInjectionProtection);

// Rate limiter for authentication endpoints (Brute-force protection)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50,
  message: { success: false, message: 'Too many login attempts from this IP, please try again after 15 minutes' }
});

// General API rate limiter (DoS & scraping protection)
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message: { success: false, message: 'Too many requests from this IP, please try again shortly.' }
});

app.use('/api', apiLimiter);

// Routes
const authRoutes = require('./routes/authRoutes');
const propertyRoutes = require('./routes/propertyRoutes');
const unitRoutes = require('./routes/unitRoutes');
const tenantRoutes = require('./routes/tenantRoutes');
const assignmentRoutes = require('./routes/assignmentRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const pgRoutes = require('./routes/pgRoutes');
const expenseRoutes = require('./routes/expenseRoutes');
const ledgerRoutes = require('./routes/ledgerRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const reportRoutes = require('./routes/reportRoutes');
const chatRoutes = require('./routes/chatRoutes');
const { router: migrationRoutes } = require('./routes/migrationRoutes');

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/properties', propertyRoutes);
app.use('/api/units', unitRoutes);
app.use('/api/tenants', tenantRoutes);
app.use('/api/assignments', assignmentRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/pg-settlements', pgRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/ledger', ledgerRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/migration', migrationRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('[Unhandled Server Error]', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error'
  });
});

const PORT = process.env.PORT || 5000;

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`[Server] Property & Rent Management Backend running on port ${PORT}`);
  });
}

module.exports = app;
