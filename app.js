const express = require('express');
const mysql = require('mysql2');
const session = require('express-session');
const flash = require('connect-flash');
const multer = require('multer');
const app = express();
const bodyParser = require('body-parser');
const path = require('path');
const Qrcode = require('qrcode');
const randomstring = require('randomstring');
const nodemailer = require('nodemailer');



// Set up multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/images'); // Directory to save uploaded files
    },
    filename: (req, file, cb) => {
        cb(null, file.originalname); 
    }
});



const upload = multer({ storage: storage });

// Import products controller (MVC)
const ProductsController = require('./controllers/ProductsControllers');

const connection = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'Republic_C207',
    database: 'c372_supermarketdb'
  });

connection.connect((err) => {
    if (err) {
        console.error('Error connecting to MySQL:', err);
        return;
    }
    console.log('Connected to MySQL database');
});

// Set up view engine
app.set('view engine', 'ejs');
//  enable static files
app.use(express.static('public'));
// enable form processing
app.use(express.urlencoded({
    extended: false
}));

app.use(bodyParser.urlencoded({
  extended: false
}));

// Make session user available to all views (so controllers can render without extra params)
app.use((req, res, next) => {
    res.locals.user = req.session ? req.session.user : null;
    next();
});

//TO DO: Insert code for Session Middleware below 
app.use(session({
    secret: 'secret',
    resave: false,
    saveUninitialized: true,
    // Session expires after 1 week of inactivity
    cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 } 
}));

app.use(flash());

// Middleware to check if user is logged in
const checkAuthenticated = (req, res, next) => {
    if (req.session.user) {
        return next();
    } else {
        req.flash('error', 'Please log in to view this resource');
        res.redirect('/login');
    }
};

// Middleware to check if user is admin
const checkAdmin = (req, res, next) => {
    if (req.session.user && req.session.user.role === 'admin') {
        return next();
    } else {
        req.flash('error', 'Access denied');
        res.redirect('/shopping');
    }
};

// Middleware for form validation
const validateRegistration = (req, res, next) => {
    const { username, password, address, contact, } = req.body;

    if (!username || !password || !address || !contact ) {
        return res.status(400).send('All fields are required.');
    }
    
    if (password.length < 6) {
        req.flash('error', 'Password should be at least 6 or more characters long');
        req.flash('formData', req.body);
        return res.redirect('/register');
    }
    next();
};

//email otp//
const otpCache = {};
// optionally set TTL cleanup; simple approach below:
function setOTP(email, otp, ttlMs = 3 * 60 * 1000) { // 3 minutes
  otpCache[email] = { code: otp, expiresAt: Date.now() + ttlMs };
  // auto-cleanup after ttl
  setTimeout(() => {
    if (otpCache[email] && otpCache[email].expiresAt <= Date.now()) {
      delete otpCache[email];
    }
  }, ttlMs + 1000);
}

// generate numeric OTP
function generateOTP() {
  return randomstring.generate({ length: 6, charset: 'numeric' });
}

// send OTP via nodemailer using environment variables
async function sendOTP(email, otp) {
  const transport = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,     // e.g. ibankingabc@gmail.com (put in .env)
      pass: process.env.EMAIL_PASS      // app password (put in .env)
    },
    tls: { rejectUnauthorized: false }
  });

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: 'OTP Verification',
    text: `Your OTP is ${otp}`,
    html: `<h3>Your OTP is: <b>${otp}</b></h3><p>Do not share this code with anyone.</p>`
  };

  return transport.sendMail(mailOptions);
}

// POST route to request OTP
app.post('/reqOTP', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).send('Email is required');

    const otp = generateOTP();
    setOTP(email, otp);

    // send email (await so errors show up)
    await sendOTP(email, otp);

    // redirect to OTP page with email prefilled
    return res.redirect(`/otp?email=${encodeURIComponent(email)}&sent=1`);
  } catch (err) {
    console.error('Error sending OTP:', err);
    return res.redirect(`/otp?error=${encodeURIComponent('Failed to send OTP. Try again.')}`);
  }
});

// POST route to verify OTP
app.post('/verifyOTP', (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) {
    return res.redirect(`/otp?error=${encodeURIComponent('Missing email or OTP')}`);
  }

  const cached = otpCache[email];
  if (!cached || Date.now() > cached.expiresAt) {
    // expired or missing
    if (cached) delete otpCache[email];
    return res.redirect(`/otp?error=${encodeURIComponent('OTP expired or invalid')}&email=${encodeURIComponent(email)}`);
  }

  if (cached.code === otp.trim()) {
    // success
    delete otpCache[email];
    return res.redirect('/qrcode'); // or wherever you want successful flow to go
  } else {
    return res.redirect(`/otp?error=${encodeURIComponent('Invalid OTP')}&email=${encodeURIComponent(email)}`);
  }
});



// Define routes

// Home -> list products (controller handles rendering)
app.get('/', ProductsController.list);

// Inventory (admin) -> list products (controller handles rendering). protect with auth/admin.
app.get('/inventory', checkAuthenticated, checkAdmin, ProductsController.list);

// Register / Login (these still use DB connection for users)
app.get('/register', (req, res) => {
    res.render('register', { messages: req.flash('error'), formData: req.flash('formData')[0] });
});

