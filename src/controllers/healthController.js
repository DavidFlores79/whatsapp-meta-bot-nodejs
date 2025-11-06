const mongoose = require('mongoose');
const openaiService = require('../services/openaiService');
const packageJson = require('../../package.json');

/**
 * Health check endpoint
 * Returns service status and dependencies health
 */
const healthCheck = async (req, res) => {
  try {
    const health = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      service: 'whatsapp-bot',
      version: packageJson.version,
      checks: {
        database: 'unknown',
        openai: 'unknown',
        memory: 'ok'
      }
    };

    // Check MongoDB connection
    try {
      if (mongoose.connection.readyState === 1) {
        health.checks.database = 'connected';
      } else {
        health.checks.database = 'disconnected';
        health.status = 'degraded';
      }
    } catch (error) {
      health.checks.database = 'error';
      health.status = 'degraded';
    }

    // Check OpenAI service availability
    try {
      if (process.env.OPENAI_API_KEY && process.env.OPENAI_ASSISTANT_ID) {
        health.checks.openai = 'configured';
      } else {
        health.checks.openai = 'not_configured';
        health.status = 'degraded';
      }
    } catch (error) {
      health.checks.openai = 'error';
      health.status = 'degraded';
    }

    // Check memory usage
    const memoryUsage = process.memoryUsage();
    const memoryUsedMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);
    const memoryTotalMB = Math.round(memoryUsage.heapTotal / 1024 / 1024);
    
    health.checks.memory = {
      status: 'ok',
      used: `${memoryUsedMB}MB`,
      total: `${memoryTotalMB}MB`,
      percentage: `${Math.round((memoryUsedMB / memoryTotalMB) * 100)}%`
    };

    // Set HTTP status based on health status
    const httpStatus = health.status === 'ok' ? 200 : 503;

    return res.status(httpStatus).json(health);
  } catch (error) {
    console.error('Health check error:', error);
    return res.status(503).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: 'Health check failed'
    });
  }
};

/**
 * Readiness probe endpoint
 * Returns 200 when service is ready to accept traffic
 */
const readiness = async (req, res) => {
  try {
    // Check critical dependencies
    const isMongoReady = mongoose.connection.readyState === 1;
    const isOpenAIConfigured = !!(process.env.OPENAI_API_KEY && process.env.OPENAI_ASSISTANT_ID);
    const isWhatsAppConfigured = !!(process.env.WHATSAPP_API_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);

    if (isMongoReady && isOpenAIConfigured && isWhatsAppConfigured) {
      return res.status(200).json({
        status: 'ready',
        timestamp: new Date().toISOString()
      });
    } else {
      return res.status(503).json({
        status: 'not_ready',
        timestamp: new Date().toISOString(),
        checks: {
          database: isMongoReady ? 'ready' : 'not_ready',
          openai: isOpenAIConfigured ? 'ready' : 'not_ready',
          whatsapp: isWhatsAppConfigured ? 'ready' : 'not_ready'
        }
      });
    }
  } catch (error) {
    console.error('Readiness check error:', error);
    return res.status(503).json({
      status: 'not_ready',
      timestamp: new Date().toISOString(),
      error: 'Readiness check failed'
    });
  }
};

/**
 * Liveness probe endpoint
 * Returns 200 when service is alive
 */
const liveness = (req, res) => {
  return res.status(200).json({
    status: 'alive',
    timestamp: new Date().toISOString()
  });
};

/**
 * Service information endpoint
 * Returns detailed service metadata
 */
const info = async (req, res) => {
  try {
    const threadStats = await openaiService.getActiveUsersCount();
    
    const serviceInfo = {
      name: packageJson.name,
      version: packageJson.version,
      description: 'WhatsApp Bot with OpenAI Assistant Integration',
      node_version: process.version,
      environment: process.env.NODE_ENV || 'development',
      uptime: {
        seconds: Math.floor(process.uptime()),
        formatted: formatUptime(process.uptime())
      },
      endpoints: {
        webhook_verification: 'GET /api/v2',
        webhook_receiver: 'POST /api/v2',
        send_template: 'POST /api/v2/send',
        cleanup_thread: 'POST /api/v2/cleanup-thread',
        health: 'GET /health',
        readiness: 'GET /health/ready',
        liveness: 'GET /health/live',
        info: 'GET /info'
      },
      features: {
        ai_assistant: !!process.env.OPENAI_ASSISTANT_ID,
        socket_io: true,
        thread_management: true,
        multimedia_support: true
      },
      statistics: {
        active_threads: threadStats,
        memory_usage: {
          rss: `${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB`,
          heap_used: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
          heap_total: `${Math.round(process.memoryUsage().heapTotal / 1024 / 1024)}MB`
        }
      },
      timestamp: new Date().toISOString()
    };

    return res.status(200).json(serviceInfo);
  } catch (error) {
    console.error('Info endpoint error:', error);
    return res.status(500).json({
      error: 'Failed to retrieve service information',
      timestamp: new Date().toISOString()
    });
  }
};

/**
 * Format uptime in human-readable format
 */
const formatUptime = (seconds) => {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  parts.push(`${secs}s`);

  return parts.join(' ');
};

module.exports = {
  healthCheck,
  readiness,
  liveness,
  info
};
