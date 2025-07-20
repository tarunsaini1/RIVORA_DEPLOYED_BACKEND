import express from "express";
import authMiddlewareHybrid from "../authmiddleware/authMiddleware.js";
import { getProjects, createProject, getProjectById, updateProject, deleteProject, updateMemberRole, removeMember, leaveProject } from "../controller/ProjectController.js";
import { deployTeamToProject, getTeamDeployments } from "../controller/deployController.js";


import { 
  upload, 
  uploadToCloudinary, 
  deleteFromCloudinary,
  getPublicIdFromUrl 
} from '../config/cloudinaryMulter.js';

import Project from '../models/Project.js';


const router = express.Router();

//Basic crud operations for projects

router.get("/projects", authMiddlewareHybrid, getProjects); //get all projects
router.post("/projects", authMiddlewareHybrid, createProject); //create a project
router.get("/projects/:id", authMiddlewareHybrid, getProjectById); //get a project by id
router.put("/projects/:id", authMiddlewareHybrid, updateProject); //update a project
router.delete("/projects/:id", authMiddlewareHybrid, deleteProject);  //delete a project

router.post('/:teamId/deploy/:projectId', authMiddlewareHybrid, deployTeamToProject);
router.get('/:teamId/deployments', authMiddlewareHybrid, getTeamDeployments);
router.patch('/projects/:projectId/members/:userId/role', authMiddlewareHybrid, updateMemberRole);

router.delete('/projects/:projectId/leave-project', authMiddlewareHybrid, leaveProject); 


router.delete('/projects/:projectId/:userId', authMiddlewareHybrid, removeMember);







//some zen mode route's yayaya


// router.post('/projects/upload-image', authMiddlewareHybrid, upload.single('image'), async (req, res) => {
//     console.log(req.file);
//     console.log("request recieved")
//   try {
//     // Check if file exists
//     if (!req.file) {
//       return res.status(400).json({ message: 'Please upload an image file' });
//     }

//     const projectId = req.body.projectId;
//     // console.log(projectId);
//     // console.log(req.user._id);
//     // console.log(req.user);

//     // Check if project exists and belongs to the user
//     const project = await Project.findOne({ 
//       _id: projectId,
//       owner: req.user._id 
//     });
//     // console.log(project);

//     if (!project) {
//       return res.status(404).json({ message: 'Project not found or access denied' });
//     }

//     // Create unique public_id for Cloudinary
//     const publicId = `project_${projectId}_${Date.now()}`;

//     // Upload image to Cloudinary
//     const result = await uploadToCloudinary(req.file.buffer, 'project-images', {
//       public_id: publicId,
//       transformation: [
//         { width: 1200, crop: "limit" }, // Resize large images
//         { quality: "auto" } // Auto optimize quality
//       ]
//     });

//     // Update project with Cloudinary URL
//     project.image = result.secure_url;
//     await project.save();

//     // Return success with image URL
//     res.status(200).json({
//       success: true,
//       data: { 
//         imageUrl: result.secure_url,
//         publicId: result.public_id
//       }
//     });

//   } catch (error) {
//     console.error('Error uploading image:', error);
//     res.status(500).json({
//       message: 'Error uploading image',
//       error: error.message
//     });
//   }
// });

router.post('/projects/upload-image', authMiddlewareHybrid, upload.single('image'), async (req, res) => {
    console.log(req.file);
    console.log("request received");
    
    try {
        // Check if file exists
        if (!req.file) {
            return res.status(400).json({ message: 'Please upload an image file' });
        }

        const projectId = req.body.projectId;
        console.log("Project ID:", projectId);

        // Check if project exists and belongs to the user
        const project = await Project.findOne({ 
            _id: projectId,
            owner: req.user._id 
        });
        console.log("Project found:", !!project);

        if (!project) {
            return res.status(404).json({ message: 'Project not found or access denied' });
        }

        // Create unique public_id for Cloudinary
        const publicId = `project_${projectId}_${Date.now()}`;
        console.log("Generated public ID:", publicId);

        try {
            console.log("Starting Cloudinary upload...");
            console.log("Upload params:", {
                buffer: req.file.buffer ? "Buffer present" : "Buffer missing",
                bufferSize: req.file.buffer ? req.file.buffer.length : 0,
                folder: 'project-images',
                publicId
            });
            
            // Upload image to Cloudinary
            const result = await uploadToCloudinary(req.file.buffer, 'project-images', {
                public_id: publicId,
                transformation: [
                    { width: 1200, crop: "limit" },
                    { quality: "auto" }
                ]
            });
            
            console.log("Cloudinary upload result:", result);

            // Update project with Cloudinary URL
            project.image = result.secure_url;
            await project.save();
            console.log(project);
            console.log("Project updated with image URL");

            // Return success with image URL
            return res.status(200).json({
                success: true,
                data: { 
                    imageUrl: result.secure_url,
                    publicId: result.public_id
                }
            });
        } catch (cloudinaryError) {
            console.error("Cloudinary upload error details:", cloudinaryError);
            return res.status(500).json({
                message: 'Error uploading to Cloudinary',
                error: cloudinaryError.message
            });
        }
    } catch (error) {
        console.error('Error uploading image - full error:', error);
        return res.status(500).json({
            message: 'Error uploading image',
            error: error.message
        });
    }
});

// Optional: Add route to delete image from Cloudinary
router.delete('/delete-image/:projectId', authMiddlewareHybrid, async (req, res) => {
  try {
    const { projectId } = req.params;
    
    // Find project
    const project = await Project.findOne({ 
      _id: projectId,
      createdBy: req.user.id 
    });

    if (!project || !project.image) {
      return res.status(404).json({ message: 'Project not found or has no image' });
    }

    // Extract public_id from URL using the helper function
    const publicId = getPublicIdFromUrl(project.image);

    if (publicId) {
      // Use the helper function to delete from Cloudinary
      await deleteFromCloudinary(publicId);
    }

    // Clear image field in project
    project.image = '';
    await project.save();

    res.status(200).json({
      success: true,
      message: 'Image deleted successfully'
    });
    
  } catch (error) {
    console.error('Error deleting image:', error);
    res.status(500).json({
      message: 'Error deleting image',
      error: error.message
    });
  }
});


export default router;