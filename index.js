import express from "express";
import cors from "cors";
import pkg from "pg";
import dotenv from "dotenv";
import multer from "multer";
import path from "path";
import fs from "fs";

dotenv.config();

const { Pool } = pkg;
const app = express();
app.use(cors());
app.use(express.json());

// Create uploads folder if not exists
const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

// Multer setup for photo upload
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    },
});
const upload = multer({ storage });

// PostgreSQL connection
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
});


// Create table if not exists
const createTable = async () => {
    const query = `
    CREATE TABLE IF NOT EXISTS form_entries (
      id SERIAL PRIMARY KEY,
      owner VARCHAR(100) NOT NULL,
      shopname VARCHAR(100) NOT NULL,
      businesstype VARCHAR(100) NOT NULL,
      phone VARCHAR(20) NOT NULL,
      location VARCHAR(100) NOT NULL,
      building VARCHAR(100),
      photo_url TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;
    try {
        await pool.query(query);
        console.log("✅ Table 'form_entries' is ready");
    } catch (err) {
        console.error("❌ Error creating table:", err);
    }
};

// Routes
app.get("/", (req, res) => {
    res.send("🚀 API is running with PostgreSQL!");
});

// POST - Save registration form
app.post("/api/form", upload.single("photo"), async (req, res) => {
    try {
        const { owner, shopname, businesstype, phone, location, building } = req.body;
        let photo_url = null;
        if (req.file) {
            const baseUrl = process.env.BASE_URL || `http://localhost:${PORT}`;
            photo_url = `${baseUrl}/uploads/${req.file.filename}`;

        }

        if (!owner || !phone || !location || !shopname || !businesstype) {
            return res.status(400).json({ error: "Owner, shopname, businesstype, phone, and location are required" });
        }

        const result = await pool.query(
            "INSERT INTO form_entries (owner, shopname, businesstype, phone, location, building, photo_url) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *",
            [owner, shopname, businesstype, phone, location, building || "", photo_url]
        );


        res.json({ success: true, data: result.rows[0] });
    } catch (err) {
        console.error("❌ Insert error:", err);
        res.status(500).json({ error: "Database insert failed" });
    }
});

// GET - Fetch all form entries
app.get("/api/form", async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM form_entries ORDER BY id DESC");
        res.json(result.rows);
    } catch (err) {
        console.error("❌ Fetch error:", err);
        res.status(500).json({ error: "Database fetch failed" });
    }
});

// Serve uploaded files statically
app.use("/uploads", express.static(uploadDir));

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, async () => {
    console.log(`🚀 Server running on port ${PORT}`);
    await createTable();
});



