
/* =========================================================
   AM ELECTRONICS AND ACCESSORIES
   PRODUCT DATABASE MODEL
   File: Models/Product.js
========================================================= */

const mongoose = require('mongoose');


/* =========================================================
   1. PRODUCT CATEGORIES
========================================================= */

const PRODUCT_CATEGORIES = [
    'covers',
    'screen-protectors',
    'headphones-earpods',
    'smartwatches',
    'chargers-cables',
    'phones',
    'bluetooth-speakers',
    'ring-lights',
    'gaming-accessories',
    'photography-lighting',
    'audio-sound',
    'storage-memory',
    'computer-accessories',
    'power-banks',

    // Legacy compatibility
    'top-selling',
    'new-arrivals'
];


/* =========================================================
   2. HOMEPAGE PLACEMENTS
========================================================= */

const HOMEPAGE_PLACEMENTS = [
    // Existing homepage sections
    'top-selling',
    'covers',
    'new-arrivals',
    'screen-protectors',
    'headphones-earpods',
    'smartwatches',
    'chargers-cables',

    // Additional supported placements
    'trending',
    'featured',
    'recommended',
    'explore',
    'must-have'
];


/* =========================================================
   3. PRODUCT SCHEMA
========================================================= */

const ProductSchema = new mongoose.Schema({

    // PRODUCT NAME
    title: {
        type: String,
        required: true,
        trim: true,
        maxlength: 150
    },


    // ORIGINAL PRICE BEFORE DISCOUNT
    originalPrice: {
        type: Number,
        default: null,
        min: 0
    },


    // CURRENT SELLING PRICE
    price: {
        type: Number,
        required: true,
        min: 0
    },


    // PRODUCT DESCRIPTION
    // Optional because the admin form allows an empty description.
    description: {
        type: String,
        trim: true,
        default: '',
        maxlength: 5000
    },


    // PRODUCT IMAGE PATH
    image: {
        type: String,
        required: true,
        trim: true
    },


    // BRAND
    brand: {
        type: String,
        trim: true,
        maxlength: 100,
        default: ''
    },


    // MODEL
    model: {
        type: String,
        trim: true,
        maxlength: 100,
        default: ''
    },


    // PRODUCT FEATURES
    features: {
        type: [String],
        default: []
    },


    // PRODUCT SPECIFICATIONS
    specifications: {
        type: [mongoose.Schema.Types.Mixed],
        default: []
    },


    // AVAILABLE COLORS
    colors: {
        type: [String],
        default: []
    },


    // ADDITIONAL PRODUCT IMAGES
    extraImages: {
        type: [String],
        default: []
    },


    // WARRANTY INFORMATION
    warranty: {
        type: String,
        trim: true,
        maxlength: 300,
        default: ''
    },


    // PRODUCT DETAILS VERIFICATION
    detailsVerified: {
        type: Boolean,
        default: false
    },


    // DEMO / EXHIBITION PRODUCTS
    isDemo: {
        type: Boolean,
        default: false,
        index: true
    },

    demoBatch: {
        type: String,
        trim: true,
        default: ''
    },


    // ACTUAL PRODUCT CATEGORY
    // Describes what the product is.
    // Separate from homepage placement.
    category: {
        type: String,
        default: null,
        enum: [null, ...PRODUCT_CATEGORIES]
    },


    // PRODUCT DESTINATION
    targetPage: {
        type: String,
        enum: ['homepage', 'shop'],
        default: 'shop',
        index: true
    },


    // OPTIONAL SHOP BADGE
    shopBadge: {
        type: String,
        enum: [
            'none',
            'new-arrival',
            'top-seller'
        ],
        default: 'none'
    },


    // MULTIPLE HOMEPAGE PLACEMENTS
    // One product can appear in several homepage sections.
    placements: {
        type: [{
            type: String,
            enum: HOMEPAGE_PLACEMENTS
        }],
        default: []
    },


    // LEGACY SINGLE HOMEPAGE PLACEMENT
    placement: {
        type: String,
        default: 'regular',
        enum: ['regular', ...HOMEPAGE_PLACEMENTS]
    },


    // SHOW PRODUCT IN SHOP
    showInShop: {
        type: Boolean,
        default: true
    },


    // SHOW PRODUCT ON HOMEPAGE
    showOnHomepage: {
        type: Boolean,
        default: false
    },


    // STOCK MANAGEMENT
    stockStatus: {
        type: String,
        enum: [
            'in-stock',
            'out-of-stock'
        ],
        default: 'in-stock'
    },


    // PRODUCT CREATION DATE
    createdAt: {
        type: Date,
        default: Date.now
    }

});


/* =========================================================
   4. PRICE VALIDATION AND PLACEMENT CLEANUP
========================================================= */

ProductSchema.pre('validate', function () {

    // Selling price cannot exceed the original price.
    if (
        this.originalPrice !== null &&
        this.originalPrice !== undefined &&
        this.price !== null &&
        this.price !== undefined &&
        this.price > this.originalPrice
    ) {
        this.invalidate(
            'price',
            'The selling price cannot exceed the original price.'
        );
    }


    // Remove duplicate homepage placements.
    if (Array.isArray(this.placements)) {
        this.placements = [
            ...new Set(this.placements)
        ];
    }

});


/* =========================================================
   5. DISCOUNT PERCENTAGE VIRTUAL
========================================================= */

ProductSchema.virtual('discountPercentage').get(function () {

    if (
        this.originalPrice === null ||
        this.originalPrice === undefined ||
        this.originalPrice <= 0 ||
        this.price >= this.originalPrice
    ) {
        return 0;
    }

    return Math.round(
        (
            (this.originalPrice - this.price) /
            this.originalPrice
        ) * 100
    );

});


/* =========================================================
   6. JSON AND OBJECT VIRTUALS
========================================================= */

ProductSchema.set('toJSON', {
    virtuals: true
});

ProductSchema.set('toObject', {
    virtuals: true
});


/* =========================================================
   7. DATABASE INDEXES
========================================================= */

ProductSchema.index({
    targetPage: 1,
    placements: 1,
    createdAt: -1
});

ProductSchema.index({
    targetPage: 1,
    category: 1,
    createdAt: -1
});


/* =========================================================
   8. EXPORT PRODUCT MODEL
========================================================= */

module.exports =
    mongoose.models.Product ||
    mongoose.model('Product', ProductSchema);


