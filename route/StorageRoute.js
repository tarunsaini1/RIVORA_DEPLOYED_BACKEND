import express from 'express';
import multer from 'multer';
import authMiddlewareHybrid from '../authmiddleware/authMiddleware.js';
import { 
  uploadTaskFile, 
  getTaskFiles, 
  getFileById, 
  deleteTaskFile, 
//   generateFileInsights 
} from '../controller/FileController.js';

const router = express.Router();

// Configure multer for file uploads (store in memory)
const storage = multer.memoryStorage();
const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Upload a file to a task
router.post('/tasks/:taskId/files', 
  authMiddlewareHybrid, 
  upload.single('file'), 
  uploadTaskFile
);

// Get all files for a task
router.get('/tasks/:taskId/files', 
  authMiddlewareHybrid, 
  getTaskFiles
);

// Get a specific file by ID (with access check)
router.get('/files/:fileId', 
  authMiddlewareHybrid, 
  getFileById
);

// Delete a file
router.delete('/files/:fileId', 
  authMiddlewareHybrid, 
  deleteTaskFile
);

// Manually trigger AI insights generation for a file
// router.post('/files/:fileId/insights', 
//   authMiddlewareHybrid, 
//   generateFileInsights
// );

export default router;