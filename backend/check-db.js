const mongoose = require('mongoose');
const User = require('./models/User');
const Message = require('./models/Message');

async function check() {
  try {
    // Connect to the specific URI the server is using (or the default)
    const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:59267/onchat'; // Port from my previous command_status check
    console.log('Connecting to:', uri);
    await mongoose.connect(uri);
    const userCount = await User.countDocuments();
    const messageCount = await Message.countDocuments();
    console.log(`Users: ${userCount}`);
    console.log(`Messages: ${messageCount}`);
    
    if (messageCount > 0) {
      const lastMessage = await Message.findOne().sort({ createdAt: -1 });
      console.log('Last message date:', lastMessage.createdAt);
    }
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    process.exit();
  }
}
check();
