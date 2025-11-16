const connection = require('../db');
const Cart = require('../models/Cart');

const CartControllers = {

    // ===========================
    // Display cart page
    // ===========================
    viewCart(req, res) {
        const cart = req.session.cart || [];
        res.render("cart", { cart, user: req.session.user });
    },

    // ===========================
    // Add product to cart
    // ===========================
    addToCart(req, res) {
        const productId = req.params.id;
        const quantity = parseInt(req.body.quantity) || 1;

        connection.query("SELECT * FROM products WHERE id = ?", [productId], (err, results) => {
            if (err) throw err;
            if (results.length === 0) return res.status(404).send("Product not found");

            const product = results[0];

            if (!req.session.cart) req.session.cart = [];

            const existing = req.session.cart.find(i => i.id === product.id);

            if (existing) {
                existing.quantity += quantity;
            } else {
                req.session.cart.push({
                    id: product.id,
                    productName: product.productName,
                    price: product.price,
                    quantity: quantity,
                    image: product.image
                });
            }

            res.redirect("/cart");
        });
    },

    // ===========================
    // Remove item from cart
    // ===========================
    removeFromCart(req, res) {
        const productId = parseInt(req.params.id);

        req.session.cart = (req.session.cart || []).filter(
            item => item.id !== productId
        );

        res.redirect('/cart');
    },

    // ===========================
    // Clear entire cart
    // ===========================
    clearCart(req, res) {
        req.session.cart = [];
        res.redirect('/cart');
    },

    // ===========================
    // Increase Quantity
    // ===========================
    increaseQty(req, res) {
        const productId = parseInt(req.params.id);

        if (!req.session.cart) req.session.cart = [];

        const item = req.session.cart.find(i => i.id === productId);
        if (item) {
            item.quantity += 1;
        }

        res.redirect('/cart');
    },

    // ===========================
    // Decrease Quantity
    // ===========================
    decreaseQty(req, res) {
        const productId = parseInt(req.params.id);

        if (!req.session.cart) req.session.cart = [];

        const item = req.session.cart.find(i => i.id === productId);

        if (item) {
            item.quantity -= 1;

            // If reduced to 0 → remove item completely
            if (item.quantity <= 0) {
                req.session.cart = req.session.cart.filter(i => i.id !== productId);
            }
        }

        res.redirect('/cart');
    }
};

module.exports = CartControllers;
