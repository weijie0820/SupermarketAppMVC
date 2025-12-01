// controllers/CartControllers.js
const Cart = require('../models/Cart');

const CartControllers = {

    // ------------------------------------------------------
    // VIEW CART
    // ------------------------------------------------------
    viewCart(req, res) {
        const user = req.session.user;
        if (!user) return res.redirect('/login');

        Cart.getUserCart(user.id, (err, items) => {
            if (err) return res.status(500).send("DB error");

            res.render("cart", {
                cart: items
                // messages automatically available from res.locals
            });
        });
    },

    // ------------------------------------------------------
    // ADD TO CART (DB VERSION + FLASH)
    // ------------------------------------------------------
    addToCart(req, res) {
        const user = req.session.user;
        if (!user) return res.redirect('/login');

        const productId = req.params.id;
        const qty = parseInt(req.body.quantity || 1);

        Cart.addItem(user.id, productId, qty, (result) => {
            if (result && result.error) {
                req.flash("error", result.error);
                return res.redirect('/cart');
            }

            req.flash("success", "Item added to cart!");
            res.redirect('/cart');
        });
    },

    // ------------------------------------------------------
    // INCREASE QTY (+1) WITH STOCK VALIDATION
    // ------------------------------------------------------
    increaseQty(req, res) {
        const user = req.session.user;
        if (!user) return res.redirect('/login');

        const productId = req.params.id;

        Cart.increase(user.id, productId, (result) => {
            if (result && result.error) {
                req.flash("error", result.error);
                return res.redirect('/cart');
            }

            req.flash("success", "Quantity updated");
            res.redirect('/cart');
        });
    },

    // ------------------------------------------------------
    // DECREASE QTY (-1) OR REMOVE
    // ------------------------------------------------------
    decreaseQty(req, res) {
        const user = req.session.user;
        if (!user) return res.redirect('/login');

        Cart.decrease(user.id, req.params.id, (result) => {
            if (result && result.error) {
                req.flash("error", result.error);
            }
            res.redirect('/cart');
        });
    },

    // ------------------------------------------------------
    // UPDATE TYPED QUANTITY (e.g. user types 10)
    // ------------------------------------------------------
    updateQtyTyped(req, res) {
        const user = req.session.user;
        if (!user) return res.redirect('/login');

        const newQty = parseInt(req.body.quantity);
        const productId = req.params.id;

        Cart.updateQuantity(user.id, productId, newQty, (result) => {
            if (result && result.error) {
                req.flash("error", result.error);
                return res.redirect('/cart');
            }

            req.flash("success", "Quantity updated");
            res.redirect('/cart');
        });
    },

    // ------------------------------------------------------
    // UPDATE MULTIPLE FROM CHECKOUT FORM
    // ------------------------------------------------------
    updateMultiple(req, res) {
        const user = req.session.user;
        if (!user) return res.redirect('/login');

        const quantities = req.body.quantities;

        const tasks = Object.entries(quantities).map(([productId, qty]) => {
            return new Promise((resolve, reject) => {
                Cart.updateQuantity(user.id, productId, parseInt(qty), (result) => {
                    if (result && result.error) reject(result.error);
                    else resolve();
                });
            });
        });

        Promise.all(tasks)
            .then(() => {
                req.flash("success", "Cart updated");
                res.redirect('/cart');
            })
            .catch(err => {
                req.flash("error", err);
                res.redirect('/cart');
            });
    },

    // ------------------------------------------------------
    // REMOVE PRODUCT FROM CART
    // ------------------------------------------------------
    remove(req, res) {
        const user = req.session.user;
        if (!user) return res.redirect('/login');

        Cart.remove(user.id, req.params.id, () => {
            req.flash("success", "Item removed");
            res.redirect('/cart');
        });
    },

    // ------------------------------------------------------
    // CLEAR CART
    // ------------------------------------------------------
    clear(req, res) {
        const user = req.session.user;
        if (!user) return res.redirect('/login');

        Cart.clear(user.id, () => {
            req.flash("success", "Cart cleared");
            res.redirect('/cart');
        });
    }
};

module.exports = CartControllers;
