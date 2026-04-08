const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const Chat = require('./models/Chat');
const User = require('./models/User');

async function test() {
  const mongoServer = await MongoMemoryServer.create({
    instance: {
      dbPath: './data/db',
      storageEngine: 'wiredTiger',
    }
  });
  await mongoose.connect(mongoServer.getUri());

  // 1. Create a user
  const u1 = await User.create({ username: 'test1', password: '123' });
  const u2 = await User.create({ username: 'test2', password: '123' });

  // 2. Create a chat
  const chat = await Chat.create({ users: [u1._id, u2._id], isGroupChat: true });
  console.log("Before pull length:", chat.users.length);

  // 3. Pull u1
  const updatedChat = await Chat.findByIdAndUpdate(chat._id, { $pull: { users: u1._id.toString() } }, { new: true }).populate('users');
  console.log("After pull length:", updatedChat.users.length);

  process.exit(0);
}

test().catch(console.error);
