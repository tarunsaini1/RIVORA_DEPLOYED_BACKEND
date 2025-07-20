import User from '../models/User.js';
import redisClient from '../config/redis.js';
import cloudinary from '../config/Cloudinary.js';

/**
 * Get user profile information
 */
export const getUserProfile = async (req, res) => {
    try {
        // Get user ID from authenticated user
        const userId = req.user?.id;
        
        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
        }
        
        // Try to get from cache first
        let userData;
        try {
            const cachedUser = await redisClient.get(`user:profile:${userId}`);
            if (cachedUser) {
                userData = JSON.parse(cachedUser);
                console.log('User profile retrieved from cache');
            }
        } catch (redisError) {
            console.error('Redis error:', redisError);
            // Continue execution even if Redis fails
        }
        
        // If not in cache, fetch from database
        if (!userData) {
            userData = await User.findById(userId)
                .select('-password -refreshTokens -__v')
                .populate('projects', 'name description currentStatus deadline')
                .populate('tasks', 'title description dueDate status');
                
            if (!userData) {
                return res.status(404).json({
                    success: false,
                    message: 'User not found'
                });
            }
            
            // Cache the user data
            try {
                await redisClient.set(
                    `user:profile:${userId}`, 
                    JSON.stringify(userData),
                    { EX: 3600 } // Cache for 1 hour
                );
            } catch (redisError) {
                console.error('Redis caching error:', redisError);
                // Continue execution even if Redis fails
            }
        }
        
        return res.status(200).json({
            success: true,
            user: userData
        });
        
    } catch (error) {
        console.error('Profile fetch error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch user profile',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Update user profile information including skills and interests
 */
export const updateUserProfile = async (req, res) => {
    try {
        const userId = req.user.id;
        
        // Prepare profile update data
        const updateData = {
            name: req.body.name,
            username: req.body.username,
            bio: req.body.bio,
            profession: req.body.profession
        };
        
        // Handle skills array
        if (Array.isArray(req.body.skills)) {
            // Filter out empty strings and limit to prevent abuse
            updateData.skills = req.body.skills
                .filter(skill => typeof skill === 'string' && skill.trim() !== '')
                .map(skill => skill.trim())
                .slice(0, 20); // Limit to 20 skills max
        }
        
        // Handle interests array
        if (Array.isArray(req.body.interests)) {
            // Filter out empty strings and limit to prevent abuse
            updateData.interests = req.body.interests
                .filter(interest => typeof interest === 'string' && interest.trim() !== '')
                .map(interest => interest.trim())
                .slice(0, 20); // Limit to 20 interests max
        }
        
        // Single skill operations
        if (req.body.addSkill && typeof req.body.addSkill === 'string' && req.body.addSkill.trim() !== '') {
            // Get current skills
            const user = await User.findById(userId).select('skills');
            const currentSkills = user.skills || [];
            
            // Add new skill if not already in the list
            if (!currentSkills.includes(req.body.addSkill.trim())) {
                updateData.skills = [...currentSkills, req.body.addSkill.trim()].slice(0, 20);
            }
        }
        
        if (req.body.removeSkill && typeof req.body.removeSkill === 'string') {
            // Get current skills if not already fetched
            if (!updateData.skills) {
                const user = await User.findById(userId).select('skills');
                updateData.skills = (user.skills || [])
                    .filter(skill => skill !== req.body.removeSkill);
            } else {
                // Filter out the skill to remove
                updateData.skills = updateData.skills
                    .filter(skill => skill !== req.body.removeSkill);
            }
        }
        
        // Single interest operations
        if (req.body.addInterest && typeof req.body.addInterest === 'string' && req.body.addInterest.trim() !== '') {
            // Get current interests
            const user = await User.findById(userId).select('interests');
            const currentInterests = user.interests || [];
            
            // Add new interest if not already in the list
            if (!currentInterests.includes(req.body.addInterest.trim())) {
                updateData.interests = [...currentInterests, req.body.addInterest.trim()].slice(0, 20);
            }
        }
        
        if (req.body.removeInterest && typeof req.body.removeInterest === 'string') {
            // Get current interests if not already fetched
            if (!updateData.interests) {
                const user = await User.findById(userId).select('interests');
                updateData.interests = (user.interests || [])
                    .filter(interest => interest !== req.body.removeInterest);
            } else {
                // Filter out the interest to remove
                updateData.interests = updateData.interests
                    .filter(interest => interest !== req.body.removeInterest);
            }
        }
        
        // Handle profile picture if uploaded
        if (req.file) {
            // Use the Cloudinary URL from multer middleware
            updateData.profilePicture = req.file.path;
        } else if (req.body.profilePicture && req.body.profilePicture.startsWith('data:image')) {
            try {
                // Handle base64 image data
                const uploadResult = await cloudinary.uploader.upload(req.body.profilePicture, {
                    folder: 'aether_mind/profiles',
                    transformation: [{ width: 500, height: 500, crop: 'limit' }]
                });
                updateData.profilePicture = uploadResult.secure_url;
            } catch (uploadError) {
                console.error('Image upload error:', uploadError);
                return res.status(400).json({
                    success: false,
                    message: 'Failed to upload profile image'
                });
            }
        }
        
        // Remove undefined fields
        Object.keys(updateData).forEach(key => 
            updateData[key] === undefined && delete updateData[key]
        );
        
        // If no updates, return early
        if (Object.keys(updateData).length === 0) {
            return res.status(400).json({
                success: false,
                message: "No valid update data provided"
            });
        }
        
        // Update user in database
        const updatedUser = await User.findByIdAndUpdate(
            userId,
            { $set: updateData },
            { new: true, runValidators: true }
        ).select('-password -refreshTokens -__v');
        
        if (!updatedUser) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }
        
        // Clear user cache
        try {
            await redisClient.del(`user:profile:${userId}`);
        } catch (redisError) {
            console.error('Redis cache clear error:', redisError);
            // Continue even if Redis fails
        }
        
        return res.status(200).json({
            success: true,
            message: "Profile updated successfully",
            user: updatedUser
        });
        
    } catch (error) {
        console.error('Profile update error:', error);
        
        // Handle duplicate username error
        if (error.code === 11000 && error.keyPattern?.username) {
            return res.status(400).json({
                success: false,
                message: "Username is already taken"
            });
        }
        
        return res.status(500).json({
            success: false,
            message: "Failed to update profile",
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};