import express from "express";
import { generateAITasks } from "../controller/genAi.js";
import authMiddlewareHybrid from "../authmiddleware/authMiddleware.js";
import { generateAnalysis } from "../controller/genAiinsight.js";
import aiController from "../controller/fileAi.js";
import excelAnalysis from "../controller/ExcelAnalysis.js";
import mongoose from "mongoose";
import File from "../models/FileSchema.js";

const router = express.Router();

router.post('/generateAITasks', authMiddlewareHybrid, async(req, res) => {
    try {
        const { projectId, projectName, projectDescription, teamMembers, projectDeadline } = req.body;
        const createdBy = req.user._id; // Fix: Correct way to get user ID

        

        // Validation
        if (!projectId || !projectName || !projectDescription || !teamMembers || !projectDeadline) {
            return res.status(400).json({
                success: false,
                message: "Missing required fields in request body",
                receivedData: { projectId, projectName, projectDescription, teamMembers, projectDeadline }
            });
        }

        const tasks = await generateAITasks(
            projectId, 
            projectName, 
            projectDescription, 
            teamMembers, 
            projectDeadline, 
            createdBy
        );

        if (!tasks) {
            return res.status(500).json({
                success: false,
                message: "Failed to generate AI tasks"
            });
        }

        res.status(201).json({
            success: true,
            message: "AI tasks generated successfully",
            data: tasks
        });

    } catch (error) {
        console.error("AI Task Generation Error:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        });
    }
});


router.post('/projects/:projectId/analysis', authMiddlewareHybrid, generateAnalysis);

router.post('/analyze/:fileId', authMiddlewareHybrid, aiController.analyzeFile);

router.post('/excel/:fileId/analyze', authMiddlewareHybrid, excelAnalysis.analyzeExcelFile);

router.get('/excel/:fileId/check-analysis', authMiddlewareHybrid, async (req, res) => {
  try {
    console.log('Checking Excel analysis status');
    const { fileId } = req.params;
    const userId = req.user._id;
    console.log('File ID:', fileId);
    console.log('User ID:', userId);

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(fileId)) {
      return res.status(400).json({ message: 'Invalid file ID' });
    }

    // Find the file
    const file = await File.findById(fileId);
    if (!file) {
      return res.status(404).json({ message: 'File not found' });
    }
    console.log('File:', file);

    // Check permissions
    const hasAccess = await File.userHasAccess(fileId, userId);
    if (!hasAccess) {
      return res.status(403).json({ message: 'You do not have permission to access this file' });
    }
    
    // Check if analysis exists
    const hasAnalysis = !!file.excelAnalysis && file.isProcessed;
    
    res.status(200).json({ 
      hasAnalysis,
      processedAt: file.excelAnalysis?.processedAt
    });
    
  } catch (error) {
    console.error('Check Excel analysis error:', error);
    res.status(500).json({
      message: 'Failed to check Excel analysis status',
      error: error.message
    });
  }
});

router.get('/excel/:fileId/analysis', authMiddlewareHybrid, async (req, res) => {
  try {
    const { fileId } = req.params;
    const userId = req.user._id;

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(fileId)) {
      return res.status(400).json({ message: 'Invalid file ID' });
    }

    // Find the file
    const file = await File.findById(fileId);
    if (!file) {
      return res.status(404).json({ message: 'File not found' });
    }

    // Check permissions
    const hasAccess = await File.userHasAccess(fileId, userId);
    if (!hasAccess) {
      return res.status(403).json({ message: 'You do not have permission to access this file' });
    }
    
    // Check if analysis exists
    if (!file.excelAnalysis) {
      return res.status(404).json({ message: 'Excel analysis not found for this file' });
    }
    
    res.status(200).json({ 
      fileId: file._id,
      excelAnalysis: file.excelAnalysis,
      insights: file.aiInsights || {}
    });
    
  } catch (error) {
    console.error('Get Excel analysis error:', error);
    res.status(500).json({
      message: 'Failed to retrieve Excel analysis',
      error: error.message
    });
  }
});

export default router;