// ---------- SWITCH FORMS ----------
function toggleForm(type) {
  document.getElementById("login-form").style.display =
    type === "login" ? "block" : "none";

  document.getElementById("signup-form").style.display =
    type === "signup" ? "block" : "none";

  document.getElementById("forgot-form").style.display =
    type === "forgot" ? "block" : "none";
}

function togglePassword(inputIdOrEl, toggleIdOrEl) {
  const passwordInput =
    typeof inputIdOrEl === "string"
      ? document.getElementById(inputIdOrEl)
      : inputIdOrEl;

  const toggleButton =
    typeof toggleIdOrEl === "string"
      ? document.getElementById(toggleIdOrEl)
      : toggleIdOrEl;

  if (!passwordInput || !toggleButton) return;

  const isPassword = passwordInput.type === "password";
  passwordInput.type = isPassword ? "text" : "password";
  toggleButton.textContent = isPassword ? "🙈" : "👁️";
  toggleButton.setAttribute(
    "aria-label",
    isPassword ? "Hide password" : "Show password"
  );
}

function populateUsername() {
  const loginInput = document.getElementById("login-username");
  const savedUsername =
    localStorage.getItem("loginUsername") || localStorage.getItem("username");
  if (loginInput && savedUsername) {
    loginInput.value = savedUsername;
  }
}

window.addEventListener("DOMContentLoaded", populateUsername);

// Improve password input behavior across browsers and keep our toggle visible
window.addEventListener("DOMContentLoaded", () => {
  const pwdInputs = document.querySelectorAll('input[type="password"]');
  pwdInputs.forEach(input => {
    // discourage browser native reveal/autocomplete
    try {
      input.setAttribute('autocomplete', 'new-password');
      input.setAttribute('autocorrect', 'off');
      input.setAttribute('autocapitalize', 'off');
      input.setAttribute('spellcheck', 'false');
    } catch (e) {}

    // ensure the custom toggle remains visible while typing
    const wrapper = input.closest('.password-wrapper');
    if (wrapper) {
      const btn = wrapper.querySelector('.toggle-password');
      if (btn) {
        btn.style.visibility = 'visible';
        // when user types, ensure toggle stays on top and clickable
        input.addEventListener('input', () => {
          btn.style.visibility = 'visible';
          btn.style.zIndex = 3;
        });
      }
    }
  });
});

const API_BASE_URL = window.APP_CONFIG.API_BASE_URL.replace(/\/$/, '');
const API_URL = `${API_BASE_URL}/auth`;
const PASSWORD_REQUIREMENTS_MESSAGE = "Password must be at least 8 characters and include at least one uppercase letter and one special character.";

function isStrongPassword(password) {
  return password.length >= 8 && /[A-Z]/.test(password) && /[^A-Za-z0-9\s]/.test(password);
}

// ---------- LOGIN ----------
function login() {
  let username = document.getElementById("login-username").value;
  let password = document.getElementById("login-password").value;

  if (!username || !password) {
    alert("Please fill all fields");
    return;
  }

  localStorage.setItem("loginUsername", username);

  fetch(`${API_URL}/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      username,
      password
    })
  })
    .then(res => res.json())
    .then(data => {

      alert(data.message);

      if (data.success) {

        // ✅ IMPORTANT: store user session and auth token
        localStorage.setItem("userId", data.user._id);
        localStorage.setItem("username", data.user.username);
        if (data.token) {
          localStorage.setItem("token", data.token);
        }

        window.location.href = "todo.html";
      }
    })
    .catch(err => {
      console.error(err);
      alert("Server not connected");
    });
}

// ---------- SIGNUP ----------
function signup() {
  let email = document.getElementById("signup-email").value;
  let username = document.getElementById("signup-username").value;
  let password = document.getElementById("signup-password").value;
  let confirm = document.getElementById("signup-confirm").value;

  if (!email || !username || !password || !confirm) {
    alert("Please fill all fields");
    return;
  }

  if (!isStrongPassword(password)) {
    alert(PASSWORD_REQUIREMENTS_MESSAGE);
    return;
  }

  if (password !== confirm) {
    alert("Passwords do not match");
    return;
  }

  fetch(`${API_URL}/signup`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      email,
      username,
      password
    })
  })
    .then(res => res.json())
    .then(data => {

      alert(data.message);

      if (data.success) {
        toggleForm("login");
      }
    })
    .catch(err => {
      console.error(err);
      alert("Server not connected");
    });
}

// ---------- RESET PASSWORD ----------
async function resetPassword() {
  const email = document.getElementById("forgot-email").value;
  const button = document.getElementById("forgot-submit");
  const status = document.getElementById("forgot-status");

  if (!email) {
    alert("Please enter email");
    return;
  }

  button.disabled = true;
  const originalText = button.textContent;
  button.textContent = "Sending...";
  status.textContent = "Please wait while we send the reset link.";

  try {
    const res = await fetch(`${API_URL}/forgot-password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ email })
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      status.textContent = data.message || "Unable to send reset link. Please try again.";
      if (data.error) status.textContent += " (" + data.error + ")";
    } else {
      // show success message and preview link when available using DOM
      status.textContent = '';
      const msgDiv = document.createElement('div');
      msgDiv.textContent = data.message || 'Reset link request complete.';
      status.appendChild(msgDiv);

      if (data.previewUrl) {
        const linkDiv = document.createElement('div');
        linkDiv.style.marginTop = '8px';
        const a = document.createElement('a');
        a.href = data.previewUrl;
        a.target = '_blank';
        a.textContent = 'Open email preview';
        linkDiv.appendChild(a);
        status.appendChild(linkDiv);
      }

      // keep the forgot form visible so user can see the status/preview
    }
  } catch (err) {
    console.error(err);
    status.textContent = "Unable to send reset link. Please try again. " + (err && err.message ? err.message : '');
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}