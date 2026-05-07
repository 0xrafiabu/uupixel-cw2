const express = require("express");
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const { BlobServiceClient } = require("@azure/storage-blob");
const { sql, pool, poolConnect } = require("./config/db");

const app = express();
const rootDir = __dirname;
const dataDir = path.join(rootDir, "data");
const usersFile = path.join(dataDir, "users.json");
const photosFile = path.join(dataDir, "photos.json");
const upload = multer({ storage: multer.memoryStorage() });
const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
const containerName = process.env.AZURE_STORAGE_CONTAINER;

const blobServiceClient =
    BlobServiceClient.fromConnectionString(connectionString);

const containerClient =
    blobServiceClient.getContainerClient(containerName);

app.use(cors());
app.use(express.json({ limit: "30mb" }));
app.use(express.urlencoded({ extended: true, limit: "30mb" }));

function ensureDataFiles() {
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }

    if (!fs.existsSync(usersFile)) {
        fs.writeFileSync(usersFile, "{}");
    }

    if (!fs.existsSync(photosFile)) {
        fs.writeFileSync(photosFile, "[]");
    }
}

function readJson(filePath, fallback) {
    try {
        ensureDataFiles();
        const data = fs.readFileSync(filePath, "utf8");
        return JSON.parse(data || JSON.stringify(fallback));
    } catch (err) {
        console.error(`Read JSON error for ${filePath}:`, err);
        return fallback;
    }
}

function writeJson(filePath, data) {
    ensureDataFiles();
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function readUsers() {
    const users = readJson(usersFile, {});
    return users && typeof users === "object" && !Array.isArray(users) ? users : {};
}

function saveUsers(users) {
    writeJson(usersFile, users);
}

function readPhotos() {
    const photos = readJson(photosFile, []);
    return Array.isArray(photos) ? photos : [];
}

function savePhotos(photos) {
    writeJson(photosFile, photos);
}

function normalizeEmail(email) {
    return String(email || "").trim().toLowerCase();
}

function findPhoto(photos, id) {
    return photos.find(photo => String(photo.id) === String(id));
}

ensureDataFiles();

app.post("/users/register", async (req, res) => {
    try {
        const { fullName, email, password } = req.body;

        if (!fullName || !email || !password) {
            return res.status(400).json({
                message: "All fields are required."
            });
        }

        await poolConnect;

        // Check existing user
        const existingUser = await pool.request()
            .input("email", sql.NVarChar, email)
            .query("SELECT * FROM users WHERE email = @email");

        if (existingUser.recordset.length > 0) {
            return res.status(400).json({
                message: "User already exists."
            });
        }

        // Insert user
        await pool.request()
            .input("username", sql.NVarChar, fullName)
            .input("email", sql.NVarChar, email)
            .input("password", sql.NVarChar, password)
            .query(`
                INSERT INTO users (username, email, password)
                VALUES (@username, @email, @password)
            `);

        res.json({
            message: "User registered successfully."
        });

    } catch (err) {
        console.error(err);

        res.status(500).json({
            message: "Registration failed."
        });
    }
});

app.post("/users/login", async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                message: "Email and password are required."
            });
        }

        await poolConnect;

        const result = await pool.request()
            .input("email", sql.NVarChar, email)
            .query(`
                SELECT * FROM users
                WHERE email = @email
            `);

        if (result.recordset.length === 0) {
            return res.status(401).json({
                message: "Invalid credentials."
            });
        }

        const user = result.recordset[0];

        if (user.password !== password) {
            return res.status(401).json({
                message: "Invalid credentials."
            });
        }

        res.json({
            message: "Login successful.",
            user: {
                fullName: user.username,
                email: user.email
            }
        });

    } catch (err) {
        console.error(err);

        res.status(500).json({
            message: "Login failed."
        });
    }
});

