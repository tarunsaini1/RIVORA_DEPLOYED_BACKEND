import { uploadFile, deleteFile } from '../utils/vercelHandler.js';
import File from '../models/FileSchema.js';
import { Task } from '../models/TaskModel.js';
import Project from '../models/Project.js';
// import { analyzeFile } from '../utils/fileAi.js';

// Upload a file to a task
export const uploadTaskFile = async (req, res) => {
  try {
    const { taskId } = req.params;
    const userId = req.user.id;
    
    // Check if task exists
    const task = await Task.findById(taskId);
    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }
    
    // Check if user has access to the task (assigned or project admin)
    const isAssigned = task.assignedTo.some(id => id.toString() === userId);
    const project = await Project.findById(task.projectId);
    
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }
    
    const isAdmin = project.members.some(member => 
      (member.userId.toString() === userId || member._id.toString() === userId) && 
      member.role === 'admin'
    );
    
    if (!isAssigned && !isAdmin) {
      return res.status(403).json({ message: 'You do not have permission to upload files to this task' });
    }
    
    // Check if file was provided
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }
    
    // Upload file to Vercel Blob
    const result = await uploadFile(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype
    );
    
    // Create file record in database
    const file = new File({
      taskId,
      projectId: task.projectId,
      name: req.file.originalname,
      url: result.url,
      size: result.size,
      type: req.file.mimetype,
      uploadedBy: userId
    });
    
    await file.save();
    
    // Schedule AI analysis if file type is supported
    if (isFileTypeSupported(req.file.mimetype)) {
      // We'll handle this asynchronously
    //   analyzeFile(file._id).catch(err => 
    //     console.error(`Error analyzing file ${file._id}:`, err)
    //   );
    }
    
    // Update task to reference this file
    await Task.findByIdAndUpdate(taskId, {
      $push: { attachments: file._id },
      $push: { 
        history: {
          action: 'file_added',
          by: userId,
          timestamp: new Date(),
          details: `File "${req.file.originalname}" added`
        }
      }
    });
    
    return res.status(201).json({
      message: 'File uploaded successfully',
      file: {
        _id: file._id,
        name: file.name,
        size: file.size,
        type: file.type,
        uploadedAt: file.uploadedAt,
        uploadedBy: file.uploadedBy,
        url: file.url,
        isProcessed: file.isProcessed
      }
    });
  } catch (error) {
    console.error('Error uploading file:', error);
    return res.status(500).json({ 
      message: 'Failed to upload file',
      error: error.message
    });
  }
};

// Get all files for a task
export const getTaskFiles = async (req, res) => {
  try {
    const { taskId } = req.params;
    const userId = req.user.id;
    
    // Check if task exists
    const task = await Task.findById(taskId);
    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }
    
    // Check if user has access to the task
    const isAssigned = task.assignedTo.some(id => id.toString() === userId);
    const project = await Project.findById(task.projectId);
    
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }
    
    const isProjectMember = project.members.some(member => 
      member.userId.toString() === userId || member._id.toString() === userId
    );
    
    if (!isAssigned && !isProjectMember) {
      return res.status(403).json({ message: 'You do not have permission to view files for this task' });
    }
    
    // Get files
    const files = await File.find({ taskId })
      .select('-__v')
      .sort({ uploadedAt: -1 });
    
    return res.status(200).json({
      files: files.map(file => ({
        _id: file._id,
        name: file.name,
        size: file.size,
        type: file.type,
        uploadedAt: file.uploadedAt,
        uploadedBy: file.uploadedBy,
        url: file.url,
        isProcessed: file.isProcessed,
        aiInsights: file.isProcessed ? file.aiInsights : null
      }))
    });
  } catch (error) {
    console.error('Error getting task files:', error);
    return res.status(500).json({ 
      message: 'Failed to get task files',
      error: error.message
    });
  }
};

