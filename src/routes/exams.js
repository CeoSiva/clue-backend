const express = require("express");
const crypto = require("crypto");
const Exam = require("../models/exam");
const Topic = require("../models/topic");
const Question = require("../models/question");
// const authMiddleware = require("../middleware/auth"); // Assuming we'll add this later or use the one from auth.js if exported

const router = express.Router();

// Helper to generate unique access code
function generateAccessCode() {
    return crypto.randomBytes(16).toString("hex");
}

// GET /api/exams - List exams
router.get("/", async (req, res) => {
    try {
        const exams = await Exam.find()
            .sort({ createdAt: -1 })
            .populate("topics", "title code"); // Populate topic details
        return res.json(exams);
    } catch (err) {
        console.error("Error fetching exams", err);
        return res.status(500).json({ message: "Failed to fetch exams" });
    }
});

// POST /api/exams - Create a new exam configuration
router.post("/", async (req, res) => {
    try {
        const {
            title,
            description,
            candidateEmail,
            candidateName,
            topicIds,
            questionCount,
            durationMinutes,
            expiryDate,
        } = req.body;

        if (!title || !candidateEmail || !questionCount || !durationMinutes || !topicIds || !topicIds.length) {
            return res.status(400).json({ message: "Missing required fields" });
        }

        // Validate topics exist
        const topics = await Topic.find({ _id: { $in: topicIds } });
        if (topics.length !== topicIds.length) {
            return res.status(400).json({ message: "Some topics not found" });
        }

        // Create Exam with configuration only
        const exam = await Exam.create({
            title,
            description,
            candidateEmail,
            candidateName,
            topics: topicIds,
            questionCount,
            durationMinutes,
            expiryDate,
            questions: [], // No questions yet
            accessCode: generateAccessCode(),
            status: "waiting",
        });

        return res.status(201).json(exam);
    } catch (err) {
        console.error("Error creating exam", err);
        return res.status(500).json({ message: "Failed to create exam" });
    }
});

// GET /api/exams/verify/:accessCode - Verify exam link
router.get("/verify/:accessCode", async (req, res) => {
    try {
        const { accessCode } = req.params;
        const exam = await Exam.findOne({ accessCode }).select("title description durationMinutes candidateName status expiryDate");

        if (!exam) {
            return res.status(404).json({ message: "Exam not found" });
        }

        if (exam.expiryDate && new Date() > new Date(exam.expiryDate)) {
            return res.status(400).json({ message: "Exam link has expired", code: "EXPIRED" });
        }

        if (exam.status === "attended") {
            return res.status(400).json({ message: "Exam has already been completed", code: "COMPLETED" });
        }

        return res.json(exam);
    } catch (err) {
        console.error("Error verifying exam", err);
        return res.status(500).json({ message: "Failed to verify exam" });
    }
});

// POST /api/exams/:accessCode/start - Start exam and generate questions
router.post("/:accessCode/start", async (req, res) => {
    try {
        const { accessCode } = req.params;
        const { candidateName, candidateEmail, candidatePhone, ip, userAgent } = req.body;

        const exam = await Exam.findOne({ accessCode });

        if (!exam) {
            return res.status(404).json({ message: "Exam not found" });
        }

        if (exam.status === "attended") {
            return res.status(400).json({ message: "Exam already completed" });
        }

        // Update candidate info if provided
        if (candidateName) exam.candidateName = candidateName;
        if (candidateEmail) exam.candidateEmail = candidateEmail;

        exam.candidateInfo = {
            name: candidateName || exam.candidateName,
            email: candidateEmail || exam.candidateEmail,
            phone: candidatePhone,
            ip,
            userAgent
        };

        // 1. Fetch questions directly from Question collection based on topics
        const questionsDocs = await Question.find({ topicId: { $in: exam.topics } });

        // 2. Map to format
        let allQuestions = questionsDocs.map(q => ({
            _id: q._id,
            questionText: q.question,
            options: q.options,
            correctIndex: q.correctIndex,
            originalTopicId: q.topicId,
        }));

        if (allQuestions.length < exam.questionCount) {
            return res.status(400).json({
                message: `Not enough questions available. Needed ${exam.questionCount}, found ${allQuestions.length}.`,
            });
        }

        // 3. Randomly select questions
        for (let i = allQuestions.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [allQuestions[i], allQuestions[j]] = [allQuestions[j], allQuestions[i]];
        }
        const selectedQuestions = allQuestions.slice(0, exam.questionCount);

        // 4. Update Exam with new questions and start time
        exam.questions = selectedQuestions;
        exam.startedAt = new Date();
        exam.status = "waiting"; // In progress
        exam.score = undefined;
        await exam.save();

        // 5. Return questions WITHOUT correct answers
        const questionsForCandidate = selectedQuestions.map(q => ({
            _id: q._id,
            questionText: q.questionText,
            options: q.options,
            // No correctIndex!
        }));

        return res.json({
            exam: {
                title: exam.title,
                durationMinutes: exam.durationMinutes,
                candidateName: exam.candidateName,
            },
            questions: questionsForCandidate
        });

    } catch (err) {
        console.error("Error starting exam", err);
        return res.status(500).json({ message: "Failed to start exam" });
    }
});

