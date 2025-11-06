/**
 * Cloudinary Service - Generic upload service for various purposes
 * 
 * This service provides flexible Cloudinary integration with folder-based organization
 * Supports: ticket images, user avatars, documents, and general uploads
 */

const cloudinary = require('cloudinary').v2;
const https = require('https');
const fs = require('fs');
const path = require('path');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

/**
 * Cloudinary folder structure for organization
 * This keeps all uploads organized by purpose
 */
const CLOUDINARY_FOLDERS = {
  TICKETS: 'whatsapp-bot/tickets',
  AVATARS: 'whatsapp-bot/avatars',
  DOCUMENTS: 'whatsapp-bot/documents',
  TEMPORARY: 'whatsapp-bot/temp',
  GENERAL: 'whatsapp-bot/general'
};

/**
 * Generic upload function to Cloudinary
 * @param {string|Buffer} source - File path, URL, or Buffer to upload
 * @param {object} options - Upload options
 * @param {string} options.folder - Cloudinary folder (use CLOUDINARY_FOLDERS constants)
 * @param {string} options.subfolder - Optional subfolder (e.g., userId, ticketId)
 * @param {string} options.filename - Optional custom filename (without extension)
 * @param {string} options.resourceType - Resource type: 'image', 'video', 'raw', 'auto' (default: 'auto')
 * @param {object} options.transformation - Optional transformation settings
 * @param {boolean} options.overwrite - Whether to overwrite existing files (default: false)
 * @param {string[]} options.tags - Optional tags for the upload
 * @returns {Promise<object>} - Cloudinary upload result with secure_url, public_id, etc.
 */
async function uploadToCloudinary(source, options = {}) {
  try {
    const {
      folder = CLOUDINARY_FOLDERS.GENERAL,
      subfolder = null,
      filename = null,
      resourceType = 'auto',
      transformation = null,
      overwrite = false,
      tags = []
    } = options;

    // Build the full folder path
    const fullFolder = subfolder ? `${folder}/${subfolder}` : folder;

    // Build upload options
    const uploadOptions = {
      folder: fullFolder,
      resource_type: resourceType,
      overwrite: overwrite,
      tags: tags,
      use_filename: filename ? false : true,
      unique_filename: filename ? false : true
    };

    // Add custom filename if provided
    if (filename) {
      uploadOptions.public_id = `${fullFolder}/${filename}`;
    }

    // Add transformation if provided
    if (transformation) {
      uploadOptions.transformation = transformation;
    }

    console.log(`📤 Uploading to Cloudinary folder: ${fullFolder}`);

    // Upload to Cloudinary
    const result = await cloudinary.uploader.upload(source, uploadOptions);

    console.log(`✅ Upload successful: ${result.secure_url}`);
    console.log(`   - Public ID: ${result.public_id}`);
    console.log(`   - Format: ${result.format}`);
    console.log(`   - Size: ${(result.bytes / 1024).toFixed(2)} KB`);

    return {
      url: result.secure_url,
      publicId: result.public_id,
      format: result.format,
      width: result.width,
      height: result.height,
      bytes: result.bytes,
      resourceType: result.resource_type,
      createdAt: result.created_at
    };
  } catch (error) {
    console.error('❌ Cloudinary upload error:', error.message);
    throw new Error(`Failed to upload to Cloudinary: ${error.message}`);
  }
}

/**
 * Upload image from WhatsApp for ticket attachments
 * @param {string} whatsappMediaUrl - WhatsApp media URL (requires auth header)
 * @param {string} userId - User phone number (for folder organization)
 * @param {string} whatsappToken - WhatsApp API token for downloading media
 * @param {string} ticketId - Optional ticket ID for subfolder organization
 * @returns {Promise<object>} - Upload result with Cloudinary URL
 */
async function uploadTicketImage(whatsappMediaUrl, userId, whatsappToken, ticketId = null) {
  let tempFilePath = null;

  try {
    console.log(`🎫 Processing ticket image for user ${userId}`);

    // Download image from WhatsApp to temp file
    tempFilePath = await downloadMediaToTemp(whatsappMediaUrl, whatsappToken);

    // Create subfolder structure: userId/ticketId (if provided)
    const subfolder = ticketId ? `${userId}/${ticketId}` : userId;

    // Upload to Cloudinary with optimization
    const result = await uploadToCloudinary(tempFilePath, {
      folder: CLOUDINARY_FOLDERS.TICKETS,
      subfolder: subfolder,
      resourceType: 'image',
      tags: ['ticket', 'whatsapp', userId, ticketId].filter(Boolean),
      transformation: {
        quality: 'auto:good',
        fetch_format: 'auto'
      }
    });

    return result;
  } catch (error) {
    console.error('Error uploading ticket image:', error);
    throw error;
  } finally {
    // Clean up temp file
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
      console.log(`🗑️  Deleted temp file: ${tempFilePath}`);
    }
  }
}

/**
 * Upload user avatar image
 * @param {string} imageSource - Image URL, file path, or Buffer
 * @param {string} userId - User ID (phone number)
 * @param {string} whatsappToken - Optional WhatsApp token if source is WhatsApp URL
 * @returns {Promise<object>} - Upload result with Cloudinary URL
 */
