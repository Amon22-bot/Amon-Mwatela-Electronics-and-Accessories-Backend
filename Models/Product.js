
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
   2. HOMEPAGE PRODUCT PLACEMENTS
========================================================= */

const HOMEPAGE_PRODUCT_PLACEMENTS = [
    'top-selling',
    'new-arrivals',
    'covers',
    'screen-protectors',
    'headphones-earpods',
    'smartwatches',
    'chargers-cables',
    'power-banks'
];


/* =========================================================
   3. ADDITIONAL SHOP COLLECTIONS
========================================================= */

const ADDITIONAL_SHOP_COLLECTIONS = [
    'trending',
    'featured',
    'recommended',
    'must-have',
    'explore'
];


/* =========================================================
   4. ALL PRODUCT COLLECTION PLACEMENTS
========================================================= */

const HOMEPAGE_PLACEMENTS = [
    ...HOMEPAGE_PRODUCT_PLACEMENTS,
    ...ADDITIONAL_SHOP_COLLECTIONS
];


/* =========================================================
   5. PRODUCT IMAGE SUBDOCUMENT
========================================================= */

const ProductImageSchema = new mongoose.Schema({

    // IMAGE URL
    url: {
        type: String,
        required: true,
        trim: true
    },

    // IMAGE STORAGE IDENTIFIER
    publicId: {
        type: String,
        trim: true,
        default: ''
    }

}, {
    _id: false
});


/* =========================================================
   6. PRODUCT SCHEMA
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
    description: {
        type: String,
        trim: true,
        default: '',
        maxlength: 5000
    },


    // MAIN PRODUCT IMAGE
    // Retained for existing frontend compatibility.
    image: {
        type: String,
        required: true,
        trim: true
    },


    // ADDITIONAL PRODUCT IMAGES
    // Maximum 3 additional images.
    // Including the main image, maximum is 4.
    extraImages: {
        type: [ProductImageSchema],
        default: [],
        validate: {
            validator: function (images) {
                return Array.isArray(images) &&
                    images.length <= 3;
            },
            message:
                'A product can have a maximum of 3 additional images.'
        }
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


    // PRODUCT COLLECTION ASSIGNMENTS
    // Supports the eight homepage product placements
    // and the five additional Shop collections.
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
   7. PRICE VALIDATION AND PLACEMENT CLEANUP
========================================================= */

ProductSchema.pre('validate', function () {

    // Selling price cannot exceed original price.
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


    // Remove duplicate collection assignments.
    if (Array.isArray(this.placements)) {
        this.placements = [
            ...new Set(this.placements)
        ];
    }


    // Validate maximum additional images.
    if (
        Array.isArray(this.extraImages) &&
        this.extraImages.length > 3
    ) {
        this.invalidate(
            'extraImages',
            'A product can have a maximum of 3 additional images.'
        );
    }

});


/* =========================================================
   8. DISCOUNT PERCENTAGE VIRTUAL
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
   9. JSON AND OBJECT VIRTUALS
========================================================= */

ProductSchema.set('toJSON', {
    virtuals: true
});

ProductSchema.set('toObject', {
    virtuals: true
});


/* =========================================================
   10. DATABASE INDEXES
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
   11. EXPORT PRODUCT MODEL
========================================================= */

module.exports =
    mongoose.models.Product ||
    mongoose.model('Product', ProductSchema);
