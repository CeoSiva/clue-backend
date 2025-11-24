const mongoose = require("mongoose");

const examSchema = new mongoose.Schema(
    {
        title: { type: String, required: true, trim: true },
        description: { type: String, trim: true },
        candidateEmail: { type: String, required: true, trim: true, lowercase: true },
        candidateName: { type: String, trim: true }, // Optional, if known

        // Configuration
        topics: [{ type: mongoose.Schema.Types.ObjectId, ref: "Topic" }],
        questionCount: { type: Number, required: true },
        durationMinutes: { type: Number, required: true },
        expiryDate: { type: Date }, // Optional: when the link expires

        // State
        status: {
            type: String,
            enum: ["waiting", "attended", "expired"],
            default: "waiting",
        },
        startedAt: { type: Date },
        completedAt: { type: Date },
        score: { type: Number }, // Percentage or raw score

        // The actual questions for this instance
        // The actual questions for this instance (populated on start)
        questions: {
            type: [
                {
                    questionText: { type: String, required: true },
                    options: [String],
                    correctIndex: { type: Number, required: true },
                    originalTopicId: { type: mongoose.Schema.Types.ObjectId, ref: "Topic" },
                    selectedOptionIndex: { type: Number },
                    isCorrect: { type: Boolean },
                },
            ],
            default: [],
        },

        // Candidate Activity Logs (e.g. tab switching)
        logs: {
            type: [
                {
                    action: { type: String, required: true }, // e.g., "tab_hidden", "tab_visible"
                    timestamp: { type: Date, default: Date.now },
                    details: { type: String }
                }
            ],
            default: []
        },

        // OTP for verification
        otp: {
            code: { type: String },
            expiresAt: { type: Date }
        },

        // Extra candidate info captured at onboarding
        candidateInfo: {
            name: { type: String },
            email: { type: String },
            phone: { type: String },
            profilePic: { type: String }, // URL/Path
            resume: { type: String }, // URL/Path
            documents: [String], // Array of URLs/Paths
            ip: { type: String },
            userAgent: { type: String }
        },

        // Unique access token for the URL
        accessCode: { type: String, unique: true, required: true },
    },
    {
        timestamps: true,
    }
);

module.exports = mongoose.model("Exam", examSchema);
