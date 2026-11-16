
/* =========================================================
   AM ELECTRONICS - PRODUCT ROUTES
   ---------------------------------------------------------
   Handles:
   1. Loading all Shop products
   2. Loading homepage products by placement
   3. Loading products by actual product category
   4. Searching products
   5. Admin product listing
   6. Retrieving a single product
   7. Creating products from the admin portal
   8. Deleting products
   9. Supporting legacy product records
  10. Enforcing a maximum of 10 products per homepage placement

   IMPORTANT:
   - category = the product's actual category
   - placements = homepage sections where the product appears
   - A product can appear in Shop and in multiple homepage sections
   - An empty placements array means the product appears only in Shop
========================================================= */

const express = require('express');
const mongoose = require('mongoose');

const router = express.Router();

const Product = require('../Models/Product');
const { requireAdmin } = require('../Middleware/adminAuth');


/* =========================================================
   1. CONFIGURATION
========================================================= */

const MAX_HOMEPAGE_PRODUCTS = 10;


/*
   Homepage placements currently supported by the website.

   Legacy placements are retained where they may still be
   needed by existing records or older frontend sections.

   "you-may-like" has been removed.
*/

const HOMEPAGE_CATEGORIES = [
    'top-selling',
    'covers',
    'new-arrivals',
    'screen-protectors',
    'headphones-earpods',
    'smartwatches',
    'chargers-cables',
    'trending',
    'featured',
    'recommended',
    'explore',
    'must-have'
];


/*
   Actual product categories.

   These are separate from homepage placements.
*/

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

    // Legacy values retained for existing product records.
    'top-selling',
    'new-arrivals'
];


const CATEGORY_LABELS = {
    'top-selling': 'Top Selling',
    'covers': 'Phone Covers',
    'new-arrivals': 'New Arrivals',
    'screen-protectors': 'Screen Protectors',
    'headphones-earpods': 'Headphones & Earpods',
    'smartwatches': 'Smartwatches',
    'chargers-cables': 'Chargers & Cables',
    'phones': 'Phones',
    'bluetooth-speakers': 'Bluetooth Speakers',
    'ring-lights': 'Ring Lights',
    'gaming-accessories': 'Gaming Accessories',
    'photography-lighting': 'Photography & Lighting',
    'audio-sound': 'Audio & Sound',
    'storage-memory': 'Storage & Memory',
    'computer-accessories': 'Computer Accessories',
    'power-banks': 'Power Banks',
    'trending': 'Trending',
    'featured': 'Featured',
    'recommended': 'Recommended',
    'explore': 'Explore',
    'must-have': 'Must Have'
};


/* =========================================================
   2. GENERAL HELPERS
========================================================= */


/*
   Escape special regular-expression characters before
   using a search term in a MongoDB regular expression.
*/

function escapeRegex(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}


/*
   Convert comma-separated or newline-separated input into
   a clean array of strings.

   Also accepts an existing array.
*/

function normaliseArray(value) {
    if (Array.isArray(value)) {
        return value
            .map(item => String(item).trim())
            .filter(Boolean);
    }

    if (typeof value === 'string') {
        return value
            .split(/[\n,]+/)
            .map(item => item.trim())
            .filter(Boolean);
    }

    return [];
}


/*
   Convert specifications into a consistent array.

   Supports:
   - An array of objects
   - An array of strings
   - A JSON string
   - Newline-separated text
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
                            item.name || item.label || ''
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
            .filter(item => item.name || item.value);
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
        // Treat the input as ordinary text below.
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
                name: line.slice(0, separatorIndex).trim(),
                value: line.slice(separatorIndex + 1).trim()
            };
        })
        .filter(item => item.name || item.value);
}


/*
   Convert common boolean representations into a boolean.

   Returns null when the value is not explicitly provided.
*/

