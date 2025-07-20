import mongoose from "mongoose";

const { Schema } = mongoose;

const teamTaskSchema = new Schema({
  team: {
    type: Schema.Types.ObjectId,
    ref: 'Team',
    required: true
  },
  title: {
    type: String,
    required: [true, 'Task title is required'],
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  status: {
    type: String,
    enum: ['todo', 'in_progress', 'review', 'done'],
    default: 'todo'
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  category: {
    type: String,
    default: null
  },
  dueDate: {
    type: Date,
    default: null
  },
  assignees: [{
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    assignedAt: {
      type: Date,
      default: Date.now
    }
  }],
  // For task dependencies
  dependencies: [{
    type: Schema.Types.ObjectId,
    ref: 'TeamTask'
  }],
  // For subtasks
  parent: {
    type: Schema.Types.ObjectId,
    ref: 'TeamTask',
    default: null
  },
  // Track completion
  completedAt: {
    type: Date,
    default: null
  },
  completedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  // Track time estimates and actuals
  estimatedHours: {
    type: Number,
    default: null
  },
  actualHours: {
    type: Number,
    default: 0
  },
  timeEntries: [{
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    hours: Number,
    description: String,
    date: {
      type: Date,
      default: Date.now
    }
  }],
  // Attachments
  attachments: [{
    fileId: {
      type: Schema.Types.ObjectId,
      ref: 'File'
    },
    addedAt: {
      type: Date,
      default: Date.now
    },
    addedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    }
  }],
  // Comments
  comments: [{
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    text: String,
    createdAt: {
      type: Date,
      default: Date.now
    },
    updatedAt: {
      type: Date,
      default: Date.now
    },
    edited: {
      type: Boolean,
      default: false
    }
  }],
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  updatedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
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

// Add indexes for efficient queries
teamTaskSchema.index({ team: 1, status: 1 });
teamTaskSchema.index({ team: 1, dueDate: 1 });
teamTaskSchema.index({ 'assignees.user': 1 });
teamTaskSchema.index({ parent: 1 }); // For finding subtasks

// Virtual for calculating completion percentage
teamTaskSchema.virtual('completionPercentage').get(function() {
  if (this.status === 'done') return 100;
  if (this.status === 'todo') return 0;
  if (this.status === 'in_progress') return 50;
  if (this.status === 'review') return 75;
  return 0;
});

const TeamTask = mongoose.model('TeamTask', teamTaskSchema);

export default TeamTask;