const dotenv = require("dotenv");
dotenv.config()
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const User = require('./models/User');
const Message = require('./models/Message');
const Chat = require('./models/Chat');
const CallHistory = require('./models/CallHistory');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    methods: ['GET', 'POST'],
    credentials: true
  },
  transports: ['websocket', 'polling']
});

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Ensure uploads directory exists
if (!fs.existsSync('./uploads')) {
  fs.mkdirSync('./uploads');
}
if (!fs.existsSync('./uploads/messages')) {
  fs.mkdirSync('./uploads/messages', { recursive: true });
}
if (!fs.existsSync('./uploads/voice')) {
  fs.mkdirSync('./uploads/voice', { recursive: true });
}

// Multer Storage Configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

// Secondary Multer for Message Files (Images/Docs)
const messageStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/messages/'),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, 'msg-' + uniqueSuffix + path.extname(file.originalname));
  }
});
const uploadMessageFile = multer({ storage: messageStorage });

// Voice Recording Upload
const voiceStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/voice/'),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, 'voice-' + uniqueSuffix + '.webm');
  }
});
const uploadVoice = multer({ storage: voiceStorage });

const { MongoMemoryServer } = require('mongodb-memory-server');
const PORT = process.env.PORT || 5000;

// Dynamic In-Memory MongoDB Connection (NOW PERSISTENT TO DISK)
const startDatabase = async () => {
  try {
    let mongoUri = process.env.MONGODB_URI;
    
    if (mongoUri) {
      console.log('📡 Using DATABASE CONNECTION URI from .env:', mongoUri);
    } else {
      console.log('⚠️ No MONGODB_URI found in .env, falling back to Local Automatic MongoDB (Memory Server)...');
      const mongoServer = await MongoMemoryServer.create({
        instance: {
          dbPath: './data/db', // Persist to this folder
          storageEngine: 'wiredTiger',
        }
      });
      mongoUri = mongoServer.getUri();
    }
    
    await mongoose.connect(mongoUri); 
    console.log('✅ Connected to MongoDB Successfully!');
    if (!process.env.MONGODB_URI) {
      console.log(`\n📡 DATABASE CONNECTION URI FOR COMPASS:\n${mongoUri}\n`);
    }
    
    // Auto-create system user safely
    try {
      const existing = await User.findOne({ username: 'system' });
      if (!existing) {
        await User.create({ username: 'system', password: 'password123' });
      }
    } catch (err) { /* already exists */ }
  } catch (err) {
    console.error('❌ Failed to connect to MongoDB.', err.message);
  }
};
startDatabase();

// --- GLOBALS ---
// Map of online users: userId -> socketId
const userSocketMap = new Map();

// --- REST ENDPOINTS ---

app.post('/api/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    const existingUser = await User.findOne({ username });
    if (existingUser) return res.status(400).json({ error: 'Username already exists' });
    
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({ username, email, password: hashedPassword, status: 'Online' });
    res.status(201).json(user);
  } catch (error) {
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user) return res.status(401).json({ error: 'Invalid username or password' });
    
    // To allow existing mock accounts (password123 without hash) to gracefully fail or pass,
    // we just use simple bcrypt compare which handles bcrypt formats natively.
    // However, if the old password was literally "password123" (unhashed), bcrypt.compare will fail. This is intended to force registration.
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch && user.password !== password) return res.status(401).json({ error: 'Invalid username or password' });
    
    user.status = 'Online';
    await user.save();
    res.status(200).json(user);
  } catch (error) {
    res.status(500).json({ error: 'Login failed' });
  }
});

app.post('/api/auth/verify', async (req, res) => {
  try {
    const { userId } = req.body;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    // Optional: Reset status to Online on verification
    user.status = 'Online';
    await user.save();
    
    res.status(200).json(user);
  } catch (error) {
    res.status(500).json({ error: 'Verification failed' });
  }
});

