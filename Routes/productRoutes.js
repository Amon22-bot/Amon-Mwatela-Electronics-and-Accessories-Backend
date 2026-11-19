
/* =========================================================
   AM ELECTRONICS AND ACCESSORIES
   PRODUCT ROUTES

   File: Routes/productRoutes.js

   FEATURES:
   1. Load all Shop products.
   2. Load homepage products by placement.
   3. Load products by actual category.
   4. Load products by additional Shop collection.
   5. Search products.
   6. Admin product listing.
   7. Retrieve individual products.
   8. Create products.
   9. Edit products.
   10. Delete products.
   11. Upload product images to MongoDB GridFS.
   12. Retrieve product images from GridFS.
   13. Delete associated GridFS images.
   14. Support legacy product records.
   15. Enforce a maximum of 10 products per
       homepage product placement.

   GRIDFS BUCKET:
   productImages

   MAXIMUM PRODUCT IMAGES:
   4 total (1 main + 3 additional).
========================================================= */

const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');

const router = express.Router();

const Product = require('../Models/Product');
const { requireAdmin } = require('../Middleware/adminAuth');


/* =========================================================
   1. CONFIGURATION
========================================================= */

const MAX_HOMEPAGE_PRODUCTS = 10;

const MAX_PRODUCT_IMAGES = 4;

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

const PRODUCT_IMAGE_BUCKET = 'productImages';


/*
   Use the approved configuration from Product.js.
*/

const HOMEPAGE_PRODUCT_PLACEMENTS =
    Product.HOMEPAGE_PRODUCT_PLACEMENTS;

const ADDITIONAL_SHOP_COLLECTIONS =
    Product.ADDITIONAL_SHOP_COLLECTIONS;

const LEGACY_COMPATIBLE_PLACEMENTS =
    Product.LEGACY_COMPATIBLE_PLACEMENTS;

const PRODUCT_CATEGORIES =
    Product.PRODUCT_CATEGORIES.filter(category =>
        !['top-selling', 'new-arrivals'].includes(category)
    );


/* =========================================================
   2. CATEGORY AND COLLECTION LABELS
========================================================= */

const CATEGORY_LABELS = {

    'top-selling': 'Top Selling',
    'new-arrivals': 'New Arrivals',

    'covers': 'Phone Covers',
    'screen-protectors': 'Screen Protectors',
    'headphones-earpods': 'Headphones & Earpods',
    'smartwatches': 'Smartwatches',
    'chargers-cables': 'Chargers & Cables',
    'power-banks': 'Power Banks',

    'phones': 'Phones',
    'bluetooth-speakers': 'Bluetooth Speakers',
    'ring-lights': 'Ring Lights',

    'gaming-accessories': 'Gaming Accessories',
    'photography-lighting': 'Photography & Lighting',
    'audio-sound': 'Audio & Sound',
    'storage-memory': 'Storage & Memory',
    'computer-accessories': 'Computer Accessories',

    'trending': 'Trending',
    'featured': 'Featured',
    'recommended': 'Recommended',
    'must-have': 'Must Have',
    'explore': 'Explore'

};


/* =========================================================
   3. GRIDFS CONFIGURATION
========================================================= */


/*
   Get the product image GridFS bucket.

   This bucket is separate from the existing siteAssets
   bucket used for logos, hero slides and category images.
*/

function getProductImageBucket() {

    if (
        mongoose.connection.readyState !== 1 ||
        !mongoose.connection.db
    ) {

        throw new Error(
            'MongoDB connection is not ready.'
        );

    }

    return new mongoose.mongo.GridFSBucket(

        mongoose.connection.db,

        {
            bucketName: PRODUCT_IMAGE_BUCKET
        }

    );

}


/*
   Generate the public backend URL.

   This ensures product image URLs point to the backend
   rather than the GitHub Pages frontend.
*/

function getBackendBaseUrl(req) {

    const configuredUrl =
        process.env.BACKEND_URL ||
        process.env.API_BASE_URL;

    if (configuredUrl) {

        return configuredUrl.replace(/\/+$/, '');

    }

    const protocol =
        req.get('x-forwarded-proto') ||
        req.protocol;

    return `${protocol}://${req.get('host')}`;

}


/*
   Generate a public GridFS image URL.
*/

function getProductImageUrl(req, fileId) {

    return (
        `${getBackendBaseUrl(req)}` +
        `/api/products/image/${fileId}`
    );

}


/* =========================================================
   4. MULTER IMAGE UPLOAD CONFIGURATION
========================================================= */

const storage = multer.memoryStorage();

const imageUpload = multer({

    storage,

    limits: {

        fileSize: MAX_IMAGE_SIZE,

        files: MAX_PRODUCT_IMAGES

    },

    fileFilter: (req, file, callback) => {

        const allowedTypes = [

            'image/jpeg',
            'image/png',
            'image/webp',
            'image/gif'

        ];

        if (!allowedTypes.includes(file.mimetype)) {

            return callback(

                new Error(
                    'Only JPEG, PNG, WEBP and GIF images are allowed.'
                )

            );

        }

        callback(null, true);

    }

});


/*
   Accept uploaded images under the "images" field.

   Maximum: Four files.
*/