app.post('/register', validateRegistration, (req, res) => {
    const { username, email, password, address, contact, role } = req.body;

    const sql = 'INSERT INTO users (username, email, password, address, contact, role, verified) VALUES (?, ?, SHA1(?), ?, ?, ?, 0)';
    connection.query(sql, [username, email, password, address, contact, role], (err, result) => {
        if (err) {
            throw err;
        }

        // ✅ Immediately send OTP after registration
        const otp = generateOTP();
        setOTP(email, otp);
        sendOTP(email, otp);

        // ✅ Redirect to OTP page
        req.flash('success', 'Registration successful! Check your email for OTP.');
        return res.redirect(`/otp?email=${encodeURIComponent(email)}&sent=1`);
    });
});


app.get('/login', (req, res) => {
    res.render('login', { messages: req.flash('success'), errors: req.flash('error') });
});

app.post('/login', (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        req.flash('error', 'All fields are required.');
        return res.redirect('/login');
    }

    const sql = 'SELECT * FROM users WHERE email = ? AND password = SHA1(?)';
    connection.query(sql, [email, password], (err, results) => {
        if (err) throw err;

        // ✅ Verified user
        if (results.length > 0 && results[0].verified == 1) {
            req.session.user = results[0];
            req.flash('success', 'Login successful!');
            return results[0].role === 'user'
                ? res.redirect('/shopping')
                : res.redirect('/inventory');
        }

        // ❌ User exists but not verified
        else if (results.length > 0 && results[0].verified == 0) {
            req.flash('error', 'Please verify your email before logging in.');
            return res.redirect('/otp?email=' + email);
        }

        // ❌ No match at all
        else {
            req.flash('error', 'Invalid email or password.');
            return res.redirect('/login');
        }
    });
});


app.post('/verifyOTP', (req, res) => {
    const { email, otp } = req.body;
    if (!email || !otp) {
        return res.redirect(`/otp?error=${encodeURIComponent('Missing email or OTP')}`);
    }

    const cached = otpCache[email];
    if (!cached || Date.now() > cached.expiresAt) {
        if (cached) delete otpCache[email];
        return res.redirect(`/otp?error=${encodeURIComponent('OTP expired or invalid')}&email=${encodeURIComponent(email)}`);
    }

    if (cached.code === otp.trim()) {
        delete otpCache[email];

        // ✅ Mark user verified in DB
        connection.query(
            'UPDATE users SET verified = 1 WHERE email = ?',
            [email],
            () => res.redirect('/login?verified=1')
        );
    } else {
        return res.redirect(`/otp?error=${encodeURIComponent('Invalid OTP')}&email=${encodeURIComponent(email)}`);
    }
});

// Shopping -> reuse controller to list products (controller will render)
app.get('/shopping', checkAuthenticated, ProductsController.list);

// Add-to-cart, cart and logout still use session + connection for product lookup
app.post('/add-to-cart/:id', checkAuthenticated, (req, res) => {
    const productId = parseInt(req.params.id);
    const quantity = parseInt(req.body.quantity) || 1;

    connection.query('SELECT * FROM products WHERE id = ?', [productId], (error, results) => {
        if (error) throw error;

        if (results.length > 0) {
            const product = results[0];

            if (!req.session.cart) {
                req.session.cart = [];
            }

            const existingItem = req.session.cart.find(item => item.productId === productId);
            if (existingItem) {
                existingItem.quantity += quantity;
            } else {
                req.session.cart.push({
                    id: product.id,
                    productName: product.productName,
                    price: product.price,
                    quantity: quantity,
                    image: product.image
                });
            }

            res.redirect('/cart');
        } else {
            res.status(404).send("Product not found");
        }
    });
});


// GET route for consent page
app.get('/verify', (req, res) => {
  const email = req.query.email || ''; // optional: pass email from OTP or registration
  res.render('verify', { email });
});


app.post('/consent', (req, res) => {
  const { choice, email } = req.body;

  if (choice === 'agree') {
    // Mark user verified or approved in DB
    connection.query('UPDATE users SET verified = 1 WHERE email = ?', [email], (err) => {
      if (err) return res.status(500).send('Database error');
      res.send('Thank you! You have agreed and registration is complete.');
    });
  } else {
    res.send('You disagreed. Registration canceled.');
  }
});



//qrcode route



// QR code route
app.use('/html', express.static(path.join(__dirname, 'html')));

app.get('/qrcode', async (req, res) => {
        const url = 'http://192.168.1.254:3000/verify?message=Scan%20successfully';

       

    try {
        const qrCodeUrl = await Qrcode.toDataURL(url);
        res.render('qrcode', { qrCodeUrl }); // pass to EJS
    } catch (err) {
        console.error(err);
        res.status(500).send('Internal Server Error');
    }
});


app.get('/cart', checkAuthenticated, (req, res) => {
    const cart = req.session.cart || [];
    res.render('cart', { cart, user: req.session.user });
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

app.get('/otp', (req, res) => {
  // Pass query strings to view so it can show messages / prefill
  res.render('otp', { query: req.query || {} });
});


// Product detail -> controller handles rendering
app.get('/product/:id', checkAuthenticated, ProductsController.getById);

// Add product form -> controller renders form (admin protected)
app.get('/addProduct', checkAuthenticated, checkAdmin, ProductsController.renderAddForm);

// Add product (file upload) -> controller handles insert
app.post('/addProduct', checkAuthenticated, checkAdmin, upload.single('image'), ProductsController.add);

// Render edit/update form (admin) -> controller renders edit page
app.get('/updateProduct/:id', checkAuthenticated, checkAdmin, ProductsController.renderEditForm);

// Update product (file upload) -> controller handles update
app.post('/updateProduct/:id', checkAuthenticated, checkAdmin, upload.single('image'), ProductsController.update);

// Delete product -> controller handles deletion
app.get('/deleteProduct/:id', checkAuthenticated, checkAdmin, ProductsController.delete);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on URL address: http://localhost:${PORT}/`));
