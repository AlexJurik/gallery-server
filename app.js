const http = require('http');
const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const formidableMiddleware = require('express-formidable');

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

    res.status(400).send(response);
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

    res.status(400).send(response);
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

      res.status(409).send(response);
      return;
    }

    response = {
      "path": path.join('gallery', req.body.name),
      "name": path.basename(newDir)
    };

    res.status(201).send(response);
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

    res.status(404).send(response);
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

app.delete('/gallery/:path/:img?', (req, res) => {
  let response;
  if (!req.params.img) {
    const gallery = path.join(__dirname, 'gallery', req.params.path);
    fs.rmdir(gallery, (err) => {
      if (err) {
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

        res.status(404).send(response);
        return;
      }
      response = {
        "code": 200,
        "success": `Gallery ${req.params.path} was successfully deleted`
      };

      res.status(200).send(response);
    })
  } else {
    const image = path.join(__dirname, 'gallery', req.params.path, req.params.img);
    fs.unlink(image, (err) => {
      if (err) {
        response = {
          "code": 404,
          "payload": {
            "paths": ["img"],
            "validator": "required",
            "example": null
          },
          "img": "NOT_EXISTS",
          "description": `Cannot delete image: image with name ${req.params.img} not exists in ${req.params.path} gallery`
        };

        res.status(404).send(response);
        return;
      }
      response = {
        "code": 200,
        "success": `Image ${req.params.img} was successfully deleted`
      };

      res.status(200).send(response);
    })
  }
});

app.post('/gallery/:path', formidableMiddleware(), (req, res) => {
  let response;
  const file = path.join(__dirname, 'gallery', req.params.path, req.files.image.name);
  const filePath = req.files.image.path;
  fs.readFile(filePath, (err, data) => {
    if (err) {
      response = {
        "code": 404,
        "payload": {
          "paths": ["path"],
          "validator": "required",
          "example": null
        },
        "path": "NOT_EXISTS",
        "description": `Cannot upload image: image to upload was not found`
      };

      res.status(400).send(response);
      return;
    }
    fs.writeFile(file, data, (err) => {
      if (err) {
        response = {
          "code": 404,
          "payload": {
            "paths": ["path"],
            "validator": "required",
            "example": null
          },
          "path": "NOT_EXISTS",
          "description": `Cannot upload image: gallery with name ${req.params.path} was not found`
        };

        res.status(404).send(response);
        return;
      }
      const uploaded = [];
      uploaded.push({
        "path": req.files.image.name,
        "fullpath": path.join(req.params.path, req.files.image.name),
        "name": req.files.image.name.substring(0, req.files.image.name.indexOf('.')),
        "modified": req.files.image.lastModifiedDate
      })
      res.status(201).send({ uploaded });
    });
  });
});

app.get('/:w*(x):h/gallery/:path', (req, res) => {
  res.send(req.params);
})

app.use((err, req, res, next) => {
  const response = { "TypeError": "Undefined" }
  res.status(500).send(response);
});

const server = http.createServer(app);

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`)
});