function normaliseBoolean(value) {
    if (typeof value === 'boolean') {
        return value;
    }

    if (typeof value === 'string') {
        const normalised = value.trim().toLowerCase();

        if (['true', '1', 'yes'].includes(normalised)) {
            return true;
        }

        if (['false', '0', 'no'].includes(normalised)) {
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
   Validate a product category.
*/

function isValidProductCategory(category) {
    return (
        typeof category === 'string' &&
        PRODUCT_CATEGORIES.includes(category)
    );
}


/*
   Validate a homepage placement.
*/

function isValidHomepagePlacement(placement) {
    return (
        typeof placement === 'string' &&
        HOMEPAGE_CATEGORIES.includes(placement)
    );
}


/*
   Get homepage placements submitted by the admin.

   New admin form:
       placements: ["top-selling", "new-arrivals"]

   Legacy format:
       placement: "top-selling"

   Older format:
       targetPage: "homepage"
       category: "covers"

   The legacy category fallback is only used when the
   older homepage submission does not provide placements.
*/

function getSubmittedPlacements({
    placements,
    placement,
    category,
    allowLegacyCategoryFallback = false
}) {
    let submitted = [];

    if (Array.isArray(placements)) {
        submitted = normaliseArray(placements);
    } else if (typeof placements === 'string' && placements.trim()) {
        submitted = normaliseArray(placements);
    }

    if (submitted.length === 0 && placement) {
        const legacyPlacement = String(placement).trim();

        if (legacyPlacement && legacyPlacement !== 'regular') {
            submitted = [legacyPlacement];
        }
    }

    if (
        submitted.length === 0 &&
        allowLegacyCategoryFallback &&
        category &&
        isValidHomepagePlacement(category)
    ) {
        submitted = [category];
    }

    return [...new Set(submitted)];
}


/* =========================================================
   3. HOMEPAGE PRODUCT FILTER
========================================================= */


/*
   Supports both current and older product records.

   Current records:
       showOnHomepage: true
       placements: ["top-selling"]

   Older records may use:
       targetPage: "homepage"
       placement: "top-selling"

   Some older records may only have:
       targetPage: "homepage"
       category: "covers"
*/

function homepagePlacementFilter(placement) {
    return {
        $or: [

            // Current placement format.
            {
                showOnHomepage: true,
                placements: placement
            },

            // Current visibility with legacy singular placement.
            {
                showOnHomepage: true,
                placement: placement
            },

            // Current visibility with legacy category placement.
            {
                showOnHomepage: true,
                placement: {
                    $in: [null, '', 'regular']
                },
                category: placement
            },

            // Older homepage records with a placements array.
            {
                targetPage: 'homepage',
                showOnHomepage: { $ne: false },
                placements: placement
            },

            // Older homepage records with a singular placement.
            {
                targetPage: 'homepage',
                showOnHomepage: { $ne: false },
                placement: placement
            },

            // Older homepage records using category as placement.
            {
                targetPage: 'homepage',
                showOnHomepage: { $ne: false },
                placement: {
                    $in: [null, '', 'regular']
                },
                category: placement
            },

            // Very old records without targetPage.
            {
                targetPage: { $exists: false },
                showOnHomepage: true,
                placements: placement
            },

            {
                targetPage: { $exists: false },
                showOnHomepage: true,
                placement: placement
            }
        ]
    };
}


/* =========================================================
   4. SHOP PRODUCT FILTER
========================================================= */


/*
   Shop should include:
   - Current products with showInShop: true
   - Legacy Shop products with targetPage: "shop"
   - Older products without targetPage or showInShop

   Products can appear in both Shop and homepage sections.
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


/* =========================================================
   5. GET ALL SHOP PRODUCTS
========================================================= */

/*
   GET /api/products

   Returns all products available in the Shop.

   Homepage placement does not remove a product from Shop.
*/

router.get('/', async (req, res) => {
    try {
        const products = await Product.find(
            shopProductsFilter()
        ).sort({
            createdAt: -1
        });

        return res.status(200).json(products);

    } catch (error) {
        console.error('Error loading Shop products:', error);

        return res.status(500).json({
            message: 'Failed to load products.',
            error: error.message
        });
    }
});


/* =========================================================
   6. GET HOMEPAGE PRODUCTS BY PLACEMENT
========================================================= */

/*
   GET /api/products/homepage/:category

   Examples:
       /api/products/homepage/top-selling
       /api/products/homepage/new-arrivals
       /api/products/homepage/covers

   Maximum of 10 products per homepage placement.
*/

router.get('/homepage/:category', async (req, res) => {
    try {
        const category = String(
            req.params.category || ''
        ).trim().toLowerCase();

        if (!isValidHomepagePlacement(category)) {
            return res.status(400).json({
                message: 'Invalid homepage placement.',
                allowedPlacements: HOMEPAGE_CATEGORIES
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
        console.error('Error loading homepage products:', error);

        return res.status(500).json({
            message: 'Failed to load homepage products.',
            error: error.message
        });
    }
});


/* =========================================================
   7. GET PRODUCTS BY ACTUAL PRODUCT CATEGORY
========================================================= */

/*
   GET /api/products/category/:category

   Examples:
       /api/products/category/power-banks
       /api/products/category/gaming-accessories
       /api/products/category/photography-lighting

   This route filters by the actual product category,
   not by homepage placement.

   Shop category results are not limited to 10.
*/

router.get('/category/:category', async (req, res) => {
    try {
        const category = String(
            req.params.category || ''
        ).trim().toLowerCase();

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
                    category: category
                }
            ]
        }).sort({
            createdAt: -1
        });

        return res.status(200).json(products);

    } catch (error) {
        console.error('Error loading category products:', error);

        return res.status(500).json({
            message: 'Failed to load category products.',
            error: error.message
        });
    }
});


/* =========================================================
   8. SEARCH PRODUCTS
========================================================= */

/*
   GET /api/products/search?q=phone

   Searches:
   - Product title
   - Description
   - Brand
   - Model
   - Actual category
   - Legacy placement
   - Homepage placements

   Search results are restricted to Shop products.
*/

router.get('/search', async (req, res) => {
    try {
        const searchTerm = String(
            req.query.q || ''
        ).trim();

        if (!searchTerm) {
            return res.status(200).json([]);
        }

        const safeSearchTerm = escapeRegex(searchTerm);

        const searchRegex = new RegExp(
            safeSearchTerm,
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
                        }
                    ]
                }
            ]
        }).sort({
            createdAt: -1
        });

        return res.status(200).json(products);

    } catch (error) {
        console.error('Error searching products:', error);

        return res.status(500).json({
            message: 'Product search failed.',
            error: error.message
        });
    }
});


