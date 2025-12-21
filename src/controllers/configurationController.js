const configService = require('../services/configurationService');

/**
 * Configuration Controller
 * Handles HTTP requests for system configuration management
 * Admin-only access required
 */

/**
 * Get all configurations
 */
async function getAllConfigurations(req, res) {
    try {
        const configurations = {
            ticketCategories: await configService.getTicketCategories(),
            assistantConfig: await configService.getAssistantConfig(),
            terminology: await configService.getTicketTerminology(),
            ticketIdFormat: await configService.getTicketIdFormat(),
            instructionsTemplate: await configService.getInstructionsTemplate(),
            presets: await configService.getConfigurationPresets()
        };

        res.json({
            success: true,
            data: configurations
        });
    } catch (error) {
        console.error('Error getting configurations:', error);
        res.status(500).json({
            success: false,
            error: 'Error al obtener las configuraciones'
        });
    }
}

/**
 * Get ticket categories
 */
async function getTicketCategories(req, res) {
    try {
        const categories = await configService.getTicketCategories();
        res.json({
            success: true,
            data: categories
        });
    } catch (error) {
        console.error('Error getting ticket categories:', error);
        res.status(500).json({
            success: false,
            error: 'Error al obtener las categorías'
        });
    }
}

/**
 * Update ticket categories
 */
async function updateTicketCategories(req, res) {
    try {
        const { categories } = req.body;

        if (!Array.isArray(categories)) {
            return res.status(400).json({
                success: false,
                error: 'Las categorías deben ser un arreglo'
            });
        }

        // Validate category structure
        for (const category of categories) {
            if (!category.id || !category.label) {
                return res.status(400).json({
                    success: false,
                    error: 'Cada categoría debe tener id y label'
                });
            }
        }

        const agentId = req.agent ? req.agent._id : null;
        await configService.updateSetting('ticket_categories', categories, agentId);

        res.json({
            success: true,
            message: 'Categorías actualizadas correctamente'
        });
    } catch (error) {
        console.error('Error updating ticket categories:', error);
        res.status(500).json({
            success: false,
            error: 'Error al actualizar las categorías'
        });
    }
}

/**
 * Get assistant configuration
 */
async function getAssistantConfig(req, res) {
    try {
        const config = await configService.getAssistantConfig();
        res.json({
            success: true,
            data: config
        });
    } catch (error) {
        console.error('Error getting assistant config:', error);
        res.status(500).json({
            success: false,
            error: 'Error al obtener la configuración del asistente'
        });
    }
}

/**
 * Update assistant configuration
 */
async function updateAssistantConfig(req, res) {
    try {
        const { config } = req.body;

        if (!config || typeof config !== 'object') {
            return res.status(400).json({
                success: false,
                error: 'Configuración inválida'
            });
        }

        const agentId = req.agent ? req.agent._id : null;
        await configService.updateSetting('assistant_configuration', config, agentId);

        res.json({
            success: true,
            message: 'Configuración del asistente actualizada correctamente'
        });
    } catch (error) {
        console.error('Error updating assistant config:', error);
        res.status(500).json({
            success: false,
            error: 'Error al actualizar la configuración del asistente'
        });
    }
}

/**
 * Get ticket terminology
 */
async function getTerminology(req, res) {
    try {
        const terminology = await configService.getTicketTerminology();
        res.json({
            success: true,
            data: terminology
        });
    } catch (error) {
        console.error('Error getting terminology:', error);
        res.status(500).json({
            success: false,
            error: 'Error al obtener la terminología'
        });
    }
}

/**
 * Update ticket terminology
 */
async function updateTerminology(req, res) {
    try {
        const { terminology } = req.body;

        if (!terminology || typeof terminology !== 'object') {
            return res.status(400).json({
                success: false,
                error: 'Terminología inválida'
            });
        }

        const agentId = req.agent ? req.agent._id : null;
        await configService.updateSetting('ticket_terminology', terminology, agentId);

        res.json({
            success: true,
            message: 'Terminología actualizada correctamente'
        });
    } catch (error) {
        console.error('Error updating terminology:', error);
        res.status(500).json({
            success: false,
            error: 'Error al actualizar la terminología'
        });
    }
}

