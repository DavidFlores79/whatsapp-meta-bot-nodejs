const CRMSettings = require('../models/CRMSettings');

/**
 * CRM Settings Controller
 * Manages CRM configuration settings
 */

/**
 * Get current CRM settings
 */
async function getSettings(req, res) {
    try {
        const settings = await CRMSettings.getSettings();
        
        // Convert milliseconds to hours/minutes for frontend
        const formattedSettings = {
            autoTimeout: {
                open: settings.autoTimeout.open / (60 * 60 * 1000), // hours
                assigned: settings.autoTimeout.assigned / (60 * 60 * 1000), // hours
                waiting: settings.autoTimeout.waiting / (60 * 60 * 1000), // hours
                resolved: settings.autoTimeout.resolved / (60 * 60 * 1000) // hours
            },
            sla: {
                firstResponseTime: settings.sla.firstResponseTime / (60 * 1000), // minutes
                resolutionTime: settings.sla.resolutionTime / (60 * 60 * 1000), // hours
                enableAlerts: settings.sla.enableAlerts
            },
            priorityEscalation: {
                enabled: settings.priorityEscalation.enabled,
                waitTimeThreshold: settings.priorityEscalation.waitTimeThreshold / (60 * 1000), // minutes
                urgentKeywords: settings.priorityEscalation.urgentKeywords.join(', '),
                highKeywords: settings.priorityEscalation.highKeywords.join(', '),
                vipAutoEscalate: settings.priorityEscalation.vipAutoEscalate,
                reassignmentThreshold: settings.priorityEscalation.reassignmentThreshold
            },
            resolutionConfirmation: {
                enabled: settings.resolutionConfirmation.enabled,
                messageTemplate: settings.resolutionConfirmation.messageTemplate,
                autoCloseOnConfirm: settings.resolutionConfirmation.autoCloseOnConfirm,
                autoCloseTimeout: settings.resolutionConfirmation.autoCloseTimeout / (60 * 60 * 1000) // hours
            },
            businessHours: {
                enabled: settings.businessHours.enabled,
                timezone: settings.businessHours.timezone,
                schedule: settings.businessHours.schedule,
                afterHoursMessage: settings.businessHours.afterHoursMessage
            },
            lastModifiedAt: settings.lastModifiedAt,
            lastModifiedBy: settings.lastModifiedBy
        };

        res.json(formattedSettings);
    } catch (error) {
        console.error('[CRMSettings] Error getting settings:', error);
        res.status(500).json({ error: 'Failed to retrieve CRM settings' });
    }
}

/**
 * Update CRM settings
 */
async function updateSettings(req, res) {
    try {
        const updates = req.body;
        const agentId = req.agent._id;

        // Convert hours/minutes back to milliseconds
        const processedUpdates = {
            autoTimeout: {
                open: updates.autoTimeout?.open ? updates.autoTimeout.open * 60 * 60 * 1000 : undefined,
                assigned: updates.autoTimeout?.assigned ? updates.autoTimeout.assigned * 60 * 60 * 1000 : undefined,
                waiting: updates.autoTimeout?.waiting ? updates.autoTimeout.waiting * 60 * 60 * 1000 : undefined,
                resolved: updates.autoTimeout?.resolved ? updates.autoTimeout.resolved * 60 * 60 * 1000 : undefined
            },
            sla: {
                firstResponseTime: updates.sla?.firstResponseTime ? updates.sla.firstResponseTime * 60 * 1000 : undefined,
                resolutionTime: updates.sla?.resolutionTime ? updates.sla.resolutionTime * 60 * 60 * 1000 : undefined,
                enableAlerts: updates.sla?.enableAlerts
            },
            priorityEscalation: {
                enabled: updates.priorityEscalation?.enabled,
                waitTimeThreshold: updates.priorityEscalation?.waitTimeThreshold ? 
                    updates.priorityEscalation.waitTimeThreshold * 60 * 1000 : undefined,
                urgentKeywords: updates.priorityEscalation?.urgentKeywords ? 
                    updates.priorityEscalation.urgentKeywords.split(',').map(k => k.trim()) : undefined,
                highKeywords: updates.priorityEscalation?.highKeywords ? 
                    updates.priorityEscalation.highKeywords.split(',').map(k => k.trim()) : undefined,
                vipAutoEscalate: updates.priorityEscalation?.vipAutoEscalate,
                reassignmentThreshold: updates.priorityEscalation?.reassignmentThreshold
            },
            resolutionConfirmation: {
                enabled: updates.resolutionConfirmation?.enabled,
                messageTemplate: updates.resolutionConfirmation?.messageTemplate,
                autoCloseOnConfirm: updates.resolutionConfirmation?.autoCloseOnConfirm,
                autoCloseTimeout: updates.resolutionConfirmation?.autoCloseTimeout ? 
                    updates.resolutionConfirmation.autoCloseTimeout * 60 * 60 * 1000 : undefined
            },
            businessHours: updates.businessHours
        };

        // Remove undefined values
        Object.keys(processedUpdates).forEach(key => {
            if (processedUpdates[key] && typeof processedUpdates[key] === 'object') {
                Object.keys(processedUpdates[key]).forEach(subKey => {
                    if (processedUpdates[key][subKey] === undefined) {
                        delete processedUpdates[key][subKey];
                    }
                });
            }
        });

        const updatedSettings = await CRMSettings.updateSettings(processedUpdates, agentId);

        console.log(`[CRMSettings] Settings updated by agent ${req.agent.email}`);

        // Return formatted settings
        const formattedSettings = {
            autoTimeout: {
                open: updatedSettings.autoTimeout.open / (60 * 60 * 1000),
                assigned: updatedSettings.autoTimeout.assigned / (60 * 60 * 1000),
                waiting: updatedSettings.autoTimeout.waiting / (60 * 60 * 1000),
                resolved: updatedSettings.autoTimeout.resolved / (60 * 60 * 1000)
            },
            sla: {
                firstResponseTime: updatedSettings.sla.firstResponseTime / (60 * 1000),
                resolutionTime: updatedSettings.sla.resolutionTime / (60 * 60 * 1000),
                enableAlerts: updatedSettings.sla.enableAlerts
            },
            priorityEscalation: {
                enabled: updatedSettings.priorityEscalation.enabled,
                waitTimeThreshold: updatedSettings.priorityEscalation.waitTimeThreshold / (60 * 1000),
                urgentKeywords: updatedSettings.priorityEscalation.urgentKeywords.join(', '),
                highKeywords: updatedSettings.priorityEscalation.highKeywords.join(', '),
                vipAutoEscalate: updatedSettings.priorityEscalation.vipAutoEscalate,
                reassignmentThreshold: updatedSettings.priorityEscalation.reassignmentThreshold
            },
            resolutionConfirmation: {
                enabled: updatedSettings.resolutionConfirmation.enabled,
                messageTemplate: updatedSettings.resolutionConfirmation.messageTemplate,
                autoCloseOnConfirm: updatedSettings.resolutionConfirmation.autoCloseOnConfirm,
                autoCloseTimeout: updatedSettings.resolutionConfirmation.autoCloseTimeout / (60 * 60 * 1000)
            },
            businessHours: {
                enabled: updatedSettings.businessHours.enabled,
                timezone: updatedSettings.businessHours.timezone,
                schedule: updatedSettings.businessHours.schedule,
                afterHoursMessage: updatedSettings.businessHours.afterHoursMessage
            },
            lastModifiedAt: updatedSettings.lastModifiedAt,
            lastModifiedBy: updatedSettings.lastModifiedBy
        };

        res.json({
            message: 'CRM settings updated successfully',
            settings: formattedSettings
        });
    } catch (error) {
        console.error('[CRMSettings] Error updating settings:', error);
        res.status(500).json({ error: 'Failed to update CRM settings' });
    }
}