app.get("/users/profile", async (req, res) => {
    try {
        const email = normalizeEmail(req.query.email);

        if (!email) {
            return res.status(400).json({
                message: "Email is required."
            });
        }

        await poolConnect;

        // Get user from SQL
        const userResult = await pool.request()
            .input("email", sql.NVarChar, email)
            .query(`
                SELECT * FROM users
                WHERE email = @email
            `);

        if (userResult.recordset.length === 0) {
            return res.status(404).json({
                message: "User not found."
            });
        }

        const user = userResult.recordset[0];

        // Get photos
        const photos = readPhotos().filter(
            photo => normalizeEmail(photo.email) === email
        );

        const likes = photos.reduce(
            (total, photo) => total + Number(photo.likes || 0),
            0
        );

        const downloads = photos.reduce(
            (total, photo) => total + Number(photo.downloads || 0),
            0
        );

        res.json({
            email: user.email,
            fullName: user.username,
            profilePicUrl: user.profilePicUrl || "",
            uploads: photos.length,
            likes,
            downloads
        });

    } catch (err) {
        console.error(err);

        res.status(500).json({
            message: "Profile failed to load."
        });
    }
});

app.post("/users/profile-picture", upload.single("profilePic"), async (req, res) => {
    try {
        const email = normalizeEmail(req.body.email);

        if (!email) {
            return res.status(400).json({ message: "Email is required." });
        }

        if (!req.file) {
            return res.status(400).json({ message: "Profile picture is required." });
        }

        if (req.file.mimetype !== "image/jpeg") {
            return res.status(400).json({ message: "Only JPEG images are supported." });
        }

        await poolConnect;

        const result = await pool.request()
            .input("email", sql.NVarChar, email)
            .query(`
                SELECT * FROM users
                WHERE email = @email
            `);

        if (result.recordset.length === 0) {
            return res.status(404).json({
                message: "User not found."
            });
        }

        const profilePicUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`;

        await pool.request()
            .input("email", sql.NVarChar, email)
            .input("profilePicUrl", sql.NVarChar, profilePicUrl)
            .query(`
                UPDATE users
                SET profilePicUrl = @profilePicUrl
                WHERE email = @email
            `);

        return res.json({ message: "Profile picture updated.", profilePicUrl });
    } catch (err) {
        console.error("Profile picture error:", err);
        return res.status(500).json({ message: "Profile picture update failed." });
    }
});

app.get("/photos", async (req, res) => {
    try {
        const category =
            String(req.query.category || "")
                .trim()
                .toLowerCase();

        await poolConnect;

        let query = `
            SELECT * FROM photos
        `;

        if (category) {
            query += `
                WHERE LOWER(category) LIKE '%' + @category + '%'
            `;
        }

        const request = pool.request();

        if (category) {
            request.input("category", sql.NVarChar, category);
        }

        const result = await request.query(query);

        return res.json(result.recordset);

    } catch (err) {
        console.error("Get photos error:", err);

        return res.status(500).json({
            message: "Photos failed to load."
        });
    }
});

app.post("/photos", upload.single("photo"), async (req, res) => {
    try {
        const { category, email } = req.body;

        if (!req.file) {
            return res.status(400).json({ message: "Photo is required." });
        }

        if (!category || !email) {
            return res.status(400).json({
                message: "Category and email are required."
            });
        }

        await poolConnect;

        const userResult = await pool.request()
            .input("email", sql.NVarChar, email)
            .query(`
                SELECT * FROM users
                WHERE email = @email
            `);

        if (userResult.recordset.length === 0) {
            return res.status(404).json({
                message: "User not found."
            });
        }

        const user = userResult.recordset[0];

        const id = Date.now().toString();

        // unique blob name
        const blobName = `${id}-${req.file.originalname}`;

        // blob client
        const blockBlobClient =
            containerClient.getBlockBlobClient(blobName);

        // upload to Azure Blob
        await blockBlobClient.uploadData(req.file.buffer, {
            blobHTTPHeaders: {
                blobContentType: req.file.mimetype
            }
        });

        // Azure blob URL
        const imageUrl = blockBlobClient.url;

        const newPhoto = {
            id,
            email,
            fullName: user.username,
            category,
            size: (req.file.size / 1024).toFixed(1) + " KB",
            likes: 0,
            downloads: 0,
            imageUrl
        };

        await pool.request()
            .input("id", sql.NVarChar, id)
            .input("email", sql.NVarChar, email)
            .input("fullName", sql.NVarChar, user.username)
            .input("category", sql.NVarChar, category)
            .input("size", sql.NVarChar, newPhoto.size)
            .input("likes", sql.Int, 0)
            .input("downloads", sql.Int, 0)
            .input("imageUrl", sql.NVarChar, imageUrl)
            .query(`
                INSERT INTO photos
                (id, email, fullName, category, size, likes, downloads, imageUrl)
                VALUES
                (@id, @email, @fullName, @category, @size, @likes, @downloads, @imageUrl)
            `);

        res.json({
            message: "Photo uploaded successfully.",
            photo: newPhoto
        });

    } catch (err) {
        console.error(err);

        res.status(500).json({
            message: "Upload failed."
        });
    }
});

app.post("/photos/:id/like", async (req, res) => {
    try {
        await poolConnect;

        const photoId = req.params.id;

        const result = await pool.request()
            .input("id", sql.NVarChar, photoId)
            .query(`
                UPDATE photos
                SET likes = likes + 1
                WHERE id = @id
            `);

        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({
                message: "Photo not found."
            });
        }

        res.json({
            message: "Photo liked."
        });

    } catch (err) {
        console.error("Like photo error:", err);

        res.status(500).json({
            message: "Like failed."
        });
    }
});

app.post("/photos/:id/download", async (req, res) => {
    try {
        await poolConnect;

        const photoId = req.params.id;

        const result = await pool.request()
            .input("id", sql.NVarChar, photoId)
            .query(`
                UPDATE photos
                SET downloads = downloads + 1
                WHERE id = @id
            `);

        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({
                message: "Photo not found."
            });
        }

        res.json({
            message: "Download recorded."
        });

    } catch (err) {
        console.error("Download photo error:", err);

        res.status(500).json({
            message: "Download failed."
        });
    }
});

app.put("/photos/:id", async (req, res) => {
    try {
        const email = normalizeEmail(req.body.email);
        const category = String(req.body.category || "").trim();

        if (!email || !category) {
            return res.status(400).json({
                message: "Email and category are required."
            });
        }

        await poolConnect;

        const photoResult = await pool.request()
            .input("id", sql.NVarChar, req.params.id)
            .query(`
                SELECT * FROM photos
                WHERE id = @id
            `);

        if (photoResult.recordset.length === 0) {
            return res.status(404).json({
                message: "Photo not found."
            });
        }

        const photo = photoResult.recordset[0];

        if (normalizeEmail(photo.email) !== email) {
            return res.status(403).json({
                message: "Only the owner can edit this photo."
            });
        }

        await pool.request()
            .input("id", sql.NVarChar, req.params.id)
            .input("category", sql.NVarChar, category)
            .query(`
                UPDATE photos
                SET category = @category
                WHERE id = @id
            `);

        res.json({
            message: "Photo updated."
        });

    } catch (err) {
        console.error("Edit photo error:", err);

        res.status(500).json({
            message: "Photo update failed."
        });
    }
});

app.delete("/photos/:id", async (req, res) => {
    try {
        const photoId = req.params.id;

        await poolConnect;

        const result = await pool.request()
            .input("id", sql.NVarChar, photoId)
            .query(`
                SELECT * FROM photos
                WHERE id = @id
            `);

        if (result.recordset.length === 0) {
            return res.status(404).json({
                message: "Photo not found."
            });
        }

        const photo = result.recordset[0];

        // Extract blob name
        const blobName =
            photo.imageUrl.split("/").pop();

        const blockBlobClient =
            containerClient.getBlockBlobClient(blobName);

        // Delete image from Blob Storage
        await blockBlobClient.deleteIfExists();

        // Delete metadata from SQL
        await pool.request()
            .input("id", sql.NVarChar, photoId)
            .query(`
                DELETE FROM photos
                WHERE id = @id
            `);

        res.json({
            message: "Photo deleted successfully."
        });

    } catch (err) {
        console.error(err);

        res.status(500).json({
            message: "Delete failed."
        });
    }
});

app.use(express.static(rootDir, { index: false }));

app.get("/", (req, res) => {
    res.sendFile(path.join(rootDir, "index.html"));
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
});