function handleProductImages(req, res, next) {

    imageUpload.array(
        'images',
        MAX_PRODUCT_IMAGES
    )(req, res, error => {

        if (!error) {

            return next();

        }

        if (error instanceof multer.MulterError) {

            if (error.code === 'LIMIT_FILE_SIZE') {

                return res.status(400).json({

                    message:
                        'Each product image must be 5 MB or smaller.'

                });

            }

            if (error.code === 'LIMIT_FILE_COUNT') {

                return res.status(400).json({

                    message:
                        'A product can have a maximum of four images.'

                });

            }

            return res.status(400).json({

                message: error.message

            });

        }

        return res.status(400).json({

            message: error.message ||
                'Product image upload failed.'

        });

    });

}


/* =========================================================
   5. IMAGE FILE VALIDATION
========================================================= */


/*
   Validate actual image signatures.

   This provides additional protection beyond checking
   the uploaded MIME type.
*/

function isValidImageBuffer(buffer, mimeType) {

    if (!Buffer.isBuffer(buffer)) {

        return false;

    }

    if (mimeType === 'image/jpeg') {

        return (
            buffer.length >= 3 &&
            buffer[0] === 0xFF &&
            buffer[1] === 0xD8 &&
            buffer[2] === 0xFF
        );

    }

    if (mimeType === 'image/png') {

        return (
            buffer.length >= 8 &&
            buffer.subarray(0, 8).equals(
                Buffer.from([
                    0x89, 0x50, 0x4E, 0x47,
                    0x0D, 0x0A, 0x1A, 0x0A
                ])
            )
        );

    }

    if (mimeType === 'image/gif') {

        const signature =
            buffer.subarray(0, 6).toString('ascii');

        return (
            signature === 'GIF87a' ||
            signature === 'GIF89a'
        );

    }

    if (mimeType === 'image/webp') {

        return (
            buffer.length >= 12 &&
            buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
            buffer.subarray(8, 12).toString('ascii') === 'WEBP'
        );

    }

    return false;

}


/* =========================================================
   6. GENERAL HELPERS
========================================================= */


/*
   Escape special regular-expression characters.
*/

function escapeRegex(value) {

    return String(value).replace(
        /[.*+?^${}()|[\]\\]/g,
        '\\$&'
    );

}


/*
   Normalise arrays.

   Supports:
   - Existing arrays.
   - JSON array strings.
   - Comma-separated strings.
   - Newline-separated strings.
*/

function normaliseArray(value) {

    if (Array.isArray(value)) {

        return value
            .map(item => String(item).trim())
            .filter(Boolean);

    }

    if (typeof value !== 'string' || !value.trim()) {

        return [];

    }

    const trimmed = value.trim();

    try {

        const parsed = JSON.parse(trimmed);

        if (Array.isArray(parsed)) {

            return normaliseArray(parsed);

        }

    } catch (error) {

        // Continue with ordinary text handling.

    }

    return trimmed
        .split(/[\n,]+/)
        .map(item => item.trim())
        .filter(Boolean);

}


/*
   Normalise specifications.
*/

function normaliseSpecifications(value) {

    if (Array.isArray(value)) {

        return value

            .map(item => {

                if (
                    item &&
                    typeof item === 'object' &&
                    !Array.isArray(item)
                ) {

                    return {

                        name: String(
                            item.name ||
                            item.label ||
                            ''
                        ).trim(),

                        value: String(
                            item.value || ''
                        ).trim()

                    };

                }

                return {

                    name: '',

                    value: String(item).trim()

                };

            })

            .filter(item =>
                item.name || item.value
            );

    }

    if (typeof value !== 'string' || !value.trim()) {

        return [];

    }

    try {

        const parsed = JSON.parse(value);

        if (Array.isArray(parsed)) {

            return normaliseSpecifications(parsed);

        }

    } catch (error) {

        // Treat as ordinary text.

    }

    return value

        .split('\n')

        .map(line => line.trim())

        .filter(Boolean)

        .map(line => {

            const separatorIndex = line.indexOf(':');

            if (separatorIndex === -1) {

                return {

                    name: '',

                    value: line

                };

            }

            return {

                name: line
                    .slice(0, separatorIndex)
                    .trim(),

                value: line
                    .slice(separatorIndex + 1)
                    .trim()

            };

        })

        .filter(item =>
            item.name || item.value
        );

}


/*
   Normalise boolean values.
*/

function normaliseBoolean(value) {

    if (typeof value === 'boolean') {

        return value;

    }

    if (typeof value === 'string') {

        const normalised =
            value.trim().toLowerCase();

        if (
            ['true', '1', 'yes'].includes(normalised)
        ) {

            return true;

        }

        if (
            ['false', '0', 'no'].includes(normalised)
        ) {

            return false;

        }

    }

    if (typeof value === 'number') {

        if (value === 1) return true;

        if (value === 0) return false;

    }

    return null;

}


/*
   Check whether a value is an actual product category.
*/

function isValidProductCategory(category) {

    return (

        typeof category === 'string' &&

        PRODUCT_CATEGORIES.includes(category)

    );

}


/*
   Check whether a value is one of the eight homepage
   product placements.
*/

function isValidHomepagePlacement(placement) {

    return (

        typeof placement === 'string' &&

        HOMEPAGE_PRODUCT_PLACEMENTS.includes(placement)

    );

}


/*
   Check whether a value is one of the five additional
   Shop collections.
*/

