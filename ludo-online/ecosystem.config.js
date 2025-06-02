module.exports = {
  apps : [{
    name   : "ludo-backend",
    script : "./server.js", // Path to your main server script
    instances : 1, // Or a number based on CPU cores, e.g., 'max'
    autorestart: true,
    watch: false, // Set to true for development, false for production
    max_memory_restart: '1G', // Optional: restart if it exceeds memory limit
    env_production: {
       NODE_ENV: "production",
       PORT: 3000 // You can override this with an environment variable or specific port
       // Add other production environment variables here
       // e.g., DATABASE_URL: "your_production_db_url"
    },
    env_development: {
       NODE_ENV: "development",
       PORT: 3001
       // Add development environment variables
    }
  }]
};
