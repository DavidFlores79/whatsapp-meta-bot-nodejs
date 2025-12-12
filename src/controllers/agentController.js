const Agent = require('../models/Agent');
const authService = require('../services/authService');

/**
 * POST /api/v2/agents/auth/login
 */
async function login(req, res) {
    try {
        const { email, password, deviceInfo } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password required' });
        }

        const result = await authService.login(email, password, deviceInfo);

        // Emit status change
        const { io } = require('../models/server');
        io.emit('agent_status_changed', {
            agentId: result.agent._id,
            status: 'online',
            timestamp: new Date()
        });

        return res.json(result);
    } catch (error) {
        console.error('Login error:', error);
        return res.status(401).json({ error: error.message });
    }
}

/**
 * POST /api/v2/agents/auth/refresh
 */
async function refreshToken(req, res) {
    try {
        const { refreshToken } = req.body;

        if (!refreshToken) {
            return res.status(400).json({ error: 'Refresh token required' });
        }

        const result = await authService.refreshAccessToken(refreshToken);
        return res.json(result);
    } catch (error) {
        console.error('Token refresh error:', error);
        return res.status(403).json({ error: error.message });
    }
}

/**
 * POST /api/v2/agents/auth/logout
 */
async function logout(req, res) {
    try {
        const { refreshToken } = req.body;
        const agentId = req.agent._id;

        await authService.logout(agentId, refreshToken);

        // Emit status change
        const { io } = require('../models/server');
        io.emit('agent_status_changed', {
            agentId,
            status: 'offline',
            timestamp: new Date()
        });

        return res.json({ success: true });
    } catch (error) {
        console.error('Logout error:', error);
        return res.status(500).json({ error: error.message });
    }
}

/**
 * GET /api/v2/agents/profile
 */
async function getProfile(req, res) {
    try {
        const agent = await Agent.findById(req.agent._id);
        return res.json({ agent });
    } catch (error) {
        console.error('Get profile error:', error);
        return res.status(500).json({ error: error.message });
    }
}

/**
 * PATCH /api/v2/agents/profile
 */
async function updateProfile(req, res) {
    try {
        const { firstName, lastName, avatar, phoneNumber, settings, autoAssign, languages } = req.body;

        const updateData = {};
        if (firstName) updateData.firstName = firstName;
        if (lastName) updateData.lastName = lastName;
        if (avatar) updateData.avatar = avatar;
        if (phoneNumber) updateData.phoneNumber = phoneNumber;
        if (settings) updateData.settings = settings;
        if (typeof autoAssign === 'boolean') updateData.autoAssign = autoAssign;
        if (languages && Array.isArray(languages)) updateData.languages = languages;

        const agent = await Agent.findByIdAndUpdate(
            req.agent._id,
            updateData,
            { new: true }
        );

        console.log('[AgentController] Profile updated for agent:', agent._id, updateData);

        return res.json({ agent });
    } catch (error) {
        console.error('Update profile error:', error);
        return res.status(500).json({ error: error.message });
    }
}

/**
 * PATCH /api/v2/agents/status
 */
