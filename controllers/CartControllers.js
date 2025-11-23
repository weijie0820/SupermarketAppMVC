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

    updateQtyTyped(req, res) {
    const user = req.session.user;
    if (!user) return res.redirect('/login');

    const productId = req.params.id;
    const newQty = parseInt(req.body.quantity);

    Cart.updateQuantity(user.id, productId, newQty, (err) => {
        if (err) return res.status(500).send("DB error");
        res.redirect('/cart');
    });
},

updateMultiple(req, res) {
    const user = req.session.user;
    if (!user) return res.redirect('/login');

    const quantities = req.body.quantities;   // e.g. { "3": "2", "5": "4" }

    const tasks = Object.entries(quantities).map(([productId, qty]) => {
        return new Promise((resolve, reject) => {
            Cart.updateQuantity(user.id, productId, parseInt(qty), (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    });

    Promise.all(tasks)
        .then(() => res.redirect('/cart'))
        .catch(() => res.status(500).send("DB error"));
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