function isValidShopCollection(collection) {

    return (

        typeof collection === 'string' &&

        ADDITIONAL_SHOP_COLLECTIONS.includes(collection)

    );

}


/* =========================================================
   7. PRODUCT ASSIGNMENT HELPERS
========================================================= */


/*
   Separate submitted placement and collection values.

   Supports old admin submissions that placed collection
   names inside the placements field.

   New records will store these assignments separately.
*/

function getSubmittedAssignments({

    placements,

    placement,

    collections,

    category,

    allowLegacyCategoryFallback = false

}) {

    let submittedPlacements = [];

    let submittedCollections = [];


    /*
       Read the new placements field.
    */

    const rawPlacements =
        normaliseArray(placements);


    /*
       Separate homepage placements from legacy collection
       values.
    */

    rawPlacements.forEach(value => {

        if (isValidHomepagePlacement(value)) {

            submittedPlacements.push(value);

        } else if (isValidShopCollection(value)) {

            submittedCollections.push(value);

        }

    });


    /*
       Read the new collections field.
    */

    submittedCollections.push(
        ...normaliseArray(collections)
    );


    /*
       Read the legacy singular placement field.
    */

    if (placement) {

        const legacyPlacement =
            String(placement).trim().toLowerCase();

        if (
            isValidHomepagePlacement(legacyPlacement)
        ) {

            if (submittedPlacements.length === 0) {

                submittedPlacements.push(
                    legacyPlacement
                );

            }

        } else if (
            isValidShopCollection(legacyPlacement)
        ) {

            submittedCollections.push(
                legacyPlacement
            );

        }

    }


    /*
       Support older homepage submissions that used
       category as their homepage placement.
    */

    if (

        submittedPlacements.length === 0 &&

        allowLegacyCategoryFallback &&

        category &&

        isValidHomepagePlacement(category)

    ) {

        submittedPlacements.push(category);

    }


    return {

        placements: [
            ...new Set(submittedPlacements)
        ],

        collections: [
            ...new Set(submittedCollections)
        ]

    };

}


/*
   Read collection assignments from existing products.

   Old records may contain Shop collection values in:
   - placements
   - placement

   These are recognised without immediately modifying
   the stored database record.
*/

function getProductCollections(product) {

    const collections = [

        ...(product.collections || [])

    ];


    if (Array.isArray(product.placements)) {

        product.placements.forEach(value => {

            if (isValidShopCollection(value)) {

                collections.push(value);

            }

        });

    }


    if (
        product.placement &&
        isValidShopCollection(product.placement)
    ) {

        collections.push(product.placement);

    }


    return [
        ...new Set(collections)
    ];

}


/* =========================================================
   8. GRIDFS IMAGE OPERATIONS
========================================================= */


/*
   Upload a validated image buffer to GridFS.
*/

async function uploadImageToGridFS(file, metadata = {}) {

    if (
        !isValidImageBuffer(
            file.buffer,
            file.mimetype
        )
    ) {

        throw new Error(
            `Invalid image file: ${file.originalname}`
        );

    }

    const bucket = getProductImageBucket();

    const extension =
        path.extname(file.originalname || '').toLowerCase();

    const safeExtension = [
        '.jpg',
        '.jpeg',
        '.png',
        '.webp',
        '.gif'
    ].includes(extension)
        ? extension
        : '.jpg';

    const filename =
        `product-${Date.now()}-${mongoose.Types.ObjectId()}` +
        safeExtension;


    return new Promise((resolve, reject) => {

        const uploadStream = bucket.openUploadStream(

            filename,

            {

                contentType: file.mimetype,

                metadata

            }

        );


        uploadStream.on('error', reject);


        uploadStream.on('finish', () => {

            resolve({

                fileId: uploadStream.id.toString(),

                filename,

                contentType: file.mimetype

            });

        });


        uploadStream.end(file.buffer);

    });

}


/*
   Delete a GridFS image safely.

   Missing files are ignored so legacy products without
   GridFS images can still be deleted.
*/

async function deleteGridFSImage(fileId) {

    if (
        !fileId ||
        !mongoose.Types.ObjectId.isValid(
            String(fileId)
        )
    ) {

        return;

    }

    const bucket = getProductImageBucket();

    try {

        await bucket.delete(

            new mongoose.Types.ObjectId(
                String(fileId)
            )

        );

    } catch (error) {

        if (error.code !== 'ENOENT') {

            console.error(
                'GridFS image deletion warning:',
                error.message
            );

        }

    }

}


/*
   Delete all GridFS images belonging to a product.
*/

async function deleteProductImages(product) {

    const imageIds = [];


    if (product.imageFileId) {

        imageIds.push(product.imageFileId);

    }


    if (Array.isArray(product.extraImages)) {

        product.extraImages.forEach(image => {

            if (
                image &&
                typeof image === 'object' &&
                image.fileId
            ) {

                imageIds.push(image.fileId);

            }

        });

    }


    const uniqueIds = [
        ...new Set(imageIds.map(String))
    ];


    for (const fileId of uniqueIds) {

        await deleteGridFSImage(fileId);

    }

}


/*
   Delete uploaded files if product creation or editing
   fails after the files have been stored.
*/

async function cleanupUploadedImages(images) {

    for (const image of images) {

        if (image && image.fileId) {

            await deleteGridFSImage(image.fileId);

        }

    }

}


