const express = require('express');
const mysql = require('mysql2');
const session = require('express-session');
const flash = require('connect-flash');
const multer = require('multer');
const app = express();
const bodyParser = require('body-parser');
const path = require('path');
const randomstring = require('randomstring');
const nodemailer = require('nodemailer');
const UserControllers = require('./controllers/UserControllers');
const CartControllers = require('./controllers/CartControllers');
const OrderControllers = require('./controllers/OrderControllers');
const ReviewController = require('./controllers/ReviewController');
const ProductsController = require('./controllers/ProductsControllers');
const PaymentControllers = require('./controllers/PaymentControllers');
const CategoriesControllers = require('./controllers/CategoriesControllers');
const paypal = require('./services/paypal');
const hitpay= require('./services/hitpay');
const nets= require('./services/nets');





// Set up multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/images'); // Directory to save uploaded files
    },
    filename: (req, file, cb) => {
        cb(null, file.originalname); 
    }
});


const loginOtpCache = {};


const upload = multer({ storage: storage });

// Import products controller (MVC)
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
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

//TO DO: Insert code for Session Middleware below 
app.use(session({
    secret: 'secret',
    resave: false,
    saveUninitialized: true,
    // Session expires after 1 week of inactivity
    cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 } 
}));


app.use(flash());

// Make session user available to all views (so controllers can render without extra params)
app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    res.locals.messages = {
        error: req.flash('error'),
        success: req.flash('success')
    };
    next();
});

app.use((req, res, next) => {
    res.locals.PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
    next();
});



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
    const { username, email, password, address, contact } = req.body;
    const role = 'user'; // default role for all public registrations

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
function setOTP(email, otp, ttlMs = 60 * 1000) { // 1 minutes
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





// Define routes
//Home Route
app.get('/', (req, res) => {
    const user = req.session.user;

    ReviewController.getReviews((err, reviews) => {
        if (err) throw err;

        res.render('index', {
            user,
            reviews
        });
    });
});

// About Us Page
app.get('/aboutus', (req, res) => res.render('aboutus'));

// Contact Us Page
app.get('/contact', (req, res) => res.render('contact'));

// Review pages
app.get('/reviews', checkAuthenticated, (req, res) => {
    ReviewController.list(req, res);
});
app.post('/reviews/add', checkAuthenticated, ReviewController.addReview);

// Inventory (admin) -> list products (controller handles rendering). protect with auth/admin.
app.get('/inventory', checkAuthenticated, checkAdmin, ProductsController.list);

// Register / Login (these still use DB connection for users)
app.get('/register', (req, res) => {
    res.render('register', { messages: req.flash('error'), formData: req.flash('formData')[0] });
});

app.post('/register', validateRegistration, (req, res) => {
    const { username, email, password, address, contact, role } = req.body;

    // 1️⃣ First check whether the email already exists
    const checkEmailSql = "SELECT * FROM users WHERE email = ?";
    connection.query(checkEmailSql, [email], (err, results) => {
        if (err) throw err;

        if (results.length > 0) {
            // Email exists → block registration
            req.flash("error", "This email is already registered. Please use another email.");
            req.flash("formData", req.body);
            return res.redirect("/register");
        }

        // 2️⃣ Insert new user since email is unique
        const insertSql = `
            INSERT INTO users (username, email, password, address, contact, role, verified)
            VALUES (?, ?, SHA1(?), ?, ?, ?, 0)
        `;

        connection.query(insertSql, [username, email, password, address, contact, role], (err2) => {
            if (err2) throw err2;

            // 3️⃣ Generate and send OTP
            const otp = generateOTP();
            setOTP(email, otp);
            sendOTP(email, otp);

            req.flash("success", "Registration successful! Check your email for OTP.");
            return res.redirect(`/otp?email=${encodeURIComponent(email)}&sent=1`);
        });
    });
});


//Login Route
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
    connection.query(sql, [email, password], async (err, results) => {
        if (err) throw err;

        // If user not found
        if (results.length === 0) {
            req.flash('error', 'Invalid email or password.');
            return res.redirect('/login');
        }

        const user = results[0];

        // If not verified from registration, block login
        if (user.verified == 0) {
            req.flash('error', 'Please verify your email before logging in.');
            return res.redirect('/otp?email=' + email);
        }

        // 🔵 STEP 1: Generate login OTP
        const loginOTP = generateOTP();

        // 🔵 STEP 2: Save OTP for login
        loginOtpCache[email] = {
            code: loginOTP,
            expiresAt: Date.now() + 60 * 1000   // 1 minute validity
        };

        // 🔵 STEP 3: Email OTP
        await sendOTP(email, loginOTP);

        // 🔵 STEP 4: Store user temporarily before they pass OTP
        req.session.tempUser = user;

        req.flash('success', 'An OTP has been sent to your email to verify your login.');
        return res.redirect(`/otp?email=${encodeURIComponent(email)}&loginVerify=1&sent=1`);
    });
});


