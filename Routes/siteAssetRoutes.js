
"use strict";

const express = require("express");
const mongoose = require("mongoose");
const multer = require("multer");

const {
    GridFSBucket,
    ObjectId
} = require("mongodb");

const SiteAsset = require("../Models/SiteAsset");

const {
    requireAdmin
} = require("../Middleware/adminAuth");

const router = express.Router();

/* =========================================
   CONFIGURATION
========================================= */

const MAX_FILE_SIZE = 5 * 1024 * 1024;

const ALLOWED_MIME_TYPES = [
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/gif"
];

const BUCKET_NAME = "siteAssets";

const ASSET_TYPES = {
    LOGO: "logo",
    HERO: "hero",
    CATEGORY: "category"
};

/* =========================================
   GRIDFS CONNECTION
========================================= */

let gridFSBucket = null;

function getBucket() {
    if (!mongoose.connection.db) {
        throw new Error(
            "MongoDB is not connected. GridFS is unavailable."
        );
    }

    if (!gridFSBucket) {
        gridFSBucket = new GridFSBucket(
            mongoose.connection.db,
            {
                bucketName: BUCKET_NAME
            }
        );
    }

    return gridFSBucket;
}

/* =========================================
   MULTER CONFIGURATION
========================================= */

const storage = multer.memoryStorage();

const upload = multer({
    storage,

    limits: {
        fileSize: MAX_FILE_SIZE,
        files: 1
    },

    fileFilter(req, file, callback) {
        if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
            return callback(
                new Error(
                    "Only PNG, JPG, WEBP and GIF images are allowed."
                )
            );
        }

        callback(null, true);
    }
});

/* =========================================
   ASSET KEY VALIDATION
========================================= */

function isValidAssetKey(key) {
    return (
        typeof key === "string" &&
        /^[a-z0-9-]{1,80}$/.test(key)
    );
}

/* =========================================
   IMAGE CONTENT VALIDATION
========================================= */

function isValidImageBuffer(buffer, mimeType) {
    if (!Buffer.isBuffer(buffer) || buffer.length < 12) {
        return false;
    }

    switch (mimeType) {
        case "image/png":
            return buffer.subarray(0, 8).equals(
                Buffer.from([
                    0x89, 0x50, 0x4E, 0x47,
                    0x0D, 0x0A, 0x1A, 0x0A
                ])
            );

        case "image/jpeg":
            return (
                buffer[0] === 0xFF &&
                buffer[1] === 0xD8 &&
                buffer[2] === 0xFF
            );

        case "image/gif": {
            const signature = buffer
                .subarray(0, 6)
                .toString("ascii");

            return (
                signature === "GIF87a" ||
                signature === "GIF89a"
            );
        }

        case "image/webp":
            return (
                buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
                buffer.subarray(8, 12).toString("ascii") === "WEBP"
            );

        default:
            return false;
    }
}

/* =========================================
   ASSET TYPE VALIDATION
========================================= */

function getExpectedAssetType(key) {
    if (key === "website-logo") {
        return ASSET_TYPES.LOGO;
    }

    if (/^hero-slide-[1-5]$/.test(key)) {
        return ASSET_TYPES.HERO;
    }

    if (/^category-[a-z0-9-]+$/.test(key)) {
        return ASSET_TYPES.CATEGORY;
    }

    return null;
}

/* =========================================
   GRIDFS IMAGE UPLOAD
========================================= */

function saveImage(file, key, type) {
    return new Promise((resolve, reject) => {
        const bucket = getBucket();

        const filename = `${key}-${Date.now()}`;

        const uploadStream = bucket.openUploadStream(
            filename,
            {
                contentType: file.mimetype,

                metadata: {
                    key,
                    type,
                    originalName: file.originalname
                }
            }
        );

        uploadStream.on("error", reject);

        uploadStream.on("finish", () => {
            resolve(uploadStream.id);
        });

        uploadStream.end(file.buffer);
    });
}

/* =========================================
   GRIDFS IMAGE DELETION
========================================= */

async function deleteImage(fileId) {
    if (!fileId) return;

    const bucket = getBucket();

    const objectId = fileId instanceof ObjectId
        ? fileId
        : new ObjectId(String(fileId));

    await bucket.delete(objectId);
}

/* =========================================
   FORMAT ASSET RESPONSE

   PUBLIC:
   /api/site-assets/image/:fileId

   ADMIN:
   /api/site-assets/admin/image/:fileId
========================================= */

