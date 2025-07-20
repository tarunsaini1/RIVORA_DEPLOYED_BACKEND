import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import redisClient from '../config/redis.js';

import GoogleCalendarService from './googleServices.js';

// Ensure proper dotenv configuration
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../../.env') });

// Debug environment variables
const CACHE_EXPIRY = 3600;
const EMAIL_TOKEN_EXPIRY = 24 * 60 * 60 * 1000;
const PASSWORD_RESET_EXPIRY = 60 * 60 * 1000;


const client = new OAuth2Client({
  clientId: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  redirectUri: `${process.env.BACKEND_URL}/auth/google/callback`
});

// export const googleAuth = (req, res) => {
//      const state = crypto.randomBytes(16).toString('hex');


//   // Store state in session
//   req.session.oauthState = state;
//   const redirectUrl = `https://accounts.google.com/o/oauth2/auth?client_id=${process.env.GOOGLE_CLIENT_ID}&redirect_uri=${process.env.BACKEND_URL}/auth/google/callback&response_type=code&scope=email profile`;
//   res.redirect(redirectUrl);

// };

export const googleAuth = (req, res) => {
  // Generate a random state for CSRF protection
  const state = crypto.randomBytes(16).toString('hex');

  // Define the scopes including Google Calendar access
  const googleScopes = [
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://www.googleapis.com/auth/calendar'
  ];

  // Store the state in session for later validation in the callback
  req.session.oauthState = state;

  // Construct the Google OAuth URL
  const redirectUrl = `https://accounts.google.com/o/oauth2/auth?` +
    `client_id=${process.env.GOOGLE_CLIENT_ID}` +
    `&redirect_uri=${encodeURIComponent(process.env.BACKEND_URL + '/auth/google/callback')}` +
    `&response_type=code` +
    `&scope=${encodeURIComponent(googleScopes.join(' '))}` +
    `&state=${state}`;

  // Redirect the user to the Google OAuth consent screen
  res.redirect(redirectUrl);
};

// export const googleAuthCallback = async (req, res) => {
//     const { code } = req.query;

//     if (!code) {
//         return res.status(400).json({ success: false, message: "No code provided" });
//     }

//     try {
//         const { tokens } = await client.getToken(code);
        
//         // Verify token and get user info
//         const ticket = await client.verifyIdToken({
//             idToken: tokens.id_token,
//             audience: process.env.GOOGLE_CLIENT_ID,
//         });
        
//         const payload = ticket.getPayload();
//         let user = await User.findOne({ googleId: payload.sub });

//         // Initialize Google Calendar service
//         const calendarService = new GoogleCalendarService(tokens);
        
//         // Fetch user's calendars
//         const calendars = await calendarService.listCalendars();
//         const primaryCalendar = calendars.find(cal => cal.primary);

//         // Calculate token expiry properly
//         let tokenExpiry = null;
//         if (tokens.expiry_date) {
//             tokenExpiry = new Date(tokens.expiry_date);
//         } else if (tokens.expires_in) {
//             tokenExpiry = new Date(Date.now() + tokens.expires_in * 1000);
//         }

//         // Verify tokenExpiry is valid before using it
//         if (!(tokenExpiry instanceof Date && !isNaN(tokenExpiry))) {
//             console.warn('Invalid token expiry, setting default expiry');
//             tokenExpiry = new Date(Date.now() + 3600 * 1000); // 1 hour default
//         }

//         const updateData = {
//             authProvider: "google",
//             isVerified: true,
//             googleAccessToken: tokens.access_token,
//             googleRefreshToken: tokens.refresh_token,
//             googleTokenExpiry: tokenExpiry,
//             'preferences.calendarSettings': {
//                 enabled: true,
//                 syncEnabled: true,
//                 primaryCalendarId: primaryCalendar?.id || 'primary',
//                 defaultReminders: primaryCalendar?.defaultReminders || [],
//                 workingHours: {
//                     start: "09:00",
//                     end: "17:00",
//                     workDays: [1, 2, 3, 4, 5]
//                 }
//             }
//         };

//         if (user) {
//             // Update existing user
//             await User.findByIdAndUpdate(user._id, {
//                 $set: updateData,
//                 $setOnInsert: {
//                     username: payload.email.split("@")[0],
//                     name: payload.name,
//                     email: payload.email,
//                     profilePicture: payload.picture || ""
//                 }
//             }, { new: true, upsert: true });
//         } else {
//             // Create new user
//             user = await User.create({
//                 ...updateData,
//                 googleId: payload.sub,
//                 username: payload.email.split("@")[0],
//                 name: payload.name,
//                 email: payload.email,
//                 profilePicture: payload.picture || ""
//             });
//         }

