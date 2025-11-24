
const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const User = require("../models/user");

const router = express.Router();

function signToken(payload, expiresIn = process.env.JWT_EXPIRES_IN || "7d") {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn });
}

function getTokenFromHeader(req) {
  const authHeader = req.headers["authorization"];
  if (!authHeader) return null;

  // Expected format: "Bearer <token>"
  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") return null;

  return parts[1];
}

function authMiddleware(req, res, next) {
  try {
    const token = getTokenFromHeader(req);
    if (!token) return res.status(401).json({ message: "Unauthorized" });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { id: decoded.sub, email: decoded.email };
    next();
  } catch (err) {
    return res.status(401).json({ message: "Unauthorized" });
  }
}

// Register (auto-login)
router.post("/register", async (req, res) => {
  try {
    const { name, email, password } = req.body || {};
    if (!name || !email || !password)
      return res.status(400).json({ message: "Missing required fields" });
    if (password.length < 6)
      return res.status(400).json({ message: "Password too short" });

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) return res.status(409).json({ message: "Email already in use" });

    const hash = await bcrypt.hash(password, 10);
    const user = await User.create({ name, email: email.toLowerCase(), password: hash });

    const token = signToken({ sub: user._id.toString(), email: user.email });

    return res.status(201).json({ id: user._id, name: user.name, email: user.email, token });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

// Login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password)
      return res.status(400).json({ message: "Missing email or password" });

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(401).json({ message: "Invalid credentials" });

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ message: "Invalid credentials" });

    const token = signToken({ sub: user._id.toString(), email: user.email });

    return res.json({ id: user._id, name: user.name, email: user.email, token });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

// Logout
router.post("/logout", (req, res) => {
  // Token removal is handled client-side
  return res.status(204).send();
});

// Current user
router.get("/me", authMiddleware, async (req, res) => {
  const user = await User.findById(req.user.id).select("_id name email");
  if (!user) return res.status(404).json({ message: "Not found" });
  return res.json({ id: user._id, name: user.name, email: user.email });
});

module.exports = router;

