/**
 * Geocoding Service - Location processing and address conversion
 * 
 * Supports multiple geocoding providers:
 * - Google Maps (primary, requires API key)
 * - OpenCage (fallback, requires API key)
 * - Coordinate formatting (fallback if no API keys)
 */

const { Client } = require('@googlemaps/google-maps-services-js');
const https = require('https');

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
const OPENCAGE_API_KEY = process.env.OPENCAGE_API_KEY;

// Cache for geocoding results to reduce API calls
const geocodeCache = new Map();
const CACHE_DURATION = 1000 * 60 * 60 * 24; // 24 hours

/**
 * Convert coordinates to formatted address using reverse geocoding
 * @param {number} latitude - GPS latitude
 * @param {number} longitude - GPS longitude
 * @param {string} provider - 'google' or 'opencage' (optional, will try both)
 * @returns {Promise<object>} Formatted address data
 */
async function reverseGeocode(latitude, longitude, provider = null) {
  try {
    // Validate coordinates first
    if (!validateCoordinates(latitude, longitude)) {
      throw new Error(`Invalid coordinates: ${latitude}, ${longitude}`);
    }

    // Check cache first
    const cacheKey = `${latitude.toFixed(6)},${longitude.toFixed(6)}`;
    const cached = geocodeCache.get(cacheKey);
    
    if (cached && (Date.now() - cached.timestamp < CACHE_DURATION)) {
      console.log(`📍 Using cached geocoding result for ${cacheKey}`);
      return cached.data;
    }

    console.log(`📍 Reverse geocoding: ${latitude}, ${longitude}`);

    let result = null;

    // Try specified provider or fallback through available providers
    if (!provider || provider === 'google') {
      if (GOOGLE_MAPS_API_KEY) {
        try {
          result = await reverseGeocodeGoogle(latitude, longitude);
        } catch (googleError) {
          console.error('Google Maps geocoding failed:', googleError.message);
          // Continue to try next provider
        }
      }
    }

    if (!result && (!provider || provider === 'opencage')) {
      if (OPENCAGE_API_KEY) {
        try {
          result = await reverseGeocodeOpenCage(latitude, longitude);
        } catch (opencageError) {
          console.error('OpenCage geocoding failed:', opencageError.message);
          // Continue to fallback
        }
      }
    }

    // Fallback: just return formatted coordinates
    if (!result) {
      console.warn('⚠️  No geocoding API available, using coordinate format only');
      result = {
        formatted_address: formatCoordinates(latitude, longitude),
        street_number: null,
        street_name: null,
        neighborhood: null,
        city: null,
        state: null,
        country: null,
        postal_code: null,
        coordinates: { latitude, longitude },
        coordinates_string: formatCoordinates(latitude, longitude),
        provider: 'fallback'
      };
    }

    // Cache the result
    geocodeCache.set(cacheKey, {
      data: result,
      timestamp: Date.now()
    });

    return result;
  } catch (error) {
    console.error('Reverse geocoding error:', error);
    
    // Return basic coordinate information as fallback
    return {
      formatted_address: formatCoordinates(latitude, longitude),
      street_number: null,
      street_name: null,
      neighborhood: null,
      city: null,
      state: null,
      country: null,
      postal_code: null,
      coordinates: { latitude, longitude },
      coordinates_string: formatCoordinates(latitude, longitude),
      error: error.message,
      provider: 'error_fallback'
    };
  }
}

/**
 * Reverse geocode using Google Maps API
 * @param {number} latitude - GPS latitude
 * @param {number} longitude - GPS longitude
 * @returns {Promise<object>} Structured address data
 */
async function reverseGeocodeGoogle(latitude, longitude) {
  const client = new Client({});

  const response = await client.reverseGeocode({
    params: {
      latlng: { lat: latitude, lng: longitude },
      key: GOOGLE_MAPS_API_KEY,
      language: 'es', // Spanish for Mexico
    },
    timeout: 5000,
  });

  if (!response.data.results || response.data.results.length === 0) {
    throw new Error('No results from Google Maps');
  }

  const result = response.data.results[0];
  const components = result.address_components;

  // Parse address components
  const addressData = {
    formatted_address: result.formatted_address,
    street_number: getAddressComponent(components, 'street_number'),
    street_name: getAddressComponent(components, 'route'),
    neighborhood: getAddressComponent(components, 'neighborhood') || 
                  getAddressComponent(components, 'sublocality'),
    city: getAddressComponent(components, 'locality') || 
          getAddressComponent(components, 'administrative_area_level_2'),
    state: getAddressComponent(components, 'administrative_area_level_1', 'short_name'),
    country: getAddressComponent(components, 'country'),
    postal_code: getAddressComponent(components, 'postal_code'),
    coordinates: { latitude, longitude },
    coordinates_string: formatCoordinates(latitude, longitude),
    provider: 'google'
  };

  console.log(`✅ Google Maps geocoded: ${addressData.formatted_address}`);
  return addressData;
}

