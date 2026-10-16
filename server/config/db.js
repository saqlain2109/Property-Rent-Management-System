const mongoose = require('mongoose');

let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

const connectDB = async () => {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    const uri = process.env.MONGODB_URI || 
                process.env.MONGO_URI || 
                process.env.MONGODB_URL || 
                process.env.DATABASE_URL ||
                'mongodb://127.0.0.1:27017/property_rent_db';

    cached.promise = mongoose.connect(uri, {
      bufferCommands: false,
      serverSelectionTimeoutMS: 5000
    }).then(async (mongooseInstance) => {
      console.log(`[Database] MongoDB Connected: ${mongooseInstance.connection.host}/${mongooseInstance.connection.name}`);
      
      // Auto-seed if database has 0 properties (first deployment / fresh server)
      try {
        const Property = require('../models/Property');
        const count = await Property.countDocuments();
        if (count === 0) {
          console.log('[Database] Database is empty. Running automatic verified migration...');
          const { executeMigration } = require('../routes/migrationRoutes');
          const User = require('../models/User');
          let admin = await User.findOne({ email: 'admin@propertyrent.com' });
          if (!admin) {
            admin = await User.create({
              name: 'Administrator',
              email: 'admin@propertyrent.com',
              password: 'AdminPassword123!',
              role: 'admin'
            });
          }
          await executeMigration({ dryRun: false, user: admin });
          console.log('[Database] Automatic migration completed successfully!');
        }
      } catch (err) {
        console.error('[Database Auto-Seed Warning]', err.message);
      }

      return mongooseInstance;
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    throw e;
  }

  return cached.conn;
};

module.exports = connectDB;
