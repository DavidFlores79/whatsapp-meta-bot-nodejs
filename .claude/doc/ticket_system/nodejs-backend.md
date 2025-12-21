# Universal Ticket System - Backend Implementation Plan (Phases 0, 1, 2)

**Feature**: Universal Configurable Ticket System for CRM
**Created**: 2025-12-21
**Scope**: Backend Only (Phases 0, 1, 2)
**Status**: Ready for Implementation

---

## Overview

This document provides a detailed implementation plan for the backend components of the Universal Ticket System. The system is designed to work across multiple industries (LUXFREE solar/lighting by default) through a database-driven configuration system.

### Key Architectural Principles

1. **Database-First Configuration**: All ticket categories, terminology, and ID formats stored in MongoDB with hardcoded fallbacks
2. **Dynamic Validation**: Ticket model validates against configured categories fetched from database
3. **Service Layer Emission**: Socket.io events emitted from service layer (not controllers)
4. **Thin Controllers**: HTTP handlers delegate to services for business logic
5. **Atomic ID Generation**: MongoDB atomic operations for sequential ticket IDs with year reset
6. **Multi-Industry Support**: Same codebase serves LUXFREE, restaurants, e-commerce, healthcare via configuration

---

## Phase 0: Configuration System Foundation

### Objective
Create a flexible configuration system that allows ticket categories, terminology, and assistant behavior to be customized without code changes.

### 0.1 Create SystemSettings Model

**File**: `src/models/SystemSettings.js`

**Purpose**: Multi-document key-value store for all ticket system configurations

**Schema Design**:
```javascript
const mongoose = require('mongoose');

const SystemSettingsSchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    unique: true,
    index: true,
    description: 'Unique identifier for the setting'
  },
  value: {
    type: mongoose.Schema.Types.Mixed,
    required: true,
    description: 'Configuration value (object, array, string, etc.)'
  },
  category: {
    type: String,
    enum: ['tickets', 'assistant', 'presets', 'general'],
    default: 'general',
    index: true,
    description: 'Category for organizing settings'
  },
  description: {
    type: String,
    description: 'Human-readable description of the setting'
  },
  isEditable: {
    type: Boolean,
    default: true,
    description: 'Whether this setting can be modified via UI'
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Agent',
    description: 'Agent who last modified this setting'
  }
}, {
  timestamps: true
});

// Indexes for performance
SystemSettingsSchema.index({ category: 1, key: 1 });

// Static method to get setting with fallback
SystemSettingsSchema.statics.getSetting = async function(key, defaultValue) {
  const setting = await this.findOne({ key });
  return setting ? setting.value : defaultValue;
};

// Static method to update setting
SystemSettingsSchema.statics.updateSetting = async function(key, value, updatedBy, category = 'general') {
  return await this.findOneAndUpdate(
    { key },
    {
      value,
      category,
      updatedBy,
      updatedAt: new Date()
    },
    { upsert: true, new: true, runValidators: true }
  );
};

module.exports = mongoose.model('SystemSettings', SystemSettingsSchema);
```

**Default Settings Structure**:

The following configurations will be seeded on first server start:

1. **ticket_categories** (array of category objects):
```javascript
{
  key: 'ticket_categories',
  value: [
    {
      id: 'solar_installation',
      label: 'Instalación Solar',
      labelEn: 'Solar Installation',
      icon: 'sun',
      color: '#F59E0B',
      description: 'Instalación de paneles solares y sistemas fotovoltaicos'
    },
    {
      id: 'light_malfunction',
      label: 'Falla de Luminaria',
      labelEn: 'Light Malfunction',
      icon: 'lightbulb-off',
      color: '#EF4444',
      description: 'Problemas con luminarias o alumbrado público'
    },
    {
      id: 'maintenance',
      label: 'Mantenimiento',
      labelEn: 'Maintenance',
      icon: 'wrench',
      color: '#10B981',
      description: 'Mantenimiento preventivo o correctivo'
    },
    {
      id: 'electrical_issue',
      label: 'Problema Eléctrico',
      labelEn: 'Electrical Issue',
      icon: 'zap',
      color: '#DC2626',
      description: 'Fallas eléctricas, cortocircuitos o problemas de instalación'
    },
    {
      id: 'billing',
      label: 'Facturación',
      labelEn: 'Billing',
      icon: 'dollar-sign',
      color: '#6366F1',
      description: 'Consultas sobre pagos, facturas o presupuestos'
    },
    {
      id: 'other',
      label: 'Otro',
      labelEn: 'Other',
      icon: 'more-horizontal',
      color: '#9CA3AF',
      description: 'Otros temas no clasificados'
    }
  ],
  category: 'tickets',
  description: 'Available ticket categories for LUXFREE',
  isEditable: true
}
```

2. **assistant_configuration** (object):
```javascript
{
  key: 'assistant_configuration',
  value: {
    assistantName: 'Lúmen',
    companyName: process.env.COMPANY_NAME || 'LUXFREE',
    primaryServiceIssue: 'instalaciones solares, luminarias y servicios eléctricos',
    serviceType: 'instalación y mantenimiento eléctrico',
    ticketNoun: 'reporte',
    ticketNounPlural: 'reportes',
    language: 'es'
  },
  category: 'assistant',
  description: 'AI assistant configuration and terminology',
  isEditable: true
}
```

3. **ticket_terminology** (object):
```javascript
{
  key: 'ticket_terminology',
  value: {
    ticketSingular: 'reporte',
    ticketPlural: 'reportes',
    createVerb: 'reportar',
    customerNoun: 'usuario',
    agentNoun: 'agente',
    resolveVerb: 'resolver'
  },
  category: 'tickets',
  description: 'Ticket system terminology in Spanish',
  isEditable: true
}
```

4. **ticket_id_format** (object):
```javascript
{
  key: 'ticket_id_format',
  value: {
    prefix: 'LUX',
    includeYear: true,
    padLength: 6,
    separator: '-'
    // Result: LUX-2025-000001
  },
  category: 'tickets',
  description: 'Ticket ID generation format',
  isEditable: true
}
```

**Important Notes**:
- Use `mongoose.Schema.Types.Mixed` for flexible value storage
- Separate from `CRMSettings` (which uses singleton pattern for conversation settings)
- Multi-document pattern allows easy querying by category
- `isEditable: false` can lock system-critical settings

---

### 0.2 Create Configuration Service

**File**: `src/services/configurationService.js`

**Purpose**: Centralized configuration management with in-memory caching (5-minute TTL)

**Implementation**:
```javascript
const SystemSettings = require('../models/SystemSettings');

class ConfigurationService {
  constructor() {
    this.cache = new Map();
    this.cacheTTL = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Get ticket categories with caching
   * @returns {Promise<Array>} Array of category objects
   */
  async getTicketCategories() {
    return this.getSetting('ticket_categories', this.getDefaultCategories());
  }

  /**
   * Get assistant configuration
   * @returns {Promise<Object>} Assistant config object
   */
  async getAssistantConfig() {
    return this.getSetting('assistant_configuration', this.getDefaultAssistantConfig());
  }

  /**
   * Get ticket terminology
   * @returns {Promise<Object>} Terminology object
   */
  async getTicketTerminology() {
    return this.getSetting('ticket_terminology', this.getDefaultTerminology());
  }

  /**
   * Get ticket ID format configuration
   * @returns {Promise<Object>} ID format object
   */
  async getTicketIdFormat() {
    return this.getSetting('ticket_id_format', this.getDefaultIdFormat());
  }

  /**
   * Generic setting getter with cache
   * @param {string} key - Setting key
   * @param {*} defaultValue - Fallback value if not in DB
   * @returns {Promise<*>} Setting value
   */
  async getSetting(key, defaultValue) {
    // Check cache
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.value;
    }

    // Fetch from database
    try {
      const setting = await SystemSettings.findOne({ key });
      const value = setting ? setting.value : defaultValue;

      // Update cache
      this.cache.set(key, { value, timestamp: Date.now() });
      return value;
    } catch (error) {
      console.error(`[ConfigService] Error fetching setting ${key}:`, error.message);
      return defaultValue;
    }
  }

  /**
   * Update a setting and invalidate cache
   * @param {string} key - Setting key
   * @param {*} value - New value
   * @param {ObjectId} updatedBy - Agent ID
   * @param {string} category - Setting category
   * @returns {Promise<Object>} Updated setting document
   */
  async updateSetting(key, value, updatedBy, category = 'general') {
    try {
      const setting = await SystemSettings.updateSetting(key, value, updatedBy, category);

      // Invalidate cache
      this.cache.delete(key);

      console.log(`[ConfigService] Setting ${key} updated by ${updatedBy}`);
      return setting;
    } catch (error) {
      console.error(`[ConfigService] Error updating setting ${key}:`, error.message);
      throw error;
    }
  }

  /**
   * Invalidate entire cache (use after bulk updates)
   */
  invalidateCache() {
    this.cache.clear();
    console.log('[ConfigService] Cache invalidated');
  }

  /**
   * Validate category ID against configured categories
   * @param {string} categoryId - Category ID to validate
   * @returns {Promise<boolean>} True if valid
   */
  async isValidCategory(categoryId) {
    const categories = await this.getTicketCategories();
    return categories.some(cat => cat.id === categoryId);
  }

  // ============================================
  // DEFAULT CONFIGURATIONS (LUXFREE)
  // ============================================

  getDefaultCategories() {
    return [
      {
        id: 'solar_installation',
        label: 'Instalación Solar',
        labelEn: 'Solar Installation',
        icon: 'sun',
        color: '#F59E0B',
        description: 'Instalación de paneles solares y sistemas fotovoltaicos'
      },
      {
        id: 'light_malfunction',
        label: 'Falla de Luminaria',
        labelEn: 'Light Malfunction',
        icon: 'lightbulb-off',
        color: '#EF4444',
        description: 'Problemas con luminarias o alumbrado público'
      },
      {
        id: 'maintenance',
        label: 'Mantenimiento',
        labelEn: 'Maintenance',
        icon: 'wrench',
        color: '#10B981',
        description: 'Mantenimiento preventivo o correctivo'
      },
      {
        id: 'electrical_issue',
        label: 'Problema Eléctrico',
        labelEn: 'Electrical Issue',
        icon: 'zap',
        color: '#DC2626',
        description: 'Fallas eléctricas, cortocircuitos o problemas de instalación'
      },
      {
        id: 'billing',
        label: 'Facturación',
        labelEn: 'Billing',
        icon: 'dollar-sign',
        color: '#6366F1',
        description: 'Consultas sobre pagos, facturas o presupuestos'
      },
      {
        id: 'other',
        label: 'Otro',
        labelEn: 'Other',
        icon: 'more-horizontal',
        color: '#9CA3AF',
        description: 'Otros temas no clasificados'
      }
    ];
  }

  getDefaultAssistantConfig() {
    return {
      assistantName: 'Lúmen',
      companyName: process.env.COMPANY_NAME || 'LUXFREE',
      primaryServiceIssue: 'instalaciones solares, luminarias y servicios eléctricos',
      serviceType: 'instalación y mantenimiento eléctrico',
      ticketNoun: 'reporte',
      ticketNounPlural: 'reportes',
      language: 'es'
    };
  }

  getDefaultTerminology() {
    return {
      ticketSingular: 'reporte',
      ticketPlural: 'reportes',
      createVerb: 'reportar',
      customerNoun: 'usuario',
      agentNoun: 'agente',
      resolveVerb: 'resolver'
    };
  }

  getDefaultIdFormat() {
    return {
      prefix: 'LUX',
      includeYear: true,
      padLength: 6,
      separator: '-'
    };
  }
}

module.exports = new ConfigurationService();
```

