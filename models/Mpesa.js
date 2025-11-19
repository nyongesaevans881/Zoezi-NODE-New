const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema(
  {
    phone: {
      type: String,
      required: true,
    },
    transactionId: {
      type: String,
      required: true,
      unique: true,
    },
    amount: {
      type: Number,
      required: true,
    }
  },
  {
    timestamps: true,
  }
);

// Optional: Add indexes if needed
paymentSchema.index({ transactionId: 1 });

// Export model (uses default connection)
module.exports = mongoose.model('MpesaTransaction', paymentSchema);
