module.exports = {
  apps: [
    {
      name: 'goldenConnect-cabinet',
      cwd: __dirname,
      script: 'src/server.js',
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
};