**Key Features**:
- In-memory cache with 5-minute TTL
- Automatic fallback to hardcoded defaults
- Cache invalidation on updates
- Helper method for category validation
- Singleton pattern (exported instance)

**Cache Strategy**:
- **Read**: Check cache → DB → fallback default
- **Write**: Update DB → invalidate cache → return new value
- **TTL**: 5 minutes (balance between performance and freshness)

---

### 0.3 Create Configuration Controller

**File**: `src/controllers/configurationController.js`

**Purpose**: HTTP handlers for configuration CRUD (admin-only)

**Implementation**:
```javascript
const configService = require('../services/configurationService');
const SystemSettings = require('../models/SystemSettings');

/**
 * GET /api/v2/config/ticket-categories
 * Get all ticket categories
 */
async function getTicketCategories(req, res) {
  try {
    const categories = await configService.getTicketCategories();
    res.json({
      success: true,
      categories
    });
  } catch (error) {
    console.error('[ConfigController] Error getting categories:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve ticket categories'
    });
  }
}

/**
 * PUT /api/v2/config/ticket-categories
 * Update ticket categories (admin only)
 */
async function updateTicketCategories(req, res) {
  try {
    const { categories } = req.body;
    const agentId = req.agent._id;

    // Validate input
    if (!Array.isArray(categories) || categories.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Categories must be a non-empty array'
      });
    }

    // Validate each category has required fields
    for (const cat of categories) {
      if (!cat.id || !cat.label) {
        return res.status(400).json({
          success: false,
          error: 'Each category must have id and label'
        });
      }
    }

    const setting = await configService.updateSetting(
      'ticket_categories',
      categories,
      agentId,
      'tickets'
    );

    res.json({
      success: true,
      message: 'Ticket categories updated successfully',
      categories: setting.value
    });
  } catch (error) {
    console.error('[ConfigController] Error updating categories:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * GET /api/v2/config/assistant
 * Get assistant configuration
 */
async function getAssistantConfig(req, res) {
  try {
    const config = await configService.getAssistantConfig();
    res.json({
      success: true,
      config
    });
  } catch (error) {
    console.error('[ConfigController] Error getting assistant config:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve assistant configuration'
    });
  }
}

/**
 * PUT /api/v2/config/assistant
 * Update assistant configuration (admin only)
 */
async function updateAssistantConfig(req, res) {
  try {
    const config = req.body;
    const agentId = req.agent._id;

    // Validate required fields
    const requiredFields = ['assistantName', 'companyName', 'ticketNoun', 'ticketNounPlural'];
    for (const field of requiredFields) {
      if (!config[field]) {
        return res.status(400).json({
          success: false,
          error: `Missing required field: ${field}`
        });
      }
    }

    const setting = await configService.updateSetting(
      'assistant_configuration',
      config,
      agentId,
      'assistant'
    );

    res.json({
      success: true,
      message: 'Assistant configuration updated successfully',
      config: setting.value
    });
  } catch (error) {
    console.error('[ConfigController] Error updating assistant config:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * GET /api/v2/config/terminology
 * Get ticket terminology
 */
async function getTerminology(req, res) {
  try {
    const terminology = await configService.getTicketTerminology();
    res.json({
      success: true,
      terminology
    });
  } catch (error) {
    console.error('[ConfigController] Error getting terminology:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve terminology'
    });
  }
}

/**
 * PUT /api/v2/config/terminology
 * Update ticket terminology (admin only)
 */
async function updateTerminology(req, res) {
  try {
    const terminology = req.body;
    const agentId = req.agent._id;

    const setting = await configService.updateSetting(
      'ticket_terminology',
      terminology,
      agentId,
      'tickets'
    );

    res.json({
      success: true,
      message: 'Terminology updated successfully',
      terminology: setting.value
    });
  } catch (error) {
    console.error('[ConfigController] Error updating terminology:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * GET /api/v2/config/ticket-id-format
 * Get ticket ID format configuration
 */
async function getTicketIdFormat(req, res) {
  try {
    const format = await configService.getTicketIdFormat();
    res.json({
      success: true,
      format
    });
  } catch (error) {
    console.error('[ConfigController] Error getting ID format:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve ticket ID format'
    });
  }
}

/**
 * PUT /api/v2/config/ticket-id-format
 * Update ticket ID format (admin only)
 */
async function updateTicketIdFormat(req, res) {
  try {
    const format = req.body;
    const agentId = req.agent._id;

    // Validate
    if (!format.prefix) {
      return res.status(400).json({
        success: false,
        error: 'Prefix is required'
      });
    }

    const setting = await configService.updateSetting(
      'ticket_id_format',
      format,
      agentId,
      'tickets'
    );

    res.json({
      success: true,
      message: 'Ticket ID format updated successfully',
      format: setting.value
    });
  } catch (error) {
    console.error('[ConfigController] Error updating ID format:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * POST /api/v2/config/reset/:key
 * Reset a configuration to defaults (admin only)
 */
async function resetToDefault(req, res) {
  try {
    const { key } = req.params;
    const agentId = req.agent._id;

    let defaultValue;
    let category;

    switch (key) {
      case 'ticket_categories':
        defaultValue = configService.getDefaultCategories();
        category = 'tickets';
        break;
      case 'assistant_configuration':
        defaultValue = configService.getDefaultAssistantConfig();
        category = 'assistant';
        break;
      case 'ticket_terminology':
        defaultValue = configService.getDefaultTerminology();
        category = 'tickets';
        break;
      case 'ticket_id_format':
        defaultValue = configService.getDefaultIdFormat();
        category = 'tickets';
        break;
      default:
        return res.status(400).json({
          success: false,
          error: 'Invalid configuration key'
        });
    }

    const setting = await configService.updateSetting(key, defaultValue, agentId, category);

    res.json({
      success: true,
      message: `${key} reset to default`,
      value: setting.value
    });
  } catch (error) {
    console.error('[ConfigController] Error resetting config:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * GET /api/v2/config/all
 * Get all ticket system configurations (admin only)
 */
async function getAllConfigurations(req, res) {
  try {
    const [categories, assistantConfig, terminology, idFormat] = await Promise.all([
      configService.getTicketCategories(),
      configService.getAssistantConfig(),
      configService.getTicketTerminology(),
      configService.getTicketIdFormat()
    ]);

    res.json({
      success: true,
      configurations: {
        ticketCategories: categories,
        assistantConfiguration: assistantConfig,
        terminology: terminology,
        ticketIdFormat: idFormat
      }
    });
  } catch (error) {
    console.error('[ConfigController] Error getting all configs:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve configurations'
    });
  }
}

module.exports = {
  getTicketCategories,
  updateTicketCategories,
  getAssistantConfig,
  updateAssistantConfig,
  getTerminology,
  updateTerminology,
  getTicketIdFormat,
  updateTicketIdFormat,
  resetToDefault,
  getAllConfigurations
};
```

**Controller Pattern**:
- Thin controllers (delegate to service)
- Input validation before service call
- Consistent error responses
- Admin authentication via middleware
- Use `req.agent._id` for audit trail

---

### 0.4 Create Configuration Routes

**File**: `src/routes/configurationRoutes.js`

**Purpose**: API route definitions for configuration endpoints

**Implementation**:
```javascript
const express = require('express');
const router = express.Router();
const configController = require('../controllers/configurationController');
const { authenticateToken, requireAdmin } = require('../middleware/authMiddleware');

// All configuration routes require admin authentication
router.use(authenticateToken);
router.use(requireAdmin);

// Ticket Categories
router.get('/ticket-categories', configController.getTicketCategories);
router.put('/ticket-categories', configController.updateTicketCategories);

// Assistant Configuration
router.get('/assistant', configController.getAssistantConfig);
router.put('/assistant', configController.updateAssistantConfig);

// Terminology
router.get('/terminology', configController.getTerminology);
router.put('/terminology', configController.updateTerminology);

// Ticket ID Format
router.get('/ticket-id-format', configController.getTicketIdFormat);
router.put('/ticket-id-format', configController.updateTicketIdFormat);

// Reset to defaults
router.post('/reset/:key', configController.resetToDefault);

// Get all configurations
router.get('/all', configController.getAllConfigurations);

module.exports = router;
```

**Route Structure**:
```
GET    /api/v2/config/ticket-categories    - Get categories
PUT    /api/v2/config/ticket-categories    - Update categories (admin)
GET    /api/v2/config/assistant             - Get assistant config
PUT    /api/v2/config/assistant             - Update assistant config (admin)
GET    /api/v2/config/terminology           - Get terminology
PUT    /api/v2/config/terminology           - Update terminology (admin)
GET    /api/v2/config/ticket-id-format      - Get ID format
PUT    /api/v2/config/ticket-id-format      - Update ID format (admin)
POST   /api/v2/config/reset/:key            - Reset to defaults (admin)
GET    /api/v2/config/all                   - Get all configs (admin)
```

**Authentication Requirements**:
- All routes require `authenticateToken` middleware
- All routes require `requireAdmin` middleware (role check)

**Note**: Create `requireAdmin` middleware if it doesn't exist:
```javascript
// In src/middleware/authMiddleware.js
function requireAdmin(req, res, next) {
  if (req.agent.role !== 'admin') {
    return res.status(403).json({
      success: false,
      error: 'Admin access required'
    });
  }
  next();
}
```

---

### 0.5 Update app.js - Add Initialization Function

**File**: `src/app.js` (or `src/models/server.js`)

**Purpose**: Automatically seed default configurations on first server start

**Implementation**:

Add this function to `src/app.js`:

