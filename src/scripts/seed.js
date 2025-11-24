// Seed a default user into the database
// Usage: npm run seed
// Optional env overrides: SEED_NAME, SEED_EMAIL, SEED_PASSWORD

const bcrypt = require("bcrypt");
const dotenv = require("dotenv");
const connectDB = require("../config/db");
const User = require("../models/user");

dotenv.config();

async function main() {
  const name = process.env.SEED_NAME || "CEOSiva";
  const email = (process.env.SEED_EMAIL || "ceosivaofficial@gmail.com").toLowerCase();
  const password = process.env.SEED_PASSWORD || "ceo@123";

  if (!process.env.MONGO_URI) {
    console.error("MONGO_URI is not set in environment");
    process.exit(1);
  }

  await connectDB();

  try {
    const existing = await User.findOne({ email });
    if (existing) {
      console.log(`User already exists: ${existing.email} (id=${existing._id})`);
      process.exit(0);
    }

    const hash = await bcrypt.hash(password, 10);
    const user = await User.create({ name, email, password: hash });

    console.log("Seeded user:");
    console.log({ id: user._id.toString(), name: user.name, email: user.email });
    console.log("Login with:", { email, password });
    process.exit(0);
  } catch (err) {
    console.error("Seeding failed:", err);
    process.exit(1);
  }
}

main();