//OTP
app.post('/verifyOTP', (req, res) => {
    const { email, otp } = req.body;

    if (!email || !otp) {
        return res.redirect(`/otp?error=${encodeURIComponent('Missing email or OTP')}`);
    }

    // Registration OTP
    const regCached = otpCache[email];

    // Login OTP
    const loginCached = loginOtpCache[email];

    // 🔵 LOGIN OTP CHECK FIRST
    if (loginCached) {
        if (Date.now() > loginCached.expiresAt) {
            delete loginOtpCache[email];
            return res.redirect(`/otp?error=OTP expired&email=${email}`);
        }

       if (loginCached.code === otp.trim()) {
            // OTP correct → Login success
            const loggedInUser = req.session.tempUser; // store temp user

            req.session.user = loggedInUser;
            delete req.session.tempUser;
            delete loginOtpCache[email];

            // Redirect based on role
            if (loggedInUser.role === 'admin') {
                return res.redirect('/inventory');
            } else {
                return res.redirect('/shopping');
            }
        }

        return res.redirect(`/otp?error=Invalid OTP&email=${email}`);
    }

    // 🔴 REGISTRATION OTP CHECK
    if (!regCached || Date.now() > regCached.expiresAt) {
        delete otpCache[email];
        return res.redirect(`/otp?error=OTP expired or invalid&email=${email}`);
    }

    if (regCached.code === otp.trim()) {
        delete otpCache[email];

        // Mark verified in DB
        connection.query(
            'UPDATE users SET verified = 1 WHERE email = ?',
            [email],
            () => res.redirect('/login?verified=1')
        );
    } else {
        return res.redirect(`/otp?error=Invalid OTP&email=${email}`);
    }
});


app.get('/otp', (req, res) => {
  // Pass query strings to view so it can show messages / prefill
  res.render('otp', { query: req.query || {} });
});

/** Search bar**/
app.get("/search", (req, res) => {
    const { q, price, category } = req.query;

    let sql = "SELECT * FROM products WHERE productName LIKE ?";
    let params = [`%${q}%`];

    if (price) {
        const [min, max] = price.split("-");
        sql += " AND price BETWEEN ? AND ?";
        params.push(min, max);
    }

    if (category) {
        sql += " AND category = ?";
        params.push(category);
    }

    connection.query(sql, params, (err, results) => {
        if (err) throw err;

        res.render("search_results", {
            products: results,
            query: q
        });
    });
});

// Shopping -> reuse controller to list products (controller will render)
app.get("/shopping", (req, res) => {
    const { price, category } = req.query;

    let sql = `
        SELECT p.*
        FROM products p
        LEFT JOIN categories c
          ON p.category_id = c.category_id
        WHERE 1=1
    `;
    let params = [];

    // price filter
    if (price) {
        const [min, max] = price.split("-");
        sql += " AND p.price BETWEEN ? AND ?";
        params.push(min, max);
    }

    // category filter (by name)
    if (category) {
        sql += " AND c.category_name = ?";
        params.push(category);
    }

    connection.query(sql, params, (err, products) => {
        if (err) throw err;
        res.render("shopping", {
            products,
            user: req.session.user
        });
    });
});



//Categories 
// Admin category management
app.get("/admin/categories", checkAuthenticated, checkAdmin, CategoriesControllers.list);
app.post("/admin/categories/create", checkAuthenticated, checkAdmin, CategoriesControllers.create);
app.post("/admin/categories/update/:id", checkAuthenticated, checkAdmin, CategoriesControllers.update);
app.post("/admin/categories/delete/:id", checkAuthenticated, checkAdmin, CategoriesControllers.remove);

// Optional: JSON endpoint (sidebar)
app.get("/api/categories", CategoriesControllers.getAllJson);


// --- CART (Database Version) ---
app.get('/cart', CartControllers.viewCart);
app.post('/add-to-cart/:id', CartControllers.addToCart);
app.post('/cart/increase/:id', CartControllers.increaseQty);
app.post('/cart/decrease/:id', CartControllers.decreaseQty);
app.post('/cart/update/:id', CartControllers.updateQtyTyped);
app.post('/cart/remove/:id', CartControllers.remove);
app.post('/cart/clear', CartControllers.clear);
app.post('/cart/update-multiple', CartControllers.updateMultiple);

//Order Routes
app.get('/checkout', OrderControllers.showCheckout);
app.post('/order/create', OrderControllers.createOrder);
app.post('/checkout', OrderControllers.showCheckout);

//Payment Route
app.get('/payment', checkAuthenticated, PaymentControllers.showPaymentPage);
app.get('/payment/:id', checkAuthenticated, PaymentControllers.showPaymentPage);

