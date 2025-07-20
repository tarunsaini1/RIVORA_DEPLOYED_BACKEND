import express from 'express';
import authMiddlewareHybrid from '../authmiddleware/authMiddleware.js';
import {
  createTeam,
  getMyTeams,
  getTeam,
  updateTeam,
  deleteTeam,
  addTeamMember,
  updateTeamMember,
  removeTeamMember,
  leaveTeam,
  getAvailableConnections
} from '../controller/teamController.js';

// import { getTeamTasks,  } from '../controller/teamTask.js';

const router = express.Router();

// Base routes
router.route('/')
  .post(authMiddlewareHybrid, createTeam)
  .get(authMiddlewareHybrid, getMyTeams);

// Team-specific routes
router.route('/:teamId')
  .get(authMiddlewareHybrid, getTeam)
  .put(authMiddlewareHybrid, updateTeam)
  .delete(authMiddlewareHybrid, deleteTeam);

// Member management routes
router.route('/:teamId/members')
  .post(authMiddlewareHybrid, addTeamMember);

router.route('/:teamId/members/:memberId')
  .put(authMiddlewareHybrid, updateTeamMember)
  .delete(authMiddlewareHybrid, removeTeamMember);

router.route('/:teamId/leave')
  .delete(authMiddlewareHybrid, leaveTeam);

// Available connections for team
router.route('/:teamId/available-connections')
  .get(authMiddlewareHybrid, getAvailableConnections);

// Team Task Routes
// router.get('/teams/:teamId/tasks', authMiddlewareHybrid, teamTaskController.getTeamTasks);
// router.post('/teams/:teamId/tasks', authMiddlewareHybrid, teamTaskController.createTeamTask);
// router.put('/tasks/:taskId', authMiddlewareHybrid, teamTaskController.updateTeamTask);
// router.delete('/tasks/:taskId', authMiddlewareHybrid, teamTaskController.deleteTeamTask);
// router.post('/tasks/:taskId/comments', authMiddlewareHybrid, teamTaskController.addTaskComment);
// router.post('/tasks/:taskId/time', authMiddlewareHybrid, teamTaskController.logTaskTime);
// router.get('/tasks/:taskId/time', authMiddlewareHybrid, teamTaskController.getTaskTimeLogs);

// // Team Calendar Routes
// router.get('/teams/:teamId/calendar', authMiddlewareHybrid, teamCalendarController.getTeamEvents);
// router.post('/teams/:teamId/calendar', authMiddlewareHybrid, teamCalendarController.createEvent);
// router.put('/calendar/:eventId', authMiddlewareHybrid, teamCalendarController.updateEvent);
// router.delete('/calendar/:eventId', authMiddlewareHybrid, teamCalendarController.deleteEvent);
// router.patch('/calendar/:eventId/attendance', authMiddlewareHybrid, teamCalendarController.updateAttendeeStatus); 

export default router;