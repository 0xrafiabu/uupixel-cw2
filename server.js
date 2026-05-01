const express = require("express");
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");
const path = require("path");

const app = express();
const rootDir = __dirname;
const dataDir = path.join(rootDir, "data");

app.use(cors());
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true, limit: "20mb" }));

// Upload setup
const upload = multer({ storage: multer.memoryStorage() });

// Azure-safe data folder
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const usersFile = path.join(dataDir, "users.json");
const photosFile = path.join(dataDir, "photos.json");

if (!fs.existsSync(usersFile)) {
    fs.writeFileSync(usersFile, "{}");
}

if (!fs.existsSync(photosFile)) {
    fs.writeFileSync(photosFile, "[]");
}

function readUsers() {
    try {
        return JSON.parse(fs.readFileSync(usersFile, "utf8"));
    } catch {
        return {};
    }
}

function saveUsers(users) {
    fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
}

function readPhotos() {
    try {
        return JSON.parse(fs.readFileSync(photosFile, "utf8"));
    } catch {
        return [];
    }
}

function savePhotos(photos) {
    fs.writeFileSync(photosFile, JSON.stringify(photos, null, 2));
}

// REGISTER
app.post("/users/register", (req, res) => {
    try {
        const { fullName, email, password } = req.body;

        if (!fullName || !email || !password) {
            return res.status(400).json({
                message: "All fields required."
            });
        }

        const users = readUsers();

        if (users[email]) {
            return res.status(400).json({
                message: "User already exists."
            });
        }

        users[email] = {
            fullName,
            email,
            password,
            profilePicUrl: ""
        };

        saveUsers(users);

        res.json({
            message: "User registered successfully."
        });
    } catch (err) {
        console.error("Register error:", err);
        res.status(500).json({
            message: "Registration error."
        });
    }
});

// LOGIN
app.post("/users/login", (req, res) => {
    const { email, password } = req.body;
    const users = readUsers();

    if (!users[email] || users[email].password !== password) {
        return res.status(401).json({
            message: "Invalid credentials."
        });
    }

    res.json({
        message: "Login successful."
    });
});

// GET PHOTOS
app.get("/photos", (req, res) => {
    let photos = readPhotos();
    const { category } = req.query;

    if (category) {
        photos = photos.filter(photo =>
            photo.category &&
            photo.category.toLowerCase().includes(category.toLowerCase())
        );
    }

    res.json(photos);
});

// UPLOAD PHOTO
app.post("/photos", upload.single("photo"), (req, res) => {
    try {
        const { category, email } = req.body;

        if (!req.file) {
            return res.status(400).json({
                message: "Photo required."
            });
        }

        const users = readUsers();
        const photos = readPhotos();

        if (!users[email]) {
            return res.status(404).json({
                message: "User not found."
            });
        }

        const id = Date.now().toString();

        const newPhoto = {
            id,
            email,
            fullName: users[email].fullName,
            category,
            size: `${(req.file.size / 1024).toFixed(1)} KB`,
            likes: 0,
            downloads: 0,
            imageUrl: `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`
        };

        photos.push(newPhoto);
        savePhotos(photos);

        res.json({
            message: "Photo uploaded successfully.",
            photo: newPhoto
        });
    } catch (err) {
        console.error("Upload error:", err);
        res.status(500).json({
            message: "Upload error."
        });
    }
});

// Serve files that live in the project root, such as /script.js and /style.css.
// index.html is served by the explicit "/" route below.
app.use(express.static(rootDir, { index: false }));

// Homepage route
app.get("/", (req, res) => {
    res.sendFile(path.join(rootDir, "index.html"));
});

// START SERVER
const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
});
