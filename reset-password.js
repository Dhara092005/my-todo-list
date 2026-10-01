const API_BASE_URL = window.APP_CONFIG.API_BASE_URL.replace(/\/$/, '');
const API_URL = `${API_BASE_URL}/auth`;
const PASSWORD_REQUIREMENTS_MESSAGE = "Password must be at least 8 characters and include at least one uppercase letter and one special character.";

function isStrongPassword(password) {
  return password.length >= 8 && /[A-Z]/.test(password) && /[^A-Za-z0-9\s]/.test(password);
}

function getQueryParam(name) {
  const params = new URLSearchParams(window.location.search);
  return params.get(name);
}

async function validateToken(token) {
  try {
    const res = await fetch(`${API_URL}/reset-password/${token}`);
    const data = await res.json();
    return data && data.success;
  } catch (err) {
    console.error(err);
    return false;
  }
}

async function submitNewPassword(token, newPassword) {
  try {
    const res = await fetch(`${API_URL}/reset-password/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newPassword })
    });
    return await res.json();
  } catch (err) {
    console.error(err);
    return { success: false, message: 'Server error' };
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const token = getQueryParam('token');
  if (!token) {
    document.getElementById('invalid-token').style.display = 'block';
    return;
  }

  const ok = await validateToken(token);
  if (!ok) {
    document.getElementById('invalid-token').style.display = 'block';
    return;
  }

  document.getElementById('reset-form').style.display = 'block';

  document.getElementById('submit-btn').addEventListener('click', async () => {
    const pw = document.getElementById('new-password').value;
    const cpw = document.getElementById('confirm-password').value;
    if (!pw || !cpw) return alert('Please fill both fields');
    if (!isStrongPassword(pw)) return alert(PASSWORD_REQUIREMENTS_MESSAGE);
    if (pw !== cpw) return alert('Passwords do not match');

    const result = await submitNewPassword(token, pw);
    alert(result.message);
    if (result.success) {
      document.getElementById('reset-form').style.display = 'none';
      document.getElementById('success-message').style.display = 'block';
      setTimeout(() => window.location.href = 'auth.html', 2000);
    }
  });
});
