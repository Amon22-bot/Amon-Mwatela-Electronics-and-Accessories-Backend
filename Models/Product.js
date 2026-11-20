
/* =========================================================
   AM ELECTRONICS AND ACCESSORIES
   PRODUCT DATABASE MODEL

   RESPONSIBILITIES:
   1. Define actual product categories.
   2. Define eight homepage product placements.
   3. Define five additional Shop collections.
   4. Support multiple placements and collections.
   5. Support up to four product images.
   6. Prepare image references for MongoDB GridFS.
   7. Preserve compatibility with legacy product records.
   8. Validate product prices and assignments.
========================================================= */

const mongoose = require('mongoose');


/* =========================================================
   1. ACTUAL PRODUCT CATEGORIES

   These describe what a product actually is.

   Ring lights       -> photography-lighting
   Bluetooth speakers -> audio-sound

   Phones, ring-lights and bluetooth-speakers are NOT
   standalone product categories.
========================================================= */

const PRODUCT_CATEGORIES = [

    'covers',
    'screen-protectors',
    'headphones-earpods',
    'smartwatches',
    'chargers-cables',

    'gaming-accessories',
    'photography-lighting',
    'audio-sound',
    'storage-memory',
    'computer-accessories',
    'power-banks'

];


/* =========================================================
   2. HOMEPAGE PRODUCT PLACEMENTS

   These are the ONLY eight homepage product sections.

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

   They are NOT product categories or homepage placements.
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
========================================================= */

const LEGACY_COLLECTION_VALUES = [

    ...ADDITIONAL_SHOP_COLLECTIONS

];


/* =========================================================
   5. LEGACY PLACEMENT COMPATIBILITY

   Existing records may contain Shop collection values
   inside the old placements field.

   These values remain accepted for compatibility.

   New assignments must use:
   - placements for homepage sections.
   - collections for additional Shop collections.
========================================================= */

const LEGACY_COMPATIBLE_PLACEMENTS = [

    ...HOMEPAGE_PRODUCT_PLACEMENTS,

    ...LEGACY_COLLECTION_VALUES

];


/* =========================================================
   6. PRODUCT IMAGE SUBDOCUMENT
========================================================= */

const ProductImageSchema = new mongoose.Schema({

    url: {
        type: String,
        required: true,
        trim: true
    },

    fileId: {
        type: String,
        trim: true,
        default: ''
    },

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

       Original price is optional.

       Products without discounts should store null.
    ----------------------------------------------------- */

    originalPrice: {

        type: Number,
        default: null,
        min: 0

    },

    price: {

        type: Number,
        required: true,
        min: 0.01

    },


    /* -----------------------------------------------------
       C. PRODUCT IMAGES

       Main image:
       - image
       - imageFileId

       Additional images:
       - extraImages

       Maximum total: FOUR images.
    ----------------------------------------------------- */

    image: {

        type: String,
        required: true,
        trim: true

    },

    imageFileId: {

        type: String,
        trim: true,
        default: ''

    },

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
    ----------------------------------------------------- */

    category: {

        type: String,

        required: true,

        enum: PRODUCT_CATEGORIES

    },


    /* -----------------------------------------------------
       G. PRODUCT DESTINATION
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
       A. ORIGINAL PRICE VALIDATION
    ----------------------------------------------------- */

    if (

        this.originalPrice !== null &&
        this.originalPrice !== undefined

    ) {

        if (

            !Number.isFinite(this.originalPrice) ||
            this.originalPrice <= 0

        ) {

            this.invalidate(
                'originalPrice',
                'Original price must be a valid positive number.'
            );

        }

        else if (

            this.price !== null &&
            this.price !== undefined &&
            this.price >= this.originalPrice

        ) {

            this.invalidate(
                'originalPrice',
                'Original price must be greater than the selling price.'
            );

        }

    }


    /* -----------------------------------------------------
       B. REMOVE DUPLICATE HOMEPAGE PLACEMENTS
    ----------------------------------------------------- */

    if (Array.isArray(this.placements)) {

        this.placements = [

            ...new Set(this.placements)

        ];

    }


    /* -----------------------------------------------------
       C. REMOVE DUPLICATE SHOP COLLECTIONS
    ----------------------------------------------------- */

    if (Array.isArray(this.collections)) {

        this.collections = [

            ...new Set(this.collections)

        ];

    }


    /* -----------------------------------------------------
       D. LEGACY PLACEMENT COMPATIBILITY

       Legacy collection values are deliberately retained.
       New records should use the collections field.
    ----------------------------------------------------- */


    /* -----------------------------------------------------
       E. MAXIMUM ADDITIONAL IMAGE VALIDATION
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


ProductSchema.index({

    showInShop: 1,
    collections: 1,
    createdAt: -1

});


/* =========================================================
   12. EXPOSE MODEL CONFIGURATION
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