async function uploadUserAvatar(imageSource, userId, whatsappToken = null) {
  let tempFilePath = null;

  try {
    console.log(`👤 Processing avatar for user ${userId}`);

    // If it's a WhatsApp URL, download it first
    let source = imageSource;
    if (typeof imageSource === 'string' && imageSource.includes('whatsapp') && whatsappToken) {
      tempFilePath = await downloadMediaToTemp(imageSource, whatsappToken);
      source = tempFilePath;
    }

    // Upload with avatar-specific settings
    const result = await uploadToCloudinary(source, {
      folder: CLOUDINARY_FOLDERS.AVATARS,
      filename: userId, // Use userId as filename for easy retrieval
      resourceType: 'image',
      overwrite: true, // Allow updating avatar
      tags: ['avatar', 'user', userId],
      transformation: {
        width: 500,
        height: 500,
        crop: 'fill',
        gravity: 'face',
        quality: 'auto:good',
        fetch_format: 'auto'
      }
    });

    return result;
  } catch (error) {
    console.error('Error uploading user avatar:', error);
    throw error;
  } finally {
    // Clean up temp file if created
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }
  }
}

/**
 * Upload document or file
 * @param {string} whatsappMediaUrl - WhatsApp media URL
 * @param {string} userId - User phone number
 * @param {string} whatsappToken - WhatsApp API token
 * @param {string} documentType - Type of document (e.g., 'invoice', 'contract', 'pdf')
 * @returns {Promise<object>} - Upload result
 */
async function uploadDocument(whatsappMediaUrl, userId, whatsappToken, documentType = 'general') {
  let tempFilePath = null;

  try {
    console.log(`📄 Processing document for user ${userId}`);

    // Download document from WhatsApp
    tempFilePath = await downloadMediaToTemp(whatsappMediaUrl, whatsappToken);

    // Upload as raw resource (preserves original format)
    const result = await uploadToCloudinary(tempFilePath, {
      folder: CLOUDINARY_FOLDERS.DOCUMENTS,
      subfolder: `${userId}/${documentType}`,
      resourceType: 'raw',
      tags: ['document', documentType, userId]
    });

    return result;
  } catch (error) {
    console.error('Error uploading document:', error);
    throw error;
  } finally {
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }
  }
}

/**
 * Delete file from Cloudinary
 * @param {string} publicId - The public_id of the resource to delete
 * @param {string} resourceType - Resource type: 'image', 'video', 'raw' (default: 'image')
 * @returns {Promise<object>} - Deletion result
 */
async function deleteFromCloudinary(publicId, resourceType = 'image') {
  try {
    console.log(`🗑️  Deleting from Cloudinary: ${publicId}`);
    
    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType
    });

    console.log(`✅ Deletion result: ${result.result}`);
    return result;
  } catch (error) {
    console.error('Error deleting from Cloudinary:', error);
    throw error;
  }
}

/**
 * Get optimized URL with transformations
 * @param {string} publicId - Cloudinary public_id
 * @param {object} options - Transformation options
 * @returns {string} - Transformed image URL
 */
function getOptimizedUrl(publicId, options = {}) {
  const {
    width = null,
    height = null,
    quality = 'auto:good',
    format = 'auto'
  } = options;

  const transformation = {
    quality: quality,
    fetch_format: format
  };

  if (width) transformation.width = width;
  if (height) transformation.height = height;

  return cloudinary.url(publicId, { transformation });
}

/**
 * Download media from WhatsApp to temporary file
 * @param {string} mediaUrl - WhatsApp media URL
 * @param {string} token - WhatsApp API token
 * @returns {Promise<string>} - Path to temporary file
 */
function downloadMediaToTemp(mediaUrl, token) {
  return new Promise((resolve, reject) => {
    const tempDir = path.join(__dirname, '../../uploads');
    
    // Ensure temp directory exists
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const tempFileName = `temp_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const tempFilePath = path.join(tempDir, tempFileName);

    console.log(`⬇️  Downloading media from WhatsApp to: ${tempFilePath}`);

    const options = {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    };

    https.get(mediaUrl, options, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download media: ${response.statusCode}`));
        return;
      }

      const fileStream = fs.createWriteStream(tempFilePath);
      
      response.pipe(fileStream);

      fileStream.on('finish', () => {
        fileStream.close();
        console.log(`✅ Media downloaded successfully`);
        resolve(tempFilePath);
      });

      fileStream.on('error', (error) => {
        fs.unlinkSync(tempFilePath);
        reject(error);
      });
    }).on('error', (error) => {
      reject(error);
    });
  });
}

// Legacy function names for backward compatibility
async function uploadImageFromWhatsApp(whatsappImageUrl, userId, ticketId = null) {
  const token = process.env.WHATSAPP_API_TOKEN;
  return uploadTicketImage(whatsappImageUrl, userId, token, ticketId);
}

async function deleteImage(publicId) {
  return deleteFromCloudinary(publicId, 'image');
}

async function getImageInfo(publicId) {
  try {
    const result = await cloudinary.api.resource(publicId);
    return result;
  } catch (error) {
    console.error('Error getting image info:', error);
    throw error;
  }
}

module.exports = {
  // Constants
  CLOUDINARY_FOLDERS,
  
  // Generic functions
  uploadToCloudinary,
  deleteFromCloudinary,
  getOptimizedUrl,
  
  // Specific use cases
  uploadTicketImage,
  uploadUserAvatar,
  uploadDocument,
  
  // Utility
  downloadMediaToTemp,
  
  // Legacy compatibility
  uploadImageFromWhatsApp,
  deleteImage,
  getImageInfo,
};