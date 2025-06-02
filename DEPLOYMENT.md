# Ludo Game Deployment Guide

This guide provides instructions for deploying the Ludo game application, which consists of a Node.js backend and a React frontend.

## Table of Contents

1.  [Prerequisites](#prerequisites)
2.  [Backend Deployment (`ludo-online`)](#backend-deployment-ludo-online)
    *   [Method 1: Using PM2 (Recommended)](#method-1-using-pm2-recommended)
    *   [Method 2: Using Docker (Alternative)](#method-2-using-docker-alternative)
3.  [Frontend Deployment (`ludo-frontend`)](#frontend-deployment-ludo-frontend)
    *   [Method 1: Using Nginx (Recommended)](#method-1-using-nginx-recommended)
    *   [Method 2: Serving from Node.js Backend (Simpler Alternative)](#method-2-serving-from-nodejs-backend-simpler-alternative)
4.  [Environment Variables Summary](#environment-variables-summary)
5.  [Basic Troubleshooting](#basic-troubleshooting)

## 1. Prerequisites

Before deploying, ensure your Linux server has the following installed:

*   **Node.js and npm:** Required for both backend and frontend. (Node.js v18.x or later recommended).
    *   You can install Node.js using a version manager like `nvm` or from NodeSource repositories.
*   **Git:** For cloning the repository.
*   **PM2 (for backend Method 1):** A process manager for Node.js. Install globally: `sudo npm install pm2 -g`
*   **Nginx (for frontend Method 1):** A web server/reverse proxy. Install: `sudo apt update && sudo apt install nginx`
*   **Docker (for backend Method 2):** A containerization platform. Follow official Docker installation guides for your Linux distribution.

## 2. Backend Deployment (`ludo-online`)

The backend server is located in the `ludo-online` directory.

### Method 1: Using PM2 (Recommended)

PM2 is a production process manager for Node.js applications that provides features like auto-restarts, logging, and monitoring.

1.  **Clone the Repository:**
    ```bash
    git clone <your-repository-url>
    cd <your-repository-url>/ludo-online
    ```

2.  **Install Dependencies:**
    Install only production dependencies.
    ```bash
    npm install --production
    ```
    (If `package-lock.json` is present and up-to-date, `npm ci --omit=dev` is also a good option for faster, more reliable builds).

3.  **Configure PM2:**
    An `ecosystem.config.js` file is provided in the `ludo-online` directory. It's configured as follows:
    ```javascript
    module.exports = {
      apps : [{
        name   : "ludo-backend",
        script : "./server.js",
        instances : 1,
        autorestart: true,
        watch: false,
        max_memory_restart: '1G',
        env_production: {
           NODE_ENV: "production",
           PORT: 3000 // Ensure this port is open or configure as needed
        }
      }]
    };
    ```
    You can adjust the `PORT` in `env_production` if needed.

4.  **Start the Application with PM2:**
    ```bash
    pm2 start ecosystem.config.js --env production
    ```

5.  **Common PM2 Commands:**
    *   List all running applications: `pm2 list`
    *   View logs for the backend: `pm2 logs ludo-backend` (or `pm2 logs 0` if it's app ID 0)
    *   Stop the application: `pm2 stop ludo-backend`
    *   Restart the application: `pm2 restart ludo-backend`
    *   Delete the application from PM2 list: `pm2 delete ludo-backend`

6.  **Enable Auto-Restart on Server Reboot (Optional but Recommended):**
    PM2 can generate a startup script for your specific OS.
    ```bash
    pm2 startup
    ```
    Follow the instructions output by this command. Then, save your current PM2 process list:
    ```bash
    pm2 save
    ```

### Method 2: Using Docker (Alternative)

A `Dockerfile` and `.dockerignore` are provided in the `ludo-online` directory.

1.  **Clone the Repository (if not already done):**
    ```bash
    git clone <your-repository-url>
    cd <your-repository-url>/ludo-online
    ```

2.  **Build the Docker Image:**
    From within the `ludo-online` directory:
    ```bash
    docker build -t ludo-backend .
    ```

3.  **Run the Docker Container:**
    This command runs the container in detached mode (`-d`) and maps port 3000 of the host to port 3000 of the container. Adjust the host port if needed.
    ```bash
    docker run -d -p 3000:3000 --name ludo-app --restart unless-stopped ludo-backend
    ```
    *   `--restart unless-stopped` ensures the container restarts automatically unless manually stopped.

4.  **Common Docker Commands:**
    *   List running containers: `docker ps`
    *   View logs: `docker logs ludo-app`
    *   Stop the container: `docker stop ludo-app`
    *   Start the container: `docker start ludo-app`
    *   Remove the container: `docker rm ludo-app` (must be stopped first)

## 3. Frontend Deployment (`ludo-frontend`)

The React frontend is in the `ludo-frontend` directory. It needs to be built into static files first.

1.  **Clone the Repository (if not already done):**
    ```bash
    git clone <your-repository-url>
    cd <your-repository-url>/ludo-frontend
    ```

2.  **Set Environment Variable for Backend URL:**
    The frontend needs to know where the backend WebSocket server is running. This is configured via the `REACT_APP_SOCKET_URL` environment variable.
    Before building, set this variable:
    ```bash
    export REACT_APP_SOCKET_URL="http://your_domain_or_ip:3000" 
    # Replace your_domain_or_ip:3000 with the actual URL of your backend.
    # If using Nginx as a reverse proxy on the same server, this might be a relative path
    # or the public URL that Nginx exposes for the backend sockets.
    ```
    For example, if your server's IP is `192.0.2.10` and backend runs on port `3000`:
    `export REACT_APP_SOCKET_URL="http://192.0.2.10:3000"`
    If using Nginx to proxy `/socket.io/` requests to `http://localhost:3000/socket.io/`, and your site is `http://your_domain_or_ip`, then `REACT_APP_SOCKET_URL` might just be `http://your_domain_or_ip` (as socket.io client will connect to the same origin by default, or you might need to specify the path if Nginx is configured for it). For simplicity, using the direct IP/domain and port of the backend is often easiest if not using an advanced Nginx proxy setup for sockets.

3.  **Install Dependencies and Build:**
    ```bash
    npm install
    npm run build
    ```
    This will create a `build/` directory inside `ludo-frontend` containing the static assets.

### Method 1: Using Nginx (Recommended)

Nginx is a high-performance web server that can efficiently serve static files.

1.  **Copy Build Files to Server:**
    Copy the contents of the `ludo-frontend/build` directory to a location on your server where Nginx will serve them from, for example, `/var/www/ludo-game`.
    ```bash
    # Example:
    sudo mkdir -p /var/www/ludo-game
    sudo cp -r build/* /var/www/ludo-game/
    ```

2.  **Create Nginx Server Block Configuration:**
    Create a new Nginx configuration file for your Ludo game site. For example, `sudo nano /etc/nginx/sites-available/ludo-game`.
    Add the following configuration, replacing placeholders:

    ```nginx
    server {
        listen 80; # Or 443 if using SSL
        server_name your_domain_or_ip; # Replace with your server's domain or IP address

        root /var/www/ludo-game; # Path to where you copied the build files
        index index.html index.htm;

        location / {
            try_files $uri $uri/ /index.html;
        }

        # Optional: If you want Nginx to also proxy WebSocket connections to your backend
        # (assuming backend runs on localhost:3000 and frontend makes requests to the same domain Nginx serves)
        # In this case, REACT_APP_SOCKET_URL in frontend build should be just "/" or your domain.
        # location /socket.io/ {
        #     proxy_pass http://localhost:3000/socket.io/; # Your backend Node.js server address
        #     proxy_http_version 1.1;
        #     proxy_set_header Upgrade $http_upgrade;
        #     proxy_set_header Connection 'upgrade';
        #     proxy_set_header Host $host;
        #     proxy_cache_bypass $http_upgrade;
        # }
    }
    ```

3.  **Enable the Nginx Site and Restart Nginx:**
    *   Create a symbolic link from `sites-available` to `sites-enabled`:
        ```bash
        sudo ln -s /etc/nginx/sites-available/ludo-game /etc/nginx/sites-enabled/
        ```
    *   Test Nginx configuration:
        ```bash
        sudo nginx -t
        ```
    *   If the test is successful, restart Nginx:
        ```bash
        sudo systemctl restart nginx
        ```

    Your frontend should now be accessible via `http://your_domain_or_ip`.

### Method 2: Serving from Node.js Backend (Simpler Alternative)

This method is simpler for development or small deployments but generally not recommended for production compared to a dedicated web server like Nginx.

1.  **Modify `ludo-online/server.js`:**
    Ensure the backend server can serve static files. Add the following snippets to your `ludo-online/server.js`:

    ```javascript
    const path = require('path');

    // ... other requires and app setup ...

    // Serve static files from the React frontend build directory
    // Adjust the path '.../ludo-frontend/build' relative to your server.js location.
    // This example assumes ludo-online and ludo-frontend are sibling directories.
    app.use(express.static(path.join(__dirname, '../ludo-frontend/build')));

    // For any other GET request, serve the React app's index.html
    // This allows React Router to handle client-side routing if you add it later.
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, '../ludo-frontend/build', 'index.html'));
    });

    // ... rest of your server.js, including io.on('connection') and server.listen ...
    ```

2.  **Deployment Steps:**
    *   Build the frontend as described above (`npm run build` in `ludo-frontend`).
    *   Ensure the `ludo-frontend/build` directory is correctly located relative to where `server.js` will run (e.g., copy it to the server).
    *   Run the backend server (using PM2 or Docker as described previously). The backend will now also serve the frontend files.
    *   In this setup, `REACT_APP_SOCKET_URL` for the frontend build can often be omitted or set to `/` (or the server's own URL) as the frontend and backend are served from the same origin.

## 4. Environment Variables Summary

*   **Backend (`ludo-online`):**
    *   `NODE_ENV`: Set to `production` for production builds/runs. PM2 ecosystem file handles this.
    *   `PORT`: The port the Node.js server will listen on (e.g., `3000`). Configurable in `ecosystem.config.js` or via Docker port mapping.
*   **Frontend (`ludo-frontend`):**
    *   `REACT_APP_SOCKET_URL`: Crucial. Must be set **at build time** for the React app. It points to the URL of your backend WebSocket server (e.g., `http://your_domain.com:3000` or `ws://your_domain.com:3000`, or if using Nginx as a reverse proxy, it might be `http://your_domain.com` or a relative path).

## 5. Basic Troubleshooting

*   **PM2 Logs (Backend):**
    *   `pm2 logs ludo-backend` or `pm2 logs <app_id>`
*   **Docker Logs (Backend):**
    *   `docker logs ludo-app`
*   **Nginx Logs (Frontend):**
    *   Access logs: `/var/log/nginx/access.log`
    *   Error logs: `/var/log/nginx/error.log`
*   **Browser Developer Console:** Check for JavaScript errors or WebSocket connection issues on the client-side.
*   **Firewall:** Ensure the necessary ports (e.g., 80 for HTTP, 443 for HTTPS, 3000 for the backend if directly exposed) are open on your server's firewall.
*   **`REACT_APP_SOCKET_URL`:** Double-check this value in the frontend build if clients cannot connect to the WebSocket server. It must be reachable from the user's browser.

This guide provides a starting point. Production deployments can involve more complex setups (HTTPS, load balancing, database configurations, etc.) depending on the scale and requirements.
