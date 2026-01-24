const db = require("../db");
const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");
const nodemailer = require("nodemailer");

// ==========================================================
// 📌 HELPER: Generate invoice PDF
// ==========================================================
function generateInvoicePDF(order, items, filePath) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40 });
    const stream = fs.createWriteStream(filePath);

    doc.pipe(stream);

    // Header
    doc.fontSize(24).text("Supermarket App - Invoice", { align: "center" });
    doc.moveDown(1.5);

    doc.fontSize(14).text(`Invoice Number: ${order.invoice_number}`);
    doc.text(`Date: ${order.order_date}`);
    doc.text(`Status: ${order.status}`);
    doc.moveDown(1);

    // Items
    doc.fontSize(18).text("Items");
    doc.moveDown(0.5);

    items.forEach((item) => {
      doc.fontSize(14).text(
        `${item.productName}  | Qty: ${item.quantity} | $${(
          item.price_per_unit * item.quantity
        ).toFixed(2)}`
      );
    });

    doc.moveDown(1);

    doc.fontSize(16).text(`Total Amount: $${Number(order.total_amount).toFixed(2)}`, {
      align: "right",
    });

    doc.end();

    stream.on("finish", resolve);
    stream.on("error", reject);
  });
}

// ==========================================================
// 📌 SHOW CHECKOUT PAGE
// ==========================================================
function showCheckout(req, res) {
  const userId = req.session.user?.id;
  if (!userId) return res.redirect("/login");

  // ✅ Support POST (from cart) and GET (back from payment)
  const selectedRaw =
    req.body && req.body.selectedProducts
      ? req.body.selectedProducts
      : req.session.selectedProducts;

  let selected = [];
  try {
    selected = JSON.parse(selectedRaw || "[]");
  } catch {
    selected = [];
  }

  if (!selected || selected.length === 0) return res.redirect("/cart");

  // ✅ store again so back button keeps working
  req.session.selectedProducts = JSON.stringify(selected);

  const placeholders = selected.map(() => "?").join(",");

  const query = `
    SELECT c.product_id, c.quantity, p.productName, p.price, p.image
    FROM cart_itemsss c
    JOIN products p ON c.product_id = p.id
    WHERE c.user_id = ? AND c.product_id IN (${placeholders})
  `;

  db.query(query, [userId, ...selected], (err, items) => {
    if (err) return res.status(500).send("Database error loading checkout items.");

    const totalAmount = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    res.render("checkout", { cart: items, totalAmount });
  });
}

// ==========================================================
// 📌 CREATE ORDER (IMPORTANT: DO NOT CREATE ORDER HERE)
// ==========================================================
function createOrder(req, res) {
  const userId = req.session.user?.id;
  if (!userId) return res.redirect("/login");

  // If user comes from confirm page via POST, store selectedProducts into session
  if (req.body && req.body.selectedProducts) {
    try {
      const ids = JSON.parse(req.body.selectedProducts || "[]");
      if (Array.isArray(ids) && ids.length > 0) {
        req.session.selectedProducts = JSON.stringify(ids);
      }
    } catch {
      // ignore
    }
  }

  // ✅ If no selectedProducts in session, user shouldn't go payment
  if (!req.session.selectedProducts) {
    return res.redirect("/cart");
  }

  // ✅ Just go to payment page
  // (Order will ONLY be created after PayPal success in PaymentControllers)
  return res.redirect("/payment");
}

// ==========================================================
// 📌 VIEW INVOICE
// ==========================================================
function viewInvoice(req, res) {
  const orderId = req.params.id;
  const userId = req.session.user?.id;
  if (!userId) return res.redirect("/login");

  db.query(
    `SELECT * FROM orders WHERE order_id = ? AND user_id = ?`,
    [orderId, userId],
    (err, orderResults) => {
      if (err || orderResults.length === 0) return res.send("Order not found.");

      db.query(
        `SELECT oi.*, p.productName, p.image
         FROM order_items oi
         JOIN products p ON oi.product_id = p.id
         WHERE oi.order_id = ?`,
        [orderId],
        (err2, items) => {
          if (err2) return res.send("Error loading invoice items.");
          res.render("invoice", { order: orderResults[0], items });
        }
      );
    }
  );
}

// ==========================================================
// 📌 DOWNLOAD PDF
// ==========================================================
function downloadInvoicePDF(req, res) {
  const orderId = req.params.id;
  const userId = req.session.user?.id;
  if (!userId) return res.redirect("/login");

  db.query(
    `SELECT * FROM orders WHERE order_id = ? AND user_id = ?`,
    [orderId, userId],
    (err, orderResults) => {
      if (err || orderResults.length === 0) return res.send("Order not found.");

      db.query(
        `SELECT oi.*, p.productName
         FROM order_items oi
         JOIN products p ON oi.product_id = p.id
         WHERE oi.order_id = ?`,
        [orderId],
        async (err2, items) => {
          if (err2) return res.send("Error loading items.");

          const order = orderResults[0];
          const folder = path.join(__dirname, "../invoices");
          if (!fs.existsSync(folder)) fs.mkdirSync(folder);

          const pdfPath = path.join(folder, `invoice_${orderId}.pdf`);
          await generateInvoicePDF(order, items, pdfPath);

          res.download(pdfPath);
        }
      );
    }
  );
}

// ==========================================================
// 📌 EMAIL PDF
// ==========================================================
function emailInvoicePDF(req, res) {
  const orderId = req.params.id;
  const user = req.session.user;
  if (!user) return res.redirect("/login");

  db.query(
    `SELECT * FROM orders WHERE order_id = ? AND user_id = ?`,
    [orderId, user.id],
    (err, orderResults) => {
      if (err || orderResults.length === 0) return res.send("Order not found.");

      db.query(
        `SELECT oi.*, p.productName
         FROM order_items oi
         JOIN products p ON oi.product_id = p.id
         WHERE oi.order_id = ?`,
        [orderId],
        async (err2, items) => {
          if (err2) return res.send("Error loading items.");

          const order = orderResults[0];
          const folder = path.join(__dirname, "../invoices");
          if (!fs.existsSync(folder)) fs.mkdirSync(folder);

          const pdfPath = path.join(folder, `invoice_${orderId}.pdf`);
          await generateInvoicePDF(order, items, pdfPath);

          const transporter = nodemailer.createTransport({
            service: "gmail",
            auth: {
              user: process.env.EMAIL_USER,
              pass: process.env.EMAIL_PASS,
            },
          });

          await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: user.email,
            subject: "Your Invoice from Supermarket App",
            text: "Please find your invoice attached.",
            attachments: [{ filename: `invoice_${orderId}.pdf`, path: pdfPath }],
          });

          req.flash("success", "Invoice PDF has been emailed to you!");
          res.redirect(`/order/invoice/${orderId}`);
        }
      );
    }
  );
}

// ==========================================================
// 📌 ORDER HISTORY
// ==========================================================
function getOrderHistory(req, res) {
  const userId = req.session.user?.id;
  if (!userId) return res.redirect("/login");

  db.query(
    `SELECT order_id, invoice_number, order_date, total_amount, status
     FROM orders
     WHERE user_id = ?
     ORDER BY order_date DESC`,
    [userId],
    (err, results) => {
      if (err) return res.status(500).send("Database error loading orders.");
      res.render("order_history", { orders: results });
    }
  );
}

module.exports = {
  showCheckout,
  createOrder,
  viewInvoice,
  downloadInvoicePDF,
  emailInvoicePDF,
  getOrderHistory,
};
