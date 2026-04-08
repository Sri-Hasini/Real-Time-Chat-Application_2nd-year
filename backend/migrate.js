require('dotenv').config();
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const User = require('./models/User');

const migrate = async () => {
  try {
    const mongoServer = await MongoMemoryServer.create({
      instance: {
        dbPath: './data/db', // Persist to this folder
        storageEngine: 'wiredTiger',
      }
    });
    const mongoUri = mongoServer.getUri();
    
    await mongoose.connect(mongoUri); 
    console.log('✅ Connected to DB');
    
    // Update all users
    const result = await User.updateMany({}, { $set: { password: '123456' } });
    console.log(`✅ Updated ${result.modifiedCount} users with new password '123456'`);
    
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
};

migrate();
