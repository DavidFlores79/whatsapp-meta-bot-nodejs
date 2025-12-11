const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Agent = require('../models/Agent');

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = '8h';
const REFRESH_TOKEN_EXPIRES_IN = '7d';

/**
 * Hash password using bcrypt
 */
async function hashPassword(password) {
    return await bcrypt.hash(password, 10);
}

/**
 * Compare password with hash
 */
async function comparePassword(password, hash) {
    return await bcrypt.compare(password, hash);
}

/**
 * Generate JWT access token
 */
function generateAccessToken(agent) {
    return jwt.sign(
        {
            id: agent._id,
            email: agent.email,
            role: agent.role
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
    );
}

/**
 * Generate refresh token
 */
function generateRefreshToken(agent) {
    return jwt.sign(
        {
            id: agent._id,
            type: 'refresh'
        },
        JWT_SECRET,
        { expiresIn: REFRESH_TOKEN_EXPIRES_IN }
    );
}

/**
 * Verify JWT token
 */
function verifyToken(token) {
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch (error) {
        throw new Error('Invalid or expired token');
    }
}

/**
 * Login agent
 */
async function login(email, password, deviceInfo = null) {
    // Find agent with password field
    const agent = await Agent.findOne({ email, isActive: true }).select('+password');

    if (!agent) {
        throw new Error('Invalid credentials');
    }

    // Verify password
    const isValidPassword = await comparePassword(password, agent.password);
    if (!isValidPassword) {
        throw new Error('Invalid credentials');
    }

    // Generate tokens
    const accessToken = generateAccessToken(agent);
    const refreshToken = generateRefreshToken(agent);

    // Store refresh token
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    agent.refreshTokens.push({
        token: refreshToken,
        expiresAt,
        deviceInfo
    });

    // Update last activity and status
    agent.lastActivity = new Date();
    agent.status = 'online';
    agent.lastStatusChange = new Date();

    await agent.save();

    // Return agent without password
    const agentObject = agent.toObject();
    delete agentObject.password;
    delete agentObject.refreshTokens;

    return {
        agent: agentObject,
        accessToken,
        refreshToken
    };
}

/**
 * Refresh access token
 */
async function refreshAccessToken(refreshToken) {
    const decoded = verifyToken(refreshToken);

    if (decoded.type !== 'refresh') {
        throw new Error('Invalid refresh token');
    }

    const agent = await Agent.findById(decoded.id);
    if (!agent || !agent.isActive) {
        throw new Error('Agent not found or inactive');
    }

    // Check if refresh token exists
    const tokenExists = agent.refreshTokens.some(t => t.token === refreshToken);
    if (!tokenExists) {
        throw new Error('Invalid refresh token');
    }

    // Generate new access token
    const accessToken = generateAccessToken(agent);

    return { accessToken };
}

/**
 * Logout agent
 */
async function logout(agentId, refreshToken) {
    const agent = await Agent.findById(agentId);
    if (!agent) {
        throw new Error('Agent not found');
    }

    // Remove refresh token
    agent.refreshTokens = agent.refreshTokens.filter(t => t.token !== refreshToken);
    agent.status = 'offline';
    agent.lastStatusChange = new Date();

    await agent.save();

    return { success: true };
}

module.exports = {
    hashPassword,
    comparePassword,
    generateAccessToken,
    generateRefreshToken,
    verifyToken,
    login,
    refreshAccessToken,
    logout
};
