module.exports = {
  apps: [
    {
      name: 'trendex-cabinet',
      cwd: __dirname,
      script: 'src/server.js',
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
};
