import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import redisClient from '../config/redis.js';
import dotenv from 'dotenv';
import crypto from 'crypto';
import transporter from '../config/nodemailer.js';



dotenv.config();

const CACHE_EXPIRY = 3600;
const EMAIL_TOKEN_EXPIRY = 24 * 60 * 60 * 1000;
const PASSWORD_RESET_EXPIRY = 60 * 60 * 1000;

// Helper function to send emails remains the same
const sendEmail = async (to, subject, html) => {
    try {
        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to,
            subject,
            html
        });
    } catch (error) {
        console.error('Email sending error:', error);
        throw new Error('Email sending failed');
    }
};

// Helper function to generate tokens
const generateTokens = (userId) => {
    const accessToken = jwt.sign({userId}, process.env.JWT_SECRET, {expiresIn: "1d"}); // 1 day
    const refreshToken = jwt.sign({userId}, process.env.JWT_REFRESH_SECRET, {expiresIn: "7d"}); // 7 days and store in cookie
    return { accessToken, refreshToken };
};


// Modified register function to include authType
export const register = async (req, res) => {
    console.log("Request Body:", req.body);
    const { username, name, email, password } = req.body;

    if(!username || !name || !email || !password){
        return res.status(400).json({message: "Please fill all fields"});
    }

    try {
        const normalizedEmail = email.toLowerCase();
        const existingUser = await User.findOne({email: normalizedEmail});

        if(existingUser){
            return res.status(400).json({
                message: existingUser.authType === 'google' ? 
                    "This email is registered with Google. Please login with Google." : 
                    "User already exists"
            });
        }   

        const hashedPassword = await bcrypt.hash(password, 10);
        const emailVerificationToken = crypto.randomBytes(32).toString('hex');
        const emailVerificationExpiry = new Date(Date.now() + EMAIL_TOKEN_EXPIRY);

        const newUser = new User({
            username,
            name,
            email: normalizedEmail,
            password: hashedPassword,
            emailVerificationToken,
            emailVerificationExpiry,
            isVerified: false,
            authType: 'email'
        });

        await newUser.save();

        // Rest of the register function remains the same...
        // Send verification email
        const verificationUrl = `${process.env.FRONTEND_URL}/verify-email?token=${emailVerificationToken}`;
        await sendEmail(
            normalizedEmail,
            'Verify Your Email',
            `Please click <a href="${verificationUrl}">here</a> to verify your email. This link expires in 24 hours.`
        );

        const userToCache = {
            ...newUser.toObject(),
            password: undefined,
            emailVerificationToken: undefined
        };

        await redisClient.set(`user:${newUser._id}`, JSON.stringify(userToCache), {EX: CACHE_EXPIRY});

        const { accessToken, refreshToken } = generateTokens(newUser._id);

        res.cookie("refreshToken", refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "None",
            maxAge: 7 * 24 * 60 * 60 * 1000
        });

        res.status(201).json({
            message: "User created successfully. Please verify your email.",
            accessToken
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Something went wrong" });
    }
};

// Modified login function to handle different auth types
export const login = async (req, res) => {
    const { email, password } = req.body;
    if(!email || !password){
        return res.status(400).json({message: "Please fill all fields"});
    }

    try {
        const normalizedEmail = email.toLowerCase();
        const existingUser = await User.findOne({email: normalizedEmail});
        
        if(!existingUser){
            return res.status(400).json({message: "Invalid credentials"});
        }

        // Check if user is registered with Google
        // if(existingUser.authType === 'google') {
        //     return res.status(400).json({
        //         message: "This email is registered with Google. Please login with Google."
        //     });
        // }

        if (!existingUser.isVerified) {
            return res.status(400).json({message: "Please verify your email before logging in"});
        }

        const isPasswordCorrect = await bcrypt.compare(password, existingUser.password);
        if(!isPasswordCorrect){
            return res.status(400).json({message: "Invalid credentials"});
        }

        const userToCache = {
            ...existingUser.toObject(),
            password: undefined
        };
        // await redisClient.set(`user:${existingUser._id}`, JSON.stringify(userToCache), {EX: CACHE_EXPIRY});

             try {
            await redisClient.set(
                `user:${existingUser._id}`, 
                JSON.stringify(userToCache), 
                { EX: CACHE_EXPIRY }
            );
        } catch (redisError) {
            console.error('Redis cache error:', redisError);
            // Continue without caching
        }

        const { accessToken, refreshToken } = generateTokens(existingUser._id);

         res.cookie('token', accessToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'None',
            maxAge: 24 * 60 * 60 * 1000 // 1 day
        });


        res.cookie("refreshToken", refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "None",
            maxAge: 7 * 24 * 60 * 60 * 1000
        });
        console.log('Login successful for:', normalizedEmail);

        res.status(200).json({
            message: "Logged in successfully",
            accessToken,
            user: userToCache
        });
        
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Something went wrong" });
    }
};

export const logout = async (req, res) => {
    try {
        console.log('Logout Request:', req.body);
        // Get user ID from token instead of requiring it in body
        const userId = req.user?.userId || req.user?.id || req.body.userId;
        
        // Clear Redis cache if userId is available
        if (userId) {
            try {
                await redisClient.del(`user:${userId}`);
            } catch (redisError) {
                console.error('Redis error during logout:', redisError);
                // Continue with logout even if Redis fails
            }
        }
        
        // Clear ALL relevant cookies - note you're missing 'refreshToken'!
        const cookiesToClear = ['token', 'refreshToken', 'connect.sid', '__refresh_yMT98QO8'];
        
        const cookieOptions = {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'None',
            path: '/'
        };
        
        cookiesToClear.forEach(cookieName => {
            res.clearCookie(cookieName, cookieOptions);
        });
        
        // Destroy session if using sessions
        if (req.session) {
            req.session.destroy(err => {
                if (err) console.error('Session destruction error:', err);
            });
        }

        res.status(200).json({ 
            success: true,
            message: 'Logged out successfully' 
        });
        
    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({ message: "Something went wrong" });
    }
};