/* =========================================================
   9. ADMIN - GET ALL PRODUCTS
========================================================= */

/*
   GET /api/products/admin/list

   Returns all products, including:
   - Shop-only products
   - Homepage products
   - Products appearing in both places

   Requires administrator authentication.
*/

router.get('/admin/list', requireAdmin, async (req, res) => {
    try {
        const products = await Product.find({})
            .sort({
                createdAt: -1
            });

        return res.status(200).json(products);

    } catch (error) {
        console.error('Admin product listing error:', error);

        return res.status(500).json({
            message: 'Failed to load admin products.',
            error: error.message
        });
    }
});


/* =========================================================
   10. GET A SINGLE PRODUCT
========================================================= */

/*
   GET /api/products/:id

   Used by the product details page.

   This route is deliberately placed after the more specific
   routes such as /search, /category and /homepage.
*/

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
        console.error('Error retrieving product:', error);

        return res.status(500).json({
            message: 'Failed to retrieve product.',
            error: error.message
        });
    }
});


/* =========================================================
   11. ADMIN - CREATE A PRODUCT
========================================================= */

/*
   POST /api/products

   Compatible with the updated admin.js form.

   Expected fields include:

   {
       title,
       category,
       placements: [],
       price,
       originalPrice,
       description,
       image,
       inStock,
       brand,
       model,
       colors: [],
       features: [],
       specifications: [],
       warranty,
       detailsVerified
   }

   Important behaviour:

   - Actual category is stored in category.
   - Homepage sections are stored in placements.
   - Products remain available in Shop by default.
   - Products with placements are also available on homepage.
   - Description is optional.
   - inStock is converted to stockStatus.
*/

