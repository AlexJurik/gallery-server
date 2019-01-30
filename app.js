const http = require('http');
const express = require('express');
const bodyParser = require('body-parser');
const Path = require('path');
const fs = require('fs');
const formidableMiddleware = require('express-formidable');
const jimp = require('jimp');

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

/** 
 * GET request 'localhost:3030/gallery'
 * @returns name and path of all galleries 
 **/
app.get('/gallery', async (req, res) => {
  const galleryDir = Path.join(__dirname, 'gallery');
  let galleryContent = await readdirAsync(galleryDir);

  const galleries = [];

  const promises = galleryContent.map(async (relPath) => {
    const fileStat = await statAsync(Path.join(galleryDir, relPath));

    if (fileStat.isDirectory()) {
      galleries.push({
        path: encodeURI(relPath),
        name: Path.basename(relPath)
      });
    }
  });

  await Promise.all(promises);

  res.status(200).send({
    galleries,
  });
});


/** 
 * POST request 'localhost:3030/gallery'
 * Body Media type: application/json
 * @example({
 * "name": "Wild animals"
 * }) 
 * @returns name and path of created gallery 
 **/
app.post('/gallery', (req, res) => {
  const { name } = req.body;
  let response;
  if (!req.body.name) {
    response = {
      "code": 400,
      "payload": {
        "paths": ["name"],
        "validator": "required",
        "example": null
      },
      "name": "NAME_NOT_FOUND",
      "description": "Bad JSON object: u'name' is a required property"
    }

    res.status(400).send(response);
    return;
  }

  if (name.includes('/')) {
    response = {
      "code": 400,
      "payload": {
        "paths": ["name"],
        "validator": "required",
        "example": null
      },
      "name": "INVALID_NAME",
      "description": "Bad JSON object: u'name' cannot include '/'"
    }

    res.status(400).send(response);
    return;
  }

  const newDir = Path.join(__dirname, 'gallery', req.body.name);
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
        "description": `Cannot create directory: directory with name ${name} already exists`
      }

      res.status(409).send(response);
      return;
    }

    response = {
      "path": Path.join('gallery', encodeURI(name)),
      "name": Path.basename(newDir)
    };

    res.status(201).send(response);
  });
});

/** 
 * GET request 'localhost:3030/gallery/:path'
 * @param(path)
 * @returns gallery and content 
 **/
app.get('/gallery/:path', async (req, res) => {
  const { path } = req.params;
  const gallery = Path.join(__dirname, 'gallery', path);
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
      "description": `Cannot read directory: directory with name ${path} not exists`
    };

    res.status(404).send(response);
    return;
  }

  const images = [];

  files.forEach(img => {
    const modified = fs.statSync(Path.join(gallery, img))
    images.push({
      "path": img,
      "fullpath": Path.join(path, img),
      "name": img.substring(0, img.indexOf('.')),
      "modified": modified.mtime
    })
  });

  response = {
    "gallery": {
      "path": Path.join('gallery', encodeURI(Path.basename(gallery))),
      "name": Path.basename(gallery)
    },
    images
  };

  res.status(200).send(response);
});

/** 
 * DELETE request 'localhost:3030/gallery/:path/:img'
 * @param(path, img?) 
 **/
app.delete('/gallery/:path/:img?', (req, res) => {
  const { path, img } = req.params;
  let response;
  if (!img) {
    const gallery = Path.join(__dirname, 'gallery', path);
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
          "description": `Cannot delete directory: directory with name ${path} not exists`
        };

        res.status(404).send(response);
        return;
      }
      response = {
        "code": 200,
        "success": `Gallery ${path} was successfully deleted`
      };

      res.status(200).send(response);
    })
  } else {
    const image = Path.join(__dirname, 'gallery', path, img);
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
          "description": `Cannot delete image: image with name ${img} not exists in ${path} gallery`
        };

        res.status(404).send(response);
        return;
      }
      response = {
        "code": 200,
        "message": `Image ${img} was successfully deleted`
      };

      res.status(200).send(response);
    })
  }
});

/** 
 * POST request 'localhost:3030/gallery/:path'
 * @param(path)
 * @file(image)
 * @returns path, fullpath, name and modification date of uploaded image  
 **/
app.post('/gallery/:path', formidableMiddleware(), (req, res) => {
  const { image } = req.files;
  const { path } = req.params;
  if (!image) {
    response = {
      "code": 404,
      "payload": {
        "paths": ["path"],
        "validator": "required",
        "example": null
      },
      "path": "NOT_EXISTS",
      "description": `Cannot upload image: image to upload was not found. Check if your key is named as 'image'`
    };

    res.status(400).send(response);
    return;
  }
  let response;
  const file = Path.join(__dirname, 'gallery', path, image.name);
  const filePath = image.path;
  fs.readFile(filePath, (err, data) => {
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
          "description": `Cannot upload image: gallery with name ${path} was not found`
        };

        res.status(404).send(response);
        return;
      }
      const uploaded = [];
      uploaded.push({
        "path": image.name,
        "fullpath": Path.join(encodeURI(path), image.name),
        "name": image.name.substring(0, image.name.indexOf('.')),
        "modified": image.lastModifiedDate
      })
      res.status(201).send({ uploaded });
    });
  });
});

/** 
 * GET request 'localhost:3030/{w}x{h}/gallery/:path/:img'
 * @param(width, height, path, img)
 * @returns resized image  
 **/
app.get('/:w*(x):h/gallery/:path/:img', async (req, res) => {
  const { w, h, path, img } = req.params;
  let response, files;
  const gallery = Path.join(__dirname, 'gallery', path);
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
      "description": `Cannot read directory: directory with name ${path} not exists`
    };

    res.status(404).send(response);
    return;
  }
  if (!files.includes(img)) {
    response = {
      "code": 404,
      "payload": {
        "paths": ["img"],
        "validator": "required",
        "example": null
      },
      "img": "NOT_FOUNG",
      "description": `Image was not found: image with name ${img} was not found in ${path} gallery`
    };

    res.status(404).send(response);
    return;
  }
  if (w === '0' && h === '0') {
    response = {
      "code": 400,
      "payload": {
        "paths": ["w", "h"],
        "validator": "required",
        "example": null
      },
      "wxh": "NOT_CORRECT",
      "description": `Request error: w and h cannot both be 0`
    };

    res.status(400).send(response);
    return;
  }
  const image = Path.join(__dirname, 'gallery', path, img);
  const resizedImage = Path.join(__dirname, 'gallery', path, img.substring(0, img.indexOf('.')) + '-resized.jpg');
  jimp.read(image, (err, image) => {
    if (err) {
      response = {
        "code": 500,
        "payload": {
          "paths": ["path"],
          "validator": "required",
          "example": null
        },
        "path": "EDITING_ERROR",
        "description": `Image was not edited: image ${img} cannot be resized`
      };

      res.status(500).send(response);
      return;
    }
    image
      .resize(Number(w) || jimp.AUTO, Number(h) || jimp.AUTO) // resize
      .quality(60) // set JPEG quality
      .write(resizedImage); // save
  });

  res.status(200).sendFile(resizedImage);
});

/** 
 * Internal server error
 **/
app.use((err, req, res) => {
  const response = { "Error": "Undefined" }
  res.status(500).send(err);
});

const server = http.createServer(app);

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`)
});
