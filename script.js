const API_BASE = window.location.origin;

let isSignUp = false;
let currentUser = localStorage.getItem("currentUser") || "";
let currentPhotos = [];

document.addEventListener("DOMContentLoaded", () => {
    const searchInput = document.getElementById("searchCategory");

    if (searchInput) {
        searchInput.addEventListener("keydown", event => {
            if (event.key === "Enter") {
                searchPhotos();
            }
        });
    }

    if (currentUser) {
        showApp();
    }
});

function getElement(id) {
    return document.getElementById(id);
}

function setText(id, text) {
    const element = getElement(id);

    if (element) {
        element.innerText = text;
    }
}

function escapeHtml(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

async function readJsonResponse(response) {
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(data.message || "Request failed.");
    }

    return data;
}

function toggleAuth() {
    isSignUp = !isSignUp;

    setText("auth-title", isSignUp ? "Sign Up" : "Sign In");
    getElement("fullName").style.display = isSignUp ? "block" : "none";
    getElement("confirmPassword").style.display = isSignUp ? "block" : "none";
    setText("auth-error", "");
}

async function authenticate() {
    const fullName = getElement("fullName").value.trim();
    const email = getElement("email").value.trim().toLowerCase();
    const password = getElement("password").value;
    const confirmPassword = getElement("confirmPassword").value;

    setText("auth-error", "");

    try {
        if (isSignUp) {
            if (!fullName || !email || !password || !confirmPassword) {
                setText("auth-error", "All fields required.");
                return;
            }

            if (password !== confirmPassword) {
                setText("auth-error", "Passwords do not match.");
                return;
            }

            const response = await fetch(`${API_BASE}/users/register`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ fullName, email, password })
            });

            await readJsonResponse(response);
            toggleAuth();
            setText("auth-error", "Account created. Please sign in.");
            return;
        }

        if (!email || !password) {
            setText("auth-error", "Email and password required.");
            return;
        }

        const response = await fetch(`${API_BASE}/users/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password })
        });

        await readJsonResponse(response);
        currentUser = email;
        localStorage.setItem("currentUser", email);
        showApp();
    } catch (err) {
        console.error("Auth error:", err);
        setText("auth-error", err.message || "Server connection failed.");
    }
}

function showApp() {
    getElement("auth-section").classList.remove("active");
    getElement("nav").style.display = "block";
    showSection("home");
}

function showSection(name) {
    document.querySelectorAll("main section").forEach(section => {
        section.classList.remove("active");
    });

    const section = getElement(`${name}-section`);

    if (section) {
        section.classList.add("active");
    }

    if (name === "home") {
        loadGallery();
    }

    if (name === "profile") {
        loadProfile();
    }
}

async function loadGallery(category = "") {
    const gallery = getElement("gallery");
    gallery.innerHTML = "<p>Loading photos...</p>";

    try {
        const query = category ? `?category=${encodeURIComponent(category)}` : "";
        const response = await fetch(`${API_BASE}/photos${query}`);
        const photos = await readJsonResponse(response);
        currentPhotos = Array.isArray(photos) ? photos : [];

        if (currentPhotos.length === 0) {
            gallery.innerHTML = "<p>No photos found.</p>";
            return;
        }

        gallery.innerHTML = currentPhotos.map(renderPhotoCard).join("");
    } catch (err) {
        console.error("Gallery error:", err);
        gallery.innerHTML = `<p>${escapeHtml(err.message || "Failed to load gallery.")}</p>`;
    }
}

function renderPhotoCard(photo) {
    const isOwner = currentUser && String(photo.email || "").toLowerCase() === currentUser.toLowerCase();
    const ownerControls = isOwner
        ? `
            <button onclick="editPhoto('${escapeHtml(photo.id)}')">Edit</button>
            <button onclick="deletePhoto('${escapeHtml(photo.id)}')">Delete</button>
        `
        : "";

    return `
        <div class="card">
            <img src="${escapeHtml(photo.imageUrl)}" alt="${escapeHtml(photo.category)} photo">
            <h3>${escapeHtml(photo.category)}</h3>
            <p>By ${escapeHtml(photo.fullName || photo.email)}</p>
            <p>${escapeHtml(photo.size || "")}</p>
            <div class="card-actions">
                <button onclick="likePhoto('${escapeHtml(photo.id)}')">Like (${Number(photo.likes || 0)})</button>
                <button onclick="downloadPhoto('${escapeHtml(photo.id)}')">Download (${Number(photo.downloads || 0)})</button>
                ${ownerControls}
            </div>
        </div>
    `;
}

async function searchPhotos() {
    const category = getElement("searchCategory").value.trim();
    await loadGallery(category);
}

async function uploadPhoto() {
    const fileInput = getElement("photoInput");
    const categoryInput = getElement("photoCategory");
    const file = fileInput.files[0];
    const category = categoryInput.value.trim();

    setText("upload-error", "");

    if (!currentUser) {
        setText("upload-error", "Please sign in first.");
        return;
    }

    if (!file || !category) {
        setText("upload-error", "Choose a JPEG photo and enter a category.");
        return;
    }

    if (file.type !== "image/jpeg") {
        setText("upload-error", "Only JPEG files are supported.");
        return;
    }

    try {
        const formData = new FormData();
        formData.append("photo", file);
        formData.append("category", category);
        formData.append("email", currentUser);

        const response = await fetch(`${API_BASE}/photos`, {
            method: "POST",
            body: formData
        });

        await readJsonResponse(response);

        fileInput.value = "";
        categoryInput.value = "";
        setText("upload-error", "Photo uploaded successfully.");
        showSection("home");
    } catch (err) {
        console.error("Upload error:", err);
        setText("upload-error", err.message || "Upload failed.");
    }
}

async function likePhoto(id) {
    try {
        const response = await fetch(`${API_BASE}/photos/${encodeURIComponent(id)}/like`, {
            method: "POST"
        });

        await readJsonResponse(response);
        await loadGallery(getElement("searchCategory").value.trim());
    } catch (err) {
        console.error("Like error:", err);
        alert(err.message || "Like failed.");
    }
}

async function downloadPhoto(id) {
    const photo = currentPhotos.find(item => String(item.id) === String(id));

    if (!photo) {
        alert("Photo not found.");
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/photos/${encodeURIComponent(id)}/download`, {
            method: "POST"
        });

        await readJsonResponse(response);

        const link = document.createElement("a");
        link.href = photo.imageUrl;
        link.download = `${(photo.category || "uupixel-photo").replace(/[^a-z0-9_-]/gi, "-")}.jpg`;
        document.body.appendChild(link);
        link.click();
        link.remove();

        await loadGallery(getElement("searchCategory").value.trim());
    } catch (err) {
        console.error("Download error:", err);
        alert(err.message || "Download failed.");
    }
}

