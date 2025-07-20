import mongoose from "mongoose";

const taskSchema = new mongoose.Schema(
  {
    // Basic Task Information
    title: { type: String, required: true },
    description: { type: String, default: "" },
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: "Project", required: true },
    status: { 
      type: String, 
      enum: ["todo", "in_progress", "in_review", "completed", "done"], 
      default: "todo" 
    },
    priority: { 
      type: String, 
      enum: ["low", "medium", "high", "urgent"], 
      default: "medium" 
    },

    // Assignment & Ownership
    assignedTo: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }], // Multiple assignees
    assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    // Tags and Categories
    tags: [{ type: String }], // Labels like "Bug", "Design", "Frontend"

    // AI-Powered Insights
    aiInsights: {
      suggestedDueDate: { type: Date },
      riskAnalysis: { type: String, default: "" },
      workloadImpact: { type: String, default: "" },
    },

    aiGenerated: { type: Boolean, default: false }, // Flag for AI-generated tasks


    // Task Dependencies & Structure
    dependencies: [{ type: mongoose.Schema.Types.ObjectId, ref: "Task" }],
    blockers: [{ type: mongoose.Schema.Types.ObjectId, ref: "Task" }],
    subtasks: [{ type: mongoose.Schema.Types.ObjectId, ref: "Subtask" }],

    // Progress & Time Tracking
    progress: { type: Number, min: 0, max: 100, default: 0 },
    dueDate: { type: Date },
    completedAt: { type: Date },
    timeTracking: [
      {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        hoursSpent: { type: Number, default: 0 },
        lastUpdated: { type: Date, default: Date.now },
      },
    ],
    estimatedTime: { type: Number, default: 0 },
    productivityScore: { type: Number, default: 0 },

    // Reminders & Notifications
    reminders: [
      {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        reminderDate: { type: Date },
      },
    ],

    // Attachments & Documentation
  attachments: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'File'
  }],

    // Task Collaboration
    comments: [
      {
        message: String,
        sender: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        timestamp: { type: Date, default: Date.now },
      },
    ],

    // Activity Tracking
    activityLog: [
      {
        action: String,
        timestamp: { type: Date, default: Date.now },
        triggeredBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      },
    ],

    // Task Views (new field)
    view: {
      type: String,
      enum: ["list", "board", "calendar"],
      default: "board"
    },

    // Timestamps
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export const Task = mongoose.model("Task", taskSchema);
