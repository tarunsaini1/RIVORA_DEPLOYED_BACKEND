import mongoose from 'mongoose';
const { Schema } = mongoose;

const NotificationSchema = new Schema({
  recipient: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true // For faster queries
  },
  type: {
    type: String,
    required: true,
    enum: [
      'connection_request', 
      'connection_accepted',
      'team_invite',
      'team_join',
      'team_leave',
      'team_role_change',

      'project_invite',
      'project_update',
      'message',
      'mention',
      'task_assigned',
      'task_completed',
      'task_deadline',
      'task_status',
      'task_progress',
      'task_priority',
      'task_update',
      'task_delete',
      'system'
    ]
  },
  priority: {
    type: String,
    enum: ['high', 'medium', 'low'],
    default: 'medium'
  },
  title: {
    type: String,
    required: true
  },
  content: {
    type: String,
    required: true
  },
  read: {
    type: Boolean,
    default: false
  },
  actionTaken: {
    type: Boolean,
    default: false
  },
  sender: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  entityType: {
    type: String,
    enum: ['user', 'team', 'project', 'task', 'message', null],
  },
  entityId: {
    type: Schema.Types.ObjectId,
    refPath: 'entityType'
  },
  actionUrl: {
    type: String
  },
  metaData: {
    type: Map,
    of: Schema.Types.Mixed
  },
  expiresAt: {
    type: Date
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true // For sorting
  }
}, { timestamps: true });

// Set TTL index to automatically delete expired notifications
NotificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Add a compound index for faster querying of unread notifications
NotificationSchema.index({ recipient: 1, read: 1, createdAt: -1 });

// Instance methods
NotificationSchema.methods.markAsRead = async function() {
  this.read = true;
  return this.save();
};

NotificationSchema.methods.markAsActioned = async function() {
  this.actionTaken = true;
  return this.save();
};

// Static methods
NotificationSchema.statics.findForUser = function(userId, options = {}) {
  const query = { recipient: userId };
  const { limit = 20, skip = 0, unreadOnly = false, type, sortBy = 'createdAt' } = options;
  
  if (unreadOnly) query.read = false;
  if (type) query.type = type;
  
  return this.find(query)
    .sort({ priority: -1, [sortBy]: -1 })
    .skip(skip)
    .limit(limit)
    .populate('sender', 'name username profilePicture')
    .populate('entityId');
};

NotificationSchema.statics.getUnreadCount = function(userId) {
  return this.countDocuments({ recipient: userId, read: false });
};

NotificationSchema.statics.markAllAsRead = function(userId) {
  return this.updateMany(
    { recipient: userId, read: false },
    { $set: { read: true } }
  );
};

export default mongoose.model('Notification', NotificationSchema);