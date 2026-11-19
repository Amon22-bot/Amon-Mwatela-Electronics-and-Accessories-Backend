/* =========================================================
   AM ELECTRONICS AND ACCESSORIES
   WEBSITE ASSET DATABASE MODEL
   File: Models/SiteAsset.js

   Manages:
   1. Website logo
   2. Homepage hero slides
   3. Homepage category-circle images

   Image files are stored separately using MongoDB GridFS.
   This model stores their metadata and management settings.
========================================================= */

const mongoose = require('mongoose');


/* =========================================================
   1. ASSET TYPES
========================================================= */

const ASSET_TYPES = [
    'logo',
    'hero',
    'category',
    'collection'
];


/* =========================================================
   2. WEBSITE ASSET SCHEMA
========================================================= */

const SiteAssetSchema = new mongoose.Schema({

    // UNIQUE ASSET IDENTIFIER
    // Examples:
    // website-logo
    // hero-slide-1
    // category-gaming

    key: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        index: true
    },


    // ASSET TYPE

    type: {
        type: String,
        required: true,
        enum: ASSET_TYPES,
        index: true
    },


    // IMAGE FILE INFORMATION
    // Actual image is stored in MongoDB GridFS.

    fileId: {
        type: mongoose.Schema.Types.ObjectId,
        default: null
    },

    filename: {
        type: String,
        trim: true,
        default: ''
    },

    contentType: {
        type: String,
        trim: true,
        default: ''
    },

    fileSize: {
        type: Number,
        default: 0,
        min: 0
    },


    // ACCESSIBLE IMAGE DESCRIPTION

    altText: {
        type: String,
        trim: true,
        maxlength: 250,
        default: ''
    },


    // HERO SLIDE CONTENT
    // These fields are also available for future expansion.

    heading: {
        type: String,
        trim: true,
        maxlength: 150,
        default: ''
    },

    description: {
        type: String,
        trim: true,
        maxlength: 500,
        default: ''
    },

    ctaText: {
        type: String,
        trim: true,
        maxlength: 50,
        default: ''
    },

    ctaLink: {
        type: String,
        trim: true,
        maxlength: 500,
        default: ''
    },


    // DISPLAY ORDER
    // Lower numbers appear first.

    order: {
        type: Number,
        default: 0
    },


    // PUBLICATION STATUS

    isActive: {
        type: Boolean,
        default: true,
        index: true
    },


    // CREATION AND UPDATE DATES

    createdAt: {
        type: Date,
        default: Date.now
    },

    updatedAt: {
        type: Date,
        default: Date.now
    }

});


/* =========================================================
   3. UPDATE TIMESTAMP
========================================================= */

SiteAssetSchema.pre('save', function () {

    this.updatedAt = new Date();

});


/* =========================================================
   4. DATABASE INDEXES
========================================================= */

SiteAssetSchema.index({
    type: 1,
    isActive: 1,
    order: 1
});


/* =========================================================
   5. EXPORT MODEL
========================================================= */

module.exports =
    mongoose.models.SiteAsset ||
    mongoose.model('SiteAsset', SiteAssetSchema);
