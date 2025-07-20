import jwt from "jsonwebtoken";
import User from "../models/User.js";

const authMiddlewareHybrid = async (req, res, next) => {
    try {
        // console.log("Auth Middleware Check:", {
        //     cookies: req.cookies,
        //     authHeader: req.headers["authorization"]
        // });

        let token;
        let secret;

        // Check for Bearer token in Authorization header
        if (req.headers["authorization"]) {
            const authHeader = req.headers["authorization"];
            token = authHeader.split(" ")[1];
            secret = process.env.JWT_SECRET;
        } else if (req.cookies && req.cookies.token) {
            token = req.cookies.token;
            secret = process.env.JWT_SECRET;
        } else if (req.cookies && req.cookies.refreshToken) {
            token = req.cookies.refreshToken;
            secret = process.env.JWT_REFRESH_SECRET;
        }

        // console.log("Token found:", !!token);

        if (!token) {
            // console.log("No token provided");
            return res.status(401).json({
                success: false,
                message: "Access denied. No token provided."
            });
        }

        const verified = jwt.verify(token, secret);
        // console.log("Token verified:", verified);

        const user = await User.findById(verified.id || verified.userId);
        if (!user) {
            return res.status(401).json({
                success: false,
                message: "User not found"
            });
        }

        // Set the complete user object in req.user
        req.user = user;
        next();

    } catch (err) {
        console.error("Token verification failed:", err.message);
        return res.status(401).json({
            success: false,
            message: "Invalid or expired token",
            // error: process.env.NODE_ENV === "development" ? err.message : undefined
        });
    }
};

export default authMiddlewareHybrid;