/**
 * Get ticket ID format
 */
async function getTicketIdFormat(req, res) {
    try {
        const format = await configService.getTicketIdFormat();
        res.json({
            success: true,
            data: format
        });
    } catch (error) {
        console.error('Error getting ticket ID format:', error);
        res.status(500).json({
            success: false,
            error: 'Error al obtener el formato de ID'
        });
    }
}

/**
 * Update ticket ID format
 */
async function updateTicketIdFormat(req, res) {
    try {
        const { format } = req.body;

        if (!format || typeof format !== 'object') {
            return res.status(400).json({
                success: false,
                error: 'Formato inválido'
            });
        }

        const agentId = req.agent ? req.agent._id : null;
        await configService.updateSetting('ticket_id_format', format, agentId);

        res.json({
            success: true,
            message: 'Formato de ID actualizado correctamente'
        });
    } catch (error) {
        console.error('Error updating ticket ID format:', error);
        res.status(500).json({
            success: false,
            error: 'Error al actualizar el formato de ID'
        });
    }
}

/**
 * Get configuration presets
 */
async function getPresets(req, res) {
    try {
        const presets = await configService.getConfigurationPresets();
        res.json({
            success: true,
            data: presets
        });
    } catch (error) {
        console.error('Error getting presets:', error);
        res.status(500).json({
            success: false,
            error: 'Error al obtener los presets'
        });
    }
}

/**
 * Load a preset configuration
 */
async function loadPreset(req, res) {
    try {
        const { presetId } = req.body;

        if (!presetId) {
            return res.status(400).json({
                success: false,
                error: 'ID de preset requerido'
            });
        }

        const presets = await configService.getConfigurationPresets();
        const preset = presets.find(p => p.id === presetId);

        if (!preset) {
            return res.status(404).json({
                success: false,
                error: 'Preset no encontrado'
            });
        }

        const agentId = req.agent ? req.agent._id : null;

        // Update all configurations from preset
        if (preset.config.assistant_configuration) {
            await configService.updateSetting('assistant_configuration', preset.config.assistant_configuration, agentId);
        }
        if (preset.config.ticket_categories) {
            await configService.updateSetting('ticket_categories', preset.config.ticket_categories, agentId);
        }
        if (preset.config.ticket_terminology) {
            await configService.updateSetting('ticket_terminology', preset.config.ticket_terminology, agentId);
        }
        if (preset.config.ticket_id_format) {
            await configService.updateSetting('ticket_id_format', preset.config.ticket_id_format, agentId);
        }

        res.json({
            success: true,
            message: `Preset "${preset.name}" cargado correctamente`
        });
    } catch (error) {
        console.error('Error loading preset:', error);
        res.status(500).json({
            success: false,
            error: 'Error al cargar el preset'
        });
    }
}

/**
 * Reset all configurations to defaults
 */
async function resetToDefaults(req, res) {
    try {
        const agentId = req.agent ? req.agent._id : null;

        // Reset all to LUXFREE defaults
        await configService.updateSetting('ticket_categories', configService.getDefaultCategories(), agentId);
        await configService.updateSetting('assistant_configuration', configService.getDefaultAssistantConfig(), agentId);
        await configService.updateSetting('ticket_terminology', configService.getDefaultTerminology(), agentId);
        await configService.updateSetting('ticket_id_format', configService.getDefaultIdFormat(), agentId);
        await configService.updateSetting('assistant_instructions_template', configService.getDefaultInstructionsTemplate(), agentId);

        res.json({
            success: true,
            message: 'Configuraciones restablecidas a valores predeterminados (LUXFREE)'
        });
    } catch (error) {
        console.error('Error resetting to defaults:', error);
        res.status(500).json({
            success: false,
            error: 'Error al restablecer las configuraciones'
        });
    }
}

module.exports = {
    getAllConfigurations,
    getTicketCategories,
    updateTicketCategories,
    getAssistantConfig,
    updateAssistantConfig,
    getTerminology,
    updateTerminology,
    getTicketIdFormat,
    updateTicketIdFormat,
    getPresets,
    loadPreset,
    resetToDefaults
};
