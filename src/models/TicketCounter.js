const mongoose = require('mongoose');

/**
 * TicketCounter Model
 * Handles sequential ticket ID generation with atomic operations
 * Supports year-based reset for configurable ID formats
 */
const ticketCounterSchema = new mongoose.Schema({
    _id: {
        type: String,
        default: 'ticket_counter'
    },
    year: {
        type: Number,
        required: true
    },
    sequence: {
        type: Number,
        default: 0
    }
});

// Static method to get next ticket number (atomic operation)
ticketCounterSchema.statics.getNextSequence = async function() {
    const currentYear = new Date().getFullYear();
    const counterId = `ticket_counter_${currentYear}`;

    const counter = await this.findOneAndUpdate(
        { _id: counterId },
        {
            $inc: { sequence: 1 },
            $setOnInsert: { year: currentYear }
        },
        { upsert: true, new: true }
    );

    return {
        year: counter.year,
        sequence: counter.sequence
    };
};

module.exports = mongoose.model('TicketCounter', ticketCounterSchema);
