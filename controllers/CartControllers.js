const Cart = require('../models/Cart');

const CartControllers = {

    viewCart(req, res) {
        const user = req.session.user;
        if (!user) return res.redirect('/login');

        Cart.getUserCart(user.id, (err, items) => {
            if (err) return res.status(500).send("DB error");
            res.render("cart", { cart: items, user });
        });
    },

    addToCart(req, res) {
        const user = req.session.user;
        if (!user) return res.redirect('/login');

        const productId = req.params.id;
        const qty = parseInt(req.body.quantity || 1);

        Cart.addItem(user.id, productId, qty, (err) => {
            if (err) return res.status(500).send("DB error");
            res.redirect('/cart');
        });
    },

    increaseQty(req, res) {
        const user = req.session.user;
        if (!user) return res.redirect('/login');

        const productId = req.params.id;

        Cart.increase(user.id, productId, (err) => {
            if (err) return res.status(500).send("DB error");
            res.redirect('/cart');
        });
    },

    decreaseQty(req, res) {
        const user = req.session.user;
        if (!user) return res.redirect('/login');

        const productId = req.params.id;

        Cart.decrease(user.id, productId, (err) => {
            if (err) return res.status(500).send("DB error");
            res.redirect('/cart');
        });
    },

    remove(req, res) {
        const user = req.session.user;
        if (!user) return res.redirect('/login');

        const productId = req.params.id;

        Cart.remove(user.id, productId, (err) => {
            if (err) return res.status(500).send("DB error");
            res.redirect('/cart');
        });
    },

    clear(req, res) {
        const user = req.session.user;
        if (!user) return res.redirect('/login');

        Cart.clear(user.id, (err) => {
            if (err) return res.status(500).send("DB error");
            res.redirect('/cart');
        });
    }
};

module.exports = CartControllers;
