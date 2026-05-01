const API_BASE = "https://uupixel-api-rafi-fffcgtbfcsjeqhb.francecentral-01.azurewebsites.net";

let isSignUp = false;
let currentUser = localStorage.getItem("currentUser");

document.addEventListener("DOMContentLoaded", () => {
    if (currentUser) showApp();
});

function toggleAuth() {
    isSignUp = !isSignUp;

    document.getElementById("auth-title").innerText =
        isSignUp ? "Sign Up" : "Sign In";

    document.getElementById("fullName").style.display =
        isSignUp ? "block" : "none";

    document.getElementById("confirmPassword").style.display =
        isSignUp ? "block" : "none";

    document.getElementById("auth-error").innerText = "";
}

async function authenticate() {
    const fullName = document.getElementById("fullName").value.trim();
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value.trim();
    const confirmPassword = document.getElementById("confirmPassword").value.trim();
    const error = document.getElementById("auth-error");

    error.innerText = "";

    if (!email || !password) {
        error.innerText = "Email and password are required.";
        return;
    }

    try {
        if (isSignUp) {
            if (!fullName) {
                error.innerText = "Full name is required.";
                return;
            }

            if (!confirmPassword) {
                error.innerText = "Please confirm your password.";
                return;
            }

            if (password !== confirmPassword) {
                error.innerText = "Passwords do not match.";
                return;
            }

            const registerRes = await fetch(API_BASE + "/users/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ fullName, email, password })
            });

            const registerData = await registerRes.json();

            if (!registerRes.ok) {
                error.innerText = registerData.message || "Registration failed.";
                return;
            }

            error.innerText = "Account created. Please sign in.";

            isSignUp = false;
            document.getElementById("auth-title").innerText = "Sign In";
            document.getElementById("fullName").style.display = "none";
            document.getElementById("confirmPassword").style.display = "none";
            document.getElementById("fullName").value = "";
            document.getElementById("password").value = "";
            document.getElementById("confirmPassword").value = "";
            return;
        }

        const loginRes = await fetch(API_BASE + "/users/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password })
        });

        const loginData = await loginRes.json();

        if (!loginRes.ok) {
            error.innerText = loginData.message || "Login failed.";
            return;
        }

        currentUser = email;
        localStorage.setItem("currentUser", email);
        showApp();
    } catch (err) {
        error.innerText = "Server error.";
    }
}

function showApp() {
    document.getElementById("auth-section").classList.remove("active");
    document.getElementById("nav").style.display = "block";
    showSection("home");
    loadGallery();
}

function showSection(name) {
    document.querySelectorAll("section").forEach(s => s.classList.remove("active"));
    document.getElementById(name + "-section").classList.add("active");

    if (name === "profile") loadProfile();
    if (name === "home") loadGallery();
}

async function uploadPhoto() {
    const fileInput = document.getElementById("photoInput");
    const categoryInput = document.getElementById("photoCategory");
    const file = fileInput.files[0];
    const category = categoryInput.value.trim();
    const error = document.getElementById("upload-error");

    error.innerText = "";

    if (!file || !file.type.includes("jpeg")) {
        error.innerText = "JPEG only.";
        return;
    }

    if (!category) {
        error.innerText = "Category required.";
        return;
    }

    const formData = new FormData();
    formData.append("photo", file);
    formData.append("category", category);
    formData.append("email", currentUser);

    try {
        const res = await fetch(API_BASE + "/photos", {
            method: "POST",
            body: formData
        });

        const data = await res.json();

        if (!res.ok) {
            error.innerText = data.message || "Upload failed.";
            return;
        }

        fileInput.value = "";
        categoryInput.value = "";
        error.innerText = "Upload successful.";
        showSection("home");
    } catch (err) {
        error.innerText = "Server error.";
    }
}

async function loadGallery(filterCategory = "") {
    const gallery = document.getElementById("gallery");
    gallery.innerHTML = "";

    try {
        let url = API_BASE + "/photos";

        if (filterCategory) {
            url += "?category=" + encodeURIComponent(filterCategory);
        }

        const res = await fetch(url);
        const photos = await res.json();

        if (!Array.isArray(photos) || photos.length === 0) {
            gallery.innerHTML = `<div class="empty-state">No photos found yet. Upload a JPEG photo or try a different search category.</div>`;
            return;
        }

        photos.forEach((photo) => {
            const card = document.createElement("div");
            card.className = "card";

            const ownerButtons = photo.email === currentUser
                ? `
                    <button class="edit-btn" onclick="editPhoto('${photo.id}')">✏ Edit</button>
                    <button class="delete-btn" onclick="deletePhoto('${photo.id}')">🗑 Delete</button>
                  `
                : "";

            card.innerHTML = `
                <img src="${photo.imageUrl}" alt="Uploaded photo">
                <p class="meta">Category: ${photo.category}</p>
                <p class="meta">Size: ${photo.size}</p>
                <p class="meta">By ${photo.fullName || photo.email}</p>
                <div class="actions">
                    <button onclick="likePhoto('${photo.id}')">❤️ ${photo.likes}</button>
                    <button onclick="downloadPhoto('${photo.id}', '${photo.imageUrl}')">⬇ ${photo.downloads}</button>
                    ${ownerButtons}
                </div>
            `;

            gallery.appendChild(card);
        });
    } catch (err) {
        gallery.innerHTML = `<div class="empty-state">Failed to load gallery.</div>`;
    }
}

function searchPhotos() {
    const value = document.getElementById("searchCategory").value;
    loadGallery(value);
}

async function likePhoto(photoId) {
    await fetch(API_BASE + "/photos/" + photoId + "/like", {
        method: "POST"
    });

    loadGallery();
}

async function downloadPhoto(photoId, imageUrl) {
    await fetch(API_BASE + "/photos/" + photoId + "/download", {
        method: "POST"
    });

    const a = document.createElement("a");
    a.href = imageUrl;
    a.download = "image.jpg";
    a.click();

    loadGallery();
}

async function editPhoto(photoId) {
    const newCategory = prompt("Enter new category:");

    if (newCategory === null) return;

    if (newCategory.trim() === "") {
        alert("Category cannot be empty.");
        return;
    }

    await fetch(API_BASE + "/photos/" + photoId, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: newCategory.trim() })
    });

    loadGallery();
}

async function deletePhoto(photoId) {
    const confirmDelete = confirm("Are you sure you want to delete this photo?");

    if (!confirmDelete) return;

    await fetch(API_BASE + "/photos/" + photoId, {
        method: "DELETE"
    });

    loadGallery();
}

async function loadProfile() {
    try {
        const res = await fetch(
            API_BASE + "/users/profile?email=" + encodeURIComponent(currentUser)
        );

        const user = await res.json();

        document.getElementById("profile-email").innerText =
            user.fullName ? `${user.fullName} (${user.email})` : user.email;

        document.getElementById("profile-pic").src =
            user.profilePicUrl || "https://via.placeholder.com/120";

        document.getElementById("stat-uploads").innerText = user.uploads || 0;
        document.getElementById("stat-likes").innerText = user.likes || 0;
        document.getElementById("stat-downloads").innerText = user.downloads || 0;
    } catch (err) {
        console.log("Profile load failed");
    }
}

function uploadProfilePic() {
    alert("Profile picture backend step will be added later.");
}

function logout() {
    localStorage.removeItem("currentUser");
    location.reload();
}