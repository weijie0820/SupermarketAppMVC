class Cart {
    constructor(sessionCart) {
        // Use existing session cart, else new cart
        this.items = sessionCart || [];
    }

    // Add or update item
    addItem(product, quantity = 1) {
        const existing = this.items.find(item => item.id === product.id);

        if (existing) {
            existing.quantity += quantity;
        } else {
            this.items.push({
                id: product.id,
                productName: product.productName,
                price: product.price,
                quantity: quantity,
                image: product.image
            });
        }
    }

    // Remove product
    removeItem(productId) {
        this.items = this.items.filter(item => item.id !== parseInt(productId));
    }

    // Clear cart
    clear() {
        this.items = [];
    }

    // Calculate total
    getTotal() {
        return this.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    }

    // Get cart items
    getItems() {
        return this.items;
    }
}

module.exports = Cart;
