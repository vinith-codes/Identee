// PM2 settings for the IDENTEE backend (keeps it running, restarts it if it crashes, starts it on boot).
// On the server, from the server/ folder:
//   pm2 start ecosystem.config.cjs      first time
//   pm2 restart identee                 after an update (deploy.sh does this)
//   pm2 logs identee                    see what it is doing
// The settings themselves (PORT, keys…) come from server/.env, as on the laptop.
module.exports = {
  apps: [
    {
      name: "identee",
      script: "server.js",
      cwd: __dirname,
      instances: 1, // one process: the rate limiter and some caches live in memory
      autorestart: true,
      max_memory_restart: "800M", // restart if it ever grows this big (invoice PDFs use Chrome)
      env: { NODE_ENV: "production" },
      time: true, // time stamps in the logs
    },
  ],
};
