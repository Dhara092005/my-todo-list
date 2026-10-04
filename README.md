# Daymark Todo

A full-stack task manager with account authentication, task categories, favorites, calendar views, reminders, profile management, and password reset.

## Live App

- Frontend: https://my-todo-list-3.onrender.com
- Backend API: https://my-todo-list-2-ulem.onrender.com

## Features

- Sign up, log in, and securely change or reset passwords
- Create, edit, complete, favorite, and delete tasks
- Filter tasks by category, status, due date, and favorites
- Calendar with monthly navigation and daily task agenda
- Profile photo, account details, and task statistics
- In-app and browser reminders
- Responsive layout with light and dark themes

## Local Development

### Requirements

- Node.js
- MongoDB Server running locally, or a MongoDB connection URI

### Start the backend

From the repository root:

```powershell
cd backend
npm install
npm start
```

Open http://localhost:3000. The Express backend serves the frontend files as well as the API.

For local MongoDB, the default connection is `mongodb://127.0.0.1:27017/todo`. To override it, create `backend/.env` and set `MONGO_URL`.

## Environment Variables

Set secrets in the hosting provider's environment settings. Never commit `.env` files or paste secret values into source code.

| Variable | Purpose |
| --- | --- |
| `NODE_ENV` | Set to `production` when deployed. |
| `PORT` | HTTP port supplied by the host; defaults to `3000` locally. |
| `MONGO_URL` | MongoDB connection URI. Use MongoDB Atlas for a public deployment. |
| `JWT_SECRET` | Secret used to sign login tokens. Required in production. |
| `APP_URL` | Public frontend origin, used for CORS and password-reset links. |
| `RESEND_API_KEY` | Resend API key used for production reset email. |
| `RESEND_FROM` | Sender address permitted by Resend. Verify the sender domain with Resend for delivery to users. |

The deployed frontend's API origin is configured in `api-config.js`. Keep it set to the public backend origin.

## Render Deployment

The repository includes `render.yaml` for a Render Blueprint deployment. It runs `node backend/server.js`, which serves the frontend and API from one web service. If deploying the frontend and backend as separate services, configure `api-config.js` with the backend's public HTTPS origin and set the backend's `APP_URL` to the frontend's public HTTPS origin.

Provide the MongoDB Atlas URI, JWT secret, Resend key, and verified sender through Render's Environment settings. Do not add their values to `render.yaml` or GitHub.

## Password Reset

Reset links point to the frontend's `/reset-password.html` page and expire after one hour. Production reset email uses Resend. For delivery to arbitrary users, the sender domain must be verified with Resend.

## Tests

Automated test scripts are not configured yet. JavaScript files can be syntax-checked with `node --check <file>`. The main application start command is `npm start` from the `backend` directory.