/* =========================================================
   9. IMAGE NORMALISATION HELPERS
========================================================= */


/*
   Convert uploaded GridFS images into product image data.

   First image = main image.
   Remaining images = additional images.
*/

function buildUploadedImageData(req, uploadedImages) {

    if (!uploadedImages.length) {

        return null;

    }

    const mainImage = uploadedImages[0];

    return {

        image: getProductImageUrl(
            req,
            mainImage.fileId
        ),

        imageFileId: mainImage.fileId,

        extraImages: uploadedImages
            .slice(1)
            .map(item => ({

                url: getProductImageUrl(
                    req,
                    item.fileId
                ),

                fileId: item.fileId,

                publicId: ''

            }))

    };

}


/*
   Normalise additional image objects submitted by the
   admin portal.

   Supports:
   - Current object format.
   - Legacy string URL format.
*/

function normaliseExtraImages(value) {

    let parsed = value;


    if (typeof parsed === 'string') {

        try {

            parsed = JSON.parse(parsed);

        } catch (error) {

            return [];

        }

    }


    if (!Array.isArray(parsed)) {

        return [];

    }


    return parsed

        .map(image => {

            if (typeof image === 'string') {

                return {

                    url: image.trim(),

                    fileId: '',

                    publicId: ''

                };

            }


            if (
                image &&
                typeof image === 'object'
            ) {

                return {

                    url: String(
                        image.url || ''
                    ).trim(),

                    fileId: String(
                        image.fileId || ''
                    ).trim(),

                    publicId: String(
                        image.publicId || ''
                    ).trim()

                };

            }


            return null;

        })

        .filter(image =>
            image && image.url
        );

}


/* =========================================================
   10. VISIBILITY FILTERS
========================================================= */


/*
   Shop visibility filter.

   Supports current and legacy records.

   Explicit showInShop:false always hides the product.
*/

function shopProductsFilter() {

    return {

        $or: [

            {

                showInShop: true

            },


            {

                showInShop: {
                    $exists: false
                },

                targetPage: 'shop'

            },


            {

                showInShop: {
                    $exists: false
                },

                targetPage: {
                    $exists: false
                }

            }

        ]

    };

}


/*
   Homepage placement filter.

   Only the eight approved homepage placements are used.

   Legacy singular placement and category assignments
   remain supported.
*/

function homepagePlacementFilter(placement) {

    return {

        $or: [

            // Current placement array.
            {

                showOnHomepage: true,

                placements: placement

            },


            // Legacy singular placement.
            {

                showOnHomepage: true,

                placement: placement

            },


            // Legacy category used as homepage placement.
            {

                showOnHomepage: true,

                placement: {
                    $in: [null, '', 'regular']
                },

                category: placement

            },


            // Older homepage records.
            {

                targetPage: 'homepage',

                showOnHomepage: {
                    $ne: false
                },

                placements: placement

            },


            {

                targetPage: 'homepage',

                showOnHomepage: {
                    $ne: false
                },

                placement: placement

            },


            {

                targetPage: 'homepage',

                showOnHomepage: {
                    $ne: false
                },

                placement: {
                    $in: [null, '', 'regular']
                },

                category: placement

            },


            // Very old records without targetPage.
            {

                targetPage: {
                    $exists: false
                },

                showOnHomepage: true,

                placements: placement

            },


            {

                targetPage: {
                    $exists: false
                },

                showOnHomepage: true,

                placement: placement

            }

        ]

    };

}


/*
   Additional Shop collection filter.

   Recognises both the new collections field and legacy
   collection assignments.
*/

function shopCollectionFilter(collection) {

    return {

        $and: [

            shopProductsFilter(),

            {

                $or: [

                    {

                        collections: collection

                    },


                    // Legacy collection in placements.
                    {

                        placements: collection

                    },


                    // Legacy collection in singular placement.
                    {

                        placement: collection

                    }

                ]

            }

        ]

    };

}


/* =========================================================
   11. GET ALL SHOP PRODUCTS
========================================================= */

router.get('/', async (req, res) => {

    try {

        const products = await Product.find(
            shopProductsFilter()
        )

            .sort({

                createdAt: -1

            });


        return res.status(200).json(products);


    } catch (error) {

        console.error(
            'Error loading Shop products:',
            error
        );


        return res.status(500).json({

            message: 'Failed to load products.'

        });

    }

});


/* =========================================================
   12. GET HOMEPAGE PRODUCTS BY PLACEMENT
========================================================= */

router.get('/homepage/:category', async (req, res) => {

    try {

        const category = String(

            req.params.category || ''

        )
            .trim()
            .toLowerCase();


        if (!isValidHomepagePlacement(category)) {

            return res.status(400).json({

                message: 'Invalid homepage placement.',

                allowedPlacements:
                    HOMEPAGE_PRODUCT_PLACEMENTS

            });

        }


        const products = await Product.find(

            homepagePlacementFilter(category)

        )

            .sort({

                createdAt: -1

            })

            .limit(MAX_HOMEPAGE_PRODUCTS);


        return res.status(200).json(products);


    } catch (error) {

        console.error(
            'Error loading homepage products:',
            error
        );


        return res.status(500).json({

            message: 'Failed to load homepage products.'

        });

    }

});


