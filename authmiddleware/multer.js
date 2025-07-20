import multer from 'multer';
import cloudinary from '../config/Cloudinary.js';
import path from 'path';

// Use memory storage for multer
const memoryStorage = multer.memoryStorage();

// Create base upload middleware
const upload = multer({
  storage: memoryStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    // Accept only image files
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
}).single('profilePicture');

// Create the wrapper middleware that uploads to Cloudinary
export const profileUpload = (req, res, next) => {
  upload(req, res, async (err) => {
    // Handle multer errors
    if (err) {
      console.error('Multer error:', err);
      return res.status(400).json({
        success: false,
        message: err.message || 'File upload error'
      });
    }
    
    // If no file was uploaded, just continue
    if (!req.file) {
      return next();
    }
    
    try {
      console.log('Uploading file to Cloudinary...');
      
      // Upload the buffer to Cloudinary
      const result = await new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            folder: 'aether_mind/profiles',
            transformation: [{ width: 500, height: 500, crop: 'limit' }]
          },
          (error, result) => {
            if (error) {
              console.error('Cloudinary upload error:', error);
              reject(error);
            } else {
              console.log('Cloudinary upload successful');
              resolve(result);
            }
          }
        );
        
        // Write the buffer to the upload stream
        uploadStream.end(req.file.buffer);
      });
      
      // Replace the file with the Cloudinary result
      req.file.path = result.secure_url;
      req.file.cloudinaryId = result.public_id;
      
      console.log(`File uploaded successfully: ${result.secure_url}`);
      next();
    } catch (error) {
      console.error('Upload to Cloudinary failed:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to upload image to cloud storage'
      });
    }
  });
};

// Helper function for direct base64 upload to Cloudinary
export const uploadBase64Image = async (base64String) => {
  if (!base64String || !base64String.startsWith('data:image')) {
    throw new Error('Invalid image data');
  }
  
  try {
    console.log('Uploading base64 image to Cloudinary...');
    const result = await cloudinary.uploader.upload(base64String, {
      folder: 'aether_mind/profiles',
      transformation: [{ width: 500, height: 500, crop: 'limit' }]
    });
    console.log(`Base64 image uploaded successfully: ${result.secure_url}`);
    return result.secure_url;
  } catch (error) {
    console.error('Error uploading base64 to Cloudinary:', error);
    throw error;
  }
};