// PayPal: Create Order
app.post('/api/paypal/create-order', async (req, res) => {
  try {
    const { amount } = req.body;
    const order = await paypal.createOrder(amount);
    if (order && order.id) return res.json({ id: order.id });
    return res.status(500).json({ error: "Failed to create PayPal order", details: order });
  } catch (err) {
    return res.status(500).json({ error: "Failed to create PayPal order", message: err.message });
  }
});


// PayPal: Capture Order
app.post('/api/paypal/capture-order', checkAuthenticated, PaymentControllers.capturePaypalOrder)
app.post("/api/refund/request", checkAuthenticated, PaymentControllers.requestRefund);
app.get("/refund", checkAuthenticated, checkAdmin, PaymentControllers.viewRefundPage);
app.post("/api/admin/refund/approve",checkAuthenticated,checkAdmin,PaymentControllers.approveRefund);
app.post("/api/admin/refund/reject",checkAuthenticated,checkAdmin,PaymentControllers.rejectRefund);





// HitPay PayNow (hosted checkout + confirm)
app.post('/api/hitpay/paynow/create', checkAuthenticated, PaymentControllers.createHitpayPaynow);
app.get('/api/hitpay/paynow/status/:requestId', checkAuthenticated, PaymentControllers.getHitpayPaynowStatus);
app.post('/api/hitpay/paynow/confirm', checkAuthenticated, PaymentControllers.confirmHitpayPaynow);

// ✅ HitPay redirect_url will come back here after user pays on HitPay page
app.get('/payment/hitpay/return', checkAuthenticated, async (req, res) => {
  try {
    console.log("HITPAY RETURN QUERY =>", req.query);

    const reference =
      req.query.reference ||
      req.query.payment_request_id ||
      req.query.id ||
      req.query.request_id;

    const statusRaw = (req.query.status || req.query.payment_status || "").toString();
    const status = statusRaw.trim().toLowerCase();

    if (reference) req.session.hitpay_paynow_request_id = reference;

    const successStatuses = ["completed", "paid", "succeeded", "success"];
    if (status && !successStatuses.includes(status)) {
      console.log("HitPay not success status =", status);
      return res.redirect("/payment");
    }

    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    // ✅ Wrap controller into a Promise that resolves when it calls res.json(...)
    const confirmOnce = () =>
      new Promise((resolve) => {
        let finished = false;

        const originalJson = res.json.bind(res);
        const originalStatus = res.status.bind(res);

        // Make res.status(...).json(...) still work, but not actually send
        res.status = (code) => {
          res._hitpayStatusCode = code;
          return res;
        };

        res.json = (data) => {
          if (finished) return;
          finished = true;

          // restore originals immediately
          res.json = originalJson;
          res.status = originalStatus;

          resolve(data);
        };

        // call controller (it will call res.json later from db callbacks)
        PaymentControllers.confirmHitpayPaynow(req, res);

        // safety timeout (in case controller never responds)
        setTimeout(() => {
          if (finished) return;
          finished = true;
          res.json = originalJson;
          res.status = originalStatus;
          resolve(null);
        }, 8000);
      });

    for (let attempt = 1; attempt <= 5; attempt++) {
      const controllerData = await confirmOnce();
      console.log("confirmHitpayPaynow response =>", controllerData);

      if (controllerData && controllerData.success && controllerData.orderId) {
        return res.redirect("/order/invoice/" + controllerData.orderId);
      }

      if (controllerData && controllerData.status === "pending") {
        await sleep(1500);
        continue;
      }

      // any other error / null
      return res.redirect("/payment");
    }

    // still pending after retries
    return res.redirect("/payment");
  } catch (e) {
    console.error("HitPay return error =>", e.message);
    return res.redirect("/payment");
  }
});

// Nets QR Code
app.post("/api/nets/qr/create", checkAuthenticated, PaymentControllers.createNetsQr);
app.post("/api/nets/qr/query", checkAuthenticated, PaymentControllers.queryNetsQr);



//order Invoice Route
app.get('/order/invoice/:id', (req, res) => {
    OrderControllers.viewInvoice(req, res);
});
app.get('/order/invoice/:id/pdf', OrderControllers.downloadInvoicePDF);
app.get('/order/invoice/:id/email', OrderControllers.emailInvoicePDF);


//Order History Route
app.get('/orders/history', (req, res) => {
    OrderControllers.getOrderHistory(req, res);
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




/*Log out*/
app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});


// Product detail -> controller handles rendering
app.get('/product/:id', ProductsController.getById);

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

// Admin user management page
app.get('/admin/users', checkAuthenticated, checkAdmin, UserControllers.listUsers);

// Update role
app.post('/admin/users/update-role', checkAuthenticated, checkAdmin, UserControllers.updateRole);

// Delete user
app.post('/admin/users/delete', checkAuthenticated, checkAdmin, UserControllers.deleteUser);




const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on URL address: http://localhost:${PORT}/`));

