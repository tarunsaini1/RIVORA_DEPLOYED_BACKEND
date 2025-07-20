import express from 'express';
import authMiddlewareHybrid from '../authmiddleware/authMiddleware.js';
import { getUserPerformanceReport, generatePerformanceReport } from '../controller/userPerformance.js';
// import { auth } from 'google-auth-library';
// import * as teamTaskController from '../controller/teamTask.js';
// import * as teamCalendarController from '../controller/CalendarTask.js';

const router = express.Router();

router.get('/user-performance', authMiddlewareHybrid, getUserPerformanceReport);
router.post('/user-performance/generate', authMiddlewareHybrid, generatePerformanceReport);

// // Team Task Routes
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