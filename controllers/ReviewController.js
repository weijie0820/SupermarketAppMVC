const db = require('../db');

// Show review page
exports.list = (req, res) => {
    db.query(
        `SELECT r.review_id, r.rating, r.comment, r.created_at,
                u.username
         FROM reviews r
         JOIN users u ON r.user_id = u.id
         ORDER BY r.created_at DESC`,
        (err, reviews) => {
            if (err) throw err;

            res.render('reviews', { reviews });
        }
    );
};

// Add review from reviews page
exports.add = (req, res) => {
    const userId = req.session.user.id;
    const { rating, comment } = req.body;

    db.query(
        `INSERT INTO reviews (user_id, rating, comment)
         VALUES (?, ?, ?)`,
        [userId, rating, comment],
        () => res.redirect('/reviews')
    );
};

// Homepage review loader
exports.getReviews = (callback) => {
    db.query(
        `SELECT r.review_id, r.rating, r.comment, r.created_at,
                u.username
         FROM reviews r
         JOIN users u ON r.user_id = u.id
         ORDER BY r.created_at DESC
         LIMIT 6`,
        callback
    );
};

// Homepage quick add
exports.addReview = (req, res) => {
    const userId = req.session.user.id;
    const { rating, comment } = req.body;

    db.query(
        `INSERT INTO reviews (user_id, rating, comment)
         VALUES (?, ?, ?)`,
        [userId, rating, comment],
        () => res.redirect('/')
    );
};
