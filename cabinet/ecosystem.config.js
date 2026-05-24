module.exports = {
  apps: [
    {
      name: 'golden-connect-cabinet',
      cwd: __dirname,
      script: 'src/server.js',
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
};
