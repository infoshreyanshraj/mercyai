# MERCY AI — Dynamic backend starter

This folder adds an API backend to the existing MERCY AI GitHub Pages frontend.

## Features in this backend
- PostgreSQL user accounts and notes
- Password hashing with bcrypt
- Signed JWT sessions
- Rate-limited login and chat routes
- AI provider proxy so the AI key stays on the server
- Health endpoint: `/api/health`

## Deploy to Render
1. Push this folder's files into a backend repository (or the root of the existing repository).
2. Create a PostgreSQL database on a provider you control.
3. In Render, create a new Blueprint and select the repo containing `render.yaml`.
4. Set `DATABASE_URL` to the database's internal/external connection string as appropriate.
5. Set `AI_API_KEY` privately in the service environment. Never place it in frontend JavaScript or GitHub Pages.
6. Deploy and open `https://YOUR-SERVICE.onrender.com/api/health`.

## Frontend connection
After deployment, set `window.MERCY_API_URL` in the website's frontend config to the deployed API URL, then update the existing signup/login and chat forms to call `/api/auth/signup`, `/api/auth/login`, and `/api/chat`. The current UI is still a separate frontend and must be wired to these endpoints before the buttons use this backend.

## Important
- This is a backend starter, not a completed production deployment. The API has not been deployed by this package.
- Do not collect real user credentials until the website's frontend is wired to the backend and tested over HTTPS.
- The chat route requires an AI provider key and may incur usage charges.
- This is not end-to-end encrypted messaging. HTTPS and server-side encryption are different from E2EE.
- GitHub Pages only serves static frontend assets; it cannot run this Node.js server.
