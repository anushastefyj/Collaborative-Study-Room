import mongoose from 'mongoose';

const pointSchema = new mongoose.Schema(
  {
    x: { type: Number, required: true },
    y: { type: Number, required: true },
  },
  { _id: false }
);

const strokeSchema = new mongoose.Schema(
  {
    strokeId: { type: String, required: true },
    userId: { type: String, required: true },
    color: { type: String, default: '#ffffff' },
    size: { type: Number, default: 3 },
    tool: { type: String, enum: ['pen', 'eraser'], default: 'pen' },
    points: [pointSchema],
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const whiteboardSchema = new mongoose.Schema(
  {
    roomCode: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      index: true,
    },
    strokes: [strokeSchema],
  },
  {
    timestamps: true,
  }
);

export const Whiteboard = mongoose.model('Whiteboard', whiteboardSchema);