// POST /api/exams/:accessCode/submit - Submit exam answers
router.post("/:accessCode/submit", async (req, res) => {
    try {
        const { accessCode } = req.params;
        const { answers, logs } = req.body; // answers: { questionId: selectedIndex }

        const exam = await Exam.findOne({ accessCode });
        if (!exam) {
            return res.status(404).json({ message: "Exam not found" });
        }

        if (exam.status === "attended") {
            return res.status(400).json({ message: "Exam already submitted" });
        }

        let correctCount = 0;

        // Grade the exam
        exam.questions.forEach(q => {
            const selectedIndex = answers[q._id.toString()];
            q.selectedOptionIndex = selectedIndex;

            if (selectedIndex !== undefined && selectedIndex === q.correctIndex) {
                q.isCorrect = true;
                correctCount++;
            } else {
                q.isCorrect = false;
            }
        });

        const score = Math.round((correctCount / exam.questions.length) * 100);

        exam.score = score;
        exam.status = "attended";
        exam.completedAt = new Date();

        if (logs && Array.isArray(logs)) {
            exam.logs = logs;
        }

        await exam.save();

        return res.json({
            message: "Exam submitted successfully",
            score: score,
            totalQuestions: exam.questions.length,
            correctAnswers: correctCount
        });

    } catch (err) {
        console.error("Error submitting exam", err);
        return res.status(500).json({ message: "Failed to submit exam" });
    }
});

// PUT /api/exams/:id - Update exam configuration
router.put("/:id", async (req, res) => {
    try {
        const {
            title,
            description,
            candidateEmail,
            candidateName,
            topicIds,
            questionCount,
            durationMinutes,
            expiryDate,
        } = req.body;

        if (!title || !candidateEmail || !questionCount || !durationMinutes || !topicIds || !topicIds.length) {
            return res.status(400).json({ message: "Missing required fields" });
        }

        // Validate topics exist
        const topics = await Topic.find({ _id: { $in: topicIds } });
        if (topics.length !== topicIds.length) {
            return res.status(400).json({ message: "Some topics not found" });
        }

        const exam = await Exam.findByIdAndUpdate(
            req.params.id,
            {
                title,
                description,
                candidateEmail,
                candidateName,
                topics: topicIds,
                questionCount,
                durationMinutes,
                expiryDate,
            },
            { new: true }
        ).populate("topics", "title code");

        if (!exam) {
            return res.status(404).json({ message: "Exam not found" });
        }

        return res.json(exam);
    } catch (err) {
        console.error("Error updating exam", err);
        return res.status(500).json({ message: "Failed to update exam" });
    }
});

// GET /api/exams/:id - Get exam details (admin view)
router.get("/:id", async (req, res) => {
    try {
        const exam = await Exam.findById(req.params.id).populate("topics", "title");
        if (!exam) {
            return res.status(404).json({ message: "Exam not found" });
        }
        return res.json(exam);
    } catch (err) {
        console.error("Error fetching exam", err);
        return res.status(500).json({ message: "Failed to fetch exam" });
    }
});

