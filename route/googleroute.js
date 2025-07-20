import express from "express";
import { google } from "googleapis";
import User from '../models/User.js';  // Add this import
// import { insertCalendarEvent, listCalendarEvents } from "../controller/googleServices.js";
import authMiddlewareHybrid from "../authmiddleware/authMiddleware.js";
import GoogleCalendarService from "../controller/googleServices.js";
import { googleAuth, googleAuthCallback, logout } from "../controller/google.js";

const router = express.Router();

router.get("/google", googleAuth);
router.get("/google/callback", googleAuthCallback);
// router.get('logout',logout);

//Calender endpoints



// Helper function to get calendar service instance
const getCalendarService = async (userId) => {
    const user = await User.findById(userId);
    if (!user || !user.googleAccessToken) {
        throw new Error('User not authenticated with Google Calendar');
    }

    return new GoogleCalendarService({
        access_token: user.googleAccessToken,
        refresh_token: user.googleRefreshToken,
        expiry_date: user.googleTokenExpiry
    });
};

// List all calendars
router.get('/calendars', authMiddlewareHybrid, async (req, res) => {
    try {
        const calendarService = await getCalendarService(req.user.id);
        const calendars = await calendarService.listCalendars();
        res.json({ success: true, calendars });
    } catch (error) {
        console.error('Calendar list error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to fetch calendars',
            error: error.message 
        });
    }
});

// Create calendar event
router.post('/events', authMiddlewareHybrid, async (req, res) => {
    try {
        const { calendarId, event } = req.body;
        
        if (!calendarId || !event) {
            return res.status(400).json({ 
                success: false, 
                message: 'Calendar ID and event details are required' 
            });
        }

        const calendarService = await getCalendarService(req.user.id);
        const createdEvent = await calendarService.createEvent(calendarId, event);
        
        res.json({ success: true, event: createdEvent });
    } catch (error) {
        console.error('Event creation error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to create event',
            error: error.message 
        });
    }
});

// List events for a specific calendar
router.get('/events', authMiddlewareHybrid, async (req, res) => {
    try {
        const { calendarId, timeMin, timeMax } = req.query;
        
        if (!calendarId || !timeMin || !timeMax) {
            return res.status(400).json({ 
                success: false, 
                message: 'Calendar ID and time range are required' 
            });
        }

        const calendarService = await getCalendarService(req.user.id);
        const events = await calendarService.listEvents(
            calendarId,
            new Date(timeMin),
            new Date(timeMax)
        );
        
        res.json({ success: true, events });
    } catch (error) {
        console.error('Event list error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to fetch events',
            error: error.message 
        });
    }
});

// Update an event
router.put('/events/:eventId', authMiddlewareHybrid, async (req, res) => {
    try {
        const { calendarId, event } = req.body;
        const { eventId } = req.params;
        
        if (!calendarId || !event || !eventId) {
            return res.status(400).json({ 
                success: false, 
                message: 'Calendar ID, event ID, and event details are required' 
            });
        }

        const calendarService = await getCalendarService(req.user.id);
        const updatedEvent = await calendarService.updateEvent(calendarId, eventId, event);
        
        res.json({ success: true, event: updatedEvent });
    } catch (error) {
        console.error('Event update error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to update event',
            error: error.message 
        });
    }
});

// Delete an event
router.delete('/events/:eventId', authMiddlewareHybrid, async (req, res) => {
    try {
        const { calendarId } = req.query;
        const { eventId } = req.params;
        
        if (!calendarId || !eventId) {
            return res.status(400).json({ 
                success: false, 
                message: 'Calendar ID and event ID are required' 
            });
        }

        const calendarService = await getCalendarService(req.user.id);
        await calendarService.deleteEvent(calendarId, eventId);
        
        res.json({ success: true, message: 'Event deleted successfully' });
    } catch (error) {
        console.error('Event deletion error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to delete event',
            error: error.message 
        });
    }
});

// Create project-specific calendar event
router.post('/projects/:projectId/events', authMiddlewareHybrid, async (req, res) => {
    try {
        const { projectId } = req.params;
        const { event } = req.body;

        // Get user with project
        const user = await User.findById(req.user.id);
        const project = user.projects.find(p => p.projectId.toString() === projectId);

        if (!project || !project.calendarId) {
            return res.status(404).json({ 
                success: false, 
                message: 'Project not found or calendar not enabled for this project' 
            });
        }

        const calendarService = await getCalendarService(req.user.id);
        const createdEvent = await calendarService.createEvent(project.calendarId, event);
        
        res.json({ success: true, event: createdEvent });
    } catch (error) {
        console.error('Project event creation error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to create project event',
            error: error.message 
        });
    }
});

export default router;

