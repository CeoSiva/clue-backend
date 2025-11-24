const mongoose = require("mongoose");



const topicSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, trim: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    level: {
      type: String,
      enum: ["beginner", "intermediate", "advanced"],
      required: true,
      default: "beginner",
    },
    // Questions are now stored in the 'Question' collection referencing this Topic
    assignedExams: {
      type: [String],
      default: [],
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Topic", topicSchema);