const multer = require("multer");
const nodemailer = require("nodemailer");
const path = require("path");
const fs = require("fs");

// Configure Multer for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = path.join(__dirname, "../../uploads");
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
        cb(null, file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname));
    },
});

const upload = multer({ storage: storage });

// Configure Nodemailer
const transporter = nodemailer.createTransport({
    host: process.env.MAIL_HOST,
    port: process.env.MAIL_PORT,
    secure: process.env.MAIL_SECURE === "true", // true for 465, false for other ports
    auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASS,
    },
});

// Helper to send email
async function sendEmail(to, subject, text) {
    if (!process.env.MAIL_USER || !process.env.MAIL_PASS) {
        console.log(`[MOCK EMAIL] To: ${to}, Subject: ${subject}, Body: ${text}`);
        return;
    }
    await transporter.sendMail({
        from: process.env.MAIL_USER,
        to,
        subject,
        text,
    });
}

// POST /api/exams/:accessCode/otp/send - Generate and send OTP
router.post("/:accessCode/otp/send", async (req, res) => {
    try {
        const { accessCode } = req.params;
        const { email } = req.body;

        if (!email) return res.status(404).json({ message: "Email is required" });

        const exam = await Exam.findOne({ accessCode });
        if (!exam) return res.status(404).json({ message: "Exam not found" });

        // Generate 6-digit OTP
        const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

        exam.otp = { code: otpCode, expiresAt };
        await exam.save();

        await sendEmail(email, "Your Exam Verification Code", `Your OTP code is: ${otpCode}. It expires in 10 minutes.`);

        return res.json({ message: "OTP sent successfully" });
    } catch (err) {
        console.error("Error sending OTP", err);
        return res.status(500).json({ message: "Failed to send OTP" });
    }
});

// POST /api/exams/:accessCode/otp/verify - Verify OTP
router.post("/:accessCode/otp/verify", async (req, res) => {
    try {
        const { accessCode } = req.params;
        const { email, otp } = req.body;

        const exam = await Exam.findOne({ accessCode });
        if (!exam) return res.status(404).json({ message: "Exam not found" });

        if (!exam.otp || !exam.otp.code) {
            return res.status(400).json({ message: "No OTP generated" });
        }

        if (new Date() > new Date(exam.otp.expiresAt)) {
            return res.status(400).json({ message: "OTP expired" });
        }

        if (exam.otp.code !== otp) {
            return res.status(400).json({ message: "Invalid OTP" });
        }

        return res.json({ message: "OTP verified successfully" });
    } catch (err) {
        console.error("Error verifying OTP", err);
        return res.status(500).json({ message: "Failed to verify OTP" });
    }
});

// POST /api/exams/:accessCode/upload - Upload candidate files
router.post("/:accessCode/upload", upload.fields([{ name: 'profilePic', maxCount: 1 }, { name: 'resume', maxCount: 1 }, { name: 'documents', maxCount: 5 }]), async (req, res) => {
    try {
        const { accessCode } = req.params;
        const exam = await Exam.findOne({ accessCode });
        if (!exam) return res.status(404).json({ message: "Exam not found" });

        const files = req.files;
        const updates = {};

        if (files['profilePic']) {
            updates['candidateInfo.profilePic'] = `/uploads/${files['profilePic'][0].filename}`;
        }
        if (files['resume']) {
            updates['candidateInfo.resume'] = `/uploads/${files['resume'][0].filename}`;
        }
        if (files['documents']) {
            updates['candidateInfo.documents'] = files['documents'].map(f => `/uploads/${f.filename}`);
        }

        await Exam.updateOne({ accessCode }, { $set: updates });

        return res.json({ message: "Files uploaded successfully", paths: updates });
    } catch (err) {
        console.error("Error uploading files", err);
        return res.status(500).json({ message: "Failed to upload files" });
    }
});

module.exports = router;