```javascript
const SystemSettings = require('./models/SystemSettings');
const configService = require('./services/configurationService');

/**
 * Initialize ticket system with default LUXFREE configuration
 * Runs once on first server start (idempotent)
 */
async function initializeTicketSystem() {
  try {
    console.log('🔍 Checking ticket system initialization...');

    // Check if ticket categories already exist
    const ticketCategoriesExist = await SystemSettings.findOne({
      key: 'ticket_categories'
    });

    if (!ticketCategoriesExist) {
      console.log('🎫 Initializing ticket system with LUXFREE defaults...');

      // Seed all default configurations
      await SystemSettings.insertMany([
        {
          key: 'ticket_categories',
          value: configService.getDefaultCategories(),
          category: 'tickets',
          description: 'Available ticket categories for LUXFREE (solar/lighting)',
          isEditable: true
        },
        {
          key: 'assistant_configuration',
          value: configService.getDefaultAssistantConfig(),
          category: 'assistant',
          description: 'AI assistant configuration for LUXFREE',
          isEditable: true
        },
        {
          key: 'ticket_terminology',
          value: configService.getDefaultTerminology(),
          category: 'tickets',
          description: 'Ticket system terminology in Spanish',
          isEditable: true
        },
        {
          key: 'ticket_id_format',
          value: configService.getDefaultIdFormat(),
          category: 'tickets',
          description: 'Ticket ID generation format',
          isEditable: true
        }
      ]);

      console.log('✅ Ticket system initialized successfully');
    } else {
      console.log('✅ Ticket system already initialized');
    }
  } catch (error) {
    console.error('❌ Error initializing ticket system:', error);
    // Don't throw - allow server to start even if seeding fails
  }
}

// Export the function
module.exports.initializeTicketSystem = initializeTicketSystem;
```

**Integration Point**:

In the database connection callback (usually in `src/app.js` or `src/models/server.js`):

```javascript
// In src/models/server.js constructor or src/app.js
const mongoose = require('mongoose');
const { initializeTicketSystem } = require('./app'); // Or wherever you put the function

// In database connection
mongoose.connection.once('open', async () => {
  console.log('📊 Database connected');

  // Initialize ticket system
  await initializeTicketSystem();

  console.log('🚀 Server ready');
});
```

**Important Characteristics**:
- ✅ Idempotent (safe to run multiple times)
- ✅ Non-blocking (server starts even if seeding fails)
- ✅ Automatic (no manual scripts required)
- ✅ Zero-configuration deployment

---

### 0.6 Register Configuration Routes

**File**: `src/models/server.js` (routes method)

**Add this line**:
```javascript
// In src/models/server.js routes() method
this.app.use("/api/v2/config", require("../routes/configurationRoutes"));
```

**Updated routes() method**:
```javascript
routes() {
  // IMPORTANT: Register more specific routes BEFORE generic ones
  this.app.use("/api/v2/agents", require("../routes/agentRoutes"));
  this.app.use("/api/v2/conversations", require("../routes/conversationRoutes"));
  this.app.use("/api/v2/customers", require("../routes/customerRoutes"));
  this.app.use("/api/v2/templates", require("../routes/templateRoutes"));
  this.app.use("/api/v2/crm-settings", require("../routes/crmSettingsRoutes"));
  this.app.use("/api/v2/config", require("../routes/configurationRoutes")); // NEW
  this.app.use("/api/v2", require("../routes/whatsappRoutes"));
  this.app.use("/health", require("../routes/healthRoutes"));
  this.app.use("/info", require("../routes/infoRoutes"));

  // Angular catch-all
  this.app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../../frontend/dist/frontend/browser/index.html'));
  });
}
```

---

### Phase 0 Summary

**Files Created**:
1. `src/models/SystemSettings.js` - Multi-document settings model
2. `src/services/configurationService.js` - Configuration management with caching
3. `src/controllers/configurationController.js` - HTTP handlers
4. `src/routes/configurationRoutes.js` - API routes

**Files Modified**:
1. `src/app.js` - Add `initializeTicketSystem()` function
2. `src/models/server.js` - Register configuration routes, call init function on DB connect
3. `src/middleware/authMiddleware.js` - Add `requireAdmin` middleware (if missing)

**Testing Checklist**:
- [ ] Server starts and seeds default configurations
- [ ] GET `/api/v2/config/all` returns all configurations
- [ ] GET `/api/v2/config/ticket-categories` returns LUXFREE categories
- [ ] PUT `/api/v2/config/ticket-categories` updates categories (admin only)
- [ ] Configuration cache works (5-minute TTL)
- [ ] Non-admin users get 403 on PUT endpoints
- [ ] Reset endpoint restores defaults

---

## Phase 1: Backend Core (Ticket Models & Service)

### Objective
Create the ticket data models and business logic service layer with dynamic configuration support.

### 1.1 Create TicketCounter Model

**File**: `src/models/TicketCounter.js`

**Purpose**: Atomic sequential ID generation with year-based reset

**Schema Design**:
```javascript
const mongoose = require('mongoose');

/**
 * TicketCounter Model
 * Generates sequential ticket IDs with year-based reset
 * Uses MongoDB atomic operations to prevent race conditions
 */
const ticketCounterSchema = new mongoose.Schema({
  _id: {
    type: String,
    default: 'ticket_counter',
    description: 'Singleton document ID'
  },
  year: {
    type: Number,
    required: true,
    description: 'Current year for ticket generation'
  },
  sequence: {
    type: Number,
    default: 0,
    description: 'Sequential counter for current year'
  }
}, {
  timestamps: true
});

/**
 * Static method to generate next ticket ID
 * @param {Object} format - Ticket ID format from configuration
 * @returns {Promise<string>} Generated ticket ID (e.g., "LUX-2025-000001")
 */
ticketCounterSchema.statics.generateTicketId = async function(format) {
  const currentYear = new Date().getFullYear();

  // Atomic increment with year reset
  const counter = await this.findOneAndUpdate(
    { _id: 'ticket_counter' },
    [
      {
        $set: {
          // Reset sequence to 1 if year changed, otherwise increment
          sequence: {
            $cond: {
              if: { $ne: ['$year', currentYear] },
              then: 1,
              else: { $add: ['$sequence', 1] }
            }
          },
          year: currentYear
        }
      }
    ],
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true
    }
  );

  // Format ticket ID based on configuration
  const paddedSequence = String(counter.sequence).padStart(format.padLength || 6, '0');

  if (format.includeYear) {
    return `${format.prefix}${format.separator}${counter.year}${format.separator}${paddedSequence}`;
  } else {
    return `${format.prefix}${format.separator}${paddedSequence}`;
  }
};

module.exports = mongoose.model('TicketCounter', ticketCounterSchema);
```

**Key Features**:
- **Atomic operations**: Uses MongoDB `$cond` operator to ensure race-condition safety
- **Year-based reset**: Automatically resets sequence to 1 on year change
- **Configurable format**: Accepts format object from `configurationService`
- **Upsert**: Creates counter document on first use
- **Singleton pattern**: Single `_id: 'ticket_counter'` document

**Example Output**:
```javascript
// With includeYear: true, prefix: "LUX", separator: "-", padLength: 6
"LUX-2025-000001"
"LUX-2025-000002"
// ... when year changes ...
"LUX-2026-000001"

// With includeYear: false, prefix: "RPT", separator: "-", padLength: 4
"RPT-0001"
"RPT-0002"
```

**Important Notes**:
- MongoDB aggregation pipeline ensures atomicity
- No Redis required (keeps architecture simple)
- Handles concurrent requests safely
- Works across server restarts (persisted in DB)

---

### 1.2 Create Ticket Model

**File**: `src/models/Ticket.js`

**Purpose**: Main ticket schema with dynamic category validation

**Schema Design**:
```javascript
const mongoose = require('mongoose');
const configService = require('../services/configurationService');

const ticketSchema = new mongoose.Schema({
  // Unique Ticket ID (generated from TicketCounter)
  ticketId: {
    type: String,
    required: true,
    unique: true,
    index: true,
    description: 'Human-readable ticket ID (e.g., LUX-2025-000001)'
  },

  // Subject and Description
  subject: {
    type: String,
    required: true,
    maxlength: 200,
    description: 'Brief summary of the issue'
  },
  description: {
    type: String,
    required: true,
    description: 'Detailed description of the issue'
  },

  // Dynamic Category Validation
  category: {
    type: String,
    required: true,
    index: true,
    description: 'Ticket category (validated against configured categories)',
    validate: {
      validator: async function(value) {
        // Validate against configured categories
        const isValid = await configService.isValidCategory(value);
        return isValid;
      },
      message: 'Invalid ticket category'
    }
  },
  subcategory: {
    type: String,
    description: 'Optional subcategory for finer classification'
  },

  // Priority
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium',
    index: true,
    description: 'Ticket priority level'
  },

  // Status Workflow
  status: {
    type: String,
    enum: ['new', 'open', 'in_progress', 'pending_customer', 'waiting_internal', 'resolved', 'closed'],
    default: 'new',
    index: true,
    description: 'Current ticket status'
  },

  // Status History Tracking
  statusHistory: [{
    from: {
      type: String,
      enum: ['new', 'open', 'in_progress', 'pending_customer', 'waiting_internal', 'resolved', 'closed']
    },
    to: {
      type: String,
      enum: ['new', 'open', 'in_progress', 'pending_customer', 'waiting_internal', 'resolved', 'closed']
    },
    changedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Agent'
    },
    reason: String,
    timestamp: {
      type: Date,
      default: Date.now
    }
  }],

  // Relationships
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer',
    required: true,
    index: true,
    description: 'Customer who reported the ticket'
  },
  conversationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Conversation',
    index: true,
    description: 'Related conversation (if created via AI)'
  },
  assignedAgent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Agent',
    index: true,
    description: 'Agent assigned to handle this ticket'
  },
  assignedAt: {
    type: Date,
    description: 'When the ticket was assigned to an agent'
  },

  // Location (Optional)
  location: {
    address: String,
    coordinates: {
      latitude: Number,
      longitude: Number
    },
    description: String
  },

  // SLA Tracking (Storage only - no monitoring yet)
  sla: {
    firstResponseTarget: {
      type: Number,
      description: 'Target time for first response (milliseconds)'
    },
    resolutionTarget: {
      type: Number,
      description: 'Target time for resolution (milliseconds)'
    },
    firstResponseAt: {
      type: Date,
      description: 'When first response was provided'
    },
    firstResponseMet: {
      type: Boolean,
      default: null,
      description: 'Whether first response SLA was met'
    },
    resolutionMet: {
      type: Boolean,
      default: null,
      description: 'Whether resolution SLA was met'
    }
  },

  // Resolution
  resolvedAt: {
    type: Date,
    description: 'When the ticket was marked as resolved'
  },
  resolvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Agent',
    description: 'Agent who resolved the ticket'
  },
  resolutionNotes: {
    type: String,
    description: 'Notes about how the ticket was resolved'
  },

  // Customer Feedback
  customerFeedback: {
    rating: {
      type: Number,
      min: 1,
      max: 5,
      description: 'Customer satisfaction rating (1-5 stars)'
    },
    comment: String,
    submittedAt: Date
  },

  // Internal Notes
  notes: [{
    agentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Agent',
      required: true
    },
    content: {
      type: String,
      required: true
    },
    isInternal: {
      type: Boolean,
      default: true,
      description: 'Whether this note is visible to customer'
    },
    timestamp: {
      type: Date,
      default: Date.now
    }
  }],

  // Tags for filtering
  tags: [String],

  // Escalation
  isEscalated: {
    type: Boolean,
    default: false,
    description: 'Whether ticket has been escalated'
  },
  escalatedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Agent',
    description: 'Agent ticket was escalated to'
  },
  escalationReason: {
    type: String,
    description: 'Reason for escalation'
  },
  escalatedAt: {
    type: Date,
    description: 'When ticket was escalated'
  },

  // Attachments (URLs)
  attachments: [{
    url: String,
    type: String, // 'image', 'document', etc.
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Agent'
    },
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],

  // Source
  source: {
    type: String,
    enum: ['whatsapp', 'web', 'mobile_app', 'ai', 'agent'],
    default: 'whatsapp',
    description: 'How the ticket was created'
  },

  // Timestamps
  closedAt: {
    type: Date,
    description: 'When ticket was closed'
  }
}, {
  timestamps: true
});

// Indexes for performance
ticketSchema.index({ customerId: 1, status: 1 });
ticketSchema.index({ assignedAgent: 1, status: 1 });
ticketSchema.index({ category: 1, status: 1 });
ticketSchema.index({ priority: 1, status: 1 });
ticketSchema.index({ createdAt: -1 });
ticketSchema.index({ tags: 1 });

// Compound index for common queries
ticketSchema.index({ status: 1, priority: -1, createdAt: -1 });

// Text search index
ticketSchema.index({
  ticketId: 'text',
  subject: 'text',
  description: 'text'
});

// Virtual for customer population
ticketSchema.virtual('customer', {
  ref: 'Customer',
  localField: 'customerId',
  foreignField: '_id',
  justOne: true
});

// Virtual for conversation population
ticketSchema.virtual('conversation', {
  ref: 'Conversation',
  localField: 'conversationId',
  foreignField: '_id',
  justOne: true
});

// Virtual for agent population
ticketSchema.virtual('agent', {
  ref: 'Agent',
  localField: 'assignedAgent',
  foreignField: '_id',
  justOne: true
});

// Pre-save middleware to update status history
ticketSchema.pre('save', function(next) {
  if (this.isModified('status') && !this.isNew) {
    const oldStatus = this._original ? this._original.status : 'new';
    this.statusHistory.push({
      from: oldStatus,
      to: this.status,
      changedBy: this._changedBy, // Set by service layer
      reason: this._statusChangeReason, // Set by service layer
      timestamp: new Date()
    });
  }
  next();
});

// Store original document for status change tracking
ticketSchema.post('init', function() {
  this._original = this.toObject();
});

module.exports = mongoose.model('Ticket', ticketSchema);
```

