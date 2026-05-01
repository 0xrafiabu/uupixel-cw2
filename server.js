const express = require("express");
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");
const path = require("path");

const app = express();

app.use(cors());
app.use(express.json({ limit: "20mb" }));
app.use(express.static(__dirname));

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

const upload = multer({ storage: multer.memoryStorage() });

// Azure-safe data folder
const dataDir = path.join(__dirname, "data");

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
    } catch (err) {
        console.error("Read users error:", err);
        return {};
    }
}

function saveUsers(users) {
    try {
        fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
    } catch (err) {
        console.error("Save users error:", err);
        throw err;
    }
}

function readPhotos() {
    try {
        return JSON.parse(fs.readFileSync(photosFile, "utf8"));
    } catch (err) {
        console.error("Read photos error:", err);
        return [];
    }
}

function savePhotos(photos) {
    try {
        fs.writeFileSync(photosFile, JSON.stringify(photos, null, 2));
    } catch (err) {
        console.error("Save photos error:", err);
        throw err;
    }
}

app.post("/users/register", (req, res) => {
    try {
        const { fullName, email, password } = req.body;

        if (!fullName || !email || !password) {
            return res.status(400).json({ message: "All fields are required." });
        }

        const users = readUsers();

        if (users[email]) {
            return res.status(400).json({ message: "User already exists." });
        }

        users[email] = {
            fullName,
            email,
            password,
            profilePicUrl: ""
        };

        saveUsers(users);

        res.json({ message: "User registered successfully." });
    } catch (err) {
        console.error("Register error:", err);
        res.status(500).json({ message: "Registration server error." });
    }
});

app.post("/users/login", (req, res) => {
    try {
        const { email, password } = req.body;
        const users = readUsers();

        if (!users[email] || users[email].password !== password) {
            return res.status(401).json({ message: "Invalid credentials." });
        }

        res.json({ message: "Login successful." });
    } catch (err) {
        console.error("Login error:", err);
        res.status(500).json({ message: "Login server error." });
    }
});

app.post("/photos", upload.single("photo"), (req, res) => {
    try {
        const { category, email } = req.body;

        if (!req.file) {
            return res.status(400).json({ message: "Photo is required." });
        }

        if (!category || !email) {
            return res.status(400).json({ message: "Category and email are required." });
        }

        const users = readUsers();
        const photos = readPhotos();

        if (!users[email]) {
            return res.status(404).json({ message: "User not found." });
        }

        const id = Date.now().toString();

        const newPhoto = {
            id,
            email,
            fullName: users[email].fullName,
            category,
            size: (req.file.size / 1024).toFixed(1) + " KB",
            likes: 0,
            downloads: 0,
            imageUrl: `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`
        };

        photos.push(newPhoto);
        savePhotos(photos);

        res.json({ message: "Photo uploaded successfully.", photo: newPhoto });
    } catch (err) {
        console.error("Upload error:", err);
        res.status(500).json({ message: "Upload server error." });
    }
});

app.get("/photos", (req, res) => {
    try {
        const { category } = req.query;
        let photos = readPhotos();

        if (category) {
            photos = photos.filter(photo =>
                photo.category.toLowerCase().includes(category.toLowerCase())
            );
        }

        res.json(photos);
    } catch (err) {
        console.error("Get photos error:", err);
        res.status(500).json({ message: "Photos server error." });
    }
});

app.post("/photos/:id/like", (req, res) => {
    try {
        const photos = readPhotos();
        const photo = photos.find(p => p.id === req.params.id);

        if (!photo) {
            return res.status(404).json({ message: "Photo not found." });
        }

        photo.likes += 1;
        savePhotos(photos);

        res.json({ message: "Photo liked." });
    } catch (err) {
        console.error("Like error:", err);
        res.status(500).json({ message: "Like server error." });
    }
});

app.post("/photos/:id/download", (req, res) => {
    try {
        const photos = readPhotos();
        const photo = photos.find(p => p.id === req.params.id);

        if (!photo) {
            return res.status(404).json({ message: "Photo not found." });
        }

        photo.downloads += 1;
        savePhotos(photos);

        res.json({ message: "Download counted." });
    } catch (err) {
        console.error("Download error:", err);
        res.status(500).json({ message: "Download server error." });
    }
});

app.put("/photos/:id", (req, res) => {
    try {
        const { category } = req.body;
        const photos = readPhotos();
        const photo = photos.find(p => p.id === req.params.id);

        if (!photo) {
            return res.status(404).json({ message: "Photo not found." });
        }

        if (!category) {
            return res.status(400).json({ message: "Category is required." });
        }

        photo.category = category;
        savePhotos(photos);

        res.json({ message: "Photo updated." });
    } catch (err) {
        console.error("Edit error:", err);
        res.status(500).json({ message: "Edit server error." });
    }
});

app.delete("/photos/:id", (req, res) => {
    try {
        const photos = readPhotos();
        const photoIndex = photos.findIndex(p => p.id === req.params.id);

        if (photoIndex === -1) {
            return res.status(404).json({ message: "Photo not found." });
        }

        photos.splice(photoIndex, 1);
        savePhotos(photos);

        res.json({ message: "Photo deleted." });
    } catch (err) {
        console.error("Delete error:", err);
        res.status(500).json({ message: "Delete server error." });
    }
});

app.get("/users/profile", (req, res) => {
    try {
        const { email } = req.query;
        const users = readUsers();
        const photos = readPhotos();

        if (!email || !users[email]) {
            return res.status(404).json({ message: "User not found." });
        }

        const user = users[email];
        const userPhotos = photos.filter(photo => photo.email === email);

        let likes = 0;
        let downloads = 0;

        userPhotos.forEach(photo => {
            likes += photo.likes;
            downloads += photo.downloads;
        });

        res.json({
            email: user.email,
            fullName: user.fullName,
            profilePicUrl: user.profilePicUrl,
            uploads: userPhotos.length,
            likes,
            downloads
        });
    } catch (err) {
        console.error("Profile error:", err);
        res.status(500).json({ message: "Profile server error." });
    }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
});