```javascript
/* =========================================================
   AM ELECTRONICS AND ACCESSORIES
   PRODUCT DATABASE MODEL

   File: Models/Product.js

   RESPONSIBILITIES:
   1. Define actual product categories.
   2. Define eight homepage product placements.
   3. Define five additional Shop collections.
   4. Support products assigned to multiple placements.
   5. Support products assigned to multiple collections.
   6. Support up to four product images.
   7. Prepare image references for MongoDB GridFS.
   8. Preserve compatibility with legacy product records.
   9. Validate product prices and assignments.
========================================================= */

const mongoose = require('mongoose');


/* =========================================================
   1. ACTUAL PRODUCT CATEGORIES
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

    // Legacy compatibility.
    'top-selling',
    'new-arrivals'

];


/* =========================================================
   2. HOMEPAGE PRODUCT PLACEMENTS

   These are the ONLY eight homepage product sections
   that display products through product carousels.

   Maximum: 10 products per placement.
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

   These are independent Shop destinations.

   They are NOT homepage product placements.

   Products may belong to multiple collections.
========================================================= */

const ADDITIONAL_SHOP_COLLECTIONS = [

    'trending',
    'featured',
    'recommended',
    'must-have',
    'explore'

];


/* =========================================================
   4. LEGACY COLLECTION VALUES

   Older product records may contain these values inside
   the placements field.

   They remain temporarily accepted to prevent existing
   records from failing validation when updated.

   New assignments should use the collections field.
========================================================= */

const LEGACY_COLLECTION_VALUES = [

    ...ADDITIONAL_SHOP_COLLECTIONS

];


/* =========================================================
   5. LEGACY PLACEMENT COMPATIBILITY

   This combined list is used ONLY to allow older records
   to remain valid during the transition.

   New homepage assignments must use the eight values in
   HOMEPAGE_PRODUCT_PLACEMENTS.

   New Shop collection assignments must use collections.
========================================================= */

const LEGACY_COMPATIBLE_PLACEMENTS = [

    ...HOMEPAGE_PRODUCT_PLACEMENTS,

    ...LEGACY_COLLECTION_VALUES

];


/* =========================================================
   6. PRODUCT IMAGE SUBDOCUMENT

   Additional product images.

   Each additional image stores:
   - url: Public image URL.
   - fileId: MongoDB GridFS file identifier.
   - publicId: Legacy image identifier.

   Maximum: Three additional images.
========================================================= */

const ProductImageSchema = new mongoose.Schema({

    // PUBLIC IMAGE URL.
    url: {
        type: String,
        required: true,
        trim: true
    },


    // GRIDFS FILE IDENTIFIER.
    // Stored as a string for convenient URL handling.
    fileId: {
        type: String,
        trim: true,
        default: ''
    },


    // LEGACY IMAGE IDENTIFIER.
    // Retained for compatibility with existing records.
    publicId: {
        type: String,
        trim: true,
        default: ''
    }

}, {

    _id: false

});


/* =========================================================
   7. PRODUCT SCHEMA
========================================================= */

const ProductSchema = new mongoose.Schema({

    /* -----------------------------------------------------
       A. BASIC PRODUCT INFORMATION
    ----------------------------------------------------- */

    title: {

        type: String,

        required: true,

        trim: true,

        maxlength: 150

    },


    description: {

        type: String,

        trim: true,

        default: '',

        maxlength: 5000

    },


    brand: {

        type: String,

        trim: true,

        maxlength: 100,

        default: ''

    },


    model: {

        type: String,

        trim: true,

        maxlength: 100,

        default: ''

    },


    /* -----------------------------------------------------
       B. PRODUCT PRICING
    ----------------------------------------------------- */

    originalPrice: {

        type: Number,

        default: null,

        min: 0

    },


    price: {

        type: Number,

        required: true,

        min: 0

    },


    /* -----------------------------------------------------
       C. PRODUCT IMAGES

       Main image:
       - image
       - imageFileId

       Additional images:
       - extraImages

       Total maximum: FOUR images.
    ----------------------------------------------------- */

    // MAIN PRODUCT IMAGE URL.
    // Retained for existing frontend compatibility.
    image: {

        type: String,

        required: true,

        trim: true

    },


    // MAIN IMAGE GRIDFS IDENTIFIER.
    imageFileId: {

        type: String,

        trim: true,

        default: ''

    },


    // ADDITIONAL PRODUCT IMAGES.
    extraImages: {

        type: [ProductImageSchema],

        default: [],

        validate: {

            validator: function (images) {

                return (
                    Array.isArray(images) &&
                    images.length <= 3
                );

            },

            message:
                'A product can have a maximum of 3 additional images.'

        }

    },


    /* -----------------------------------------------------
       D. PRODUCT DETAILS
    ----------------------------------------------------- */

    features: {

        type: [String],

        default: []

    },


    specifications: {

        type: [mongoose.Schema.Types.Mixed],

        default: []

    },


    colors: {

        type: [String],

        default: []

    },


    warranty: {

        type: String,

        trim: true,

        maxlength: 300,

        default: ''

    },


    detailsVerified: {

        type: Boolean,

        default: false

    },


    /* -----------------------------------------------------
       E. DEMO / EXHIBITION PRODUCTS
    ----------------------------------------------------- */

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


    /* -----------------------------------------------------
       F. ACTUAL PRODUCT CATEGORY

       This represents what the product actually is.

       Example:
       headphones-earpods
       gaming-accessories
       power-banks
    ----------------------------------------------------- */

    category: {

        type: String,

        default: null,

        enum: [
            null,
            ...PRODUCT_CATEGORIES
        ]

    },


    /* -----------------------------------------------------
       G. PRODUCT DESTINATION

       Retained for existing frontend/backend behaviour.

       New visibility logic will be handled by routes.
    ----------------------------------------------------- */

    targetPage: {

        type: String,

        enum: [
            'homepage',
            'shop'
        ],

        default: 'shop',

        index: true

    },


    /* -----------------------------------------------------
       H. HOMEPAGE PRODUCT PLACEMENTS

       The eight homepage product carousel sections.

       A product may belong to multiple placements.

       New assignments must use only these eight values.

       Legacy collection values remain temporarily accepted
       to preserve older product records.
    ----------------------------------------------------- */

    placements: {

        type: [{

            type: String,

            enum: LEGACY_COMPATIBLE_PLACEMENTS

        }],

        default: []

    },


    /* -----------------------------------------------------
       I. ADDITIONAL SHOP COLLECTIONS

       These are independent of homepage placements.

       Available collections:
       - trending
       - featured
       - recommended
       - must-have
       - explore

       A product may belong to multiple collections.
    ----------------------------------------------------- */

    collections: {

        type: [{

            type: String,

            enum: ADDITIONAL_SHOP_COLLECTIONS

        }],

        default: []

    },


    /* -----------------------------------------------------
       J. LEGACY SINGLE PLACEMENT

       Retained for older products and frontend compatibility.

       New product assignments should use placements.
    ----------------------------------------------------- */

    placement: {

        type: String,

        default: 'regular',

        enum: [

            'regular',

            ...LEGACY_COMPATIBLE_PLACEMENTS

        ]

    },


    /* -----------------------------------------------------
       K. PRODUCT VISIBILITY
    ----------------------------------------------------- */

    showInShop: {

        type: Boolean,

        default: true

    },


    showOnHomepage: {

        type: Boolean,

        default: false

    },


    /* -----------------------------------------------------
       L. STOCK MANAGEMENT
    ----------------------------------------------------- */

    stockStatus: {

        type: String,

        enum: [

            'in-stock',
            'out-of-stock'

        ],

        default: 'in-stock'

    },


    /* -----------------------------------------------------
       M. PRODUCT CREATION DATE
    ----------------------------------------------------- */

    createdAt: {

        type: Date,

        default: Date.now

    }

});


/* =========================================================
   8. PRICE VALIDATION AND ASSIGNMENT CLEANUP
========================================================= */

ProductSchema.pre('validate', function () {

    /* -----------------------------------------------------
       A. Validate selling price against original price.
    ----------------------------------------------------- */

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


    /* -----------------------------------------------------
       B. Remove duplicate homepage placements.
    ----------------------------------------------------- */

    if (Array.isArray(this.placements)) {

        this.placements = [

            ...new Set(this.placements)

        ];

    }


    /* -----------------------------------------------------
       C. Remove duplicate Shop collections.
    ----------------------------------------------------- */

    if (Array.isArray(this.collections)) {

        this.collections = [

            ...new Set(this.collections)

        ];

    }


    /* -----------------------------------------------------
       D. Remove duplicate legacy placement values.
    ----------------------------------------------------- */

    if (

        Array.isArray(this.placements) &&
        this.placements.length > 0

    ) {

        // Do not automatically migrate legacy collection
        // values here. That operation belongs in the routes
        // so existing records can be migrated deliberately.

    }


    /* -----------------------------------------------------
       E. Validate maximum additional images.
    ----------------------------------------------------- */

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
   9. DISCOUNT PERCENTAGE VIRTUAL
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
   10. JSON AND OBJECT VIRTUALS
========================================================= */

ProductSchema.set('toJSON', {

    virtuals: true

});


ProductSchema.set('toObject', {

    virtuals: true

});


/* =========================================================
   11. DATABASE INDEXES
========================================================= */

// Homepage product retrieval.
ProductSchema.index({

    targetPage: 1,

    placements: 1,

    createdAt: -1

});


// Actual product category retrieval.
ProductSchema.index({

    targetPage: 1,

    category: 1,

    createdAt: -1

});


// Additional Shop collection retrieval.
ProductSchema.index({

    showInShop: 1,

    collections: 1,

    createdAt: -1

});


/* =========================================================
   12. EXPOSE MODEL CONFIGURATION

   Allows backend routes to use the same approved lists
   instead of maintaining duplicate configuration arrays.
========================================================= */

ProductSchema.statics.PRODUCT_CATEGORIES =
    PRODUCT_CATEGORIES;

ProductSchema.statics.HOMEPAGE_PRODUCT_PLACEMENTS =
    HOMEPAGE_PRODUCT_PLACEMENTS;

ProductSchema.statics.ADDITIONAL_SHOP_COLLECTIONS =
    ADDITIONAL_SHOP_COLLECTIONS;

ProductSchema.statics.LEGACY_COMPATIBLE_PLACEMENTS =
    LEGACY_COMPATIBLE_PLACEMENTS;


/* =========================================================
   13. EXPORT PRODUCT MODEL
========================================================= */

module.exports =

    mongoose.models.Product ||

    mongoose.model(

        'Product',

        ProductSchema

    );
```
