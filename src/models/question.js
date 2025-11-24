const mongoose = require("mongoose");

const questionSchema = new mongoose.Schema(
    {
        topicId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Topic",
            required: true,
            index: true, // Index for fast lookups by topic
        },
        question: { type: String, required: true, trim: true },
        options: {
            type: [String],
            validate: {
                validator: (arr) => Array.isArray(arr) && arr.length === 4 && arr.every((v) => typeof v === "string" && v.trim().length > 0),
                message: "Each question must have exactly 4 non-empty options.",
            },
            required: true,
        },
        correctIndex: {
            type: Number,
            min: 0,
            max: 3,
            required: true,
        },
    },
    {
        timestamps: true,
    }
);

module.exports = mongoose.model("Question", questionSchema);
