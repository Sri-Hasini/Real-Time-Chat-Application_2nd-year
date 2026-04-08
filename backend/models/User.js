const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3
  },
  email: {
    type: String,
    // Optional for now since login just uses username in the mock flow, 
    // but schema support added per requirements
  },
  password: {
    type: String,
    required: true
  },
  profilePic: {
    type: String,
    default: 'https://i.pravatar.cc/150'
  },
  status: {
    type: String,
    default: 'Offline'
  }
}, { timestamps: true });

module.exports = mongoose.model('User', UserSchema);