/* =========================================================
   13. GET PRODUCTS BY ACTUAL CATEGORY
========================================================= */

router.get('/category/:category', async (req, res) => {

    try {

        const category = String(

            req.params.category || ''

        )
            .trim()
            .toLowerCase();


        if (!isValidProductCategory(category)) {

            return res.status(400).json({

                message: 'Invalid product category.',

                allowedCategories: PRODUCT_CATEGORIES

            });

        }


        const products = await Product.find({

            $and: [

                shopProductsFilter(),

                {

                    category

                }

            ]

        })

            .sort({

                createdAt: -1

            });


        return res.status(200).json(products);


    } catch (error) {

        console.error(
            'Error loading category products:',
            error
        );


        return res.status(500).json({

            message: 'Failed to load category products.'

        });

    }

});


/* =========================================================
   14. GET PRODUCTS BY ADDITIONAL SHOP COLLECTION
========================================================= */

router.get('/collection/:collection', async (req, res) => {

    try {

        const collection = String(

            req.params.collection || ''

        )
            .trim()
            .toLowerCase();


        if (!isValidShopCollection(collection)) {

            return res.status(400).json({

                message: 'Invalid Shop collection.',

                allowedCollections:
                    ADDITIONAL_SHOP_COLLECTIONS

            });

        }


        const products = await Product.find(

            shopCollectionFilter(collection)

        )

            .sort({

                createdAt: -1

            });


        return res.status(200).json(products);


    } catch (error) {

        console.error(
            'Error loading Shop collection:',
            error
        );


        return res.status(500).json({

            message: 'Failed to load Shop collection.'

        });

    }

});


/* =========================================================
   15. SEARCH PRODUCTS
========================================================= */

router.get('/search', async (req, res) => {

    try {

        const searchTerm = String(

            req.query.q || ''

        ).trim();


        if (!searchTerm) {

            return res.status(200).json([]);

        }


        const searchRegex = new RegExp(

            escapeRegex(searchTerm),

            'i'

        );


        const products = await Product.find({

            $and: [

                shopProductsFilter(),

                {

                    $or: [

                        {
                            title: searchRegex
                        },

                        {
                            description: searchRegex
                        },

                        {
                            brand: searchRegex
                        },

                        {
                            model: searchRegex
                        },

                        {
                            category: searchRegex
                        },

                        {
                            placement: searchRegex
                        },

                        {
                            placements: searchRegex
                        },

                        {
                            collections: searchRegex
                        },

                        {
                            features: searchRegex
                        },

                        {
                            colors: searchRegex
                        }

                    ]

                }

            ]

        })

            .sort({

                createdAt: -1

            });


        return res.status(200).json(products);


    } catch (error) {

        console.error(
            'Error searching products:',
            error
        );


        return res.status(500).json({

            message: 'Product search failed.'

        });

    }

});


/* =========================================================
   16. GET PRODUCT IMAGE FROM GRIDFS
========================================================= */

router.get('/image/:fileId', async (req, res) => {

    try {

        const { fileId } = req.params;


        if (
            !mongoose.Types.ObjectId.isValid(fileId)
        ) {

            return res.status(400).json({

                message: 'Invalid image identifier.'

            });

        }


        const bucket = getProductImageBucket();


        const objectId =
            new mongoose.Types.ObjectId(fileId);


        const files = await bucket.find({

            _id: objectId

        }).toArray();


        if (!files.length) {

            return res.status(404).json({

                message: 'Product image not found.'

            });

        }


        const file = files[0];


        res.set({

            'Content-Type':
                file.contentType || 'application/octet-stream',

            'Cache-Control':
                'public, max-age=31536000, immutable'

        });


        const downloadStream =
            bucket.openDownloadStream(objectId);


        downloadStream.on('error', error => {

            console.error(
                'Product image streaming error:',
                error
            );


            if (!res.headersSent) {

                res.status(500).json({

                    message: 'Failed to retrieve product image.'

                });

            } else {

                res.destroy();

            }

        });


        downloadStream.pipe(res);


    } catch (error) {

        console.error(
            'Product image retrieval error:',
            error
        );


        if (!res.headersSent) {

            return res.status(500).json({

                message: 'Failed to retrieve product image.'

            });

        }

    }

});


/* =========================================================
   17. ADMIN - GET ALL PRODUCTS
========================================================= */

router.get('/admin/list', requireAdmin, async (req, res) => {

    try {

        const products = await Product.find({})

            .sort({

                createdAt: -1

            });


        return res.status(200).json(products);


    } catch (error) {

        console.error(
            'Admin product listing error:',
            error
        );


        return res.status(500).json({

            message: 'Failed to load admin products.'

        });

    }

});


/* =========================================================
   18. GET A SINGLE PRODUCT
========================================================= */

router.get('/:id', async (req, res) => {

    try {

        const { id } = req.params;


        if (!mongoose.Types.ObjectId.isValid(id)) {

            return res.status(400).json({

                message: 'Invalid product ID.'

            });

        }


        const product = await Product.findById(id);


        if (!product) {

            return res.status(404).json({

                message: 'Product not found.'

            });

        }


        return res.status(200).json(product);


    } catch (error) {

        console.error(
            'Error retrieving product:',
            error
        );


        return res.status(500).json({

            message: 'Failed to retrieve product.'

        });

    }

});


/* =========================================================
   19. VALIDATE PRODUCT DATA
========================================================= */

