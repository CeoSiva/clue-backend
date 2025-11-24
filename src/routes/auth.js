
const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const User = require("../models/user");

const router = express.Router();

const COOKIE_NAME = "auth_token";

function signToken(payload, expiresIn = process.env.JWT_EXPIRES_IN || "7d") {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn });
}

function setAuthCookie(res, token) {
  const isProd = process.env.NODE_ENV === "production";
  // Allow cross-origin cookie for dev localhost; sameSite 'lax' usually works
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

function clearAuthCookie(res) {
  const isProd = process.env.NODE_ENV === "production";
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
  });
}

function getCookieToken(req) {
  const header = req.headers["cookie"];
  if (!header) return null;
  const parts = header.split(";").map((p) => p.trim());
  for (const p of parts) {
    if (p.startsWith(`${COOKIE_NAME}=`)) {
      return decodeURIComponent(p.slice(COOKIE_NAME.length + 1));
    }
  }
  return null;
}

function authMiddleware(req, res, next) {
  try {
    const token = getCookieToken(req);
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
    setAuthCookie(res, token);

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
    setAuthCookie(res, token);

    return res.json({ id: user._id, name: user.name, email: user.email, token });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

// Logout
router.post("/logout", (req, res) => {
  clearAuthCookie(res);
  return res.status(204).send();
});

// Current user
router.get("/me", authMiddleware, async (req, res) => {
  const user = await User.findById(req.user.id).select("_id name email");
  if (!user) return res.status(404).json({ message: "Not found" });
  return res.json({ id: user._id, name: user.name, email: user.email });
});

module.exports = router;