async function updateStatus(req, res) {
    try {
        const { status } = req.body;

        if (!['online', 'offline', 'busy', 'away'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status' });
        }

        const agent = await Agent.findByIdAndUpdate(
            req.agent._id,
            {
                status,
                lastStatusChange: new Date(),
                lastActivity: new Date()
            },
            { new: true }
        );

        // Emit status change
        const { io } = require('../models/server');
        io.emit('agent_status_changed', {
            agentId: agent._id,
            status,
            timestamp: new Date()
        });

        return res.json({ agent });
    } catch (error) {
        console.error('Update status error:', error);
        return res.status(500).json({ error: error.message });
    }
}

/**
 * GET /api/v2/agents
 */
async function getAllAgents(req, res) {
    try {
        const { status, role, isActive } = req.query;

        const filter = {};
        if (status) filter.status = status;
        if (role) filter.role = role;
        if (isActive !== undefined) filter.isActive = isActive === 'true';

        const agents = await Agent.find(filter).select('-password -refreshTokens');
        return res.json({ agents });
    } catch (error) {
        console.error('Get agents error:', error);
        return res.status(500).json({ error: error.message });
    }
}

/**
 * POST /api/v2/agents
 */
async function createAgent(req, res) {
    try {
        const { email, password, firstName, lastName, role, phoneNumber } = req.body;

        if (!email || !password || !firstName || !lastName) {
            return res.status(400).json({ error: 'Required fields missing' });
        }

        // Check if agent already exists
        const existingAgent = await Agent.findOne({ email });
        if (existingAgent) {
            return res.status(400).json({ error: 'Agent already exists' });
        }

        // Hash password
        const hashedPassword = await authService.hashPassword(password);

        const agent = await Agent.create({
            email,
            password: hashedPassword,
            firstName,
            lastName,
            role: role || 'agent',
            phoneNumber,
            permissions: ['view_conversations']
        });

        // Remove password from response
        const agentObject = agent.toObject();
        delete agentObject.password;

        return res.status(201).json({ agent: agentObject });
    } catch (error) {
        console.error('Create agent error:', error);
        return res.status(500).json({ error: error.message });
    }
}

/**
 * GET /api/v2/agents/:id
 */
async function getAgentById(req, res) {
    try {
        const agent = await Agent.findById(req.params.id).select('-password -refreshTokens');

        if (!agent) {
            return res.status(404).json({ error: 'Agent not found' });
        }

        return res.json({ agent });
    } catch (error) {
        console.error('Get agent error:', error);
        return res.status(500).json({ error: error.message });
    }
}

/**
 * PATCH /api/v2/agents/:id
 */
async function updateAgent(req, res) {
    try {
        const { firstName, lastName, role, isActive, maxConcurrentChats, permissions } = req.body;

        const updateData = {};
        if (firstName) updateData.firstName = firstName;
        if (lastName) updateData.lastName = lastName;
        if (role) updateData.role = role;
        if (isActive !== undefined) updateData.isActive = isActive;
        if (maxConcurrentChats) updateData.maxConcurrentChats = maxConcurrentChats;
        if (permissions) updateData.permissions = permissions;

        const agent = await Agent.findByIdAndUpdate(
            req.params.id,
            updateData,
            { new: true }
        ).select('-password -refreshTokens');

        if (!agent) {
            return res.status(404).json({ error: 'Agent not found' });
        }

        return res.json({ agent });
    } catch (error) {
        console.error('Update agent error:', error);
        return res.status(500).json({ error: error.message });
    }
}

/**
 * DELETE /api/v2/agents/:id
 */
async function deleteAgent(req, res) {
    try {
        // Soft delete - mark as inactive
        const agent = await Agent.findByIdAndUpdate(
            req.params.id,
            { isActive: false, status: 'offline' },
            { new: true }
        );

        if (!agent) {
            return res.status(404).json({ error: 'Agent not found' });
        }

        return res.json({ success: true, agent });
    } catch (error) {
        console.error('Delete agent error:', error);
        return res.status(500).json({ error: error.message });
    }
}

/**
 * GET /api/v2/agents/:id/statistics
 */
async function getAgentStatistics(req, res) {
    try {
        const agent = await Agent.findById(req.params.id);

        if (!agent) {
            return res.status(404).json({ error: 'Agent not found' });
        }

        return res.json({ statistics: agent.statistics });
    } catch (error) {
        console.error('Get statistics error:', error);
        return res.status(500).json({ error: error.message });
    }
}

module.exports = {
    login,
    refreshToken,
    logout,
    getProfile,
    updateProfile,
    updateStatus,
    getAllAgents,
    createAgent,
    getAgentById,
    updateAgent,
    deleteAgent,
    getAgentStatistics
};
