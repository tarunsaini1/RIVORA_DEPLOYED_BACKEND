import multer from 'multer';
import cloudinary from './Cloudinary.js';
import { Readable } from 'stream';

// Set up in-memory storage for multer
const storage = multer.memoryStorage();

// Create multer instance with memory storage
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB file size limit
  },
  fileFilter: (req, file, cb) => {
    // Accept only images
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  }
});

// Helper function to convert buffer to stream for Cloudinary
const bufferToStream = (buffer) => {
  const readable = new Readable({
    read() {
      this.push(buffer);
      this.push(null);
    }
  });
  return readable;
};

// Helper function to upload buffer to Cloudinary
const uploadToCloudinary = async (fileBuffer, folder = 'project-images', options = {}) => {
  return new Promise((resolve, reject) => {
    const uploadOptions = {
      folder: folder,
      resource_type: 'auto',
      ...options
    };

    // Create upload stream
    const uploadStream = cloudinary.uploader.upload_stream(
      uploadOptions,
      (error, result) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(result);
      }
    );

    // Convert buffer to stream and pipe to upload stream
    bufferToStream(fileBuffer).pipe(uploadStream);
  });
};

// Middleware to handle file upload and push to Cloudinary
const handleCloudinaryUpload = (fieldName) => {
  return async (req, res, next) => {
    // Use the upload middleware first
    upload.single(fieldName)(req, res, async (err) => {
      if (err) {
        return res.status(400).json({ 
          success: false, 
          message: err.message 
        });
      }

      // If no file was uploaded, continue to next middleware
      if (!req.file) {
        return next();
      }

      try {
        // Get options from request if provided
        const folder = req.body.folder || 'project-images';
        const publicId = req.body.projectId ? 
          `project_${req.body.projectId}_${Date.now()}` : 
          `upload_${Date.now()}`;

        // Upload to Cloudinary
        const result = await uploadToCloudinary(req.file.buffer, folder, {
          public_id: publicId,
          transformation: [
            { width: 1200, crop: "limit" },
            { quality: "auto" }
          ]
        });

        // Add Cloudinary result to request object
        req.cloudinaryResult = result;
        next();
      } catch (error) {
        return res.status(500).json({ 
          success: false, 
          message: 'Error uploading to Cloudinary',
          error: error.message 
        });
      }
    });
  };
};

// Helper function to delete image from Cloudinary
const deleteFromCloudinary = async (publicId) => {
  return cloudinary.uploader.destroy(publicId);
};

// Helper to extract public_id from Cloudinary URL
const getPublicIdFromUrl = (url) => {
  if (!url || !url.includes('cloudinary')) return null;
  
  // Extract the public ID from URL
  // Format: https://res.cloudinary.com/cloud-name/image/upload/v1234567890/folder/public_id.extension
  const splitUrl = url.split('/');
  const filenameWithExtension = splitUrl[splitUrl.length - 1];
  // Remove extension
  return filenameWithExtension.split('.')[0];
};

export { 
  upload, 
  uploadToCloudinary, 
  handleCloudinaryUpload, 
  deleteFromCloudinary,
  getPublicIdFromUrl
};