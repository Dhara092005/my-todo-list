// Set this to the deployed backend origin before publishing the frontend.
// Keep the port and path out of this value, for example: https://todo-api.onrender.com
window.APP_CONFIG = Object.freeze({
  API_BASE_URL: ['localhost', '127.0.0.1'].includes(window.location.hostname)
    ? 'http://localhost:3000'
    : 'https://my-todo-list-2-ulem.onrender.com'
});
