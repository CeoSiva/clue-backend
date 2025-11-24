const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");

const connectDB = require("./config/db");

dotenv.config();

const app = express();

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);
      // Allow any origin in development, or specific ones in production
      if (process.env.NODE_ENV === "development" || origin === process.env.FRONTEND_ORIGIN) {
        return callback(null, true);
      }
      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);

// app.use((req, res, next) => {
//   // Manual headers removed to avoid conflicts with cors middleware
//   next();
// })
app.use(express.json());

const PORT = process.env.PORT || 5001;

connectDB();

const path = require("path");

// Serve static files from uploads directory
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

// Routes
app.use("/api/auth", require("./routes/auth"));
app.use("/api/topics", require("./routes/topics"));
app.use("/api/exams", require("./routes/exams"));
app.use("/api/questions", require("./routes/questions"));

app.listen(PORT, () => console.log(`Server running on port ${PORT}`)); // Restart trigger

app.get('/health', (req, res) => {
  res.json({ message: "Server is Healthy..." })
})