router.post('/', requireAdmin, async (req, res) => {
    try {
        const {
            title,
            category,
            placements,
            placement,

            price,
            originalPrice,

            description,
            image,

            targetPage,
            showInShop,
            showOnHomepage,

            stockStatus,
            inStock,

            shopBadge,

            brand,
            model,

            colors,
            features,
            specifications,

            warranty,
            detailsVerified,

            extraImages,

            isDemo,
            demoBatch
        } = req.body;


        /* -------------------------------------------------
           A. Validate required basic fields
        ------------------------------------------------- */

        const finalTitle = String(
            title || ''
        ).trim();

        const finalCategory = String(
            category || ''
        ).trim().toLowerCase();

        const finalImage = String(
            image || ''
        ).trim();

        if (!finalTitle) {
            return res.status(400).json({
                message: 'Product title is required.'
            });
        }

        if (!finalCategory) {
            return res.status(400).json({
                message: 'Product category is required.'
            });
        }

        if (!isValidProductCategory(finalCategory)) {
            return res.status(400).json({
                message: 'Invalid product category.',
                allowedCategories: PRODUCT_CATEGORIES
            });
        }

        if (!finalImage) {
            return res.status(400).json({
                message: 'Product image is required.'
            });
        }


        /* -------------------------------------------------
           B. Validate product prices
        ------------------------------------------------- */

        const finalPrice = Number(price);

        if (
            price === undefined ||
            price === null ||
            price === '' ||
            !Number.isFinite(finalPrice) ||
            finalPrice <= 0
        ) {
            return res.status(400).json({
                message: 'A valid selling price greater than zero is required.'
            });
        }

        let finalOriginalPrice = null;

        if (
            originalPrice !== undefined &&
            originalPrice !== null &&
            originalPrice !== ''
        ) {
            finalOriginalPrice = Number(originalPrice);

            if (
                !Number.isFinite(finalOriginalPrice) ||
                finalOriginalPrice <= 0
            ) {
                return res.status(400).json({
                    message: 'Original price must be a valid positive number.'
                });
            }

            if (finalOriginalPrice < finalPrice) {
                return res.status(400).json({
                    message: 'Original price cannot be lower than the selling price.'
                });
            }
        }


        /* -------------------------------------------------
           C. Determine product visibility
        ------------------------------------------------- */

        const finalTargetPage = (
            typeof targetPage === 'string' &&
            targetPage.trim()
        )
            ? targetPage.trim().toLowerCase()
            : 'shop';


        /*
           Resolve submitted placements after validating
           the actual product category.

           This is important because the new admin form
           sends placements but does not send targetPage
           or showOnHomepage.
        */

        const submittedPlacements = getSubmittedPlacements({
            placements,
            placement,
            category: finalCategory,

            allowLegacyCategoryFallback:
                placements === undefined &&
                placement === undefined &&
                finalTargetPage === 'homepage'
        });


        /*
           Products are available in Shop by default.

           An explicit showInShop value takes precedence.
        */

        const explicitShowInShop = normaliseBoolean(
            showInShop
        );

        const finalShowInShop = (
            explicitShowInShop !== null
        )
            ? explicitShowInShop
            : (
                finalTargetPage === 'shop' ||
                submittedPlacements.length > 0
            );


        /*
           If showOnHomepage was explicitly supplied,
           respect it.

           Otherwise, infer homepage visibility from:
           - targetPage === "homepage"
           - One or more submitted placements
        */

        const explicitShowOnHomepage = normaliseBoolean(
            showOnHomepage
        );

        const finalShowOnHomepage = (
            explicitShowOnHomepage !== null
        )
            ? explicitShowOnHomepage
            : (
                finalTargetPage === 'homepage' ||
                submittedPlacements.length > 0
            );


        /* -------------------------------------------------
           D. Validate homepage placements
        ------------------------------------------------- */

        let finalPlacements = [];

        if (finalShowOnHomepage) {
            finalPlacements = submittedPlacements;

            if (finalPlacements.length === 0) {
                return res.status(400).json({
                    message: 'Select at least one homepage placement for this product.'
                });
            }

            const invalidPlacements = finalPlacements.filter(
                item => !isValidHomepagePlacement(item)
            );

            if (invalidPlacements.length > 0) {
                return res.status(400).json({
                    message: 'One or more homepage placements are invalid.',
                    invalidPlacements,
                    allowedPlacements: HOMEPAGE_CATEGORIES
                });
            }

            /*
               Enforce the maximum of 10 products in each
               selected homepage placement.

               The count uses the same compatibility filter
               as the homepage loading endpoint.
            */

            for (const selectedPlacement of finalPlacements) {
                const existingCount = await Product.countDocuments(
                    homepagePlacementFilter(selectedPlacement)
                );

                if (existingCount >= MAX_HOMEPAGE_PRODUCTS) {
                    const placementLabel =
                        CATEGORY_LABELS[selectedPlacement] ||
                        selectedPlacement;

                    return res.status(400).json({
                        message:
                            `${placementLabel} already contains the maximum of ${MAX_HOMEPAGE_PRODUCTS} products.`,
                        placement: selectedPlacement,
                        maximum: MAX_HOMEPAGE_PRODUCTS,
                        currentCount: existingCount
                    });
                }
            }
        }


        /*
           A product must be visible somewhere.

           The updated admin form normally keeps products
           in Shop, including products assigned to homepage.
        */

        if (!finalShowInShop && !finalShowOnHomepage) {
            return res.status(400).json({
                message: 'The product must be assigned to Shop or a homepage placement.'
            });
        }


        /* -------------------------------------------------
           E. Normalise stock status
        ------------------------------------------------- */

        let finalStockStatus = 'in-stock';

        if (
            typeof stockStatus === 'string' &&
            stockStatus.trim()
        ) {
            finalStockStatus = stockStatus.trim().toLowerCase();

        } else {
            const submittedInStock = normaliseBoolean(inStock);

            if (submittedInStock !== null) {
                finalStockStatus = submittedInStock
                    ? 'in-stock'
                    : 'out-of-stock';
            }
        }

        if (
            !['in-stock', 'out-of-stock'].includes(finalStockStatus)
        ) {
            return res.status(400).json({
                message: 'Invalid stock status.',
                allowedValues: ['in-stock', 'out-of-stock']
            });
        }


        /* -------------------------------------------------
           F. Normalise optional product information
        ------------------------------------------------- */

        const finalDescription = String(
            description || ''
        ).trim();

        const finalBrand = String(
            brand || ''
        ).trim();

        const finalModel = String(
            model || ''
        ).trim();

        const finalWarranty = String(
            warranty || ''
        ).trim();

        const finalColors = normaliseArray(colors);

        const finalFeatures = normaliseArray(features);

        const finalSpecifications = normaliseSpecifications(
            specifications
        );

        const finalExtraImages = normaliseArray(extraImages);


        const finalDetailsVerified = (
            normaliseBoolean(detailsVerified) === true
        );


        /* -------------------------------------------------
           G. Create product record
        ------------------------------------------------- */

        const productData = {
            title: finalTitle,

            category: finalCategory,

            price: finalPrice,

            originalPrice: finalOriginalPrice,

            description: finalDescription,

            image: finalImage,

            /*
               Keep the singular placement field for older
               frontend code and existing product records.

               New code should use the placements array.
            */

            placement: finalPlacements.length > 0
                ? finalPlacements[0]
                : 'regular',

            placements: finalPlacements,

            targetPage: finalTargetPage,

            showInShop: finalShowInShop,

            showOnHomepage: finalShowOnHomepage,

            stockStatus: finalStockStatus,

            shopBadge: String(
                shopBadge || ''
            ).trim(),

            brand: finalBrand,

            model: finalModel,

            colors: finalColors,

            features: finalFeatures,

            specifications: finalSpecifications,

            warranty: finalWarranty,

            detailsVerified: finalDetailsVerified,

            extraImages: finalExtraImages,

            isDemo: normaliseBoolean(isDemo) === true,

            demoBatch: String(
                demoBatch || ''
            ).trim()
        };


        const newProduct = new Product(productData);

        await newProduct.save();


        /* -------------------------------------------------
           H. Return successful response
        ------------------------------------------------- */

        return res.status(201).json({
            message: 'Product created successfully.',
            product: newProduct
        });

    } catch (error) {
        console.error('Error creating product:', error);

        if (error.name === 'ValidationError') {
            return res.status(400).json({
                message: 'Product validation failed.',
                errors: Object.values(error.errors).map(
                    item => item.message
                )
            });
        }

        if (error.name === 'CastError') {
            return res.status(400).json({
                message: 'One or more product fields contain invalid values.'
            });
        }

        return res.status(500).json({
            message: 'Failed to create product.',
            error: error.message
        });
    }
});


/* =========================================================
   12. ADMIN - DELETE A PRODUCT
========================================================= */

/*
   DELETE /api/products/:id

   Requires administrator authentication.
*/

router.delete('/:id', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                message: 'Invalid product ID.'
            });
        }

        const deletedProduct = await Product.findByIdAndDelete(id);

        if (!deletedProduct) {
            return res.status(404).json({
                message: 'Product not found.'
            });
        }

        return res.status(200).json({
            message: 'Product deleted successfully.',
            productId: id
        });

    } catch (error) {
        console.error('Error deleting product:', error);

        return res.status(500).json({
            message: 'Failed to delete product.',
            error: error.message
        });
    }
});


/* =========================================================
   13. EXPORT ROUTER
========================================================= */

module.exports = router;




