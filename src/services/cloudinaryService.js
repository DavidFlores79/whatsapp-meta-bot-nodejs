/**
 * Cloudinary Service - PLACEHOLDER FOR FUTURE IMPLEMENTATION
 * 
 * TODO: Implement image upload functionality
 * This service will handle image uploads from WhatsApp to Cloudinary
 */

// const cloudinary = require('cloudinary').v2;

// TODO: Configure Cloudinary
// cloudinary.config({
//   cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
//   api_key: process.env.CLOUDINARY_API_KEY,
//   api_secret: process.env.CLOUDINARY_API_SECRET
// });

/**
 * Upload image from WhatsApp URL to Cloudinary
 * @param {string} whatsappImageUrl - The WhatsApp image download URL
 * @param {string} userId - User's phone number for folder organization
 * @param {string} ticketId - Optional ticket ID for file naming
 * @returns {Promise<string>} Cloudinary public URL
 */
async function uploadImageFromWhatsApp(whatsappImageUrl, userId, ticketId = null) {
  // TODO: Implement the following steps:
  // 1. Download image from WhatsApp URL using axios
  // 2. Upload to Cloudinary with proper folder structure
  // 3. Set up image transformations (resize, optimize)
  // 4. Return the public Cloudinary URL
  // 5. Handle errors gracefully
  
  throw new Error('Cloudinary service not implemented yet');
}

/**
 * Delete image from Cloudinary
 * @param {string} publicId - Cloudinary public ID
 * @returns {Promise<boolean>} Success status
 */
async function deleteImage(publicId) {
  // TODO: Implement image deletion
  throw new Error('Image deletion not implemented yet');
}

/**
 * Get image info from Cloudinary
 * @param {string} publicId - Cloudinary public ID
 * @returns {Promise<object>} Image metadata
 */
async function getImageInfo(publicId) {
  // TODO: Implement getting image metadata
  throw new Error('Image info retrieval not implemented yet');
}

module.exports = {
  uploadImageFromWhatsApp,
  deleteImage,
  getImageInfo,
};