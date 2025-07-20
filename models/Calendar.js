import mongoose from "mongoose";

const { Schema } = mongoose;

const teamEventSchema = new Schema({
  team: {
    type: Schema.Types.ObjectId,
    ref: 'Team',
    required: true
  },
  title: {
    type: String,
    required: [true, 'Event title is required'],
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  location: {
    type: String,
    trim: true
  },
  startDate: {
    type: Date,
    required: [true, 'Start date is required']
  },
  endDate: {
    type: Date,
    required: [true, 'End date is required']
  },
  allDay: {
    type: Boolean,
    default: false
  },
  color: {
    type: String,
    default: null // Inherit from team calendar if null
  },
  recurrence: {
    type: Object,
    default: null
    // Could contain: { frequency: 'daily|weekly|monthly|yearly', interval: Number, until: Date }
  },
  attendees: [{
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'declined', 'tentative'],
      default: 'pending'
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
teamEventSchema.index({ team: 1, startDate: 1 });
teamEventSchema.index({ team: 1, endDate: 1 });
teamEventSchema.index({ 'attendees.user': 1 });

const TeamEvent = mongoose.model('TeamEvent', teamEventSchema);

export default TeamEvent;