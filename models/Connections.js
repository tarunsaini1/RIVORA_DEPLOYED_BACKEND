import mongoose from 'mongoose';

const ConnectionSchema = new mongoose.Schema({
  follower: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  following: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'declined', 'blocked'],
    default: 'pending'
  },
  connectionType: {
    type: String,
    enum: ['follow', 'linkUps'],
    default: 'follow'
  },
  requestedAt: {
    type: Date,
    default: Date.now
  },
  acceptedAt: {
    type: Date
  },
  message: {
    type: String,
    trim: true
  },
  visibility: {
    type: String,
    enum: ['public', 'connections-only', 'private'],
    default: 'public'
  }
}, { timestamps: true });

ConnectionSchema.index({ follower: 1, following: 1 }, { unique: true });

const Connection = mongoose.model('Connection', ConnectionSchema);

export default Connection;
