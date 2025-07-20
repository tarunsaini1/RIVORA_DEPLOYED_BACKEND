import express from 'express';
import {
  sendLinkUpRequest,
  acceptLinkUpRequest,
  rejectLinkUpRequest,
  removeLinkUp,
  getLinkUps,
  getPendingLinkUps,
  getLinkUpCount,
  checkLinkUpStatus,
  getUserProfile
} from '../controller/connectionController.js';
import authMiddlewareHybrid from '../authmiddleware/authMiddleware.js';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(authMiddlewareHybrid);

// LinkUp management
router.post('/linkup', sendLinkUpRequest);
router.put('/linkup/accept/:connectionId', acceptLinkUpRequest);
router.put('/linkup/reject/:connectionId', rejectLinkUpRequest);
router.delete('/linkup/:userId', removeLinkUp);

// Get LinkUps
router.get('/linkups', getLinkUps);
router.get('/linkup/pending', getPendingLinkUps);
router.get('/linkup/count/:userId?', getLinkUpCount);
router.get('/linkup/status/:userId', checkLinkUpStatus);

router.get('/profile/:userId', getUserProfile); // Get user profile

export default router;