**Key Features**:
- **Dynamic category validation**: Validates against configured categories from database
- **Status workflow**: 7-state lifecycle (new → open → in_progress → ... → closed)
- **Status history tracking**: Automatic tracking via pre-save middleware
- **SLA storage**: Fields for SLA targets and actual times (no monitoring yet)
- **Flexible relationships**: Links to Customer, Conversation, Agent
- **Internal notes system**: Notes with isInternal flag
- **Escalation support**: Manual escalation with reason tracking
- **Text search**: Full-text search on ticketId, subject, description

**Status Transitions**:
```
new → open (agent reviews)
open → in_progress (agent starts work)
in_progress → pending_customer (awaiting customer response)
pending_customer → in_progress (customer responds)
in_progress → waiting_internal (awaiting internal resource)
in_progress → resolved (solution provided)
resolved → closed (customer confirms or timeout)
```

**Important Notes**:
- Use async validator for category (queries configService)
- Status history auto-populated via middleware
- Set `this._changedBy` and `this._statusChangeReason` in service layer before save
- Virtuals not included in toJSON by default (configure if needed)

---

### 1.3 Create Ticket Service

**File**: `src/services/ticketService.js`

**Purpose**: All ticket business logic with Socket.io event emission

**Implementation**:
```javascript
const Ticket = require('../models/Ticket');
const TicketCounter = require('../models/TicketCounter');
const Customer = require('../models/Customer');
const Conversation = require('../models/Conversation');
const configService = require('./configurationService');
const { io } = require('../models/server');

class TicketService {
  /**
   * Create a new ticket (from AI tool call)
   * @param {Object} data - Ticket data from AI
   * @returns {Promise<Object>} Created ticket
   */
  async createTicketFromAI(data) {
    const {
      subject,
      description,
      category,
      priority = 'medium',
      location,
      customerId,
      conversationId
    } = data;

    // Validate customer exists
    const customer = await Customer.findById(customerId);
    if (!customer) {
      throw new Error('Customer not found');
    }

    // Get ticket ID format from configuration
    const idFormat = await configService.getTicketIdFormat();

    // Generate unique ticket ID
    const ticketId = await TicketCounter.generateTicketId(idFormat);

    // Get SLA targets based on priority (from config or defaults)
    const slaTargets = this.getSLATargets(priority);

    // Create ticket
    const ticket = new Ticket({
      ticketId,
      subject,
      description,
      category,
      priority,
      location,
      customerId,
      conversationId,
      status: 'new',
      source: 'ai',
      sla: {
        firstResponseTarget: slaTargets.firstResponse,
        resolutionTarget: slaTargets.resolution
      }
    });

    await ticket.save();

    // Update customer statistics
    await Customer.findByIdAndUpdate(customerId, {
      $inc: { 'statistics.totalTickets': 1 }
    });

    // Emit Socket.io event
    io.emit('ticket_created', {
      ticket: await ticket.populate('customerId', 'phoneNumber firstName lastName'),
      customerId,
      conversationId
    });

    console.log(`[TicketService] Ticket ${ticketId} created from AI for customer ${customerId}`);

    return ticket;
  }

  /**
   * Create a ticket manually (from agent)
   * @param {Object} data - Ticket data
   * @param {ObjectId} agentId - Agent creating the ticket
   * @returns {Promise<Object>} Created ticket
   */
  async createTicketFromAgent(data, agentId) {
    const {
      subject,
      description,
      category,
      priority = 'medium',
      customerId,
      conversationId,
      assignToSelf = false
    } = data;

    // Validate customer
    const customer = await Customer.findById(customerId);
    if (!customer) {
      throw new Error('Customer not found');
    }

    // Generate ticket ID
    const idFormat = await configService.getTicketIdFormat();
    const ticketId = await TicketCounter.generateTicketId(idFormat);

    // Get SLA targets
    const slaTargets = this.getSLATargets(priority);

    // Create ticket
    const ticket = new Ticket({
      ticketId,
      subject,
      description,
      category,
      priority,
      customerId,
      conversationId,
      status: 'open',
      source: 'agent',
      assignedAgent: assignToSelf ? agentId : null,
      assignedAt: assignToSelf ? new Date() : null,
      sla: {
        firstResponseTarget: slaTargets.firstResponse,
        resolutionTarget: slaTargets.resolution
      }
    });

    await ticket.save();

    // Update customer statistics
    await Customer.findByIdAndUpdate(customerId, {
      $inc: { 'statistics.totalTickets': 1 }
    });

    // Emit Socket.io event
    io.emit('ticket_created', {
      ticket: await ticket.populate(['customerId', 'assignedAgent']),
      createdBy: agentId
    });

    console.log(`[TicketService] Ticket ${ticketId} created by agent ${agentId}`);

    return ticket;
  }

  /**
   * Get ticket by ID with populated references
   * @param {string} ticketId - Ticket ID (e.g., "LUX-2025-000001")
   * @returns {Promise<Object>} Ticket document
   */
  async getTicketById(ticketId) {
    const ticket = await Ticket.findOne({ ticketId })
      .populate('customerId', 'phoneNumber firstName lastName email avatar')
      .populate('conversationId', 'status lastMessage')
      .populate('assignedAgent', 'firstName lastName email avatar')
      .populate('resolvedBy', 'firstName lastName email')
      .populate('notes.agentId', 'firstName lastName');

    if (!ticket) {
      throw new Error('Ticket not found');
    }

    return ticket;
  }

  /**
   * Get ticket by ID for customer (security check)
   * @param {string} ticketId - Ticket ID
   * @param {ObjectId} customerId - Customer ID for verification
   * @returns {Promise<Object>} Ticket document
   */
  async getTicketByIdForCustomer(ticketId, customerId) {
    const ticket = await Ticket.findOne({ ticketId, customerId })
      .populate('assignedAgent', 'firstName lastName')
      .select('-notes'); // Exclude internal notes

    if (!ticket) {
      throw new Error('Ticket not found or access denied');
    }

    return ticket;
  }

  /**
   * Get all tickets for a customer
   * @param {ObjectId} customerId - Customer ID
   * @param {Object} options - Query options (status, limit, skip)
   * @returns {Promise<Array>} Array of tickets
   */
  async getTicketsByCustomer(customerId, options = {}) {
    const { status, limit = 20, skip = 0, sortBy = 'createdAt', sortOrder = 'desc' } = options;

    const filter = { customerId };
    if (status) filter.status = status;

    const sort = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

    const tickets = await Ticket.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .populate('assignedAgent', 'firstName lastName')
      .select('-notes'); // Exclude internal notes

    return tickets;
  }

  /**
   * Get all tickets assigned to an agent
   * @param {ObjectId} agentId - Agent ID
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Array of tickets
   */
  async getTicketsByAgent(agentId, options = {}) {
    const { status, limit = 20, skip = 0 } = options;

    const filter = { assignedAgent: agentId };
    if (status) filter.status = status;

    const tickets = await Ticket.find(filter)
      .sort({ priority: -1, createdAt: -1 }) // Urgent first, then newest
      .skip(skip)
      .limit(limit)
      .populate('customerId', 'phoneNumber firstName lastName');

    return tickets;
  }

  /**
   * Update ticket status with history tracking
   * @param {string} ticketId - Ticket ID
   * @param {string} newStatus - New status
   * @param {ObjectId} agentId - Agent making the change
   * @param {string} reason - Reason for status change
   * @returns {Promise<Object>} Updated ticket
   */
  async updateTicketStatus(ticketId, newStatus, agentId, reason = null) {
    const ticket = await this.getTicketById(ticketId);

    // Set metadata for pre-save hook
    ticket._changedBy = agentId;
    ticket._statusChangeReason = reason;

    const oldStatus = ticket.status;
    ticket.status = newStatus;

    // Handle special status transitions
    if (newStatus === 'resolved' && !ticket.resolvedAt) {
      ticket.resolvedAt = new Date();
      ticket.resolvedBy = agentId;

      // Check if SLA met
      const resolutionTime = Date.now() - ticket.createdAt.getTime();
      ticket.sla.resolutionMet = resolutionTime <= ticket.sla.resolutionTarget;
    }

    if (newStatus === 'closed' && !ticket.closedAt) {
      ticket.closedAt = new Date();
    }

    if (newStatus === 'in_progress' && !ticket.sla.firstResponseAt) {
      ticket.sla.firstResponseAt = new Date();

      // Check if first response SLA met
      const firstResponseTime = Date.now() - ticket.createdAt.getTime();
      ticket.sla.firstResponseMet = firstResponseTime <= ticket.sla.firstResponseTarget;
    }

    await ticket.save();

    // Emit Socket.io event
    io.emit('ticket_updated', {
      ticketId: ticket.ticketId,
      oldStatus,
      newStatus,
      updatedBy: agentId,
      reason
    });

    console.log(`[TicketService] Ticket ${ticketId} status changed: ${oldStatus} → ${newStatus}`);

    return ticket;
  }

  /**
   * Assign ticket to agent
   * @param {string} ticketId - Ticket ID
   * @param {ObjectId} agentId - Agent ID to assign to
   * @returns {Promise<Object>} Updated ticket
   */
  async assignTicket(ticketId, agentId) {
    const ticket = await this.getTicketById(ticketId);

    ticket.assignedAgent = agentId;
    ticket.assignedAt = new Date();

    // Auto-transition to 'open' if currently 'new'
    if (ticket.status === 'new') {
      ticket._changedBy = agentId;
      ticket._statusChangeReason = 'Assigned to agent';
      ticket.status = 'open';
    }

    await ticket.save();

    // Emit Socket.io event
    io.emit('ticket_assigned', {
      ticketId: ticket.ticketId,
      agentId,
      customerId: ticket.customerId
    });

    console.log(`[TicketService] Ticket ${ticketId} assigned to agent ${agentId}`);

    return ticket;
  }

  /**
   * Add note to ticket
   * @param {string} ticketId - Ticket ID
   * @param {string} content - Note content
   * @param {ObjectId} agentId - Agent adding the note
   * @param {boolean} isInternal - Whether note is internal
   * @returns {Promise<Object>} Updated ticket
   */
  async addNote(ticketId, content, agentId, isInternal = true) {
    const ticket = await this.getTicketById(ticketId);

    ticket.notes.push({
      agentId,
      content,
      isInternal,
      timestamp: new Date()
    });

    await ticket.save();

    // Emit Socket.io event
    io.emit('ticket_note_added', {
      ticketId: ticket.ticketId,
      note: ticket.notes[ticket.notes.length - 1],
      agentId
    });

    console.log(`[TicketService] Note added to ticket ${ticketId} by agent ${agentId}`);

    return ticket;
  }

  /**
   * Resolve ticket
   * @param {string} ticketId - Ticket ID
   * @param {string} resolutionNotes - Resolution details
   * @param {ObjectId} agentId - Agent resolving the ticket
   * @returns {Promise<Object>} Updated ticket
   */
  async resolveTicket(ticketId, resolutionNotes, agentId) {
    const ticket = await this.getTicketById(ticketId);

    ticket.resolutionNotes = resolutionNotes;
    ticket.resolvedAt = new Date();
    ticket.resolvedBy = agentId;

    // Check resolution SLA
    const resolutionTime = Date.now() - ticket.createdAt.getTime();
    ticket.sla.resolutionMet = resolutionTime <= ticket.sla.resolutionTarget;

    ticket._changedBy = agentId;
    ticket._statusChangeReason = 'Resolved by agent';
    ticket.status = 'resolved';

    await ticket.save();

    // Emit Socket.io event
    io.emit('ticket_resolved', {
      ticketId: ticket.ticketId,
      resolvedBy: agentId,
      resolutionNotes
    });

    console.log(`[TicketService] Ticket ${ticketId} resolved by agent ${agentId}`);

    return ticket;
  }

  /**
   * Escalate ticket
   * @param {string} ticketId - Ticket ID
   * @param {ObjectId} toAgentId - Agent to escalate to
   * @param {string} reason - Escalation reason
   * @param {ObjectId} fromAgentId - Agent escalating
   * @returns {Promise<Object>} Updated ticket
   */
  async escalateTicket(ticketId, toAgentId, reason, fromAgentId) {
    const ticket = await this.getTicketById(ticketId);

    ticket.isEscalated = true;
    ticket.escalatedTo = toAgentId;
    ticket.escalationReason = reason;
    ticket.escalatedAt = new Date();
    ticket.assignedAgent = toAgentId;
    ticket.assignedAt = new Date();

    await ticket.save();

    // Emit Socket.io event
    io.emit('ticket_escalated', {
      ticketId: ticket.ticketId,
      fromAgent: fromAgentId,
      toAgent: toAgentId,
      reason
    });

    console.log(`[TicketService] Ticket ${ticketId} escalated to agent ${toAgentId}`);

    return ticket;
  }

  /**
   * Get SLA targets based on priority
   * @param {string} priority - Ticket priority
   * @returns {Object} SLA targets in milliseconds
   */
  getSLATargets(priority) {
    const targets = {
      urgent: {
        firstResponse: 15 * 60 * 1000,      // 15 minutes
        resolution: 4 * 60 * 60 * 1000      // 4 hours
      },
      high: {
        firstResponse: 60 * 60 * 1000,      // 1 hour
        resolution: 24 * 60 * 60 * 1000     // 24 hours
      },
      medium: {
        firstResponse: 4 * 60 * 60 * 1000,  // 4 hours
        resolution: 72 * 60 * 60 * 1000     // 72 hours
      },
      low: {
        firstResponse: 24 * 60 * 60 * 1000, // 24 hours
        resolution: 7 * 24 * 60 * 60 * 1000 // 7 days
      }
    };

    return targets[priority] || targets.medium;
  }

  /**
   * Search tickets (full-text search)
   * @param {string} query - Search query
   * @param {Object} options - Filter options
   * @returns {Promise<Array>} Array of tickets
   */
  async searchTickets(query, options = {}) {
    const { status, category, priority, limit = 20, skip = 0 } = options;

    const filter = {
      $text: { $search: query }
    };

    if (status) filter.status = status;
    if (category) filter.category = category;
    if (priority) filter.priority = priority;

    const tickets = await Ticket.find(filter)
      .sort({ score: { $meta: 'textScore' } })
      .skip(skip)
      .limit(limit)
      .populate('customerId', 'phoneNumber firstName lastName')
      .populate('assignedAgent', 'firstName lastName');

    return tickets;
  }

  /**
   * Get ticket statistics
   * @param {Object} filter - Optional filter (agentId, customerId, etc.)
   * @returns {Promise<Object>} Statistics object
   */
  async getTicketStats(filter = {}) {
    const stats = await Ticket.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          new: { $sum: { $cond: [{ $eq: ['$status', 'new'] }, 1, 0] } },
          open: { $sum: { $cond: [{ $eq: ['$status', 'open'] }, 1, 0] } },
          inProgress: { $sum: { $cond: [{ $eq: ['$status', 'in_progress'] }, 1, 0] } },
          resolved: { $sum: { $cond: [{ $eq: ['$status', 'resolved'] }, 1, 0] } },
          closed: { $sum: { $cond: [{ $eq: ['$status', 'closed'] }, 1, 0] } },
          urgent: { $sum: { $cond: [{ $eq: ['$priority', 'urgent'] }, 1, 0] } },
          high: { $sum: { $cond: [{ $eq: ['$priority', 'high'] }, 1, 0] } },
          escalated: { $sum: { $cond: ['$isEscalated', 1, 0] } }
        }
      }
    ]);

    return stats[0] || {
      total: 0,
      new: 0,
      open: 0,
      inProgress: 0,
      resolved: 0,
      closed: 0,
      urgent: 0,
      high: 0,
      escalated: 0
    };
  }
}

module.exports = new TicketService();
```

