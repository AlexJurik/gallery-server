const http = require('http');
const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const app = express();
const PORT = 3030;
const { promisify } = require('util');

const readdirAsync = promisify(fs.readdir);
const statAsync = promisify(fs.stat);

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Accept, Accept-Language, Content-Language, Content-Type, Authorization');
  res.header('Access-Control-Allow-Methods', 'HEAD, GET, POST, PUT, OPTIONS, DELETE');
  next();
});

app.get('/gallery', async (req, res) => {
  const galleryDir = path.join(__dirname, 'gallery');
  let files = await readdirAsync(galleryDir);

  const galleries = [];

  const promises = files.map(async (relPath) => {
    const fileStat = await statAsync(path.join(galleryDir, relPath));

    if (fileStat.isDirectory()) {
      galleries.push({
        path: relPath,
        name: path.basename(relPath)
      });
    }
  });

  await Promise.all(promises);

  res.send({
    galleries,
  });
});


app.post('/gallery', (req, res) => {
  const galleryDir = path.join(__dirname, 'gallery');
  
})

const server = http.createServer(app);

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`)
});
