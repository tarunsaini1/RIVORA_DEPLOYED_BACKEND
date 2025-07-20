import express from "express";
import authMiddlewareHybrid from "../authmiddleware/authMiddleware.js";
import { searchUser, inviteUser, respondToInvitation, getMyInvitations } from '../controller/InviteController.js';

const router = express.Router();

router.get('/search', authMiddlewareHybrid, searchUser);
router.post('/send-invitation', authMiddlewareHybrid, inviteUser);
router.post('/respond', authMiddlewareHybrid, respondToInvitation);
router.get('/requests', authMiddlewareHybrid, getMyInvitations);

export default router;

