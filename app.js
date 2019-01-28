const http = require('http');
const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const app = express();
const PORT = 3030;
const { promisify, inspect } = require('util');

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

/** GET request to gallery endpoint
 * @returns name and path of all galleries */
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
  let response = {};
  if (!req.body.name) {
    response = {
      "code": 400,
      "payload": {
        "paths": ["name"],
        "validator": "required",
        "example": null
      },
      "name": "INVALID_SCHEMA",
      "description": "Bad JSON object: u'name' is a required property"
    }
    res.statusCode = 400;
    res.send(response);
    return;
  }

  if (req.body.name.includes('/')) {
    response = {
      "code": 400,
      "payload": {
        "paths": ["name"],
        "validator": "required",
        "example": null
      },
      "name": "INVALID_SCHEMA",
      "description": "Bad JSON object: u'name' cannot include '/'"
    }
    res.statusCode = 400;
    res.send(response);
    return;
  }

  const newDir = path.join(__dirname, 'gallery', req.body.name);
  fs.mkdir(newDir, async (err) => {
    if (err) {
      response = {
        "code": 409,
        "payload": {
          "paths": ["name"],
          "validator": "required",
          "example": null
        },
        "name": "ALREADY_EXISTS",
        "description": `Cannot create directory: directory with name ${req.body.name} already exists`
      }
      res.statusCode = 409;
      res.send(response);
      return;
    }

    response = {
      "path": path.join('gallery', req.body.name),
      "name": path.basename(newDir)
    };

    res.statusCode = 201;
    res.send(response);
  });
});

app.get('/gallery/:path', async (req, res) => {
  const gallery = path.join(__dirname, 'gallery', req.params.path);
  let files, response;
  try {
    files = await readdirAsync(gallery);
  } catch (err) {
    response = {
      "code": 404,
      "payload": {
        "paths": ["path"],
        "validator": "required",
        "example": null
      },
      "path": "NOT_EXISTS",
      "description": `Cannot read directory: directory with name ${req.params.path} not exists`
    };
    res.statusCode = 404;
    res.send(response);
  }

  const images = [];

  files.forEach(img => {
    const modified = fs.statSync(path.join(gallery, img))
    images.push({
      "path": img,
      "fullpath": path.join(req.params.path, img),
      "name": img.substring(0, img.indexOf('.')),
      "modified": modified.mtime
    })
  });

  response = {
    "gallery": {
      "path": path.join('gallery', path.basename(gallery)),
      "name": path.basename(gallery)
    },
    images
  };

  res.send(response);
});

app.delete('/gallery/:path', async (req, res) => {
  let response, galleryStat;
  console.log(req.params);
  const gallery = path.join(__dirname, 'gallery', req.params.path);
  try {
    galleryStat = await statAsync(path.join(gallery));
  } catch (err) {
    response = {
      "code": 404,
      "payload": {
        "paths": ["path"],
        "validator": "required",
        "example": null
      },
      "path": "NOT_EXISTS",
      "description": `Cannot delete directory: directory with name ${req.params.path} not exists`
    };
    res.statusCode = 404;
    res.send(response);
    return;
  }
  if (galleryStat.isDirectory()) {
    fs.rmdir(gallery, (err) => {
      response = {
        "code": 200,
        "success": `Gallery ${req.params.path} was successfully deleted`
      };

      res.statusCode = 200;
      res.send(response);
    })
  } else {
    res.send("aaa");
  }

});


app.use((err, req, res, next) => {
  res.statusCode = 500;
  const response = { "TypeError": "Undefined" }
  res.send(response);
});

const server = http.createServer(app);

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`)
});
