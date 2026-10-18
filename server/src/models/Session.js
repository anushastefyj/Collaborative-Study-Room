import mongoose from 'mongoose';

const sessionSchema = new mongoose.Schema(
  {
    roomId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Room',
      required: true,
      index: true,
    },
    roomCode: {
      type: String,
      required: true,
      uppercase: true,
      index: true,
    },
    date: {
      type: String, // Format: YYYY-MM-DD in UTC
      required: true,
      index: true,
    },
    completedCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index to ensure one record per room per date
sessionSchema.index({ roomCode: 1, date: 1 }, { unique: true });

export const Session = mongoose.model('Session', sessionSchema);