export const getUser = async (req, res) => {

    // console.log('GetUser Request Headers:', req.headers);
    // console.log('GetUser Request Cookies:', req.cookies);
    // console.log('GetUser Request User:', req.user);

    try {
        // Use the userId from the decoded token stored in req.user
        const userId = req.user.userId || req.user.id;  // <-- fixed: use req.user.userId
        if(!userId){
            return res.status(401).json({ message: "user Id not found" });
        }

        const cachedUser = await redisClient.get(`user:${userId}`);
        if(cachedUser){
            return res.status(200).json({user: JSON.parse(cachedUser)});
        }

        const user = await User.findById(userId);
        if(!user){
            return res.status(404).json({message: "User not found"});
        }

        const userToCache = {
            ...user.toObject(),
            password: undefined
        };
        try {
             await redisClient.set(
                `user:${userId}`, 
                JSON.stringify(userToSend),  // 🚨 Error here!
                { EX: CACHE_EXPIRY }
            );
            console.log('User cached successfully');
        } catch (redisError) {
            console.error('Redis caching error:', redisError);
            // Continue without caching
        }

        // console.log('User found:', userToCache);
        
        res.status(200).json({user: userToCache});
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Something went wrong" });
    }
};

export const resetPassword = async (req, res) => {
    const { token, newPassword } = req.body;

    try {
        const user = await User.findOne({
            passwordResetToken: token,
            passwordResetExpiry: { $gt: Date.now() }
        });

        if (!user) {
            return res.status(400).json({ message: "Invalid or expired reset token" });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 12);
        user.password = hashedPassword;
        user.passwordResetToken = undefined;
        user.passwordResetExpiry = undefined;
        await user.save();

        // Update cache
        const userToCache = {
            ...user.toObject(),
            password: undefined
        };
        await redisClient.set(`user:${user._id}`, JSON.stringify(userToCache), {EX: CACHE_EXPIRY});

        res.status(200).json({ message: "Password reset successful" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Something went wrong" });
    }
};

export const forgotPassword = async (req, res) => {
    const { email } = req.body;
    console.log('Forgot Password Request:', email);

    try {
        const normalizedEmail = email.toLowerCase();
        const user = await User.findOne({ email: normalizedEmail });
        console.log('User found:', user);

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        const resetToken = crypto.randomBytes(32).toString('hex');
        const resetTokenExpiry = new Date(Date.now() + PASSWORD_RESET_EXPIRY);

        user.passwordResetToken = resetToken;
        user.passwordResetExpiry = resetTokenExpiry;
        await user.save();

        // Send password reset email
        const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
        await sendEmail(
            normalizedEmail,
            'Reset Your Password',
            `Please click <a href="${resetUrl}">here</a> to reset your password. This link expires in 1 hour.`
        );

        res.status(200).json({ message: "Password reset link sent to email" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Something went wrong" });
    }
};

export const verifyEmail = async (req, res) => {
    const token = req.query.token || req.body.token;
    console.log('Verify Email Request:', token);

    try {
        const user = await User.findOne({
            emailVerificationToken: token,
            emailVerificationExpiry: { $gt: Date.now() }
        });

        if (!user) {
            return res.status(400).json({ message: "Invalid or expired verification token" });
        }

        user.isVerified = true;
        user.emailVerificationToken = undefined;
        user.emailVerificationExpiry = undefined;
        await user.save();

        // Update cache
        const userToCache = {
            ...user.toObject(),
            password: undefined
        };
        await redisClient.set(`user:${user._id}`, JSON.stringify(userToCache), {EX: CACHE_EXPIRY});

       res.status(200).json({ 
            success: true,
            message: "Email verified successfully" 
        });
        
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Something went wrong" });
    }
};

export const refresh = async (req, res) => {
    try {
        // Get refresh token from cookie
        const refreshToken = req.cookies.refreshToken;
        
        if (!refreshToken) {
            return res.status(401).json({ message: "Refresh token is missing" });
        }
        
        // Verify refresh token
        const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
        
        // Find user (optional extra security)
        const user = await User.findById(decoded.userId);
        if (!user) {
            return res.status(401).json({ message: "User not found" });
        }
        
        // Generate new tokens
        const newAccessToken = jwt.sign(
            { userId: decoded.userId },
            process.env.JWT_SECRET,
            { expiresIn: "1d" }
        );
        
        const newRefreshToken = jwt.sign(
            { userId: decoded.userId },
            process.env.JWT_REFRESH_SECRET,
            { expiresIn: "7d" }
        );
        
        // Set new refresh token cookie
        res.cookie("refreshToken", newRefreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "None",
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
        });
        
        // Send new access token
        return res.status(200).json({ 
            accessToken: newAccessToken,
            message: "Token refreshed successfully"
        });
    } catch (error) {
        console.error("Refresh token error:", error);
        
        // Clear cookies on error
        res.clearCookie("refreshToken");
        res.clearCookie("token");
        
        return res.status(401).json({ message: "Invalid refresh token" });
    }
};
//handling redis errors
redisClient.on("error", (error) => {
    console.error("Redis error:", error);
});