function validateProductData(body, isUpdate = false) {

    const {

        title,

        category,

        price,

        originalPrice,

        placements,

        placement,

        collections,

        showInShop,

        showOnHomepage,

        targetPage,

        stockStatus

    } = body;


    const result = {};


    /* -----------------------------------------------------
       A. PRODUCT TITLE
    ----------------------------------------------------- */

    if (!isUpdate || title !== undefined) {

        result.title = String(
            title || ''
        ).trim();


        if (!result.title) {

            throw new Error(
                'Product title is required.'
            );

        }

    }


    /* -----------------------------------------------------
       B. PRODUCT CATEGORY
    ----------------------------------------------------- */

    if (!isUpdate || category !== undefined) {

        result.category = String(
            category || ''
        )
            .trim()
            .toLowerCase();


        if (!isValidProductCategory(result.category)) {

            throw new Error(
                'Invalid product category.'
            );

        }

    }


    /* -----------------------------------------------------
       C. PRICES
    ----------------------------------------------------- */

    if (!isUpdate || price !== undefined) {

        const finalPrice = Number(price);


        if (

            price === undefined ||
            price === null ||
            price === '' ||

            !Number.isFinite(finalPrice) ||

            finalPrice <= 0

        ) {

            throw new Error(
                'A valid selling price greater than zero is required.'
            );

        }


        result.price = finalPrice;

    }


    if (
        !isUpdate ||
        originalPrice !== undefined
    ) {

        if (

            originalPrice === undefined ||
            originalPrice === null ||
            originalPrice === ''

        ) {

            result.originalPrice = null;

        } else {

            const finalOriginalPrice =
                Number(originalPrice);


            if (

                !Number.isFinite(finalOriginalPrice) ||

                finalOriginalPrice <= 0

            ) {

                throw new Error(
                    'Original price must be a valid positive number.'
                );

            }


            result.originalPrice = finalOriginalPrice;

        }

    }


    const effectivePrice =
        result.price;


    const effectiveOriginalPrice =
        result.originalPrice;


    if (

        effectivePrice !== undefined &&

        effectiveOriginalPrice !== undefined &&

        effectiveOriginalPrice !== null &&

        effectivePrice > effectiveOriginalPrice

    ) {

        throw new Error(
            'Original price cannot be lower than the selling price.'
        );

    }


    /* -----------------------------------------------------
       D. PRODUCT ASSIGNMENTS
    ----------------------------------------------------- */

    if (

        !isUpdate ||

        placements !== undefined ||

        placement !== undefined ||

        collections !== undefined

    ) {

        const assignments = getSubmittedAssignments({

            placements,

            placement,

            collections,

            category: result.category || category,

            allowLegacyCategoryFallback:
                !isUpdate &&
                placements === undefined &&
                placement === undefined &&
                collections === undefined &&
                targetPage === 'homepage'

        });


        const invalidCollections =
            assignments.collections.filter(
                item => !isValidShopCollection(item)
            );


        if (invalidCollections.length) {

            throw new Error(
                'One or more Shop collections are invalid.'
            );

        }


        result.placements =
            assignments.placements;


        result.collections =
            assignments.collections;


        if (result.placements.length) {

            result.placement =
                result.placements[0];

        } else {

            result.placement = 'regular';

        }

    }


    /* -----------------------------------------------------
       E. VISIBILITY
    ----------------------------------------------------- */

    if (!isUpdate || targetPage !== undefined) {

        const finalTargetPage = String(

            targetPage || 'shop'

        )
            .trim()
            .toLowerCase();


        if (
            !['homepage', 'shop'].includes(finalTargetPage)
        ) {

            throw new Error(
                'Invalid product destination.'
            );

        }


        result.targetPage = finalTargetPage;

    }


    if (
        !isUpdate ||
        showInShop !== undefined
    ) {

        const explicitValue =
            normaliseBoolean(showInShop);


        result.showInShop = explicitValue !== null

            ? explicitValue

            : (

                result.targetPage === 'shop' ||

                (result.placements || []).length > 0 ||

                (result.collections || []).length > 0

            );

    }


    if (
        !isUpdate ||
        showOnHomepage !== undefined
    ) {

        const explicitValue =
            normaliseBoolean(showOnHomepage);


        result.showOnHomepage = explicitValue !== null

            ? explicitValue

            : (

                (result.placements || []).length > 0

            );

    }


    if (
        result.collections &&
        result.collections.length > 0 &&
        result.showInShop === false
    ) {

        throw new Error(
            'Products assigned to Shop collections must be visible in Shop.'
        );

    }


    if (
        result.placements &&
        result.placements.length > 0 &&
        result.showInShop === false
    ) {

        throw new Error(
            'Products assigned to homepage product placements must also be visible in Shop.'
        );

    }


    if (result.showOnHomepage === true) {

        if (
            result.placements &&
            result.placements.length === 0
        ) {

            throw new Error(
                'Select at least one homepage product placement.'
            );

        }

    }


    if (

        result.showInShop === false &&

        result.showOnHomepage === false

    ) {

        throw new Error(
            'The product must be visible in Shop or on the homepage.'
        );

    }


    /* -----------------------------------------------------
       F. STOCK STATUS
    ----------------------------------------------------- */

    if (
        !isUpdate ||
        stockStatus !== undefined
    ) {

        const finalStockStatus = String(

            stockStatus || 'in-stock'

        )
            .trim()
            .toLowerCase();


        if (

            !['in-stock', 'out-of-stock'].includes(
                finalStockStatus
            )

        ) {

            throw new Error(
                'Invalid stock status.'
            );

        }


        result.stockStatus = finalStockStatus;

    }


    /* -----------------------------------------------------
       G. OPTIONAL TEXT AND ARRAY FIELDS
    ----------------------------------------------------- */

    const textFields = [

        'description',
        'brand',
        'model',
        'warranty',
        'demoBatch'

    ];


    textFields.forEach(field => {

        if (
            !isUpdate ||
            body[field] !== undefined
        ) {

            result[field] = String(
                body[field] || ''
            ).trim();

        }

    });


    const arrayFields = [

        'colors',
        'features'

    ];


    arrayFields.forEach(field => {

        if (
            !isUpdate ||
            body[field] !== undefined
        ) {

            result[field] =
                normaliseArray(body[field]);

        }

    });


    if (
        !isUpdate ||
        body.specifications !== undefined
    ) {

        result.specifications =
            normaliseSpecifications(
                body.specifications
            );

    }


    if (
        !isUpdate ||
        body.detailsVerified !== undefined
    ) {

        result.detailsVerified =
            normaliseBoolean(
                body.detailsVerified
            ) === true;

    }


    if (
        !isUpdate ||
        body.isDemo !== undefined
    ) {

        result.isDemo =
            normaliseBoolean(
                body.isDemo
            ) === true;

    }


    return result;

}


