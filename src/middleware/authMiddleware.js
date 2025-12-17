const authService = require('../services/authService');
const Agent = require('../models/Agent');

/**
 * Middleware to verify JWT token
 */
async function authenticateToken(req, res, next) {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

        if (!token) {
            return res.status(401).json({ error: 'Access token required' });
        }

        const decoded = authService.verifyToken(token);

        // Get agent from database
        const agent = await Agent.findById(decoded.id);
        if (!agent || !agent.isActive) {
            return res.status(403).json({ error: 'Invalid or inactive agent' });
        }

        // Update last activity
        agent.lastActivity = new Date();
        await agent.save();

        // Attach agent to request
        req.agent = agent;
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
}

/**
 * Middleware to check agent role
 */
function requireRole(...roles) {
    return (req, res, next) => {
        if (!req.agent) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        if (!roles.includes(req.agent.role)) {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }

        next();
    };
}

/**
 * Middleware to check agent permissions
 */
function requirePermission(...permissions) {
    return (req, res, next) => {
        if (!req.agent) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        const hasPermission = permissions.some(p =>
            req.agent.permissions.includes(p) || req.agent.role === 'admin'
        );

        if (!hasPermission) {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }

        next();
    };
}

module.exports = {
    authenticateToken,
    requireRole,
    requirePermission
};
