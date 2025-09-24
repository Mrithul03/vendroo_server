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

// ---------------- Middleware ----------------
app.use(cors());
app.use(express.json());

// ---------------- Multer Setup ----------------
const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});
const upload = multer({ storage });

// ---------------- PostgreSQL Setup ----------------
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl:
    process.env.NODE_ENV === "production"
      ? { rejectUnauthorized: false }
      : false,
});

// ---------------- Create Tables ----------------
const createTable = async () => {
  const formTable = `
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

  const todoTable = `
    CREATE TABLE IF NOT EXISTS todos (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    completed BOOLEAN DEFAULT false,
    due_date TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  `;

  try {
    await pool.query(formTable);
    await pool.query(todoTable);
    console.log("✅ Tables 'form_entries' & 'todos' are ready");
  } catch (err) {
    console.error("❌ Error creating tables:", err);
  }
};

// ---------------- Routes ----------------
app.get("/", (req, res) => {
  res.send("🚀 API is running with PostgreSQL!");
});

// ---------------- Form APIs ----------------
app.post("/api/form", upload.single("photo"), async (req, res) => {
  try {
    const { owner, shopname, businesstype, phone, location, building } =
      req.body;

    if (!owner || !shopname || !businesstype || !phone || !location) {
      return res.status(400).json({
        error: "Owner, shopname, businesstype, phone, and location are required",
      });
    }

    let photo_url = null;
    if (req.file) {
      const baseUrl =
        process.env.BASE_URL ||
        `https://vendroo-server.onrender.com` ||
        `http://localhost:${process.env.PORT || 5000}`;
      photo_url = `${baseUrl}/uploads/${req.file.filename}`;
    }

    const result = await pool.query(
      `INSERT INTO form_entries 
        (owner, shopname, businesstype, phone, location, building, photo_url) 
        VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [owner, shopname, businesstype, phone, location, building || "", photo_url]
    );

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error("❌ Insert error:", err);
    res.status(500).json({ error: "Database insert failed" });
  }
});

app.get("/api/form", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM form_entries ORDER BY id DESC"
    );
    res.json(result.rows);
  } catch (err) {
    console.error("❌ Fetch error:", err);
    res.status(500).json({ error: "Database fetch failed" });
  }
});

// ---------------- To-Do APIs ----------------

// Create To-Do
app.post("/api/todos", async (req, res) => {
  try {
    const { title, description, due_date } = req.body;
    if (!title) {
      return res.status(400).json({ error: "Title is required" });
    }

    const result = await pool.query(
      `INSERT INTO todos (title, description, due_date) 
       VALUES ($1, $2, $3) RETURNING *`,
      [title, description || "", due_date || null]
    );

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error("❌ Insert To-Do error:", err);
    res.status(500).json({ error: "Database insert failed" });
  }
});


// Get To-Dos with search & filter
app.get("/api/todos", async (req, res) => {
  try {
    const { search, status } = req.query;

    let query = "SELECT * FROM todos";
    const params = [];
    const conditions = [];

    if (search) {
      params.push(`%${search}%`);
      conditions.push(`title ILIKE $${params.length}`);
    }

    if (status === "completed") {
      conditions.push(`completed = true`);
    } else if (status === "pending") {
      conditions.push(`completed = false`);
    }

    if (conditions.length > 0) {
      query += " WHERE " + conditions.join(" AND ");
    }

    query += " ORDER BY id DESC";

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error("❌ Fetch To-Do error:", err);
    res.status(500).json({ error: "Database fetch failed" });
  }
});

// Update To-Do
app.put("/api/todos/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, completed, due_date } = req.body;

    const result = await pool.query(
      `UPDATE todos SET 
        title = COALESCE($1, title),
        description = COALESCE($2, description),
        completed = COALESCE($3, completed),
        due_date = COALESCE($4, due_date)
      WHERE id = $5 RETURNING *`,
      [title || null, description || null, completed, due_date || null, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "To-Do not found" });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error("❌ Update To-Do error:", err);
    res.status(500).json({ error: "Database update failed" });
  }
});

// Delete To-Do
app.delete("/api/todos/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `DELETE FROM todos WHERE id = $1 RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "To-Do not found" });
    }

    res.json({ success: true, message: "To-Do deleted", data: result.rows[0] });
  } catch (err) {
    console.error("❌ Delete To-Do error:", err);
    res.status(500).json({ error: "Database delete failed" });
  }
});

// ---------------- Static Files ----------------
app.use("/uploads", express.static(uploadDir));

// ---------------- Start Server ----------------
const PORT = process.env.PORT || 5000;
app.listen(PORT, async () => {
  console.log(`🚀 Server running on port ${PORT}`);
  await createTable();
});