/* =========================================================
   20. ENFORCE HOMEPAGE PRODUCT LIMITS
========================================================= */

async function validateHomepageLimits(
    placements,
    excludeProductId = null
) {

    for (const placement of placements) {

        const filter =
            homepagePlacementFilter(placement);


        if (excludeProductId) {

            filter._id = {

                $ne: excludeProductId

            };

        }


        const existingCount =
            await Product.countDocuments(filter);


        if (
            existingCount >= MAX_HOMEPAGE_PRODUCTS
        ) {

            const label =
                CATEGORY_LABELS[placement] ||
                placement;


            throw new Error(

                `${label} already contains the maximum of ` +
                `${MAX_HOMEPAGE_PRODUCTS} products.`

            );

        }

    }

}


/* =========================================================
   21. ADMIN - CREATE A PRODUCT
========================================================= */

router.post(

    '/',

    requireAdmin,

    handleProductImages,

    async (req, res) => {

        const uploadedImages = [];

        try {

            const body = req.body;


            /* -------------------------------------------------
               A. VALIDATE PRODUCT INFORMATION
            ------------------------------------------------- */

            const productData =
                validateProductData(body);


            /* -------------------------------------------------
               B. VALIDATE IMAGE COUNT
            ------------------------------------------------- */

            const files = req.files || [];


            if (files.length > MAX_PRODUCT_IMAGES) {

                return res.status(400).json({

                    message:
                        'A product can have a maximum of four images.'

                });

            }


            const existingImage =
                String(body.image || '').trim();


            if (!files.length && !existingImage) {

                return res.status(400).json({

                    message:
                        'A main product image is required.'

                });

            }


            /* -------------------------------------------------
               C. ENFORCE HOMEPAGE PRODUCT LIMITS
            ------------------------------------------------- */

            await validateHomepageLimits(
                productData.placements || []
            );


            /* -------------------------------------------------
               D. UPLOAD IMAGES TO GRIDFS
            ------------------------------------------------- */

            if (files.length) {

                for (const file of files) {

                    const uploaded =
                        await uploadImageToGridFS(

                            file,

                            {
                                purpose: 'product-image'
                            }

                        );


                    uploadedImages.push(uploaded);

                }


                const imageData =
                    buildUploadedImageData(
                        req,
                        uploadedImages
                    );


                Object.assign(
                    productData,
                    imageData
                );

            } else {

                // Legacy URL-based product creation.
                productData.image = existingImage;

                productData.imageFileId = String(
                    body.imageFileId || ''
                ).trim();

                productData.extraImages =
                    normaliseExtraImages(
                        body.extraImages
                    );

            }


            /* -------------------------------------------------
               E. CREATE DATABASE RECORD
            ------------------------------------------------- */

            const newProduct = new Product(
                productData
            );


            await newProduct.save();


            /* -------------------------------------------------
               F. SUCCESS RESPONSE
            ------------------------------------------------- */

            return res.status(201).json({

                message: 'Product created successfully.',

                product: newProduct

            });


        } catch (error) {

            console.error(
                'Error creating product:',
                error
            );


            await cleanupUploadedImages(
                uploadedImages
            );


            if (
                error.name === 'ValidationError' ||
                error.message
            ) {

                return res.status(400).json({

                    message:
                        error.message ||
                        'Product validation failed.',

                    errors: error.errors
                        ? Object.values(
                            error.errors
                        ).map(item => item.message)
                        : []

                });

            }


            return res.status(500).json({

                message: 'Failed to create product.'

            });

        }

    }

);


/* =========================================================
   22. ADMIN - UPDATE A PRODUCT
========================================================= */

