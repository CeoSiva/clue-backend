const express = require("express");
const Topic = require("../models/topic");

const router = express.Router();

function generateTopicCode(title) {
  const letters = (title || "")
    .toLowerCase()
    .replace(/[^a-z]/g, "")
    .slice(0, 3) || "xxx";
  const random = Math.floor(1000 + Math.random() * 9000); // 4 digits
  return `clue-${letters}-${random}`;
}

// GET /api/topics - list topics with simple pagination
router.get("/", async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.max(parseInt(req.query.limit, 10) || 10, 1);
    const skip = (page - 1) * limit;

    const [items, totalItems] = await Promise.all([
      Topic.find()
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Topic.countDocuments(),
    ]);

    const topicsWithCounts = await Promise.all(
      items.map(async (topic) => {
        const count = await require("../models/question").countDocuments({ topicId: topic._id });
        return {
          _id: topic._id,
          code: topic.code,
          title: topic.title,
          description: topic.description,
          level: topic.level,
          questionsCount: count,
          assignedExams: topic.assignedExams || [],
          createdAt: topic.createdAt,
        };
      })
    );

    return res.json({
      items: topicsWithCounts,
      page,
      limit,
      totalItems,
      totalPages: Math.max(1, Math.ceil(totalItems / limit)),
    });
  } catch (err) {
    console.error("Error fetching topics", err);
    return res.status(500).json({ message: "Failed to fetch topics" });
  }
});

// GET /api/topics/:id - get single topic with questions
router.get("/:id", async (req, res) => {
  try {
    const topic = await Topic.findById(req.params.id).lean();
    if (!topic) {
      return res.status(404).json({ message: "Topic not found" });
    }
    return res.json(topic);
  } catch (err) {
    console.error("Error fetching topic", err);
    return res.status(500).json({ message: "Failed to fetch topic" });
  }
});

// Helper to validate request body for create/update
function validateTopicPayload(body) {
  const errors = [];

  if (!body.title || typeof body.title !== "string" || !body.title.trim()) {
    errors.push("Title is required.");
  }

  const validLevels = ["beginner", "intermediate", "advanced"];
  if (!body.level || !validLevels.includes(body.level)) {
    errors.push("Level must be one of: beginner, intermediate, advanced.");
  }

  if (!Array.isArray(body.questions)) {
    errors.push("Questions must be an array.");
  } else {
    body.questions.forEach((q, index) => {
      if (!q || typeof q.question !== "string" || !q.question.trim()) {
        errors.push(`Question #${index + 1}: text is required.`);
      }
      if (!Array.isArray(q.options) || q.options.length !== 4) {
        errors.push(`Question #${index + 1}: exactly 4 options are required.`);
      } else if (q.options.some((opt) => typeof opt !== "string" || !opt.trim())) {
        errors.push(`Question #${index + 1}: options must be non-empty strings.`);
      }
      if (
        typeof q.correctIndex !== "number" ||
        q.correctIndex < 0 ||
        q.correctIndex > 3 ||
        !Number.isInteger(q.correctIndex)
      ) {
        errors.push(`Question #${index + 1}: correctIndex must be an integer between 0 and 3.`);
      }
    });
  }

  return errors;
}

// POST /api/topics - create topic
router.post("/", async (req, res) => {
  try {
    const errors = validateTopicPayload(req.body);
    if (errors.length) {
      return res.status(400).json({ message: "Validation failed", errors });
    }

    const code = generateTopicCode(req.body.title);

    const topic = await Topic.create({
      code,
      title: req.body.title.trim(),
      description: req.body.description || "",
      level: req.body.level,
      // questions: req.body.questions, // Removed
      assignedExams: Array.isArray(req.body.assignedExams)
        ? req.body.assignedExams
        : [],
      // createdBy: req.user?.id, // hook this up once auth middleware is in place
    });

    // If questions are provided, insert them
    if (req.body.questions && Array.isArray(req.body.questions) && req.body.questions.length > 0) {
      const Question = require("../models/question");
      const validQuestions = req.body.questions.map(q => ({
        topicId: topic._id,
        question: q.question,
        options: q.options,
        correctIndex: q.correctIndex
      }));
      await Question.insertMany(validQuestions);
    }

    return res.status(201).json(topic);
  } catch (err) {
    console.error("Error creating topic", err);
    return res.status(500).json({ message: "Failed to create topic" });
  }
});

// PUT /api/topics/:id - update topic and questions
router.put("/:id", async (req, res) => {
  try {
    const errors = validateTopicPayload(req.body);
    if (errors.length) {
      return res.status(400).json({ message: "Validation failed", errors });
    }

    const topic = await Topic.findById(req.params.id);
    if (!topic) {
      return res.status(404).json({ message: "Topic not found" });
    }

    topic.title = req.body.title.trim();
    topic.description = req.body.description || "";
    topic.level = req.body.level;
    topic.assignedExams = Array.isArray(req.body.assignedExams)
      ? req.body.assignedExams
      : [];

    await topic.save();

    // Sync Questions if provided
    if (req.body.questions && Array.isArray(req.body.questions)) {
      const Question = require("../models/question");
      const incomingQuestions = req.body.questions;

      // Filter out valid IDs from incoming questions to know what to keep
      const incomingIds = incomingQuestions
        .filter(q => q._id)
        .map(q => q._id);

      // 1. Delete questions for this topic that are NOT in the incoming list
      await Question.deleteMany({
        topicId: topic._id,
        _id: { $nin: incomingIds }
      });

      // 2. Prepare bulk operations for Update and Insert
      const bulkOps = incomingQuestions.map(q => {
        if (q._id) {
          // Update existing
          return {
            updateOne: {
              filter: { _id: q._id },
              update: {
                $set: {
                  question: q.question,
                  options: q.options,
                  correctIndex: q.correctIndex
                }
              }
            }
          };
        } else {
          // Insert new
          return {
            insertOne: {
              document: {
                topicId: topic._id,
                question: q.question,
                options: q.options,
                correctIndex: q.correctIndex
              }
            }
          };
        }
      });

      if (bulkOps.length > 0) {
        await Question.bulkWrite(bulkOps);
      }
    }

    return res.json(topic);
  } catch (err) {
    console.error("Error updating topic", err);
    return res.status(500).json({ message: "Failed to update topic" });
  }
});

// DELETE /api/topics/:id - delete a topic
router.delete("/:id", async (req, res) => {
  try {
    const topic = await Topic.findByIdAndDelete(req.params.id);
    if (!topic) {
      return res.status(404).json({ message: "Topic not found" });
    }
    return res.status(204).send();
  } catch (err) {
    console.error("Error deleting topic", err);
    return res.status(500).json({ message: "Failed to delete topic" });
  }
});

module.exports = router;
