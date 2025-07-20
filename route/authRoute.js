import express from "express";
import rateLimit from "express-rate-limit";
import {body} from  "express-validator";

import {
  
  register,
  login,
  logout,
  getUser,
  resetPassword,
  forgotPassword,
  verifyEmail,
  refresh
} from "../controller/authController.js";     
import { validateRequest } from "../authmiddleware/validateRequest.js";
import authMiddleware from "../authmiddleware/authMiddleware.js"
import authMiddlewareHybrid from "../authmiddleware/authMiddleware.js";

const router = express.Router();

const createRateLimiter = (windowMs, max, message) => rateLimit({
    windowMs,
    max,
    message,
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    skipSuccessfulRequests: true // Don't count successful requests
});

const authLimiters = {
    login: createRateLimiter(
        15 * 60 * 1000, // 15 minutes
        20, // 5 attempts
        "Too many login attempts. Please try again later."
    ),
    
    register: createRateLimiter(
        60 * 60 * 1000, // 1 hour
        20, // 3 attempts
        "Too many registration attempts. Please try again later."
    ),
    
    passwordReset: createRateLimiter(
        60 * 60 * 1000, // 1 hour
        20, // 3 attempts
        "Too many password reset requests. Please try again later."
    ),
    
    emailVerification: createRateLimiter(
        60 * 60 * 1000, // 1 hour
        20, // 5 attempts
        "Too many verification attempts. Please try again later."
    )
};

const validationSchemas = {
    register: [
        body("username")
            .trim()
            .notEmpty().withMessage("Username is required")
            .isLength({ min: 3, max: 30 }).withMessage("Username must be between 3 and 30 characters")
            .matches(/^[a-zA-Z0-9_]+$/).withMessage("Username can only contain letters, numbers and underscores"),
        body("name")
            .trim()
            .notEmpty().withMessage("Name is required")
            .isLength({ min: 2, max: 50 }).withMessage("Name must be between 2 and 50 characters"),
        body("email")
            .trim()
            .isEmail().withMessage("Valid email is required")
            .normalizeEmail(),
        body("password")
            .isLength({ min: 8 }).withMessage("Password must be at least 8 characters")
            .matches(/^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d@$!%*#?&]+$/)
            .withMessage("Password must contain at least one letter and one number")
    ],
    
    login: [
        body("email")
            .trim()
            .isEmail().withMessage("Valid email is required")
            .normalizeEmail(),
        body("password")
            .notEmpty().withMessage("Password is required")
    ],
    
    passwordReset: [
        body("token")
            .trim()
            .notEmpty().withMessage("Token is required"),
        body("newPassword")
            .isLength({ min: 8 }).withMessage("Password must be at least 8 characters")
            .matches(/^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d@$!%*#?&]/)
            .withMessage("Password must contain at least one letter and one number")
    ],
    
    emailVerification: [
        body("token")
            .trim()
            .notEmpty().withMessage("Verification token is required")
    ]
};



router.post("/register", 
    // authLimiters.register,
    // validationSchemas.register,
    // validateRequest,
    register
);

router.post("/login",
    authLimiters.login,
    // validationSchemas.login,
    validateRequest,
    login
);

//Google OAuth



router.post("/forgot-password",
    authLimiters.passwordReset,
    [body("email").isEmail().withMessage("Valid email is required").normalizeEmail()],
    validateRequest,
    forgotPassword
);

router.post("/reset-password",
    authLimiters.passwordReset,
    validationSchemas.passwordReset,
    validateRequest,
    resetPassword
);

// Email verification route
router.post("/verify-email",
    authLimiters.emailVerification,
    validationSchemas.emailVerification,
    validateRequest,
    verifyEmail
);

// Protected routes
router.use(authMiddlewareHybrid); // Apply auth middleware to all routes below

router.get("/user", getUser);
router.post("/logout", logout);
router.post("/refresh", refresh);

// Error handling
router.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({
        message: "Something went wrong!",
        error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

export default router;