**Key Features**:
- **Socket.io emission from service layer** (not controllers)
- **Status history tracking** via `_changedBy` and `_statusChangeReason`
- **SLA calculation** on status transitions
- **Security**: `getTicketByIdForCustomer` excludes internal notes
- **Flexible querying**: By customer, agent, status, text search
- **Statistics aggregation** for dashboard
- **Singleton export** (single instance)

**Socket.io Events Emitted**:
- `ticket_created` - New ticket created
- `ticket_updated` - Status changed
- `ticket_assigned` - Ticket assigned to agent
- `ticket_note_added` - Note added
- `ticket_resolved` - Ticket resolved
- `ticket_escalated` - Ticket escalated

---

### 1.4 Integrate with OpenAI Service

**File**: `src/services/openaiService.js`

**Modify**: `handleToolCalls` function (around line 214)

**Current Implementation**:
```javascript
async function handleToolCalls(threadId, runId, toolCalls, headers, userId) {
  const toolOutputs = [];
  for (const call of toolCalls) {
    const functionName = call.function.name;
    const args = JSON.parse(call.function.arguments || "{}");
    let output = JSON.stringify({ success: true }); // Default

    // Implement tool logic here (ticket creation, etc.)
    if (functionName === "create_ticket_report") {
      output = JSON.stringify({ success: true, ticketId: `TICKET-${Date.now()}`, message: "Ticket created" });
    } else if (functionName === "get_ticket_information") {
      output = JSON.stringify({ success: true, status: "open", description: "Sample ticket info" });
    }

    toolOutputs.push({ tool_call_id: call.id, output });
  }
  // ... submit tool outputs
}
```

