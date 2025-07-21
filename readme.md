🚀 RIVORA Backend
Welcome to the RIVORA backend server repository! This project powers the backend services for the RIVORA application, providing RESTful APIs, real-time socket communication, authentication, task/project management, and AI integration.

📁 Project Structure
bash
Copy
Edit
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
🧠 Key Features
🧑‍💻 Authentication & Authorization (OAuth & JWT)

🧠 AI-powered assistance via Google Generative AI

📁 Task & Project Management with calendar integration

🔔 Real-time Notifications using socket.io

📦 Cloud Uploads using Cloudinary

🧑‍🤝‍🧑 Team Collaboration Tools

📊 User Performance Analytics

📤 File Uploads (PDF, Word) with text extraction

⚙️ Technologies Used
Node.js, Express.js

MongoDB with Mongoose

Socket.io for real-time communication

Redis for session and pub/sub

Google OAuth & AI APIs

Multer, Cloudinary for file uploads

PDF parsing, Docx extraction

Nodemailer for email notifications

📦 Setup Instructions
1. Clone the Repository
bash
Copy
Edit
git clone https://github.com/yourusername/RIVORA_DEPLOYED_BACKEND.git
cd RIVORA_DEPLOYED_BACKEND
2. Install Dependencies
bash
Copy
Edit
npm install
3. Setup Environment Variables
Create a .env.local file with the following keys:

env
Copy
Edit
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
4. Run Development Server
bash
Copy
Edit
npm run server
🌐 API Overview
Method	Endpoint	Description
GET	/	Test endpoint
POST	/api/auth	OAuth & Auth routes
POST	/api/projects	Create project
GET	/api/tasks/:projectId	Get tasks for a project
POST	/api/tasks	Add task
POST	/api/ai/query	Send prompt to AI
POST	/api/invites/send	Send project invite
GET	/api/notifications	Fetch notifications
GET	/api/teams	Get team details

Note: Most routes require authentication (cookie or JWT-based).

🧩 Application Flow
1. User Authentication
User logs in via Google OAuth.

Backend verifies and stores session using Redis.

Session maintained via cookies.

2. Project/Task Management
User can create and assign tasks.

Subtasks are supported.

Calendar sync for deadline visualization.

3. Chat & Notification
Real-time messages using socket.io.

notificationSocket.js handles events and emits updates.

Notifications stored and served via Redis & DB.

4. AI Assistance
Users can query the AI (e.g., ask for suggestions, generate text).

Handled via route: /api/ai.

5. Performance Tracking
API /api/analytics/performance provides analytics.

Tracks user activity and task completion.

🧠 Key Files
server.js: Main file initializing all routes, socket, DB.

config/db.js: MongoDB connection logic.

Service/notificationSocket.js: Handles socket connection, heartbeat, notification broadcasting.

route/: Organized by feature (auth, project, task, chat, AI).

⚡ Socket.io Events (Live Features)
connect: On client connection

notify: Emit notification

message: Chat events

heartbeat: Custom health-check ping/pong

📁 Deployment
Deployed using Vercel:

vercel.json contains custom server config.

Uses node server.js as the main entry.

