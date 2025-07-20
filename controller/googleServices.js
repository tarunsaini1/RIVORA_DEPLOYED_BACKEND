import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';


class GoogleCalendarService {
    constructor(tokens) {
        this.oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            `${process.env.BACKEND_URL}/auth/google/callback`
        );
        this.oauth2Client.setCredentials(tokens);
        this.calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });
    }

    async listCalendars() {
        try {
            const response = await this.calendar.calendarList.list();
            return response.data.items;
        } catch (error) {
            console.error('Error fetching calendars:', error);
            throw error;
        }
    }

    async createEvent(calendarId, event) {
        try {
            const response = await this.calendar.events.insert({
                calendarId,
                requestBody: event,
            });
            return response.data;
        } catch (error) {
            console.error('Error creating event:', error);
            throw error;
        }
    }

    async listEvents(calendarId, timeMin, timeMax) {
        try {
            const response = await this.calendar.events.list({
                calendarId,
                timeMin: timeMin.toISOString(),
                timeMax: timeMax.toISOString(),
                singleEvents: true,
                orderBy: 'startTime',
            });
            return response.data.items;
        } catch (error) {
            console.error('Error fetching events:', error);
            throw error;
        }
    }

    async updateEvent(calendarId, eventId, event) {
        try {
            const response = await this.calendar.events.update({
                calendarId,
                eventId,
                requestBody: event,
            });
            return response.data;
        } catch (error) {
            console.error('Error updating event:', error);
            throw error;
        }
    }

    async deleteEvent(calendarId, eventId) {
        try {
            await this.calendar.events.delete({
                calendarId,
                eventId,
            });
            return true;
        } catch (error) {
            console.error('Error deleting event:', error);
            throw error;
        }
    }
}

export default GoogleCalendarService;