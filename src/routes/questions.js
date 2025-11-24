const express = require("express");
const Question = require("../models/question");
const Topic = require("../models/topic");

const router = express.Router();

// GET /api/questions?topicId=...
router.get("/", async (req, res) => {
    try {
        const { topicId } = req.query;
        if (!topicId) {
            return res.status(400).json({ message: "topicId is required" });
        }

        const questions = await Question.find({ topicId }).sort({ createdAt: -1 });
        return res.json(questions);
    } catch (err) {
        console.error("Error fetching questions", err);
        return res.status(500).json({ message: "Failed to fetch questions" });
    }
});

// POST /api/questions/bulk - Bulk upload questions
router.post("/bulk", async (req, res) => {
    try {
        const { topicId, questions } = req.body;

        if (!topicId) {
            return res.status(400).json({ message: "topicId is required" });
        }

        if (!Array.isArray(questions) || questions.length === 0) {
            return res.status(400).json({ message: "questions must be a non-empty array" });
        }

        // Verify topic exists
        const topic = await Topic.findById(topicId);
        if (!topic) {
            return res.status(404).json({ message: "Topic not found" });
        }

        // Validate and format questions
        const validQuestions = [];
        const errors = [];

        questions.forEach((q, index) => {
            if (!q.question || !Array.isArray(q.options) || q.options.length !== 4 || typeof q.correctIndex !== "number") {
                errors.push(`Question #${index + 1} is invalid. Check format.`);
                return;
            }
            validQuestions.push({
                topicId,
                question: q.question,
                options: q.options,
                correctIndex: q.correctIndex,
            });
        });

        if (validQuestions.length === 0) {
            return res.status(400).json({ message: "No valid questions found to upload", errors });
        }

        await Question.insertMany(validQuestions);

        return res.status(201).json({
            message: `Successfully uploaded ${validQuestions.length} questions.`,
            errors: errors.length ? errors : undefined,
        });
    } catch (err) {
        console.error("Error bulk uploading questions", err);
        return res.status(500).json({ message: "Failed to upload questions" });
    }
});

module.exports = router;
