import { Server } from "socket.io";
import { socketAuthMiddleware } from '../authmiddleware/socketSuthMiddleware.js';
import Message from '../models/messge.js';
import dontenv from 'dotenv';
dontenv.config();

let io = null;
const onlineUsers = new Map();

export const initializeSocket = (server) => {
    if (io) return io;

    io = new Server(server, {
        cors: {
            // origin: "http://localhost:5173",
            origin: process.env.CLIENT_URL,
            methods: ["GET", "POST"],
            credentials: true,
            allowedHeaders: ["Cookie", "Content-Type"],
        },
        pingTimeout: 60000,
        pingInterval: 25000,
        transports: ['polling', 'websocket'],
        path: '/socket.io/',
        cookie: true,
        connectTimeout: 45000,
    });

    io.engine.on("connection_error", (err) => {
        console.log("Connection error:", err.req);
        console.log("Error message:", err.code, err.message);
    });

    io.use(socketAuthMiddleware);

    io.on("connection", (socket) => {
        console.log("New connection:", socket.id);
        
        console.log("Auth data:", {
            userId: socket.user?._id,
            cookiesPresent: !!socket.handshake.headers.cookie,
            transportType: socket.conn.transport.name
        });

        // Join project room on connection
        if (socket.handshake.query.projectId) {
            socket.join(socket.handshake.query.projectId);
            console.log(`User joined project ${socket.handshake.query.projectId}`);
        }
        
        // Then handle group join separately
        socket.on("joinGroup", (groupId) => {
            socket.join(groupId);
            console.log(`User joined group ${groupId}`);
        });

        socket.on("sendMessage", async (data) => {
            try {
                const { projectId, groupId, content, type = 'text', metadata = {} } = data;

                if (!projectId || !content) {
                    socket.emit('error', 'Invalid message data');
                    return;
                }

                // Create new message document
                const newMessage = new Message({
                    content: content,
                    sender: socket.user._id,
                    groupId: groupId,
                    projectId: projectId,
                    type: type,
                    metadata: metadata,
                    readBy: [{
                        userId: socket.user._id,
                        readAt: new Date()
                    }]
                });

                // Save to MongoDB
                await newMessage.save();

                // Populate sender details for the response
                const populatedMessage = await Message.findById(newMessage._id)
                    .populate('sender', '_id name email profilePicture')
                    .lean();

                // Broadcast to all users in the project room
                io.to(groupId).emit('receiveMessage', {
                    _id: populatedMessage._id,
                    content: populatedMessage.content,
                    sender: {
                        _id: populatedMessage.sender._id,
                        name: populatedMessage.sender.name,
                        profilePicture: populatedMessage.sender.profilePicture
                    },
                    projectId: populatedMessage.projectId,
                    type: populatedMessage.type,
                    metadata: populatedMessage.metadata,
                    readBy: populatedMessage.readBy,
                    createdAt: populatedMessage.createdAt
                });

            } catch (error) {
                console.error('Error saving message:', error);
                socket.emit('error', 'Failed to save message');
            }
        });

        socket.on("typing", ({ groupId, userId, username }) => {
            socket.to(groupId).emit("userTyping", { groupId, userId, username });
        });

        socket.on("stopTyping", ({ groupId, userId }) => {
            socket.to(groupId).emit("userStoppedTyping", { groupId, userId });
        });

        socket.on("disconnect", () => {
            const userData = onlineUsers.get(socket.id);
            if (userData) {
                userData.projects.forEach(projectId => {
                    socket.to(`project:${projectId}`).emit('userOffline', {
                        userId: userData.userId
                    });
                });
                onlineUsers.delete(socket.id);
                console.log(`User ${userData.userId} disconnected`, socket.id);
            }
        });

        socket.on('error', (error) => {
            console.error('Socket error:', error);
        });
    });

    return io;
};

export const getIO = () => {
    if (!io) {
        throw new Error('Socket.IO not initialized');
    }
    return io;
};

