// controllers/ProductsControllers.js

const Products = require('../models/Products');

module.exports = {

    // List products depending on user role
    list: function (req, res) {
        const user = req.session.user || null;

        Products.getAll(function (err, products) {
            if (err) {
                console.error('Error fetching products:', err);
                return res.status(500).render('error', { error: err });
            }

            // Guest → shopping
            if (!user) {
                return res.render('shopping', { products, user: null });
            }

            // Admin → inventory page
            if (user.role === 'admin') {
                return res.render('inventory', { products, user });
            }

            // User → shopping
            return res.render('shopping', { products, user });
        });
    },

    // Show product details
    getById: function (req, res) {
        const id = req.params.id;
        const user = req.session.user || null;   // ← FIX HERE

        Products.getById(id, function (err, product) {
            if (err) {
                console.error('Error fetching product:', err);
                return res.status(500).render('error', { error: err });
            }

            if (!product) {
                return res.status(404).render('error', { error: 'Product not found' });
            }

            // SAFE render: guest gets user = null
            res.render('product', { product, user });
        });
    },

    // Render add product form
    renderAddForm: function (req, res) {
        res.render('addProduct', { user: req.session.user });
    },

    // Add a new product
    add: function (req, res) {
        const product = {
            productName: req.body.name,
            quantity: req.body.quantity,
            price: req.body.price,
            image: req.file ? req.file.filename : null
        };

        Products.add(product, function (err, result) {
            if (err) {
                console.error('Error adding product:', err);
                return res.status(500).render('error', { error: err });
            }
            res.redirect('/inventory');
        });
    },

    // Render edit product form
    renderEditForm: function (req, res) {
        const id = req.params.id;
        Products.getById(id, function (err, product) {
            if (err) {
                console.error('Error fetching product for edit:', err);
                return res.status(500).render('error', { error: err });
            }
            if (!product) return res.status(404).render('error', { error: 'Product not found' });
            res.render('updateProduct', { product, user: req.session.user });
        });
    },

    // Update product
    update: function (req, res) {
        const id = req.params.id;
        const product = {
            productName: req.body.name,
            quantity: req.body.quantity,
            price: req.body.price,
            image: req.file ? req.file.filename : req.body.currentImage
        };

        Products.update(id, product, function (err) {
            if (err) {
                console.error('Error updating product:', err);
                return res.status(500).render('error', { error: err });
            }
            res.redirect('/inventory');
        });
    },

    // Delete product
    delete: function (req, res) {
        const id = req.params.id;

        Products.delete(id, function (err) {
            if (err) {
                console.error('Error deleting product:', err);
                return res.status(500).render('error', { error: err });
            }
            res.redirect('/inventory');
        });
    }
};
