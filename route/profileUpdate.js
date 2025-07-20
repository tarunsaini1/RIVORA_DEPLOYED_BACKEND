import express from 'express';
import { profileUpload } from '../authmiddleware/multer.js';
import authMiddlewareHybrid from '../authmiddleware/authMiddleware.js';
import { updateUserProfile, getUserProfile } from '../controller/profileUpdate.js';

const router = express.Router();

// Get user profile
router.get('/profile', authMiddlewareHybrid, getUserProfile);

// Update user profile with Cloudinary upload middleware
router.put('/profile', 
    authMiddlewareHybrid,
    (req, res, next) => {
        profileUpload(req, res, (err) => {
            if (err) {
                return res.status(400).json({
                    success: false,
                    message: err.message
                });
            }
            next();
        });
    },
    updateUserProfile
);

export default router;