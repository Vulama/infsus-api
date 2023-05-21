const express = require('express');
const multer = require('multer');
const { Pool } = require('pg');
const bodyParser = require('body-parser');

const app = express();

app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'infsus',
  password: '1234',
  port: 5432,
});

const storage = multer.diskStorage({
  destination: 'public/images/',
  filename: function (req, file, cb) {
    const originalExtension = file.originalname.split('.').pop();
    cb(null, Date.now() + '.' + originalExtension);
  }
});

const upload = multer({ storage });

app.post('/new', upload.array('images', 5), async (req, res) => {
  try {
    const { ownerId, title, description, address, city, price_per_night } = req.body;
    let pictures = [];
    if (req.files){
      pictures = req.files.map((file) => file.filename);
    }

    console.log(req.body);

    const query = `
      INSERT INTO advert (ownerId, title, description, pictures, address, city, price_per_night)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `;
    const values = [ownerId, title, description, pictures, address, city, price_per_night];
    const result = await pool.query(query, values);

    res.send('Advert created successfully');
  } catch (error) {
    console.error('Error saving a new advert:', error);
    res.status(500).send('An error occurred saving a new advert');
  }
});

app.put('/edit', upload.array('images', 5), async (req, res) => {
  try {
    const { id, ownerId, title, description, address, city, price_per_night, deletedImages } = req.body;
    const newPictures = req.files.map((file) => file.filename);
    const deletedPictures = JSON.parse(deletedImages);

    const ownershipQuery = `
    SELECT id
    FROM advert
    WHERE id = $1 AND ownerid = $2
  `;
  const ownershipResult = await pool.query(ownershipQuery, [id, ownerId]);

  if (ownershipResult.rows.length === 0) {
    return res.status(403).send('Unauthorized edition');
  }

    const fetch = `
      SELECT pictures
      FROM advert
      WHERE id = $1
    `;

    const fetchValues = [id];
    const oldPicturesResult = await pool.query(fetch, fetchValues);
    var oldPictures = oldPicturesResult.rows[0].pictures;

    deletedPictures.forEach((element) => {
      const index = oldPictures.indexOf(element);
      if (index !== -1) {
        oldPictures.splice(index, 1);
      }
    });
    
    const updatedImages = newPictures.concat(oldPictures);

    const query = `
      UPDATE advert
      SET title = $1, description = $2, pictures = $3, address = $4, city = $5, price_per_night = $6
      WHERE id = $7
    `;
    const values = [title, description, updatedImages, address, city, price_per_night, id];
    await pool.query(query, values);

    res.send('Advert updated successfully.');
  } catch (error) {
    console.error('Error editing advert:', error);
    res.status(500).send('An error occurred while editing advert');
  }
});

app.post('/reserve', async (req, res) => {
  try {
    const { userId, advertId, startDate, endDate } = req.body;

    // Check for overlap with existing reservations
    const overlapQuery = `
      SELECT id
      FROM reservation
      WHERE advertId = $1
        AND ((startDate >= $2 AND startDate <= $3)
          OR (endDate >= $2 AND endDate <= $3)
          OR (startDate <= $2 AND endDate >= $3))
    `;
    const overlapValues = [advertId, startDate, endDate];
    const overlapResult = await pool.query(overlapQuery, overlapValues);

    if (overlapResult.rows.length > 0) {
      return res.status(409).send('Reservation overlap detected');
    }

    const query = `
      INSERT INTO reservation (userId, advertId, startDate, endDate)
      VALUES ($1, $2, $3, $4)
    `;
    const values = [userId, advertId, startDate, endDate];
    await pool.query(query, values);

    res.send('Reservation created successfully.');
  } catch (error) {
    console.error('Error creating reservation:', error);
    res.status(500).send('An error occurred while creating reservation');
  }
});

app.post('/del', async (req, res) => {
  try {
    const { id, ownerId } = req.body;

    const ownershipQuery = `
      SELECT id
      FROM advert
      WHERE id = $1 AND ownerid = $2
    `;
    const ownershipResult = await pool.query(ownershipQuery, [id, ownerId]);

    if (ownershipResult.rows.length === 0) {
      return res.status(403).send('Unauthorized deletion');
    }

    const query = 'DELETE FROM advert WHERE id = $1';
    const values = [id];
    await pool.query(query, values);

    res.send('Advert deleted successfully.');
  } catch (error) {
    console.error('Error deleting advert:', error);
    res.status(500).send('An error occurred while deleting advert');
  }
});

app.get('/adverts', async (req, res) => {
  try {
    const { city, maxPrice, minPrice } = req.query;

    if (city && !/^[\w\s]+$/.test(city)) {
      return res.status(400).send('Invalid city format');
    }

    let advertsQuery = `
      SELECT a.id, a.title, a.description, a.pictures, a.address, a.city, a.price_per_night,
             u.username, u.phone_number, u.email
      FROM advert AS a
      JOIN "user" AS u ON a.ownerId = u.id
    `;

    const conditions = [];

    if (city) {
      conditions.push(`a.city = '${city}'`);
    }

    if (maxPrice) {
      conditions.push(`a.price_per_night <= ${maxPrice}`);
    }

    if (minPrice) {
      conditions.push(`a.price_per_night >= ${minPrice}`);
    }

    if (conditions.length > 0) {
      advertsQuery += ` WHERE ${conditions.join(' AND ')}`;
    }

    const result = await pool.query(advertsQuery);
    const adverts = await Promise.all(result.rows.map(async (row) => {
      const query = `
        SELECT r.id, r.startDate, r.endDate, r.userId, r.advertId
        FROM reservation AS r
        WHERE r.advertId = $1
      `;
      const values = [row.id];
      const reservationsResult = await pool.query(query, values);
      row.reservations = reservationsResult.rows;
      
      return row
    }));

    res.json(adverts);
  } catch (error) {
    console.error('Error retrieving adverts:', error);
    res.status(500).send('An error occurred while retrieving adverts');
  }
});

app.post('/register', async (req, res) => {
  try {
    const { username, password, email, phone_number } = req.body;

    const usernameQuery = `
      SELECT id
      FROM "user"
      WHERE username = $1
    `;
    const usernameResult = await pool.query(usernameQuery, [username]);

    if (usernameResult.rows.length > 0) {
      return res.status(409).send('Username already in use');
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).send('Invalid email format');
    }

    const query = `
      INSERT INTO "user" (username, password, email, phone_number)
      VALUES ($1, $2, $3, $4)
      RETURNING id
    `;
    const values = [username, password, email, phone_number];
    const result = await pool.query(query, values);

    const userId = result.rows[0].id;
    res.json({ message: 'User registered successfully', userId: userId });
  } catch (error) {
    console.error('Error registering user:', error);
    res.status(500).send('An error occurred while registering user');
  }
});

app.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    const query = 'SELECT * FROM "user" WHERE username = $1';
    const result = await pool.query(query, [username]);
    const user = result.rows[0];

    if (!user || password !== user.password) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    res.json({ message: 'Login successful', userId: user.id });
  } catch (error) {
    console.error('Error authenticating user:', error);
    res.status(500).send('An error occurred while authenticating user');
  }
});

const port = 4321;
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});