// Update Profile Picture API
app.put('/api/users/update-profile-pic', upload.single('profilePic'), async (req, res) => {
  try {
    const { userId } = req.body;
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Update user record
    const profilePicUrl = `http://localhost:5000/uploads/${req.file.filename}`;
    user.profilePic = profilePicUrl;
    await user.save();

    res.status(200).json(user);
  } catch (error) {
    console.error("Profile update error", error);
    res.status(500).json({ error: 'Failed to update profile picture' });
  }
});

// Message File Upload API
app.post('/api/messages/upload', uploadMessageFile.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file' });
    const fileUrl = `http://localhost:5000/uploads/messages/${req.file.filename}`;
    res.status(200).json({ fileUrl });
  } catch (err) {
    res.status(500).json({ error: 'Upload failed' });
  }
});

// Voice Message Upload API
app.post('/api/messages/voice', uploadVoice.single('audio'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No audio' });
    const audioUrl = `http://localhost:5000/uploads/voice/${req.file.filename}`;
    res.status(200).json({ audioUrl });
  } catch (err) {
    res.status(500).json({ error: 'Voice upload failed' });
  }
});

app.get('/api/users/search', async (req, res) => {
  try {
    const { query, currentUsername } = req.query;
    if (!query) return res.status(200).json([]);

    const users = await User.find({
      $and: [
        { username: { $regex: query, $options: 'i' } },
        { username: { $ne: currentUsername } }
      ]
    }).select('username profilePic status');
    
    res.status(200).json(users);
  } catch (error) {
    res.status(500).json({ error: 'Search failed' });
  }
});

app.post('/api/chat', async (req, res) => {
  try {
    const { currentUserId, targetUserId } = req.body;

    let chat = await Chat.findOne({
      users: { $all: [currentUserId, targetUserId] }
    }).populate('users', 'username profilePic status').populate('groupAdmin', 'username profilePic status');

    if (!chat) {
      chat = await Chat.create({
        users: [currentUserId, targetUserId]
      });
      chat = await Chat.findById(chat._id).populate('users', 'username profilePic status');
    }

    res.status(200).json(chat);
  } catch (error) {
    res.status(500).json({ error: 'Failed to access chat' });
  }
});

app.get('/api/chats/:userId', async (req, res) => {
  try {
    // We get all chats
    const chats = await Chat.find({
      users: req.params.userId
    }).populate('users', 'username profilePic status').populate('groupAdmin', 'username profilePic status').sort({ updatedAt: -1 });
    
    // We attach unread counts
    const chatsWithUnread = await Promise.all(chats.map(async (chat) => {
      let unreadCount;
      if (chat.isGroupChat) {
        // Count messages where user is NOT in seenBy array AND user is NOT the sender
        unreadCount = await Message.countDocuments({
          chatId: chat._id,
          senderId: { $ne: req.params.userId },
          seenBy: { $ne: req.params.userId }
        });
      } else {
        // Count private messages sent TO this user that are NOT in seenBy
        unreadCount = await Message.countDocuments({
          chatId: chat._id,
          receiverId: req.params.userId,
          seenBy: { $ne: req.params.userId }
        });
      }
      
      const lastMessage = await Message.findOne({ chatId: chat._id }).sort({ createdAt: -1 });
      
      const lastMessageType = lastMessage ? (lastMessage.messageType || 'text') : 'text';
      let lastMessageText = lastMessage ? lastMessage.text : null;
      if (lastMessageType === 'audio') lastMessageText = 'Voice Message';
      if (lastMessageType === 'image') lastMessageText = 'Image 📷';
      if (lastMessageType === 'file') lastMessageText = 'File 📄';

      return {
        ...chat.toObject(),
        unreadCount,
        lastMessageText,
        lastMessageType,
        lastMessageDuration: lastMessage ? lastMessage.duration : null,
      };
    }));
    
    res.status(200).json(chatsWithUnread);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch user chats' });
  }
});

