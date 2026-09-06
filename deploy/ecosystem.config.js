module.exports = {
  apps: [
    {
      name: 'tuzhong-wenshu',
      script: 'npm',
      args: 'start',
      cwd: '/www/wwwroot/tuzhong-wenshu',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '2G',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
      },
      error_file: '/www/wwwroot/tuzhong-wenshu/logs/tuzhong-wenshu-error.log',
      out_file: '/www/wwwroot/tuzhong-wenshu/logs/tuzhong-wenshu-out.log',
      merge_logs: true,
      time: true,
    },
  ],
};
