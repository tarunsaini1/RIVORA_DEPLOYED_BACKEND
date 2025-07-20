// import express from "express";
// import cookieParser from "cookie-parser";
// import cors from "cors";
// import http from "http";
// import connectDB from "./config/db.js";
// import redisClient from "./config/redis.js";
// import { auth } from "google-auth-library";
// import authRoute from "./routes/authRoute.js";

// const PORT=4000;
// const app = express();
// app.use(express.json());
// app.use(cors(
//     {
//         origin: "http://localhost:5173",
//         credentials: true,
//     }
// ));
// app.use(cookieParser());
// connectDB();
// // redisClient();

// app.get("/", (req, res) => {
//     res.send("Hello World");
// });

// app.listen(PORT, () => {
//     console.log(`Server is running on port ${PORT}`);
// });


// app.use('/api/auth',authRoute);
// // server.listen(PORT, () => {
// //   console.log(`Server is running on port ${PORT}`);
// // });