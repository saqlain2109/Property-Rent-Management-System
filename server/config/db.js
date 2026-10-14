const mongoose = require('mongoose');

let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

const connectDB = async () => {
  if (cached.conn) {
    return cached.conn;
  }

    const uri = process.env.MONGODB_URI || 
                process.env.MONGO_URI || 
                process.env.MONGODB_URL || 
                process.env.DATABASE_URL;

    if (!uri) {
      throw new Error('No MongoDB URI found in environment variables (checked MONGODB_URI, MONGO_URI, MONGODB_URL, DATABASE_URL)');
    }

    cached.promise = mongoose.connect(uri, {
      bufferCommands: false,
      serverSelectionTimeoutMS: 5000
    }).then((mongooseInstance) => {
      console.log(`[Database] MongoDB Connected: ${mongooseInstance.connection.host}/${mongooseInstance.connection.name}`);
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
