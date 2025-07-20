import mongoose from "mongoose";

const { Schema } = mongoose;

const teamSchema = new Schema({
  name: {
    type: String,
    required: [true, 'Team name is required'],
    trim: true,
    minlength: [3, 'Team name must be at least 3 characters']
  },
  description: {
    type: String,
    trim: true
  },
  category: {
    type: String,
    required: [true, 'Team category is required'],
    trim: true
  },
  owner: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  members: [{
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    role: {
      type: String,
      required: true,
      default: 'Member'
    },
    permissions: {
      type: [String],
      default: []
    },
    joinedAt: {
      type: Date,
      default: Date.now
    }
  }],
  avatar: {
    type: String
  },
  isPrivate: {
    type: Boolean,
    default: false
  },
  // Calendar settings
  calendar: {
    enabled: {
      type: Boolean,
      default: true
    },
    defaultView: {
      type: String,
      enum: ['month', 'week', 'day', 'agenda'],
      default: 'month'
    },
    color: {
      type: String,
      default: '#3788d8' // Default calendar color
    }
  },
  // Task management settings
  taskManagement: {
    enabled: {
      type: Boolean,
      default: true
    },
    defaultView: {
      type: String,
      enum: ['board', 'list', 'timeline'],
      default: 'board'
    },
    categories: [{
      name: String,
      color: String
    }]
  },
  createdAt: {
    type: Date, 
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, 
{ timestamps: true });

// Add indexes
teamSchema.index({ name: 'text', category: 'text' });
teamSchema.index({ owner: 1 });
teamSchema.index({ 'members.user': 1 });

// Add these methods to your Team schema for easy calendar and task management access

// Get user's role in the team
teamSchema.methods.getUserRole = function(userId) {
  if (this.owner.toString() === userId.toString()) {
    return 'Owner';
  }
  
  const member = this.members.find(m => m.user.toString() === userId.toString());
  return member ? member.role : null;
};

// Check if user has specific permission
teamSchema.methods.hasPermission = function(userId, permission) {
  // Owner has all permissions
  if (this.owner.toString() === userId.toString()) {
    return true;
  }
  
  const member = this.members.find(m => m.user.toString() === userId.toString());
  if (!member) {
    return false;
  }
  
  // Admin role has all permissions
  if (member.role === 'Admin') {
    return true;
  }
  
  // Check specific permission
  return member.permissions.includes(permission);
};

// Get team calendar settings
teamSchema.methods.getCalendarSettings = function() {
  return this.calendar || {
    enabled: true,
    defaultView: 'month',
    color: '#3788d8'
  };
};

// Get task management settings
teamSchema.methods.getTaskSettings = function() {
  return this.taskManagement || {
    enabled: true,
    defaultView: 'board',
    categories: []
  };
};

const Team = mongoose.model('Team', teamSchema);

export default Team;