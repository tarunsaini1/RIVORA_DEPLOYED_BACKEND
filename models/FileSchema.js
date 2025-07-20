import mongoose from 'mongoose';

const fileSchema = new mongoose.Schema({
  taskId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Task',
    required: true,
    index: true
  },
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    required: true,
    index: true
  },
  name: {
    type: String,
    required: true
  },
  url: {
    type: String,
    required: true
  },
  size: {
    type: Number,
    required: false
  },
  type: {
    type: String,
    required: true
  },
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  uploadedAt: {
    type: Date,
    default: Date.now
  },
  aiInsights: {
    summary: String,
    keyPoints: [String],
    sentiment: String,
    tags: [String],
    extractedData: mongoose.Schema.Types.Mixed,
    processedAt: Date
  },

excelAnalysis: {
  // Basic Excel data
  sheetCount: Number,
  rowCount: Number,
  columnCount: Number,
  formulaCount: Number,
  hasFormulas: Boolean,
  hasPivotTables: Boolean,
  
  // Analysis results from AI
  dataSummary: String,
  keyInsights: [String],
  dataQueries: [String],
  formulaTips: [String],
  visualizations: [String],
  advancedFeatures: [String],
  cleaningTips: [String],
  fullAnalysisText: String,
  
  // Data quality issues
  inconsistencies: [String],
  optimizationSuggestions: [String],
  
  // Metadata
  processedAt: Date
},
  
  isProcessed: {
    type: Boolean,
    default: false
  },
  processingError: String
}, { timestamps: true });

fileSchema.statics.userHasAccess = async function(fileId, userId) {
  const file = await this.findById(fileId);
  if (!file) return false;
  
  const task = await mongoose.model('Task').findById(file.taskId);
  if (!task) return false;
  
  // Check if user is assigned to the task
  const isAssignedToTask = task.assignedTo.some(id => id.toString() === userId.toString());
  
  const project = await mongoose.model('Project').findById(file.projectId);
  if (!project) return false;
  
  const isProjectAdmin = project.members.some(m => 
    (m.userId.toString() === userId.toString() || m._id.toString() === userId.toString()) && 
    m.role === 'admin'
  );
  
  return isAssignedToTask || isProjectAdmin;
};

const File = mongoose.model('File', fileSchema);

export default File;