//         // Generate JWT token
//         const jwtToken = jwt.sign(
//             { id: user._id, name: user.name, email: user.email },
//             process.env.JWT_SECRET,
//             { expiresIn: "7d" }
//         );

//         // Set cookie and redirect
//         res.cookie("token", jwtToken, {
//             httpOnly: true,
//             secure: process.env.NODE_ENV === "production",
//             sameSite: "None",
//             maxAge: 7 * 24 * 60 * 60 * 1000,
//         });

//         res.redirect(`${process.env.FRONTEND_URL}/dashboard`);

//     } catch (error) {
//         console.error('Google OAuth Error:', error);
//         return res.status(400).json({
//             success: false,
//             message: "Authentication failed",
//             error: error.response?.data?.error_description || error.message
//         });
//     }
// };

export const googleAuthCallback = async (req, res) => {
    const { code } = req.query;

    if (!code) {
        return res.status(400).json({ success: false, message: "No code provided" });
    }

    try {
        const { tokens } = await client.getToken(code);
        
        // Verify token and get user info
        const ticket = await client.verifyIdToken({
            idToken: tokens.id_token,
            audience: process.env.GOOGLE_CLIENT_ID,
        });
        
        const payload = ticket.getPayload();
        
        // First try to find user by googleId, then by email as fallback
        let user = await User.findOne({ googleId: payload.sub });
        
        // If user not found by googleId, try finding by email
        if (!user) {
            user = await User.findOne({ email: payload.email });
        }

        // Initialize Google Calendar service
        const calendarService = new GoogleCalendarService(tokens);
        
        // Fetch user's calendars
        const calendars = await calendarService.listCalendars();
        const primaryCalendar = calendars.find(cal => cal.primary);

        // Calculate token expiry properly
        let tokenExpiry = null;
        if (tokens.expiry_date) {
            tokenExpiry = new Date(tokens.expiry_date);
        } else if (tokens.expires_in) {
            tokenExpiry = new Date(Date.now() + tokens.expires_in * 1000);
        }

        // Verify tokenExpiry is valid before using it
        if (!(tokenExpiry instanceof Date && !isNaN(tokenExpiry))) {
            console.warn('Invalid token expiry, setting default expiry');
            tokenExpiry = new Date(Date.now() + 3600 * 1000); // 1 hour default
        }

        const updateData = {
            authProvider: "google",
            googleId: payload.sub, // Make sure googleId is set when updating by email
            isVerified: true,
            googleAccessToken: tokens.access_token,
            googleRefreshToken: tokens.refresh_token,
            googleTokenExpiry: tokenExpiry,
            'preferences.calendarSettings': {
                enabled: true,
                syncEnabled: true,
                primaryCalendarId: primaryCalendar?.id || 'primary',
                defaultReminders: primaryCalendar?.defaultReminders || [],
                workingHours: {
                    start: "09:00",
                    end: "17:00",
                    workDays: [1, 2, 3, 4, 5]
                }
            }
        };

        if (user) {
            // Update existing user
            user = await User.findByIdAndUpdate(user._id, {
                $set: updateData,
                $setOnInsert: {
                    username: payload.email.split("@")[0],
                    name: payload.name,
                    email: payload.email,
                    profilePicture: payload.picture || ""
                }
            }, { new: true });
        } else {
            // Create new user
            user = await User.create({
                ...updateData,
                googleId: payload.sub,
                username: payload.email.split("@")[0],
                name: payload.name,
                email: payload.email,
                profilePicture: payload.picture || ""
            });
        }

        // Generate JWT token
        const jwtToken = jwt.sign(
            { id: user._id, name: user.name, email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: "7d" }
        );

        // Set cookie and redirect
        res.cookie("token", jwtToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "None",
            maxAge: 7 * 24 * 60 * 60 * 1000,
        });

        res.redirect(`${process.env.FRONTEND_URL}/dashboard`);

    } catch (error) {
        console.error('Google OAuth Error:', error);
        
        // Redirect to frontend with error
        if (process.env.FRONTEND_URL) {
            return res.redirect(`${process.env.FRONTEND_URL}/auth/error?message=${encodeURIComponent("Authentication failed. Please try again.")}`);
        }
        
        return res.status(400).json({
            success: false,
            message: "Authentication failed",
            error: error.response?.data?.error_description || error.message
        });
    }
};

export const logout = (req, res) => {
  res.clearCookie("token");
  res.json({ message: "Logged out successfully" });
};