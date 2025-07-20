import express from "express";
import authMiddlewareHybrid from "../authmiddleware/authMiddleware.js";


const router = express.Router();

router.get("/dashboard", authMiddlewareHybrid, (req, res) => {
  res.json({ message: `${req.user.name}` });
});

export default router;