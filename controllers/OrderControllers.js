const randomstring = require("randomstring");
const db = require('../db');

// ===========================
// SHOW CHECKOUT PAGE
// ===========================
exports.showCheckout = (req, res) => {
    const userId = req.session.user?.id;
    if (!userId) return res.redirect("/login");

    let selected = JSON.parse(req.body.selectedProducts || "[]");

    if (selected.length === 0) {
        return res.redirect("/cart");
    }

    const placeholders = selected.map(() => "?").join(",");

    const query = `
        SELECT c.product_id, c.quantity, p.productName, p.price, p.image
        FROM cart_itemsss c
        JOIN products p ON c.product_id = p.id
        WHERE c.user_id = ? AND c.product_id IN (${placeholders})
    `;

    db.query(query, [userId, ...selected], (err, items) => {
        const totalAmount = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
        res.render("checkout", { cart: items, totalAmount });
    });
};





// ===========================
// CREATE ORDER
// ===========================
exports.createOrder = (req, res) => {
    const userId = req.session.user?.id;

    if (!userId) return res.redirect('/login');

    let selectedIds = [];
try {
    selectedIds = JSON.parse(req.body.selectedProducts);
} catch {
    selectedIds = [];
}

if (selectedIds.length === 0) return res.redirect("/cart");

const placeholders = selectedIds.map(() => "?").join(",");

db.query(
    `SELECT c.product_id, c.quantity, p.price
     FROM cart_itemsss c
     JOIN products p ON c.product_id = p.id
     WHERE c.user_id = ? AND c.product_id IN (${placeholders})`,
    [userId, ...selectedIds],

        (err, cartItems) => {
            if (err) throw err;

            let totalAmount = 0;
            cartItems.forEach(item => {
                totalAmount += item.price * item.quantity;
            });

            let selectedIds = [];

                try {
                    selectedIds = JSON.parse(req.body.selectedProducts);
                } catch {
                    selectedIds = [];
                }

                if (selectedIds.length === 0) return res.redirect("/cart");

            const invoiceNumber = "INV-" + randomstring.generate({ length: 6, charset: 'alphanumeric' });

            db.query(
                `INSERT INTO orders (user_id, order_date, total_amount, status, invoice_number)
                 VALUES (?, NOW(), ?, 'Pending', ?)`,
                [userId, totalAmount, invoiceNumber],
                (err, orderResult) => {
                    if (err) throw err;

                    const orderId = orderResult.insertId;

                    cartItems.forEach(item => {
                        db.query(
                            `INSERT INTO order_items 
                             (order_id, product_id, quantity, price_per_unit, created_at)
                             VALUES (?, ?, ?, ?, NOW())`,
                            [orderId, item.product_id, item.quantity, item.price]
                        );

                        
                       // 🔥 Reduce product stock safely (never below zero)
                            db.query(
                                `UPDATE products 
                                SET quantity = GREATEST(quantity - ?, 0)
                                WHERE id = ?`,
                                [item.quantity, item.product_id]
                            );

                    });

                   db.query(
                        `DELETE FROM cart_itemsss WHERE user_id = ? AND product_id IN (${placeholders})`,
                        [userId, ...selectedIds]
                    );


                    res.redirect(`/order/invoice/${orderId}`);
                }
            );
        }
    );
};




// ===========================
// VIEW INVOICE
// ===========================
exports.viewInvoice = (req, res) => {
    const orderId = req.params.id;
    const userId = req.session.user?.id;

    if (!userId) return res.redirect('/login');

    db.query(
        `SELECT * FROM orders WHERE order_id = ? AND user_id = ?`,
        [orderId, userId],
        (err, orderResults) => {
            if (err) throw err;

            if (orderResults.length === 0) {
                return res.send("Order not found.");
            }

            db.query(
                `SELECT oi.*, p.productName, p.image
                 FROM order_items oi
                 JOIN products p ON oi.product_id = p.id
                 WHERE oi.order_id = ?`,
                [orderId],
                (err, itemResults) => {
                    if (err) throw err;

                    res.render('invoice', {
                        order: orderResults[0],
                        items: itemResults
                    });
                }
            );
        }
    );
};


// ===========================
// ORDER HISTORY (USER)
// ===========================
exports.getOrderHistory = (req, res) => {
    const userId = req.session.user?.id;

    if (!userId) return res.redirect('/login');

    db.query(
        `SELECT order_id, invoice_number, order_date, total_amount, status
         FROM orders
         WHERE user_id = ?
         ORDER BY order_date DESC`,
        [userId],
        (err, results) => {
            if (err) throw err;

            res.render("order_history", {
                orders: results
            });
        }
    );
};
