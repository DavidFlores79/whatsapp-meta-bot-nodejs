const mongoose = require('mongoose');

/**
 * SystemSettings Model
 * Multi-document key-value store for system-wide configurations
 * Used for ticket categories, assistant configuration, terminology, etc.
 */
const systemSettingsSchema = new mongoose.Schema({
    key: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    value: {
        type: mongoose.Schema.Types.Mixed,
        required: true
    },
    category: {
        type: String,
        enum: ['tickets', 'assistant', 'presets', 'general'],
        default: 'general'
    },
    description: {
        type: String
    },
    isEditable: {
        type: Boolean,
        default: true
    },
    updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Agent'
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Update timestamp on save
systemSettingsSchema.pre('save', function(next) {
    this.updatedAt = new Date();
    next();
});

// Static method to get setting by key
systemSettingsSchema.statics.getSetting = async function(key, defaultValue = null) {
    const setting = await this.findOne({ key });
    return setting ? setting.value : defaultValue;
};

// Static method to update or create setting
systemSettingsSchema.statics.updateSetting = async function(key, value, updatedBy = null) {
    const setting = await this.findOneAndUpdate(
        { key },
        {
            value,
            updatedBy,
            updatedAt: new Date()
        },
        { upsert: true, new: true }
    );
    return setting;
};

module.exports = mongoose.model('SystemSettings', systemSettingsSchema);
