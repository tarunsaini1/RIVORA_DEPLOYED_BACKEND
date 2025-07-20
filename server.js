import express from "express";
import connectDB from "./config/db.js";
import cors from "cors";
import dotenv from "dotenv";
import googleroute from "./route/googleroute.js";
import cookieParser from "cookie-parser";
import dashboard from "./route/dashboard.js";
import session from "express-session";
import redisClient from "./config/redis.js";
import authRoute from "./route/authRoute.js";
import projectRoute from "./route/projectRoute.js";
import invuteRoute from "./route/inviteRoute.js";
import taskRoute from "./route/taskRoute.js";
import subTaskRoute from  "./route/subTaskRoute.js";
import aiRoute from './route/aiRoute.js';
import chatRoute from './route/messageRoute.js'
import group from './route/group.js'
import profileUpdate from './route/profileUpdate.js'
import teamTaskCalendarRoute from './route/teamTaskCalendarRoute.js'
import connectionRoute from './route/connectionRoute.js'
import teamRoutes from './route/teamRoute.js'
import errorHandler from "./middleware/errorHandler.js";
import userPerformance from './route/userPerformance.js'
import StorageRoute from './route/StorageRoute.js'
import notificationRoute from './route/notificationRoute.js'
import { initializeSocket } from "./config/socketConfig.js";
import userControllerRoutes from './route/userControllerRoute.js'
import http from "http";
import { createServer } from "http";
import { Server } from 'socket.io';
import socketService from "./Service/notificationSocket.js";



connectDB();
dotenv.config();
const app = express();
app.use(express.json());

const server = createServer(app);
socketService.init(server);
socketService._setupHeartbeat();







app.use(cors({
    // origin: "http://localhost:5173",
    origin: process.env.CLIENT_URL || "https://aether-mind-frontend.vercel.app",
    credentials: true,
     methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization", "Cookie"]
  
}));



app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production', // true in production
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// redisClient.set('test', 'Hello Redis');
// redisClient.get('test').then(value => console.log('Test value:', value));



initializeSocket(server);
// socketService(server);  

app.get("/", (req, res) => { 
  res.send("Hello World!"); 
});

app.use(cookieParser());

app.use("/api/auth",googleroute);
app.use('/api', dashboard)
app.use('/api/auth', authRoute)
app.use('/api',googleroute)
app.use('/api',projectRoute)
app.use('/api/invites', invuteRoute)
app.use('/api/tasks', taskRoute)
app.use('/api', subTaskRoute)
app.use('/api/ai', aiRoute)
app.use('/api/chat', chatRoute)
app.use('/api', group)
app.use('/api/user', profileUpdate)
app.use('/api/connections', connectionRoute)
app.use('/api/teams', teamRoutes)
app.use('/api/analytics', userPerformance)
app.use('/api', StorageRoute)
app.use('/api', teamTaskCalendarRoute)
app.use('/api/notifications', notificationRoute);
app.use('/api/user', userControllerRoutes);

app.use(errorHandler);

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