/**
 * Reset settings to defaults
 */
async function resetToDefaults(req, res) {
    try {
        const agentId = req.agent._id;

        // Delete existing settings document
        await CRMSettings.findByIdAndDelete('crm_settings');

        // Create new with defaults
        const defaultSettings = await CRMSettings.create({ 
            _id: 'crm_settings',
            lastModifiedBy: agentId
        });

        console.log(`[CRMSettings] Settings reset to defaults by agent ${req.agent.email}`);

        // Return formatted settings
        const formattedSettings = {
            autoTimeout: {
                open: defaultSettings.autoTimeout.open / (60 * 60 * 1000),
                assigned: defaultSettings.autoTimeout.assigned / (60 * 60 * 1000),
                waiting: defaultSettings.autoTimeout.waiting / (60 * 60 * 1000),
                resolved: defaultSettings.autoTimeout.resolved / (60 * 60 * 1000)
            },
            sla: {
                firstResponseTime: defaultSettings.sla.firstResponseTime / (60 * 1000),
                resolutionTime: defaultSettings.sla.resolutionTime / (60 * 60 * 1000),
                enableAlerts: defaultSettings.sla.enableAlerts
            },
            priorityEscalation: {
                enabled: defaultSettings.priorityEscalation.enabled,
                waitTimeThreshold: defaultSettings.priorityEscalation.waitTimeThreshold / (60 * 1000),
                urgentKeywords: defaultSettings.priorityEscalation.urgentKeywords.join(', '),
                highKeywords: defaultSettings.priorityEscalation.highKeywords.join(', '),
                vipAutoEscalate: defaultSettings.priorityEscalation.vipAutoEscalate,
                reassignmentThreshold: defaultSettings.priorityEscalation.reassignmentThreshold
            },
            resolutionConfirmation: {
                enabled: defaultSettings.resolutionConfirmation.enabled,
                messageTemplate: defaultSettings.resolutionConfirmation.messageTemplate,
                autoCloseOnConfirm: defaultSettings.resolutionConfirmation.autoCloseOnConfirm,
                autoCloseTimeout: defaultSettings.resolutionConfirmation.autoCloseTimeout / (60 * 60 * 1000)
            },
            businessHours: {
                enabled: defaultSettings.businessHours.enabled,
                timezone: defaultSettings.businessHours.timezone,
                schedule: defaultSettings.businessHours.schedule,
                afterHoursMessage: defaultSettings.businessHours.afterHoursMessage
            },
            lastModifiedAt: defaultSettings.lastModifiedAt,
            lastModifiedBy: defaultSettings.lastModifiedBy
        };

        res.json({
            message: 'CRM settings reset to defaults',
            settings: formattedSettings
        });
    } catch (error) {
        console.error('[CRMSettings] Error resetting settings:', error);
        res.status(500).json({ error: 'Failed to reset CRM settings' });
    }
}

module.exports = {
    getSettings,
    updateSettings,
    resetToDefaults
};
