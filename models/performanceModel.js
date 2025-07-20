import mongoose from 'mongoose';

const performanceReportSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    required: true
  },
  username: {
    type: String,
    required: true
  },
  projectName: {
    type: String,
    required: true
  },
  generatedAt: {
    type: Date,
    default: Date.now
  },
  performanceScore: {
    type: Number,
    required: true,
    min: 0,
    max: 100
  },
  metrics: {
    completionRate: Number,
    avgProgress: Number,
    overdueCount: Number,
    onTimeCompletions: Number,
    productivity: Number,
    responseTime: String
  },
  analysis: {
    strengths: [String],
    improvements: [String],
    insights: String
  },
  recommendations: [String]
});

export default mongoose.model('PerformanceReport', performanceReportSchema);