/**
 * Reverse geocode using OpenCage API
 * @param {number} latitude - GPS latitude
 * @param {number} longitude - GPS longitude
 * @returns {Promise<object>} Structured address data
 */
function reverseGeocodeOpenCage(latitude, longitude) {
  return new Promise((resolve, reject) => {
    const url = `https://api.opencagedata.com/geocode/v1/json?q=${latitude}+${longitude}&key=${OPENCAGE_API_KEY}&language=es&pretty=1`;

    https.get(url, (response) => {
      let data = '';

      response.on('data', (chunk) => {
        data += chunk;
      });

      response.on('end', () => {
        try {
          const result = JSON.parse(data);

          if (!result.results || result.results.length === 0) {
            reject(new Error('No results from OpenCage'));
            return;
          }

          const location = result.results[0];
          const comp = location.components;

          const addressData = {
            formatted_address: location.formatted,
            street_number: comp.house_number || null,
            street_name: comp.road || comp.street || null,
            neighborhood: comp.neighbourhood || comp.suburb || null,
            city: comp.city || comp.town || comp.village || null,
            state: comp.state || comp.state_code || null,
            country: comp.country || null,
            postal_code: comp.postcode || null,
            coordinates: { latitude, longitude },
            coordinates_string: formatCoordinates(latitude, longitude),
            provider: 'opencage'
          };

          console.log(`✅ OpenCage geocoded: ${addressData.formatted_address}`);
          resolve(addressData);
        } catch (parseError) {
          reject(parseError);
        }
      });
    }).on('error', (error) => {
      reject(error);
    });
  });
}

/**
 * Extract specific address component from Google Maps response
 * @param {array} components - Address components array
 * @param {string} type - Component type to extract
 * @param {string} nameType - 'long_name' or 'short_name'
 * @returns {string|null} Component value
 */
function getAddressComponent(components, type, nameType = 'long_name') {
  const component = components.find(c => c.types.includes(type));
  return component ? component[nameType] : null;
}

/**
 * Validate GPS coordinates
 * @param {number} latitude - GPS latitude
 * @param {number} longitude - GPS longitude
 * @returns {boolean} True if coordinates are valid
 */
function validateCoordinates(latitude, longitude) {
  // TODO: Implement coordinate validation
  // Check if latitude is between -90 and 90
  // Check if longitude is between -180 and 180
  // Return boolean result
  
  return (
    typeof latitude === 'number' &&
    typeof longitude === 'number' &&
    latitude >= -90 && latitude <= 90 &&
    longitude >= -180 && longitude <= 180
  );
}

/**
 * Format coordinates for display
 * @param {number} latitude - GPS latitude
 * @param {number} longitude - GPS longitude
 * @returns {string} Formatted coordinate string
 */
function formatCoordinates(latitude, longitude) {
  // TODO: Format coordinates for user-friendly display
  // Example: "23°33'01.9"S 46°38'00.3"W"
  
  if (!validateCoordinates(latitude, longitude)) {
    return 'Coordenadas inválidas';
  }
  
  return `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
}

/**
 * Calculate distance between two points using Haversine formula
 * @param {number} lat1 - First point latitude
 * @param {number} lon1 - First point longitude
 * @param {number} lat2 - Second point latitude
 * @param {number} lon2 - Second point longitude
 * @returns {number} Distance in kilometers
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in kilometers
  
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  
  return distance;
}

/**
 * Convert degrees to radians
 * @param {number} degrees - Degrees to convert
 * @returns {number} Radians
 */
function toRadians(degrees) {
  return degrees * (Math.PI / 180);
}

/**
 * Clear geocoding cache
 */
function clearCache() {
  geocodeCache.clear();
  console.log('🗑️  Geocoding cache cleared');
}

/**
 * Get cache statistics
 * @returns {object} Cache stats
 */
function getCacheStats() {
  return {
    size: geocodeCache.size,
    entries: Array.from(geocodeCache.keys())
  };
}

module.exports = {
  reverseGeocode,
  validateCoordinates,
  formatCoordinates,
  calculateDistance,
  clearCache,
  getCacheStats,
};