router.put(

    '/:id',

    requireAdmin,

    handleProductImages,

    async (req, res) => {

        const uploadedImages = [];

        try {

            const { id } = req.params;


            if (!mongoose.Types.ObjectId.isValid(id)) {

                return res.status(400).json({

                    message: 'Invalid product ID.'

                });

            }


            const product = await Product.findById(id);


            if (!product) {

                return res.status(404).json({

                    message: 'Product not found.'

                });

            }


            /* -------------------------------------------------
               A. VALIDATE SUBMITTED FIELDS
            ------------------------------------------------- */

            const updates =
                validateProductData(
                    req.body,
                    true
                );


            /* -------------------------------------------------
               B. PRESERVE EXISTING ASSIGNMENTS WHEN OMITTED
            ------------------------------------------------- */

            if (
                updates.placements === undefined
            ) {

                updates.placements =
                    product.placements.filter(
                        item => isValidHomepagePlacement(item)
                    );

            }


            if (
                updates.collections === undefined
            ) {

                updates.collections =
                    getProductCollections(product);

            }


            if (
                updates.placement === undefined
            ) {

                updates.placement =
                    updates.placements[0] ||
                    'regular';

            }


            /* -------------------------------------------------
               C. VALIDATE HOMEPAGE LIMITS
            ------------------------------------------------- */

            await validateHomepageLimits(

                updates.placements,

                product._id

            );


            /* -------------------------------------------------
               D. PRESERVE EXISTING IMAGE INFORMATION
            ------------------------------------------------- */

            const oldImageIds = [];


            if (product.imageFileId) {

                oldImageIds.push(
                    product.imageFileId
                );

            }


            if (Array.isArray(product.extraImages)) {

                product.extraImages.forEach(image => {

                    if (
                        image &&
                        typeof image === 'object' &&
                        image.fileId
                    ) {

                        oldImageIds.push(
                            image.fileId
                        );

                    }

                });

            }


            /* -------------------------------------------------
               E. REPLACE IMAGES IF NEW FILES ARE UPLOADED
            ------------------------------------------------- */

            const files = req.files || [];


            if (files.length) {

                for (const file of files) {

                    const uploaded =
                        await uploadImageToGridFS(

                            file,

                            {
                                purpose: 'product-image',

                                productId: id

                            }

                        );


                    uploadedImages.push(uploaded);

                }


                const imageData =
                    buildUploadedImageData(
                        req,
                        uploadedImages
                    );


                Object.assign(
                    updates,
                    imageData
                );

            } else {

                /*
                   When no new image files are submitted,
                   preserve the existing product images.

                   Explicit image URL updates remain supported.
                */

                if (req.body.image !== undefined) {

                    updates.image =
                        String(
                            req.body.image || ''
                        ).trim();

                }


                if (
                    req.body.imageFileId !== undefined
                ) {

                    updates.imageFileId =
                        String(
                            req.body.imageFileId || ''
                        ).trim();

                }


                if (
                    req.body.extraImages !== undefined
                ) {

                    updates.extraImages =
                        normaliseExtraImages(
                            req.body.extraImages
                        );

                }

            }


            /* -------------------------------------------------
               F. APPLY PRODUCT UPDATES
            ------------------------------------------------- */

            Object.assign(

                product,

                updates

            );


            await product.save();


            /* -------------------------------------------------
               G. DELETE OLD IMAGES AFTER SUCCESSFUL SAVE
            ------------------------------------------------- */

            const newImageIds = [];


            if (product.imageFileId) {

                newImageIds.push(
                    product.imageFileId
                );

            }


            if (Array.isArray(product.extraImages)) {

                product.extraImages.forEach(image => {

                    if (
                        image &&
                        typeof image === 'object' &&
                        image.fileId
                    ) {

                        newImageIds.push(
                            image.fileId
                        );

                    }

                });

            }


            const retainedIds = new Set(
                newImageIds.map(String)
            );


            for (const oldId of oldImageIds) {

                if (
                    !retainedIds.has(String(oldId))
                ) {

                    await deleteGridFSImage(oldId);

                }

            }


            return res.status(200).json({

                message: 'Product updated successfully.',

                product

            });


        } catch (error) {

            console.error(
                'Error updating product:',
                error
            );


            await cleanupUploadedImages(
                uploadedImages
            );


            return res.status(400).json({

                message:
                    error.message ||
                    'Failed to update product.'

            });

        }

    }

);


/* =========================================================
   23. ADMIN - DELETE A PRODUCT
========================================================= */

router.delete(

    '/:id',

    requireAdmin,

    async (req, res) => {

        try {

            const { id } = req.params;


            if (!mongoose.Types.ObjectId.isValid(id)) {

                return res.status(400).json({

                    message: 'Invalid product ID.'

                });

            }


            const product =
                await Product.findById(id);


            if (!product) {

                return res.status(404).json({

                    message: 'Product not found.'

                });

            }


            /*
               Delete the product record first.

               Then clean up associated GridFS files.
            */

            await Product.findByIdAndDelete(id);


            await deleteProductImages(product);


            return res.status(200).json({

                message: 'Product deleted successfully.',

                productId: id

            });


        } catch (error) {

            console.error(
                'Error deleting product:',
                error
            );


            return res.status(500).json({

                message: 'Failed to delete product.'

            });

        }

    }

);


/* =========================================================
   24. EXPORT ROUTER
========================================================= */

module.exports = router;