app.get('/api/messages/:chatId', async (req, res) => {
  try {
    const chat = await Chat.findById(req.params.chatId);
    if (!chat) return res.status(404).json({ error: 'Chat not found' });

    const totalUsers = chat.users.length;
    const messages = await Message.find({ chatId: req.params.chatId })
                                  .populate('senderId', 'username profilePic')
                                  .sort({ createdAt: 1 });
                                  
    const formattedHistory = messages.map(m => {
      const isSeenByAll = m.seenBy && m.seenBy.length >= totalUsers;
      return {
        id: m._id,
        text: m.text,
        messageType: m.messageType || 'text',
        fileUrl: m.fileUrl || null,
        audioUrl: m.audioUrl || null,
        sender: m.senderId ? m.senderId.username : 'Unknown',
        senderId: m.senderId ? m.senderId._id : null,
        time: new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        status: m.status,
        isEdited: m.isEdited || false,
        isDeleted: m.isDeleted || false,
        originalName: m.originalName || null,
        seenBy: m.seenBy || [],
        seen: isSeenByAll,
        chatId: m.chatId
      };
    });
    res.status(200).json(formattedHistory);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// Mark messages as seen when chat opens
app.post('/api/messages/mark-seen', async (req, res) => {
  try {
    const { chatId, userId } = req.body;
    await Message.updateMany(
      { chatId, senderId: { $ne: userId }, seenBy: { $ne: userId } },
      { $addToSet: { seenBy: userId } }
    );
    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed' });
  }
});

// --- CALL HISTORY API ---
app.get('/api/calls/:chatId', async (req, res) => {
  try {
    const calls = await CallHistory.find({ chatId: req.params.chatId })
      .populate('callerId receiverId', 'username profilePic')
      .sort({ createdAt: -1 });
    res.status(200).json(calls);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch call history' });
  }
});

// --- GROUP CHAT APIs ---
app.delete('/api/chats/:chatId', async (req, res) => {
  try {
    const { chatId } = req.params;
    await Chat.findByIdAndDelete(chatId);
    await Message.deleteMany({ chatId });
    res.status(200).json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete chat' });
  }
});

app.delete('/api/messages/clear/:chatId', async (req, res) => {
  try {
    const { chatId } = req.params;
    await Message.deleteMany({ chatId });
    res.status(200).json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to clear messages' });
  }
});

app.post('/api/groups/create', async (req, res) => {
  try {
    const { name, users, adminId } = req.body;
    const chat = await Chat.create({
      groupName: name,
      users,
      isGroupChat: true,
      groupAdmin: adminId
    });
    const fullChat = await Chat.findById(chat._id)
      .populate('users', 'username profilePic status')
      .populate('groupAdmin', 'username profilePic status');

    if (fullChat) {
      fullChat.users.forEach(user => {
        const socketId = userSocketMap.get(user._id.toString());
        if (socketId) io.to(socketId).emit('groupUpdated', fullChat);
      });
    }

    res.status(200).json(fullChat);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create group' });
  }
});

const updateGroupMembers = async ({ chatId, userId, adminId }, mode) => {
  const chat = await Chat.findById(chatId);
  if (!chat) {
    const err = new Error('Group not found');
    err.statusCode = 404;
    throw err;
  }
  if (!chat.isGroupChat) {
    const err = new Error('This is not a group chat');
    err.statusCode = 400;
    throw err;
  }

  const isAdmin = chat.groupAdmin?.toString() === adminId?.toString();
  const isSelfRemove = userId?.toString() === adminId?.toString();
  const removedUserId = mode === 'remove' ? userId?.toString() : null;

  if (mode === 'add') {
    if (!isAdmin) {
      const err = new Error('Only the admin can add members');
      err.statusCode = 403;
      throw err;
    }
    if (chat.users.some(u => u.toString() === userId.toString())) {
      const err = new Error('User is already in the group');
      err.statusCode = 400;
      throw err;
    }
    chat.users.push(userId);
  } else {
    if (!isAdmin && !isSelfRemove) {
      const err = new Error('You do not have permission to remove this member');
      err.statusCode = 403;
      throw err;
    }
    const removingAdmin = chat.groupAdmin?.toString() === userId?.toString();
    chat.users = chat.users.filter(u => u.toString() !== userId.toString());
    if (removingAdmin) {
      chat.groupAdmin = chat.users[0] || null;
    }
  }

  await chat.save();
  const fullChat = await Chat.findById(chatId)
    .populate('users', 'username profilePic status')
    .populate('groupAdmin', 'username profilePic status');

  if (mode === 'remove' && removedUserId) {
    const removedSocketId = userSocketMap.get(removedUserId);
    if (removedSocketId) {
      io.to(removedSocketId).emit('groupUpdated', { _id: chatId, isRemoved: true });
    }
  }

  if (fullChat) {
    fullChat.users.forEach(user => {
      const socketId = userSocketMap.get(user._id.toString());
      if (socketId) io.to(socketId).emit('groupUpdated', { ...fullChat.toObject(), isRemoved: false });
    });
  }

  return fullChat;
};

const groupHandler = (mode) => async (req, res) => {
  try {
    const updated = await updateGroupMembers(req.body, mode);
    res.status(200).json(updated);
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message || 'Failed' });
  }
};

app.put('/api/groups/add-member', groupHandler('add'));
app.put('/api/groups/add-user', groupHandler('add'));
app.put('/api/groups/remove-member', groupHandler('remove'));
app.put('/api/groups/remove-user', groupHandler('remove'));

// --- MESSAGE SEARCH API ---
app.get('/api/messages/search', async (req, res) => {
  try {
    const { chatId, query } = req.query;
    if (!query) return res.status(200).json([]);

    const messages = await Message.find({
      chatId,
      text: { $regex: query, $options: 'i' },
      isDeleted: { $ne: true }
    }).populate('senderId', 'username profilePic');
    res.status(200).json(messages);
  } catch (err) {
    res.status(500).json({ error: 'Search failed' });
  }
});

// --- SOCKET.IO ---

io.on('connection', (socket) => {
  console.log('🔌 New user connected:', socket.id);

  socket.on('register', (userId) => {
    const sId = userId?.toString();
    socket.userId = sId; // Store it for easier lookup
    userSocketMap.set(sId, socket.id);
    console.log(`Registered User ${sId} with Socket ${socket.id}`);
  });

  socket.on('join_chat', (chatId) => {
    socket.join(chatId?.toString());
  });
  
  socket.on('typing', async (data) => {
    const cId = data.chatId?.toString();
    const chat = await Chat.findById(cId);
    if (chat && chat.isGroupChat) {
      chat.users.forEach(memberId => {
        if (memberId.toString() !== socket.userId?.toString()) {
          const targetSocketId = userSocketMap.get(memberId.toString());
          if (targetSocketId) io.to(targetSocketId).emit('typing', { ...data, chatId: cId });
        }
      });
    } else if (data.receiverId) {
      const targetSocketId = userSocketMap.get(data.receiverId?.toString());
      if (targetSocketId) io.to(targetSocketId).emit('typing', { ...data, chatId: cId });
    }
    socket.to(cId).emit('typing', { ...data, chatId: cId });
  });

  socket.on('stopTyping', async (data) => {
    const cId = data.chatId?.toString();
    const chat = await Chat.findById(cId);
    if (chat && chat.isGroupChat) {
      chat.users.forEach(memberId => {
        if (memberId.toString() !== socket.userId?.toString()) {
          const targetSocketId = userSocketMap.get(memberId.toString());
          if (targetSocketId) io.to(targetSocketId).emit('stopTyping', { ...data, chatId: cId });
        }
      });
    } else if (data.receiverId) {
      const targetSocketId = userSocketMap.get(data.receiverId?.toString());
      if (targetSocketId) io.to(targetSocketId).emit('stopTyping', { ...data, chatId: cId });
    }
    socket.to(cId).emit('stopTyping', { ...data, chatId: cId });
  });

  socket.on('recordingStart', async (data) => {
    const cId = data.chatId?.toString();
    const chat = await Chat.findById(cId);
    if (chat && chat.isGroupChat) {
      chat.users.forEach(memberId => {
        const targetSocketId = userSocketMap.get(memberId.toString());
        if (targetSocketId) io.to(targetSocketId).emit('recordingStart', { ...data, chatId: cId });
      });
    } else if (data.receiverId) {
      const targetSocketId = userSocketMap.get(data.receiverId?.toString());
      if (targetSocketId) io.to(targetSocketId).emit('recordingStart', { ...data, chatId: cId });
    }
    socket.to(cId).emit('recordingStart', { ...data, chatId: cId });
  });

  socket.on('recordingStop', async (data) => {
    const cId = data.chatId?.toString();
    const chat = await Chat.findById(cId);
    if (chat && chat.isGroupChat) {
      chat.users.forEach(memberId => {
        const targetSocketId = userSocketMap.get(memberId.toString());
        if (targetSocketId) io.to(targetSocketId).emit('recordingStop', { ...data, chatId: cId });
      });
    } else if (data.receiverId) {
      const targetSocketId = userSocketMap.get(data.receiverId?.toString());
      if (targetSocketId) io.to(targetSocketId).emit('recordingStop', { ...data, chatId: cId });
    }
    socket.to(cId).emit('recordingStop', { ...data, chatId: cId });
  });

  socket.on('send_message', async (msgData) => {
    try {
      const savedMessage = await Message.create({
        chatId: msgData.chatId,
        senderId: msgData.senderId,
        receiverId: msgData.receiverId,
        text: msgData.text || '',
        messageType: msgData.messageType || 'text',
        fileUrl: msgData.fileUrl || null,
        audioUrl: msgData.audioUrl || null,
        originalName: msgData.originalName || null,
        duration: msgData.duration || null,
        status: 'delivered',
        seenBy: [msgData.senderId]
      });

      await savedMessage.populate('senderId', 'username profilePic');
      await Chat.findByIdAndUpdate(msgData.chatId, { updatedAt: new Date() });

      const formattedMessage = {
        id: savedMessage._id,
        chatId: savedMessage.chatId.toString(),
        text: savedMessage.text,
        messageType: savedMessage.messageType,
        fileUrl: savedMessage.fileUrl,
        audioUrl: savedMessage.audioUrl,
        duration: savedMessage.duration,
        sender: savedMessage.senderId.username,
        senderId: savedMessage.senderId._id.toString(),
        senderProfilePic: savedMessage.senderId.profilePic,
        originalName: savedMessage.originalName,
        seenBy: savedMessage.seenBy,
        receiverId: msgData.receiverId?.toString?.() || msgData.receiverId,
        time: new Date(savedMessage.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        status: savedMessage.status,
        seen: false, // Ticks start grey for everyone until all participants see it
        isEdited: false,
        isDeleted: false
      };
      
      const chat = await Chat.findById(msgData.chatId);
      if (chat && chat.isGroupChat) {
        io.to(msgData.chatId).emit('receive_message', formattedMessage);
        chat.users.forEach(userId => {
          if (userId.toString() !== msgData.senderId.toString()) {
            const socketId = userSocketMap.get(userId.toString());
            if (socketId) io.to(socketId).emit('newMessage', formattedMessage);
          }
        });
      } else {
        const targetSocketId = userSocketMap.get(msgData.receiverId?.toString());
        const senderSocketId = userSocketMap.get(msgData.senderId?.toString());
        if (senderSocketId) io.to(senderSocketId).emit('receive_message', formattedMessage);
        if (targetSocketId) {
          io.to(targetSocketId).emit('newMessage', formattedMessage);
          io.to(targetSocketId).emit('receive_message', formattedMessage);
        }
      }
    } catch (err) {
      console.error('Error saving private message:', err);
    }
  });
  
  socket.on('mark_messages_seen', async ({ chatId, userId }) => {
    try {
      await Message.updateMany(
        { chatId, senderId: { $ne: userId }, seenBy: { $ne: userId } },
        { $addToSet: { seenBy: userId } }
      );
      
      const chat = await Chat.findById(chatId);
      if (chat) {
        // Broadcast to all participants that someone has seen the messages
        chat.users.forEach(uId => {
          const targetSocketId = userSocketMap.get(uId.toString());
          if (targetSocketId) {
            io.to(targetSocketId).emit('message_status_update', { 
              chatId, 
              userId, 
              status: 'seen' 
            });
          }
        });
      }
    } catch (err) {
      console.error('Error marking messages as seen:', err);
    }
  });

  socket.on('edit_message', async ({ messageId, newText, chatId }) => {
    try {
      const message = await Message.findById(messageId);
      if (!message) return;
      message.text = newText;
      message.isEdited = true;
      await message.save();
      io.to(chatId).emit('message_edited', { messageId, newText, isEdited: true });
    } catch (err) {
      console.error('Error editing message:', err);
    }
  });

  socket.on('delete_message', async ({ messageId, chatId }) => {
    try {
      const message = await Message.findById(messageId);
      if (!message) return;
      message.isDeleted = true;
      message.text = 'This message was deleted';
      await message.save();
      io.to(chatId).emit('message_deleted', { messageId });
    } catch (err) {
      console.error('Error deleting message:', err);
    }
  });

  socket.on('callUser', ({ userToCall, offer, signalData, from, name, profilePic, isVideoCall, chatId, type }) => {
    const targetSocketId = userSocketMap.get(userToCall?.toString());
    if (targetSocketId) {
      io.to(targetSocketId).emit('callUser', {
        offer: offer || signalData,
        signal: signalData || offer,
        from: from?.toString(),
        name,
        profilePic,
        isVideoCall: typeof isVideoCall === 'boolean' ? isVideoCall : type === 'video',
        type: type || (isVideoCall ? 'video' : 'audio'),
        chatId
      });
    }
  });

  socket.on('answerCall', ({ to, answer, signal }) => {
    const targetSocketId = userSocketMap.get(to?.toString());
    if (targetSocketId) {
      io.to(targetSocketId).emit('callAccepted', answer || signal);
    }
  });

  socket.on('ice-candidate', ({ to, candidate }) => {
    const targetSocketId = userSocketMap.get(to?.toString());
    if (targetSocketId) {
      io.to(targetSocketId).emit('ice-candidate', { candidate });
    }
  });

  socket.on('endCall', ({ to }) => {
    const targetSocketId = userSocketMap.get(to?.toString());
    if (targetSocketId) {
      io.to(targetSocketId).emit('callEnded');
    }
  });

  socket.on('save_call_history', async (data) => {
    try {
      const { chatId, callerId, receiverId, type, status } = data;
      const newCall = await CallHistory.create({ chatId, callerId, receiverId, type, status });
      const populatedCall = await CallHistory.findById(newCall._id).populate('callerId receiverId', 'username profilePic');
      const callerSocketId = userSocketMap.get(callerId?.toString());
      const receiverSocketId = userSocketMap.get(receiverId?.toString());
      if (callerSocketId) io.to(callerSocketId).emit('callHistoryAdded', populatedCall);
      if (receiverSocketId) io.to(receiverSocketId).emit('callHistoryAdded', populatedCall);
      if (status === 'missed' || status === 'rejected') {
        if (receiverSocketId) {
          io.to(receiverSocketId).emit('callNotification', {
            from: populatedCall.callerId.username,
            type: populatedCall.type,
            status: 'missed',
            chatId
          });
        }
      } else if (status === 'answered') {
        const notifyTargetId = socket.id === callerSocketId ? receiverSocketId : callerSocketId;
        const fromName = socket.id === callerSocketId ? populatedCall.callerId.username : populatedCall.receiverId.username;
        if (notifyTargetId) {
          io.to(notifyTargetId).emit('callNotification', {
            from: fromName,
            type: populatedCall.type,
            status: 'ended',
            chatId
          });
        }
      }
    } catch (err) {
      console.error('Failed to save call history:', err);
    }
  });

  socket.on('disconnect', () => {
    console.log('🛑 User disconnected:', socket.id);
    for (let [userId, sockId] of userSocketMap.entries()) {
      if (sockId === socket.id) {
        userSocketMap.delete(userId);
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`🚀 Server running dynamically on http://localhost:${PORT}`);
});