**Updated Implementation**:
```javascript
const ticketService = require('./ticketService');
const Customer = require('../models/Customer');
const Conversation = require('../models/Conversation');
const configService = require('./configurationService');

async function handleToolCalls(threadId, runId, toolCalls, headers, userId) {
  const toolOutputs = [];

  for (const call of toolCalls) {
    const functionName = call.function.name;
    const args = JSON.parse(call.function.arguments || "{}");
    let output;

    if (functionName === "create_ticket_report") {
      try {
        // Get customer by phone (userId is phone number)
        const customer = await Customer.findOne({ phoneNumber: userId });
        if (!customer) {
          output = JSON.stringify({
            success: false,
            error: "No se pudo identificar al cliente. Por favor contacta a un agente."
          });
          toolOutputs.push({ tool_call_id: call.id, output });
          continue;
        }

        // Get conversation if exists
        const conversation = await Conversation.findOne({
          customerId: customer._id,
          status: { $in: ['open', 'assigned'] }
        }).sort({ updatedAt: -1 });

        // Get valid categories
        const categories = await configService.getTicketCategories();
        const validCategoryIds = categories.map(c => c.id);

        // Validate category
        let category = args.category || 'other';
        if (!validCategoryIds.includes(category)) {
          category = 'other'; // Fallback to 'other' if invalid
        }

        // Validate priority
        const validPriorities = ['low', 'medium', 'high', 'urgent'];
        let priority = args.priority || 'medium';
        if (!validPriorities.includes(priority)) {
          priority = 'medium';
        }

        // Create ticket via service
        const ticket = await ticketService.createTicketFromAI({
          subject: args.subject,
          description: args.description,
          category: category,
          priority: priority,
          location: args.location,
          customerId: customer._id,
          conversationId: conversation ? conversation._id : null
        });

        // Get terminology for response
        const terminology = await configService.getTicketTerminology();

        output = JSON.stringify({
          success: true,
          ticketId: ticket.ticketId,
          message: `${terminology.ticketSingular} creado exitosamente. Tu número de ${terminology.ticketSingular} es ${ticket.ticketId}.`
        });

        console.log(`[OpenAI] Created ticket ${ticket.ticketId} for customer ${customer.phoneNumber}`);
      } catch (error) {
        console.error('[OpenAI] Error creating ticket:', error);
        output = JSON.stringify({
          success: false,
          error: "No se pudo crear el reporte. Por favor intenta de nuevo o contacta a un agente."
        });
      }
    }
    else if (functionName === "get_ticket_information") {
      try {
        // Get customer by phone
        const customer = await Customer.findOne({ phoneNumber: userId });
        if (!customer) {
          output = JSON.stringify({
            success: false,
            error: "No se pudo identificar al cliente."
          });
          toolOutputs.push({ tool_call_id: call.id, output });
          continue;
        }

        if (args.ticket_id) {
          // Get specific ticket
          try {
            const ticket = await ticketService.getTicketByIdForCustomer(
              args.ticket_id,
              customer._id
            );

            output = JSON.stringify({
              success: true,
              ticket: {
                ticketId: ticket.ticketId,
                subject: ticket.subject,
                status: ticket.status,
                priority: ticket.priority,
                createdAt: ticket.createdAt,
                assignedAgent: ticket.assignedAgent ?
                  `${ticket.assignedAgent.firstName} ${ticket.assignedAgent.lastName}` :
                  'No asignado',
                resolutionNotes: ticket.resolutionNotes
              }
            });
          } catch (error) {
            output = JSON.stringify({
              success: false,
              error: `No se encontró el reporte ${args.ticket_id} o no tienes acceso a él.`
            });
          }
        } else if (args.lookup_recent) {
          // Get customer's recent tickets
          const tickets = await ticketService.getTicketsByCustomer(customer._id, {
            limit: 5,
            sortBy: 'createdAt',
            sortOrder: 'desc'
          });

          if (tickets.length === 0) {
            output = JSON.stringify({
              success: true,
              message: "No tienes reportes registrados."
            });
          } else {
            const ticketSummaries = tickets.map(t => ({
              ticketId: t.ticketId,
              subject: t.subject,
              status: t.status,
              createdAt: t.createdAt
            }));

            output = JSON.stringify({
              success: true,
              tickets: ticketSummaries,
              message: `Encontré ${tickets.length} reportes recientes.`
            });
          }
        } else {
          output = JSON.stringify({
            success: false,
            error: "Debes proporcionar un número de reporte o solicitar los reportes recientes."
          });
        }
      } catch (error) {
        console.error('[OpenAI] Error getting ticket info:', error);
        output = JSON.stringify({
          success: false,
          error: "No se pudo obtener la información del reporte."
        });
      }
    }
    else {
      // Unknown function
      output = JSON.stringify({
        success: false,
        error: "Función desconocida"
      });
    }

    toolOutputs.push({ tool_call_id: call.id, output });
  }

  // Submit tool outputs to OpenAI
  await axios.post(
    `${BASE_URL}/threads/${threadId}/runs/${runId}/submit_tool_outputs`,
    { tool_outputs: toolOutputs },
    { headers }
  );
}
```

**Key Changes**:
- Replaced placeholder logic with actual ticket service calls
- Customer lookup by phone number (userId)
- Dynamic category validation against configured categories
- Uses dynamic terminology in response messages
- Error handling with user-friendly Spanish messages
- Security: Customers can only access their own tickets
- Support for both specific ticket lookup and recent tickets list

**Important Notes**:
- Always return JSON string to OpenAI (never throw)
- Use configured terminology for messages
- Validate all input from AI (category, priority)
- Fallback to defaults if invalid input
- Include ticket ID in success response

---

### Phase 1 Summary

**Files Created**:
1. `src/models/TicketCounter.js` - Sequential ID generation
2. `src/models/Ticket.js` - Ticket schema with dynamic validation
3. `src/services/ticketService.js` - Ticket business logic with Socket.io

**Files Modified**:
1. `src/services/openaiService.js` - Replace placeholder tool handlers with real implementation

**Testing Checklist**:
- [ ] Ticket ID generation works (LUX-2025-000001 format)
- [ ] Year reset works (sequence resets on year change)
- [ ] AI can create tickets via WhatsApp
- [ ] Category validation works (rejects invalid categories)
- [ ] Socket.io events are emitted correctly
- [ ] Customer statistics are updated (totalTickets increments)
- [ ] Status history is tracked automatically
- [ ] SLA targets are calculated based on priority
- [ ] Security: Customers can only access their tickets

---

## Phase 2: Backend API (Controllers & Routes)

### Objective
Create HTTP API endpoints for ticket management with proper authentication, validation, and pagination.

### 2.1 Create Ticket Controller

**File**: `src/controllers/ticketController.js`

**Purpose**: HTTP handlers for ticket CRUD operations

**Implementation**:
```javascript
const ticketService = require('../services/ticketService');
const configService = require('../services/configurationService');

/**
 * GET /api/v2/tickets
 * List tickets with filters and pagination
 */
async function listTickets(req, res) {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      category,
      priority,
      assignedAgent,
      customerId,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Build filter
    const filter = {};
    if (status) filter.status = status;
    if (category) filter.category = category;
    if (priority) filter.priority = priority;
    if (assignedAgent) filter.assignedAgent = assignedAgent;
    if (customerId) filter.customerId = customerId;

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    let tickets, total;

    if (search) {
      // Full-text search
      tickets = await ticketService.searchTickets(search, {
        ...filter,
        limit: parseInt(limit),
        skip
      });
      total = tickets.length; // Approximate for search
    } else {
      // Regular query
      const Ticket = require('../models/Ticket');
      const sort = {};
      sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

      [tickets, total] = await Promise.all([
        Ticket.find(filter)
          .sort(sort)
          .skip(skip)
          .limit(parseInt(limit))
          .populate('customerId', 'phoneNumber firstName lastName avatar')
          .populate('assignedAgent', 'firstName lastName avatar')
          .select('-notes'), // Exclude internal notes from list
        Ticket.countDocuments(filter)
      ]);
    }

    res.json({
      success: true,
      tickets,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('[TicketController] Error listing tickets:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * GET /api/v2/tickets/:id
 * Get single ticket details
 */
async function getTicket(req, res) {
  try {
    const { id } = req.params;

    const ticket = await ticketService.getTicketById(id);

    res.json({
      success: true,
      ticket
    });
  } catch (error) {
    console.error('[TicketController] Error getting ticket:', error);
    res.status(404).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * POST /api/v2/tickets
 * Create a new ticket (manual creation by agent)
 */
async function createTicket(req, res) {
  try {
    const {
      subject,
      description,
      category,
      priority,
      customerId,
      conversationId,
      assignToSelf
    } = req.body;

    // Validate required fields
    if (!subject || !description || !category || !customerId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: subject, description, category, customerId'
      });
    }

    // Validate category
    const isValid = await configService.isValidCategory(category);
    if (!isValid) {
      return res.status(400).json({
        success: false,
        error: 'Invalid ticket category'
      });
    }

    const agentId = req.agent._id;

    const ticket = await ticketService.createTicketFromAgent({
      subject,
      description,
      category,
      priority,
      customerId,
      conversationId,
      assignToSelf
    }, agentId);

    res.status(201).json({
      success: true,
      ticket
    });
  } catch (error) {
    console.error('[TicketController] Error creating ticket:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * PUT /api/v2/tickets/:id
 * Update ticket (general fields)
 */
async function updateTicket(req, res) {
  try {
    const { id } = req.params;
    const updates = req.body;
    const agentId = req.agent._id;

    // Prevent updating critical fields via this endpoint
    delete updates.ticketId;
    delete updates.customerId;
    delete updates.createdAt;
    delete updates.status; // Use dedicated endpoint

    const Ticket = require('../models/Ticket');
    const ticket = await Ticket.findOneAndUpdate(
      { ticketId: id },
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!ticket) {
      return res.status(404).json({
        success: false,
        error: 'Ticket not found'
      });
    }

    // Emit update event
    const { io } = require('../models/server');
    io.emit('ticket_updated', {
      ticketId: ticket.ticketId,
      updates,
      updatedBy: agentId
    });

    res.json({
      success: true,
      ticket
    });
  } catch (error) {
    console.error('[TicketController] Error updating ticket:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * POST /api/v2/tickets/:id/assign
 * Assign ticket to agent
 */
async function assignTicket(req, res) {
  try {
    const { id } = req.params;
    const { agentId } = req.body;

    if (!agentId) {
      return res.status(400).json({
        success: false,
        error: 'Agent ID is required'
      });
    }

    const ticket = await ticketService.assignTicket(id, agentId);

    res.json({
      success: true,
      ticket
    });
  } catch (error) {
    console.error('[TicketController] Error assigning ticket:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * POST /api/v2/tickets/:id/status
 * Update ticket status
 */
async function updateTicketStatus(req, res) {
  try {
    const { id } = req.params;
    const { status, reason } = req.body;
    const agentId = req.agent._id;

    if (!status) {
      return res.status(400).json({
        success: false,
        error: 'Status is required'
      });
    }

    const validStatuses = ['new', 'open', 'in_progress', 'pending_customer', 'waiting_internal', 'resolved', 'closed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid status'
      });
    }

    const ticket = await ticketService.updateTicketStatus(id, status, agentId, reason);

    res.json({
      success: true,
      ticket
    });
  } catch (error) {
    console.error('[TicketController] Error updating status:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * POST /api/v2/tickets/:id/notes
 * Add note to ticket
 */
async function addTicketNote(req, res) {
  try {
    const { id } = req.params;
    const { content, isInternal = true } = req.body;
    const agentId = req.agent._id;

    if (!content) {
      return res.status(400).json({
        success: false,
        error: 'Note content is required'
      });
    }

    const ticket = await ticketService.addNote(id, content, agentId, isInternal);

    res.json({
      success: true,
      ticket,
      note: ticket.notes[ticket.notes.length - 1]
    });
  } catch (error) {
    console.error('[TicketController] Error adding note:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * POST /api/v2/tickets/:id/resolve
 * Resolve ticket
 */
async function resolveTicket(req, res) {
  try {
    const { id } = req.params;
    const { resolutionNotes } = req.body;
    const agentId = req.agent._id;

    if (!resolutionNotes) {
      return res.status(400).json({
        success: false,
        error: 'Resolution notes are required'
      });
    }

    const ticket = await ticketService.resolveTicket(id, resolutionNotes, agentId);

    res.json({
      success: true,
      ticket
    });
  } catch (error) {
    console.error('[TicketController] Error resolving ticket:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * POST /api/v2/tickets/:id/escalate
 * Escalate ticket to another agent
 */
async function escalateTicket(req, res) {
  try {
    const { id } = req.params;
    const { toAgentId, reason } = req.body;
    const fromAgentId = req.agent._id;

    if (!toAgentId || !reason) {
      return res.status(400).json({
        success: false,
        error: 'Target agent ID and reason are required'
      });
    }

    const ticket = await ticketService.escalateTicket(id, toAgentId, reason, fromAgentId);

    res.json({
      success: true,
      ticket
    });
  } catch (error) {
    console.error('[TicketController] Error escalating ticket:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * GET /api/v2/tickets/stats/summary
 * Get ticket statistics
 */
async function getTicketStats(req, res) {
  try {
    const { agentId, customerId } = req.query;

    const filter = {};
    if (agentId) filter.assignedAgent = agentId;
    if (customerId) filter.customerId = customerId;

    const stats = await ticketService.getTicketStats(filter);

    res.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('[TicketController] Error getting stats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * GET /api/v2/customers/:customerId/tickets
 * Get all tickets for a customer
 */
async function getCustomerTickets(req, res) {
  try {
    const { customerId } = req.params;
    const { status, page = 1, limit = 20 } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const tickets = await ticketService.getTicketsByCustomer(customerId, {
      status,
      limit: parseInt(limit),
      skip
    });

    const Ticket = require('../models/Ticket');
    const total = await Ticket.countDocuments({
      customerId,
      ...(status && { status })
    });

    res.json({
      success: true,
      tickets,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('[TicketController] Error getting customer tickets:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * GET /api/v2/conversations/:conversationId/tickets
 * Get all tickets related to a conversation
 */
async function getConversationTickets(req, res) {
  try {
    const { conversationId } = req.params;

    const Ticket = require('../models/Ticket');
    const tickets = await Ticket.find({ conversationId })
      .sort({ createdAt: -1 })
      .populate('customerId', 'phoneNumber firstName lastName')
      .populate('assignedAgent', 'firstName lastName');

    res.json({
      success: true,
      tickets
    });
  } catch (error) {
    console.error('[TicketController] Error getting conversation tickets:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

module.exports = {
  listTickets,
  getTicket,
  createTicket,
  updateTicket,
  assignTicket,
  updateTicketStatus,
  addTicketNote,
  resolveTicket,
  escalateTicket,
  getTicketStats,
  getCustomerTickets,
  getConversationTickets
};
```