// Get a specific file by ID
export const getFileById = async (req, res) => {
  try {
    const { fileId } = req.params;
    const userId = req.user.id;
    
    // Find the file
    const file = await File.findById(fileId);
    if (!file) {
      return res.status(404).json({ message: 'File not found' });
    }
    
    // Check if user has access to the file
    const hasAccess = await File.userHasAccess(fileId, userId);
    if (!hasAccess) {
      return res.status(403).json({ message: 'You do not have permission to access this file' });
    }
    
    return res.status(200).json({
      file: {
        _id: file._id,
        name: file.name,
        size: file.size,
        type: file.type,
        uploadedAt: file.uploadedAt,
        uploadedBy: file.uploadedBy,
        url: file.url,
        isProcessed: file.isProcessed,
        aiInsights: file.isProcessed ? file.aiInsights : null
      }
    });
  } catch (error) {
    console.error('Error getting file:', error);
    return res.status(500).json({ 
      message: 'Failed to get file',
      error: error.message
    });
  }
};

// Delete a file
export const deleteTaskFile = async (req, res) => {
  try {
    console.log("Delete file");
    const { fileId } = req.params;
    const userId = req.user.id;
    
    // Find the file
    const file = await File.findById(fileId);
    if (!file) {
      return res.status(404).json({ message: 'File not found' });
    }
    
    // Check if user is the file uploader or a project admin
    const isUploader = file.uploadedBy.toString() === userId;
    const project = await Project.findById(file.projectId);
    
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }
    
    const isAdmin = project.members.some(member => 
      (member.userId.toString() === userId || member._id.toString() === userId) && 
      member.role === 'admin'
    );
    
    if (!isUploader && !isAdmin) {
      return res.status(403).json({ message: 'You do not have permission to delete this file' });
    }
    
    // Delete file from Vercel Blob
    await deleteFile(file.url);
    
    // Remove file reference from task
    await Task.findByIdAndUpdate(file.taskId, {
      $pull: { attachments: file._id },
      $push: { 
        history: {
          action: 'file_removed',
          by: userId,
          timestamp: new Date(),
          details: `File "${file.name}" removed`
        }
      }
    });
    
    // Delete file record from database
    await File.findByIdAndDelete(fileId);
    
    return res.status(200).json({
      message: 'File deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting file:', error);
    return res.status(500).json({ 
      message: 'Failed to delete file',
      error: error.message
    });
  }
};

// Manually trigger AI insights generation
// export const generateFileInsights = async (req, res) => {
//   try {
//     const { fileId } = req.params;
//     const userId = req.user.id;
    
//     // Find the file
//     const file = await File.findById(fileId);
//     if (!file) {
//       return res.status(404).json({ message: 'File not found' });
//     }
    
//     // Check if user has access to the file
//     const hasAccess = await File.userHasAccess(fileId, userId);
//     if (!hasAccess) {
//       return res.status(403).json({ message: 'You do not have permission to access this file' });
//     }
    
//     if (!isFileTypeSupported(file.type)) {
//       return res.status(400).json({ message: 'AI analysis is not supported for this file type' });
//     }
    
//     // Process in background and send immediate response
//     res.status(202).json({
//       message: 'File analysis scheduled',
//       fileId
//     });
    
//     // Actually process the file (this runs after response is sent)
//     try {
//       await analyzeFile(fileId);
//     } catch (err) {
//       console.error(`Error analyzing file ${fileId}:`, err);
//       // Update file with error status
//       await File.findByIdAndUpdate(fileId, {
//         processingError: err.message
//       });
//     }
//   } catch (error) {
//     console.error('Error scheduling file analysis:', error);
//     return res.status(500).json({ 
//       message: 'Failed to schedule file analysis',
//       error: error.message
//     });
//   }
// };

// Helper functions
function isFileTypeSupported(mimeType) {
  const supportedTypes = [
    // Text files
    'text/plain',
    'text/csv', 
    'text/markdown',
    // Documents
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // docx
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // xlsx
    'application/vnd.openxmlformats-officedocument.presentationml.presentation', // pptx
    // Images
    'image/jpeg',
    'image/png',
    'image/gif',
  ];
  
  return supportedTypes.includes(mimeType);
}