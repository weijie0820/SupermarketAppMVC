const express = require('express');
const mysql = require('mysql2');
const session = require('express-session');
const flash = require('connect-flash');
const multer = require('multer');
const app = express();

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
    const { username, email, password, address, contact, role } = req.body;

    if (!username || !email || !password || !address || !contact || !role) {
        return res.status(400).send('All fields are required.');
    }
    
    if (password.length < 6) {
        req.flash('error', 'Password should be at least 6 or more characters long');
        req.flash('formData', req.body);
        return res.redirect('/register');
    }
    next();
};

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

    const sql = 'INSERT INTO users (username, email, password, address, contact, role) VALUES (?, ?, SHA1(?), ?, ?, ?)';
    connection.query(sql, [username, email, password, address, contact, role], (err, result) => {
        if (err) {
            throw err;
        }
        req.flash('success', 'Registration successful! Please log in.');
        res.redirect('/login');
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
        if (err) {
            throw err;
        }

        if (results.length > 0) {
            req.session.user = results[0]; 
            req.flash('success', 'Login successful!');
            if(req.session.user.role == 'user')
                res.redirect('/shopping');
            else
                res.redirect('/inventory');
        } else {
            req.flash('error', 'Invalid email or password.');
            res.redirect('/login');
        }
    });
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

app.get('/cart', checkAuthenticated, (req, res) => {
    const cart = req.session.cart || [];
    res.render('cart', { cart, user: req.session.user });
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
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