async function editPhoto(id) {
    const photo = currentPhotos.find(item => String(item.id) === String(id));

    if (!photo) {
        alert("Photo not found.");
        return;
    }

    const category = prompt("Enter new category:", photo.category || "");

    if (category === null) {
        return;
    }

    const trimmedCategory = category.trim();

    if (!trimmedCategory) {
        alert("Category cannot be empty.");
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/photos/${encodeURIComponent(id)}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ category: trimmedCategory, email: currentUser })
        });

        await readJsonResponse(response);
        await loadGallery(getElement("searchCategory").value.trim());
    } catch (err) {
        console.error("Edit error:", err);
        alert(err.message || "Edit failed.");
    }
}

async function deletePhoto(id) {
    if (!confirm("Delete this photo?")) {
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/photos/${encodeURIComponent(id)}`, {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: currentUser })
        });

        await readJsonResponse(response);
        await loadGallery(getElement("searchCategory").value.trim());
    } catch (err) {
        console.error("Delete error:", err);
        alert(err.message || "Delete failed.");
    }
}

async function loadProfile() {
    try {
        const response = await fetch(`${API_BASE}/users/profile?email=${encodeURIComponent(currentUser)}`);
        const profile = await readJsonResponse(response);

        setText("profile-email", profile.email || currentUser);
        setText("stat-uploads", Number(profile.uploads || 0));
        setText("stat-likes", Number(profile.likes || 0));
        setText("stat-downloads", Number(profile.downloads || 0));

        const profilePic = getElement("profile-pic");

        if (profilePic) {
            profilePic.src = profile.profilePicUrl || "";
            profilePic.style.display = profile.profilePicUrl ? "block" : "none";
        }
    } catch (err) {
        console.error("Profile error:", err);
        setText("profile-email", err.message || "Profile failed to load.");
    }
}

async function uploadProfilePic() {
    const input = getElement("profileUpload");
    const file = input && input.files[0];

    if (!file) {
        alert("Choose a JPEG profile picture.");
        return;
    }

    if (file.type !== "image/jpeg") {
        alert("Only JPEG files are supported.");
        return;
    }

    try {
        const formData = new FormData();
        formData.append("profilePic", file);
        formData.append("email", currentUser);

        const response = await fetch(`${API_BASE}/users/profile-picture`, {
            method: "POST",
            body: formData
        });

        await readJsonResponse(response);
        input.value = "";
        await loadProfile();
    } catch (err) {
        console.error("Profile picture error:", err);
        alert(err.message || "Profile picture update failed.");
    }
}

function logout() {
    localStorage.removeItem("currentUser");
    currentUser = "";
    location.reload();
}
