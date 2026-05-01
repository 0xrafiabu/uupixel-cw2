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

const usersFile = path.join(__dirname, "data", "users.json");
const photosFile = path.join(__dirname, "data", "photos.json");

function readUsers() {
    try {
        return JSON.parse(fs.readFileSync(usersFile, "utf8"));
    } catch (err) {
        return {};
    }
}

function saveUsers(users) {
    fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
}

function readPhotos() {
    try {
        return JSON.parse(fs.readFileSync(photosFile, "utf8"));
    } catch (err) {
        return [];
    }
}

function savePhotos(photos) {
    fs.writeFileSync(photosFile, JSON.stringify(photos, null, 2));
}

// register
app.post("/users/register", (req, res) => {
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
});

// login
app.post("/users/login", (req, res) => {
    const { email, password } = req.body;
    const users = readUsers();

    if (!users[email] || users[email].password !== password) {
        return res.status(401).json({ message: "Invalid credentials." });
    }

    res.json({ message: "Login successful." });
});

// upload photo
app.post("/photos", upload.single("photo"), (req, res) => {
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
});

// get photos
app.get("/photos", (req, res) => {
    const { category } = req.query;
    let photos = readPhotos();

    if (category) {
        photos = photos.filter(photo =>
            photo.category.toLowerCase().includes(category.toLowerCase())
        );
    }

    res.json(photos);
});

// like photo
app.post("/photos/:id/like", (req, res) => {
    const photos = readPhotos();
    const photo = photos.find(p => p.id === req.params.id);

    if (!photo) {
        return res.status(404).json({ message: "Photo not found." });
    }

    photo.likes += 1;
    savePhotos(photos);

    res.json({ message: "Photo liked." });
});

// download photo
app.post("/photos/:id/download", (req, res) => {
    const photos = readPhotos();
    const photo = photos.find(p => p.id === req.params.id);

    if (!photo) {
        return res.status(404).json({ message: "Photo not found." });
    }

    photo.downloads += 1;
    savePhotos(photos);

    res.json({ message: "Download counted." });
});

// edit photo
app.put("/photos/:id", (req, res) => {
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
});

// delete photo
app.delete("/photos/:id", (req, res) => {
    const photos = readPhotos();
    const photoIndex = photos.findIndex(p => p.id === req.params.id);

    if (photoIndex === -1) {
        return res.status(404).json({ message: "Photo not found." });
    }

    photos.splice(photoIndex, 1);
    savePhotos(photos);

    res.json({ message: "Photo deleted." });
});

// profile
app.get("/users/profile", (req, res) => {
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
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});