function formatAsset(asset, isAdmin = false) {
    if (!asset) return null;

    const fileId = asset.fileId
        ? asset.fileId.toString()
        : "";

    let imageUrl = "";

    if (fileId) {
        imageUrl = isAdmin
            ? `/api/site-assets/admin/image/${fileId}`
            : `/api/site-assets/image/${fileId}`;
    }

    return {
        key: asset.key,
        type: asset.type,

        url: imageUrl,

        altText: asset.altText || "",
        heading: asset.heading || "",
        description: asset.description || "",
        ctaText: asset.ctaText || "",
        ctaLink: asset.ctaLink || "",

        order: Number(asset.order || 0),

        isActive: asset.isActive !== false,

        updatedAt: asset.updatedAt || asset.createdAt || null
    };
}

/* =========================================
   STREAM GRIDFS IMAGE

   Admin requests can retrieve inactive assets.
   Public requests can retrieve active assets only.
========================================= */

async function streamGridFSImage(req, res, isAdmin = false) {
    try {
        const { fileId } = req.params;

        if (
            typeof fileId !== "string" ||
            !/^[a-f\d]{24}$/i.test(fileId) ||
            !ObjectId.isValid(fileId)
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid image identifier."
            });
        }

        const objectId = new ObjectId(fileId);

        const query = {
            fileId: objectId
        };

        if (!isAdmin) {
            query.isActive = true;
        }

        const asset = await SiteAsset.findOne(query).lean();

        if (!asset) {
            return res.status(404).json({
                success: false,
                message: "Website image not found."
            });
        }

        if (!ALLOWED_MIME_TYPES.includes(asset.contentType)) {
            return res.status(415).json({
                success: false,
                message: "Unsupported website image type."
            });
        }

        const bucket = getBucket();

        res.setHeader(
            "Content-Type",
            asset.contentType
        );

        res.setHeader(
            "X-Content-Type-Options",
            "nosniff"
        );

        res.setHeader(
            "Content-Security-Policy",
            "default-src 'none'; sandbox"
        );

        res.setHeader(
            "Cache-Control",
            isAdmin
                ? "private, no-store"
                : "public, max-age=3600"
        );

        const downloadStream = bucket.openDownloadStream(objectId);

        downloadStream.on("error", error => {
            console.error(
                "GridFS image retrieval failed:",
                error
            );

            if (!res.headersSent) {
                res.status(404).json({
                    success: false,
                    message: "Image file could not be found."
                });
            } else {
                res.destroy(error);
            }
        });

        downloadStream.pipe(res);

    } catch (error) {
        console.error(
            "Website image serving failed:",
            error
        );

        if (!res.headersSent) {
            return res.status(500).json({
                success: false,
                message: "Could not retrieve website image."
            });
        }

        res.destroy(error);
    }
}

/* =========================================
   PUBLIC ASSET LIST

   Returns active assets only.
========================================= */

router.get("/", async (req, res) => {
    try {
        const assets = await SiteAsset.find({
            isActive: true,
            fileId: { $ne: null }
        })
            .sort({
                type: 1,
                order: 1
            })
            .lean();

        const formattedAssets = {};

        assets.forEach(asset => {
            formattedAssets[asset.key] = formatAsset(asset, false);
        });

        return res.status(200).json({
            success: true,
            assets: formattedAssets
        });

    } catch (error) {
        console.error(
            "Public website asset retrieval failed:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Could not load website images."
        });
    }
});

/* =========================================
   ADMIN ASSET LIST

   Returns active AND inactive assets.

   Protected by requireAdmin.
========================================= */

router.get(
    "/admin/list",
    requireAdmin,
    async (req, res) => {
        try {
            const assets = await SiteAsset.find({})
                .sort({
                    type: 1,
                    order: 1
                })
                .lean();

            return res.status(200).json({
                success: true,
                assets: assets.map(asset =>
                    formatAsset(asset, true)
                )
            });

        } catch (error) {
            console.error(
                "Admin website asset retrieval failed:",
                error
            );

            return res.status(500).json({
                success: false,
                message: "Could not load admin website images."
            });
        }
    }
);

/* =========================================
   PUBLIC IMAGE ENDPOINT

   Only active images can be accessed.
========================================= */