**Controller Characteristics**:
- Thin controllers (business logic in service layer)
- Input validation before service calls
- Consistent error response format
- Authentication via middleware (`req.agent`)
- Pagination support
- Search support

---

### 2.2 Create Ticket Routes

**File**: `src/routes/ticketRoutes.js`

**Purpose**: RESTful API route definitions

**Implementation**:
```javascript
const express = require('express');
const router = express.Router();
const ticketController = require('../controllers/ticketController');
const { authenticateToken } = require('../middleware/authMiddleware');

// All ticket routes require authentication
router.use(authenticateToken);

/**
 * Ticket CRUD Operations
 */

// List tickets with filters and pagination
router.get('/', ticketController.listTickets);

// Get ticket statistics
router.get('/stats/summary', ticketController.getTicketStats);

// Get specific ticket
router.get('/:id', ticketController.getTicket);

// Create new ticket (manual creation by agent)
router.post('/', ticketController.createTicket);

// Update ticket (general fields)
router.put('/:id', ticketController.updateTicket);

// Assign ticket to agent
router.post('/:id/assign', ticketController.assignTicket);

// Update ticket status
router.post('/:id/status', ticketController.updateTicketStatus);

// Add note to ticket
router.post('/:id/notes', ticketController.addTicketNote);

// Resolve ticket
router.post('/:id/resolve', ticketController.resolveTicket);

// Escalate ticket
router.post('/:id/escalate', ticketController.escalateTicket);

module.exports = router;
```

**Route Structure**:
```
GET    /api/v2/tickets                    - List tickets (with filters, pagination, search)
GET    /api/v2/tickets/stats/summary      - Get ticket statistics
GET    /api/v2/tickets/:id                - Get single ticket
POST   /api/v2/tickets                    - Create ticket (agent)
PUT    /api/v2/tickets/:id                - Update ticket
POST   /api/v2/tickets/:id/assign         - Assign to agent
POST   /api/v2/tickets/:id/status         - Update status
POST   /api/v2/tickets/:id/notes          - Add note
POST   /api/v2/tickets/:id/resolve        - Resolve ticket
POST   /api/v2/tickets/:id/escalate       - Escalate ticket
```

**Additional Routes** (for customer/conversation integration):

Add these to existing route files:

**In `src/routes/customerRoutes.js`**:
```javascript
// Add after existing routes
router.get('/:customerId/tickets', ticketController.getCustomerTickets);
```

**In `src/routes/conversationRoutes.js`**:
```javascript
// Add after existing routes
router.get('/:conversationId/tickets', ticketController.getConversationTickets);
```

---

### 2.3 Register Ticket Routes

**File**: `src/models/server.js`

**Modify**: `routes()` method

**Add this line**:
```javascript
this.app.use("/api/v2/tickets", require("../routes/ticketRoutes"));
```

**Updated routes() method**:
```javascript
routes() {
  // IMPORTANT: Register more specific routes BEFORE generic ones
  this.app.use("/api/v2/agents", require("../routes/agentRoutes"));
  this.app.use("/api/v2/conversations", require("../routes/conversationRoutes"));
  this.app.use("/api/v2/customers", require("../routes/customerRoutes"));
  this.app.use("/api/v2/templates", require("../routes/templateRoutes"));
  this.app.use("/api/v2/crm-settings", require("../routes/crmSettingsRoutes"));
  this.app.use("/api/v2/config", require("../routes/configurationRoutes"));
  this.app.use("/api/v2/tickets", require("../routes/ticketRoutes")); // NEW
  this.app.use("/api/v2", require("../routes/whatsappRoutes"));
  this.app.use("/health", require("../routes/healthRoutes"));
  this.app.use("/info", require("../routes/infoRoutes"));

  // Angular catch-all
  this.app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../../frontend/dist/frontend/browser/index.html'));
  });
}
```

---

### 2.4 Socket.io Events Summary

**Events Emitted** (from `ticketService.js`):

| Event | Payload | Description |
|-------|---------|-------------|
| `ticket_created` | `{ ticket, customerId, conversationId }` | New ticket created |
| `ticket_updated` | `{ ticketId, oldStatus, newStatus, updatedBy, reason }` | Status changed |
| `ticket_assigned` | `{ ticketId, agentId, customerId }` | Ticket assigned |
| `ticket_note_added` | `{ ticketId, note, agentId }` | Note added |
| `ticket_resolved` | `{ ticketId, resolvedBy, resolutionNotes }` | Ticket resolved |
| `ticket_escalated` | `{ ticketId, fromAgent, toAgent, reason }` | Ticket escalated |

**Frontend Integration** (for later):
```typescript
// In ticket.service.ts
this.socket.on('ticket_created', (data) => this.handleTicketCreated(data));
this.socket.on('ticket_updated', (data) => this.handleTicketUpdated(data));
this.socket.on('ticket_assigned', (data) => this.handleTicketAssigned(data));
this.socket.on('ticket_note_added', (data) => this.handleNoteAdded(data));
this.socket.on('ticket_resolved', (data) => this.handleTicketResolved(data));
this.socket.on('ticket_escalated', (data) => this.handleTicketEscalated(data));
```

---

### Phase 2 Summary

**Files Created**:
1. `src/controllers/ticketController.js` - HTTP handlers for ticket endpoints
2. `src/routes/ticketRoutes.js` - Ticket API routes

**Files Modified**:
1. `src/models/server.js` - Register ticket routes
2. `src/routes/customerRoutes.js` - Add customer tickets endpoint
3. `src/routes/conversationRoutes.js` - Add conversation tickets endpoint

**API Endpoints Created**:
- 10 ticket endpoints (list, get, create, update, assign, status, notes, resolve, escalate, stats)
- 2 integration endpoints (customer tickets, conversation tickets)

**Testing Checklist**:
- [ ] GET `/api/v2/tickets` returns paginated list
- [ ] GET `/api/v2/tickets?status=open` filters by status
- [ ] GET `/api/v2/tickets?search=solar` performs full-text search
- [ ] POST `/api/v2/tickets` creates ticket (requires auth)
- [ ] POST `/api/v2/tickets/:id/assign` assigns ticket
- [ ] POST `/api/v2/tickets/:id/status` updates status
- [ ] POST `/api/v2/tickets/:id/notes` adds note
- [ ] POST `/api/v2/tickets/:id/resolve` resolves ticket
- [ ] GET `/api/v2/customers/:id/tickets` returns customer tickets
- [ ] GET `/api/v2/tickets/stats/summary` returns statistics
- [ ] Socket.io events are emitted on all operations
- [ ] Unauthenticated requests return 401

---

## Complete File Summary

### Phase 0: Configuration System (5 files)

| File | Type | Purpose |
|------|------|---------|
| `src/models/SystemSettings.js` | Model | Multi-document settings storage |
| `src/services/configurationService.js` | Service | Configuration management with caching |
| `src/controllers/configurationController.js` | Controller | HTTP handlers for settings |
| `src/routes/configurationRoutes.js` | Routes | Configuration API endpoints |
| `src/app.js` (modified) | Init | Seed default configurations |

### Phase 1: Ticket Core (3 new + 1 modified)

| File | Type | Purpose |
|------|------|---------|
| `src/models/TicketCounter.js` | Model | Sequential ID generation |
| `src/models/Ticket.js` | Model | Ticket schema with validation |
| `src/services/ticketService.js` | Service | Ticket business logic |
| `src/services/openaiService.js` (modified) | Service | AI tool integration |

### Phase 2: Ticket API (2 new + 3 modified)

| File | Type | Purpose |
|------|------|---------|
| `src/controllers/ticketController.js` | Controller | HTTP handlers |
| `src/routes/ticketRoutes.js` | Routes | API endpoints |
| `src/models/server.js` (modified) | Server | Register routes |
| `src/routes/customerRoutes.js` (modified) | Routes | Customer tickets endpoint |
| `src/routes/conversationRoutes.js` (modified) | Routes | Conversation tickets endpoint |

**Total**: 10 new files + 5 modified files = **15 files**

---

## Environment Variables

**No new environment variables required**. The system uses existing variables:

```env
# Already in .env
COMPANY_NAME=LUXFREE          # Used in default assistant config
OPENAI_API_KEY=...            # Used by openaiService
OPENAI_ASSISTANT_ID=...       # Used by openaiService
```

**Optional** (for initial seeding, but defaults work fine):
```env
TICKET_PREFIX=LUX             # Ticket ID prefix (default: LUX)
```

---

## Database Indexes

**Automatically created** by Mongoose schemas:

### SystemSettings
- `{ key: 1 }` (unique)
- `{ category: 1, key: 1 }`

### TicketCounter
- None (singleton document)

### Ticket
- `{ ticketId: 1 }` (unique)
- `{ customerId: 1 }`
- `{ conversationId: 1 }`
- `{ assignedAgent: 1 }`
- `{ category: 1 }`
- `{ status: 1 }`
- `{ priority: 1 }`
- `{ createdAt: -1 }`
- `{ tags: 1 }`
- `{ customerId: 1, status: 1 }` (compound)
- `{ assignedAgent: 1, status: 1 }` (compound)
- `{ category: 1, status: 1 }` (compound)
- `{ priority: 1, status: 1 }` (compound)
- `{ status: 1, priority: -1, createdAt: -1 }` (compound)
- Text index on `{ ticketId, subject, description }`

