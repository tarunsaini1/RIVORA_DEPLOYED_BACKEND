
# 🚀 RIVORA Backend

Welcome to the **RIVORA** backend server repository! This project powers the backend services for the RIVORA application, providing RESTful APIs, real-time socket communication, authentication, task/project management, and AI integration.

---

## 📁 Project Structure

```text
RIVORA_DEPLOYED_BACKEND-main/
│
├── config/                 # Configuration files (DB, Redis, Cloudinary, Nodemailer, etc.)
├── route/                  # API route handlers for various modules
├── Service/                # Custom services like sockets, notification handling
├── authmiddleware/         # Middlewares for authentication and validation
├── middleware/             # Global error handlers, etc.
├── .env.local              # Environment-specific secrets/configs
├── server.js               # Main entry point of the application
├── package.json            # Project dependencies and scripts
└── vercel.json             # Vercel deployment configuration
```

---

## 🧠 Key Features

- 🧑‍💻 **Authentication & Authorization** (OAuth & JWT)
- 🧠 **AI-powered assistance** via Google Generative AI
- 📁 **Task & Project Management** with calendar integration
- 🔔 **Real-time Notifications** using socket.io
- 📦 **Cloud Uploads** using Cloudinary
- 🧑‍🤝‍🧑 **Team Collaboration Tools**
- 📊 **User Performance Analytics**
- 📤 **File Uploads** (PDF, Word) with text extraction

---

## ⚙️ Technologies Used

- **Node.js**, **Express.js**
- **MongoDB** with Mongoose
- **Socket.io** for real-time communication
- **Redis** for session management and pub/sub
- **Google OAuth & Generative AI APIs**
- **Multer**, **Cloudinary** for file uploads
- **PDF Parsing**, **DOCX Extraction**
- **Nodemailer** for email notifications

---

## 📦 Setup Instructions

### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/RIVORA_DEPLOYED_BACKEND.git
cd RIVORA_DEPLOYED_BACKEND
```
### 2. Install Dependencies
npm install
### 3. Setup Environment Variables
Create a .env.local file in the root directory and add:
```bash
PORT=4000
MONGO_URI=your_mongo_connection_string
SESSION_SECRET=your_secret
CLIENT_URL=https://your-frontend-url.com
CLOUDINARY_NAME=your_cloudinary_name
CLOUDINARY_API_KEY=your_cloudinary_key
CLOUDINARY_API_SECRET=your_cloudinary_secret
REDIS_URL=your_redis_url
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
JWT_SECRET=your_jwt_secret
```
### 4. Run Development Server

npm run server


🌐 ## 🌐 API Overview

| Method | Endpoint               | Description                    |
|--------|------------------------|--------------------------------|
| GET    | `/`                    | Test endpoint                  |
| POST   | `/api/auth`            | OAuth & Auth routes            |
| POST   | `/api/projects`        | Create project                 |
| GET    | `/api/tasks/:projectId`| Get tasks for a project        |
| POST   | `/api/tasks`           | Add task                       |
| POST   | `/api/ai/query`        | Send prompt to AI              |
| POST   | `/api/invites/send`    | Send project invite            |
| GET    | `/api/notifications`   | Fetch notifications            |
| GET    | `/api/teams`           | Get team details               |


🔐 Note: Most routes require authentication (cookie or JWT-based).

🧩## 🧩 Application Flow

1. **User Authentication**
   - User logs in via **Google OAuth**
   - Backend verifies token and stores session using **Redis**
   - Session maintained using **cookies**

2. **Project/Task Management**
   - Users can create & assign tasks
   - Subtasks supported
   - Calendar sync for deadlines

3. **Chat & Notification**
   - Real-time chat using **Socket.io**
   - `notificationSocket.js` handles events
   - Notifications stored & served using **Redis + MongoDB**

4. **AI Assistance**
   - Users can query AI for help (generate text, suggestions)
   - Uses `/api/ai` endpoint

5. **Performance Tracking**
   - Endpoint `/api/analytics/performance` provides analytics
   - Tracks user activity & task completion

---

## 🧠 Key Files

- `server.js` — Entry point, initializes DB, routes, and sockets
- `config/db.js` — MongoDB connection
- `Service/notificationSocket.js` — Socket connections & events
- `route/` — Organized feature routes (auth, task, chat, ai, etc.)

---

## ⚡ Socket.io Events (Live Features)

| Event Name | Description                       |
|------------|-----------------------------------|
| connect    | On client connection              |
| notify     | Emit notification                 |
| message    | Chat messages                     |
| heartbeat  | Custom health-check ping/pong     |




## 📁 Deployment

- Deployed on **Vercel**
- Custom server configured using `vercel.json`
- Uses `server.js` as the entry point

---

## 🛠️ Future Improvements

- Admin panel for user/project management
- Role-based access control (RBAC)
- Rate limiting and throttling
- Unit and integration tests