router.get(
    "/image/:fileId",
    async (req, res) => {
        return streamGridFSImage(req, res, false);
    }
);

/* =========================================
   PROTECTED ADMIN IMAGE ENDPOINT

   Allows the admin manager to preview active
   and inactive images.

   The frontend must send the Bearer token
   using fetch() and display the returned blob.
========================================= */

router.get(
    "/admin/image/:fileId",
    requireAdmin,
    async (req, res) => {
        return streamGridFSImage(req, res, true);
    }
);

/* =========================================
   UPLOAD OR REPLACE WEBSITE IMAGE
========================================= */

router.post(
    "/",
    requireAdmin,
    upload.single("image"),
    async (req, res) => {
        let newFileId = null;
        let databaseUpdated = false;

        try {
            const {
                key,
                type,
                altText
            } = req.body;

            if (!isValidAssetKey(key)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid website image key."
                });
            }

            const expectedType = getExpectedAssetType(key);

            if (!expectedType) {
                return res.status(400).json({
                    success: false,
                    message: "Unsupported website image key."
                });
            }

            if (type !== expectedType) {
                return res.status(400).json({
                    success: false,
                    message: "The supplied image type does not match the image key."
                });
            }

            if (!req.file) {
                return res.status(400).json({
                    success: false,
                    message: "Please select an image to upload."
                });
            }

            if (!isValidImageBuffer(
                req.file.buffer,
                req.file.mimetype
            )) {
                return res.status(400).json({
                    success: false,
                    message: "The uploaded file is not a valid image of the selected type."
                });
            }

            const existingAsset = await SiteAsset.findOne({
                key
            });

            /* Save the new image to GridFS first. */

            newFileId = await saveImage(
                req.file,
                key,
                type
            );

            const update = {
                key,
                type,

                fileId: newFileId,

                filename: req.file.originalname,

                contentType: req.file.mimetype,

                fileSize: req.file.size,

                altText: String(altText || "").trim(),

                isActive: true,

                updatedAt: new Date()
            };

            const updatedAsset = await SiteAsset.findOneAndUpdate(
                { key },
                {
                    $set: update,

                    $setOnInsert: {
                        createdAt: new Date(),
                        order: 0
                    }
                },
                {
                    new: true,
                    upsert: true,
                    runValidators: true,
                    setDefaultsOnInsert: true
                }
            );

            databaseUpdated = true;

            /*
                Delete the old GridFS image only after
                the database successfully references
                the new image.
            */

            if (
                existingAsset?.fileId &&
                existingAsset.fileId.toString() !== newFileId.toString()
            ) {
                try {
                    await deleteImage(existingAsset.fileId);
                } catch (cleanupError) {
                    console.error(
                        "Old GridFS image cleanup failed:",
                        cleanupError
                    );
                }
            }

            return res.status(200).json({
                success: true,
                message: "Website image uploaded successfully.",

                asset: formatAsset(updatedAsset, true)
            });

        } catch (error) {
            console.error(
                "Website image upload failed:",
                error
            );

            /*
                Only remove the new file if the database
                update did not succeed.
            */

            if (newFileId && !databaseUpdated) {
                try {
                    await deleteImage(newFileId);
                } catch (cleanupError) {
                    console.error(
                        "Failed to clean up incomplete GridFS upload:",
                        cleanupError
                    );
                }
            }

            return res.status(500).json({
                success: false,
                message: "Could not upload website image."
            });
        }
    }
);

/* =========================================
   REORDER HERO SLIDES

   Must appear before PATCH /:key.
========================================= */

router.patch(
    "/reorder",
    requireAdmin,
    async (req, res) => {
        try {
            const items = req.body.items;

            if (!Array.isArray(items)) {
                return res.status(400).json({
                    success: false,
                    message: "Provide an items array containing slide keys and order values."
                });
            }

            const validItems = [];
            const seenKeys = new Set();

            for (const item of items) {
                if (
                    !item ||
                    !isValidAssetKey(item.key) ||
                    !/^hero-slide-[1-5]$/.test(item.key)
                ) {
                    return res.status(400).json({
                        success: false,
                        message: "One or more hero slide keys are invalid."
                    });
                }

                if (seenKeys.has(item.key)) {
                    return res.status(400).json({
                        success: false,
                        message: "Duplicate hero slide keys are not allowed."
                    });
                }

                seenKeys.add(item.key);

                const order = Number(item.order);

                if (!Number.isInteger(order) || order < 0) {
                    return res.status(400).json({
                        success: false,
                        message: "Hero slide order values must be non-negative integers."
                    });
                }

                validItems.push({
                    key: item.key,
                    order
                });
            }

            const operations = validItems.map(item => ({
                updateOne: {
                    filter: {
                        key: item.key,
                        type: ASSET_TYPES.HERO
                    },

                    update: {
                        $set: {
                            order: item.order,
                            updatedAt: new Date()
                        }
                    }
                }
            }));

            if (operations.length) {
                await SiteAsset.bulkWrite(operations);
            }

            return res.status(200).json({
                success: true,
                message: "Hero slide order updated."
            });

        } catch (error) {
            console.error(
                "Hero slide reordering failed:",
                error
            );

            return res.status(500).json({
                success: false,
                message: "Could not reorder hero slides."
            });
        }
    }
);