---

## Testing Strategy

### Phase 0 Testing

**Configuration Endpoints**:
```bash
# Get all configurations
curl -H "Authorization: Bearer <admin_token>" \
  http://localhost:5000/api/v2/config/all

# Update ticket categories
curl -X PUT -H "Authorization: Bearer <admin_token>" \
  -H "Content-Type: application/json" \
  -d '{"categories":[{"id":"custom","label":"Custom"}]}' \
  http://localhost:5000/api/v2/config/ticket-categories

# Reset to defaults
curl -X POST -H "Authorization: Bearer <admin_token>" \
  http://localhost:5000/api/v2/config/reset/ticket_categories
```

**Database Verification**:
```javascript
// In MongoDB shell or Compass
db.systemsettings.find()
// Should show 4 documents: ticket_categories, assistant_configuration, etc.
```

### Phase 1 Testing

**Ticket Creation via AI** (WhatsApp simulation):
- Send "Necesito reportar una falla en una luminaria" via WhatsApp
- AI should call `create_ticket_report` tool
- Verify ticket created in database
- Verify customer statistics incremented

**Ticket ID Generation**:
```javascript
// Test year reset
const TicketCounter = require('./src/models/TicketCounter');
const configService = require('./src/services/configurationService');

const format = await configService.getTicketIdFormat();
const id1 = await TicketCounter.generateTicketId(format);
console.log(id1); // LUX-2025-000001

// Manually change year in DB to test reset
await TicketCounter.updateOne(
  { _id: 'ticket_counter' },
  { $set: { year: 2024, sequence: 999 } }
);

const id2 = await TicketCounter.generateTicketId(format);
console.log(id2); // LUX-2025-000001 (reset because year changed)
```

### Phase 2 Testing

**API Endpoints**:
```bash
# List tickets
curl -H "Authorization: Bearer <token>" \
  http://localhost:5000/api/v2/tickets?page=1&limit=10

# Get ticket
curl -H "Authorization: Bearer <token>" \
  http://localhost:5000/api/v2/tickets/LUX-2025-000001

# Create ticket
curl -X POST -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"subject":"Test","description":"Test desc","category":"maintenance","customerId":"<id>"}' \
  http://localhost:5000/api/v2/tickets

# Assign ticket
curl -X POST -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"agentId":"<agent_id>"}' \
  http://localhost:5000/api/v2/tickets/LUX-2025-000001/assign

# Update status
curl -X POST -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"status":"in_progress","reason":"Started work"}' \
  http://localhost:5000/api/v2/tickets/LUX-2025-000001/status

# Resolve ticket
curl -X POST -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"resolutionNotes":"Replaced faulty component"}' \
  http://localhost:5000/api/v2/tickets/LUX-2025-000001/resolve
```

**Socket.io Testing** (use Socket.io client in browser console):
```javascript
const socket = io('http://localhost:5000');

socket.on('ticket_created', (data) => console.log('Ticket created:', data));
socket.on('ticket_updated', (data) => console.log('Ticket updated:', data));
socket.on('ticket_assigned', (data) => console.log('Ticket assigned:', data));

// Perform actions via API and watch events fire
```

---

## Important Notes & Best Practices

### 1. NO AI Attribution in Commits
When committing these changes, use human-authored commit messages:

```bash
# Good
git commit -m "Add universal ticket system backend with dynamic configuration"

# Bad (don't do this)
git commit -m "Add ticket system 🤖 Generated with Claude Code"
```

### 2. Database-First with Hardcoded Fallback
Always follow this pattern:
```javascript
// 1. Try to get from database
const categories = await configService.getTicketCategories();

// 2. configService automatically falls back to hardcoded defaults if DB is empty
// 3. No need to handle undefined - always returns a value
```

### 3. Socket.io Event Emission Location
- **Service Layer**: Emit events after successful database operations
- **NOT Controller**: Controllers should not emit events (thin controller pattern)

```javascript
// Good - in ticketService.js
await ticket.save();
io.emit('ticket_created', { ticket });

// Bad - in ticketController.js
const ticket = await ticketService.createTicket(...);
io.emit('ticket_created', { ticket }); // DON'T DO THIS
```

### 4. Status History Tracking
Set metadata before saving to trigger pre-save hook:
```javascript
// In ticketService.js
ticket._changedBy = agentId;
ticket._statusChangeReason = reason;
ticket.status = newStatus;
await ticket.save(); // Pre-save hook will record history
```

### 5. Category Validation
The async validator queries the database on every save. For performance:
- Cache is used by configService (5-minute TTL)
- Validation only runs when category field changes
- Fallback to 'other' category in AI tool handlers (don't fail ticket creation)

### 6. Ticket ID Format
The counter uses MongoDB aggregation pipeline for atomicity:
```javascript
// Atomic operation - safe for concurrent requests
const counter = await TicketCounter.findOneAndUpdate(
  { _id: 'ticket_counter' },
  [{ $set: { sequence: { $cond: { ... } } } }],
  { upsert: true, new: true }
);
```

### 7. Error Handling in OpenAI Tool Calls
Always return JSON, never throw:
```javascript
// Good
try {
  const ticket = await ticketService.createTicketFromAI(...);
  output = JSON.stringify({ success: true, ticketId: ticket.ticketId });
} catch (error) {
  output = JSON.stringify({ success: false, error: "User-friendly message" });
}

// Bad - don't throw
if (!customer) {
  throw new Error('Customer not found'); // DON'T DO THIS
}
```

### 8. Security Considerations
- **Customer access**: Use `getTicketByIdForCustomer()` which excludes internal notes
- **Agent access**: Use `getTicketById()` which includes full details
- **Admin-only endpoints**: Configuration routes use `requireAdmin` middleware

---

## OpenAI Assistant Tool Definitions

Add these to your OpenAI Assistant configuration (via OpenAI Dashboard or API):

### Tool 1: create_ticket_report
```json
{
  "type": "function",
  "function": {
    "name": "create_ticket_report",
    "description": "Creates a support ticket for the customer. Use when the customer reports an issue, requests help, or needs follow-up on a problem related to solar installations, lighting, electrical systems, or billing. The ticket will be tracked and assigned to an agent.",
    "parameters": {
      "type": "object",
      "properties": {
        "subject": {
          "type": "string",
          "description": "Brief summary of the issue (max 200 chars)"
        },
        "description": {
          "type": "string",
          "description": "Detailed description of the customer's issue or request, including all relevant details they provided"
        },
        "category": {
          "type": "string",
          "enum": ["solar_installation", "light_malfunction", "maintenance", "electrical_issue", "billing", "other"],
          "description": "Category that best describes the issue: solar_installation (panel installations), light_malfunction (lighting problems), maintenance (preventive/corrective), electrical_issue (electrical failures), billing (payments/invoices), other (uncategorized)"
        },
        "priority": {
          "type": "string",
          "enum": ["low", "medium", "high", "urgent"],
          "description": "Priority level based on issue severity. Use 'urgent' only for critical issues like complete power outages, safety hazards, or emergencies. Use 'high' for serious problems affecting service. Use 'medium' for standard issues. Use 'low' for minor concerns."
        },
        "location": {
          "type": "object",
          "description": "Location information if the issue is related to a physical location",
          "properties": {
            "address": {
              "type": "string",
              "description": "Physical address of the issue"
            },
            "description": {
              "type": "string",
              "description": "Additional location details (building, floor, room, etc.)"
            }
          }
        }
      },
      "required": ["subject", "description", "category"]
    }
  }
}
```

### Tool 2: get_ticket_information
```json
{
  "type": "function",
  "function": {
    "name": "get_ticket_information",
    "description": "Retrieves information about a customer's support ticket. Use when customer asks about ticket status, wants updates, references a previous issue, or asks about their reports/tickets.",
    "parameters": {
      "type": "object",
      "properties": {
        "ticket_id": {
          "type": "string",
          "description": "The ticket ID (format: LUX-YYYY-NNNNNN, e.g., LUX-2025-000001). Optional if looking up by recent tickets."
        },
        "lookup_recent": {
          "type": "boolean",
          "description": "Set to true to retrieve the customer's most recent tickets (up to 5) instead of a specific one. Use this when customer says 'my tickets', 'my reports', 'check my cases', etc."
        }
      },
      "required": []
    }
  }
}
```

**Important**: Update the `category` enum if you change ticket categories via the configuration API.

---

## Migration Path for Existing LUXFREE Deployment

If deploying to an existing LUXFREE instance:

1. **Backup database** before deployment
2. **Deploy code** with new files
3. **Restart server** - initialization runs automatically
4. **Verify seeding**:
   ```bash
   # Check logs for:
   # "🎫 Initializing ticket system with LUXFREE defaults..."
   # "✅ Ticket system initialized successfully"
   ```
5. **Test configuration API**:
   ```bash
   curl -H "Authorization: Bearer <admin_token>" \
     http://localhost:5000/api/v2/config/all
   ```
6. **Test ticket creation via WhatsApp**
7. **Test ticket API endpoints**

**Rollback Plan**:
- Remove ticket routes from `server.js`
- Drop `tickets` and `ticketcounters` collections
- Drop `systemsettings` collection
- Restart server

---

## Future Enhancements (Out of Scope for Phases 0-2)

The following features are planned but NOT included in this implementation:

1. **SLA Monitoring** (Phase 3):
   - Background job to check SLA breaches
   - Automatic priority escalation
   - Email/WhatsApp notifications

2. **Frontend Components** (Phase 4-5):
   - Ticket list view
   - Ticket detail view
   - Ticket creation form
   - Settings management UI
   - Dashboard widgets

3. **OpenAI Assistant Sync** (Phase 6):
   - Automatic sync of tool definitions when categories change
   - Dynamic instructions template with variable replacement

4. **Industry Presets** (Phase 7):
   - Pre-configured settings for restaurants, e-commerce, healthcare
   - "Load Preset" feature in settings UI

---

## Conclusion

This implementation plan provides a complete backend foundation for a universal, multi-industry ticket system. The architecture is:

- **Configurable**: Categories, terminology, and ID format stored in database
- **Scalable**: Works for LUXFREE (lighting) or any other industry without code changes
- **Maintainable**: Clean separation of concerns (models, services, controllers)
- **Real-time**: Socket.io events for instant UI updates
- **Secure**: Role-based access, customer data isolation
- **Production-ready**: Error handling, validation, caching, atomic operations

**Next Steps**:
1. Review this plan
2. Implement Phase 0 (Configuration System)
3. Test configuration endpoints
4. Implement Phase 1 (Ticket Models & Service)
5. Test AI ticket creation
6. Implement Phase 2 (API Endpoints)
7. Test full ticket lifecycle
8. Move to frontend implementation (Phases 4-5)

---

**Document Version**: 1.0
**Last Updated**: 2025-12-21
**Approved for Implementation**: Pending User Confirmation
