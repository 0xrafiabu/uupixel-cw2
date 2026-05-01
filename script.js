// Use Azure API automatically
const API_BASE = window.location.origin;

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
    const confirmPassword =
        document.getElementById("confirmPassword").value.trim();

    const error = document.getElementById("auth-error");
    error.innerText = "";

    try {
        if (isSignUp) {
            if (!fullName || !email || !password || !confirmPassword) {
                error.innerText = "All fields required.";
                return;
            }

            if (password !== confirmPassword) {
                error.innerText = "Passwords do not match.";
                return;
            }

            const res = await fetch(API_BASE + "/users/register", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    fullName,
                    email,
                    password
                })
            });

            const data = await res.json();

            if (!res.ok) {
                error.innerText = data.message;
                return;
            }

            error.innerText = "Account created. Please sign in.";
            toggleAuth();
            return;
        }

        const res = await fetch(API_BASE + "/users/login", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                email,
                password
            })
        });

        const data = await res.json();

        if (!res.ok) {
            error.innerText = data.message;
            return;
        }

        currentUser = email;
        localStorage.setItem("currentUser", email);
        showApp();

    } catch (err) {
        error.innerText = "Server connection failed.";
        console.error(err);
    }
}

function showApp() {
    document
        .getElementById("auth-section")
        .classList.remove("active");

    document.getElementById("nav").style.display = "block";

    showSection("home");
}

function showSection(name) {
    document
        .querySelectorAll("section")
        .forEach(s => s.classList.remove("active"));

    document
        .getElementById(name + "-section")
        .classList.add("active");

    if (name === "home") loadGallery();
}

async function loadGallery() {
    const gallery = document.getElementById("gallery");
    gallery.innerHTML = "";

    try {
        const res = await fetch(API_BASE + "/photos");
        const photos = await res.json();

        if (!Array.isArray(photos)) {
            gallery.innerHTML = "No photos yet.";
            return;
        }

        photos.forEach(photo => {
            const card = document.createElement("div");
            card.className = "card";

            card.innerHTML = `
                <img src="${photo.imageUrl}">
                <p>${photo.category}</p>
                <button onclick="likePhoto('${photo.id}')">
                    ❤️ ${photo.likes}
                </button>
            `;

            gallery.appendChild(card);
        });

    } catch (err) {
        gallery.innerHTML = "Failed to load gallery.";
    }
}

async function likePhoto(id) {
    await fetch(API_BASE + "/photos/" + id + "/like", {
        method: "POST"
    });

    loadGallery();
}

function logout() {
    localStorage.removeItem("currentUser");
    location.reload();
}