/* =========================================
   UPDATE HERO SLIDE DETAILS
========================================= */

router.patch(
    "/:key",
    requireAdmin,
    async (req, res) => {
        try {
            const { key } = req.params;

            if (!isValidAssetKey(key)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid website image key."
                });
            }

            const asset = await SiteAsset.findOne({
                key,
                type: ASSET_TYPES.HERO
            });

            if (!asset) {
                return res.status(404).json({
                    success: false,
                    message: "Hero slide not found."
                });
            }

            const allowedFields = [
                "heading",
                "description",
                "ctaText",
                "ctaLink",
                "altText"
            ];

            allowedFields.forEach(field => {
                if (Object.hasOwn(req.body, field)) {
                    asset[field] = String(
                        req.body[field] ?? ""
                    ).trim();
                }
            });

            if (Object.hasOwn(req.body, "order")) {
                const order = Number(req.body.order);

                if (!Number.isInteger(order) || order < 0) {
                    return res.status(400).json({
                        success: false,
                        message: "Order must be a non-negative integer."
                    });
                }

                asset.order = order;
            }

            if (Object.hasOwn(req.body, "isActive")) {
                if (typeof req.body.isActive !== "boolean") {
                    return res.status(400).json({
                        success: false,
                        message: "isActive must be true or false."
                    });
                }

                asset.isActive = req.body.isActive;
            }

            asset.updatedAt = new Date();

            await asset.save();

            return res.status(200).json({
                success: true,
                message: "Hero slide updated successfully.",

                asset: formatAsset(asset, true)
            });

        } catch (error) {
            console.error(
                "Hero slide update failed:",
                error
            );

            return res.status(500).json({
                success: false,
                message: "Could not update hero slide."
            });
        }
    }
);

/* =========================================
   DELETE WEBSITE IMAGE

   Removes the replacement and its metadata.
========================================= */

router.delete(
    "/:key",
    requireAdmin,
    async (req, res) => {
        try {
            const { key } = req.params;

            if (!isValidAssetKey(key)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid website image key."
                });
            }

            const asset = await SiteAsset.findOne({
                key
            });

            if (!asset) {
                return res.status(404).json({
                    success: false,
                    message: "Website image replacement was not found."
                });
            }

            await SiteAsset.deleteOne({
                _id: asset._id
            });

            if (asset.fileId) {
                try {
                    await deleteImage(asset.fileId);
                } catch (cleanupError) {
                    console.error(
                        "GridFS image deletion failed:",
                        cleanupError
                    );
                }
            }

            return res.status(200).json({
                success: true,
                message: "Website image replacement removed successfully."
            });

        } catch (error) {
            console.error(
                "Website image deletion failed:",
                error
            );

            return res.status(500).json({
                success: false,
                message: "Could not remove website image."
            });
        }
    }
);

/* =========================================
   MULTER AND UPLOAD ERROR HANDLER
========================================= */

router.use((error, req, res, next) => {
    if (res.headersSent) {
        return next(error);
    }

    if (error instanceof multer.MulterError) {
        if (error.code === "LIMIT_FILE_SIZE") {
            return res.status(413).json({
                success: false,
                message: "The image must be 5 MB or smaller."
            });
        }

        return res.status(400).json({
            success: false,
            message: error.message
        });
    }

    if (error) {
        console.error(
            "Website asset route error:",
            error
        );

        return res.status(400).json({
            success: false,
            message: error.message ||
                "Website image request failed."
        });
    }

    next();
});

module.exports = router;
