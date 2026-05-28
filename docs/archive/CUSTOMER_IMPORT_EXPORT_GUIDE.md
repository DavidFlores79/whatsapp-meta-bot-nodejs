# Customer Import/Export Guide

## Overview

The WhatsApp Bot CRM now supports comprehensive customer data import/export functionality using XLSX, XLS, and CSV file formats. This feature allows you to:

- **Export** customers to Excel/CSV files with full data preservation
- **Import** customers in bulk from Excel/CSV files with validation
- **Download** a template file with instructions and sample data

---

## Features

### ✅ Supported File Formats
- **XLSX** (Excel 2007+) - Recommended
- **XLS** (Excel 97-2003)
- **CSV** (Comma-separated values)

### ✅ Key Capabilities
- Upload files up to **5MB**
- Automatic data validation
- Duplicate detection with optional update
- Detailed import results with row-level error reporting
- Column width optimization for readability
- Multi-sheet template with instructions

---

## API Endpoints

### 1. Download Import Template

**Endpoint:** `GET /api/v2/customers/template`

**Headers:**
```
Authorization: Bearer <your_jwt_token>
```

**Description:** Downloads a pre-formatted XLSX template with three sheets:
- **Instructions**: Field definitions and requirements
- **Sample Data**: Example customers for reference
- **Import Template**: Empty sheet ready for your data

**Example:**
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:5000/api/v2/customers/template \
  --output customer_template.xlsx
```

---

### 2. Export Customers

**Endpoint:** `GET /api/v2/customers/export`

**Headers:**
```
Authorization: Bearer <your_jwt_token>
```

**Query Parameters:**
| Parameter | Type | Description | Example |
|-----------|------|-------------|---------|
| `format` | string | Export format: `xlsx` or `csv` (default: `xlsx`) | `format=csv` |
| `status` | string | Filter by status | `status=active` |
| `segment` | string | Filter by segment | `segment=vip` |
| `tags` | string | Filter by tags (comma-separated) | `tags=premium,vip` |

**Response:** Binary file download (XLSX or CSV)

**Exported Fields:**
- phoneNumber
- firstName, lastName
- email
- status, segment, source
- tags (semicolon-separated)
- alternativePhones (semicolon-separated)
- address fields (street, city, state, country, postalCode)
- notes
- isBlocked, blockReason
- firstContact, lastInteraction, createdAt

**Examples:**

```bash
# Export all customers as XLSX
curl -H "Authorization: Bearer YOUR_TOKEN" \
  "http://localhost:5000/api/v2/customers/export" \
  --output customers.xlsx

# Export active VIP customers as CSV
curl -H "Authorization: Bearer YOUR_TOKEN" \
  "http://localhost:5000/api/v2/customers/export?format=csv&status=active&segment=vip" \
  --output vip_customers.csv

# Export customers with specific tags
curl -H "Authorization: Bearer YOUR_TOKEN" \
  "http://localhost:5000/api/v2/customers/export?tags=premium,gold" \
  --output premium_customers.xlsx
```

---

### 3. Import Customers

**Endpoint:** `POST /api/v2/customers/bulk/import`

**Headers:**
```
Authorization: Bearer <your_jwt_token>
Content-Type: multipart/form-data
```

**Body Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `file` | file | Yes | XLSX, XLS, or CSV file |
| `updateExisting` | boolean | No | Update existing customers (default: false) |

**Response:**
```json
{
  "success": true,
  "message": "Import completed",
  "results": {
    "total": 100,
    "imported": 85,
    "updated": 10,
    "duplicates": 3,
    "failed": 2
  },
  "details": {
    "success": [
      { "row": 2, "phoneNumber": "529991234567", "id": "..." }
    ],
    "updated": [
      { "row": 5, "phoneNumber": "529997654321", "id": "..." }
    ],
    "duplicates": [
      { "row": 12, "phoneNumber": "529991111111", "reason": "Customer already exists" }
    ],
    "failed": [
      { "row": 20, "data": {...}, "reason": "Missing phone number" }
    ]
  }
}
```

**Examples:**

```bash
# Import customers (skip duplicates)
curl -X POST \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@customers.xlsx" \
  http://localhost:5000/api/v2/customers/bulk/import

# Import customers (update existing)
curl -X POST \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@customers.xlsx" \
  -F "updateExisting=true" \
  http://localhost:5000/api/v2/customers/bulk/import
```

**JavaScript Example:**
```javascript
const formData = new FormData();
formData.append('file', fileInput.files[0]);
formData.append('updateExisting', 'true');

fetch('http://localhost:5000/api/v2/customers/bulk/import', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`
  },
  body: formData
})
.then(res => res.json())
.then(data => console.log(data));
```

---

## Field Reference

### Required Fields

| Field | Description | Example |
|-------|-------------|---------|
| `phoneNumber` | Customer phone number with country code | 529991234567 |

### Optional Fields

| Field | Type | Description | Example | Valid Values |
|-------|------|-------------|---------|--------------|
| `firstName` | string | First name | Juan | - |
| `lastName` | string | Last name | Pérez | - |
| `email` | string | Email address | juan@example.com | - |
| `status` | string | Customer status | active | active, inactive, blocked, vip |
| `segment` | string | Customer segment | regular | vip, regular, new, inactive |
| `source` | string | How customer was acquired | whatsapp | whatsapp, referral, website, social_media, other |
| `tags` | string | Tags (semicolon-separated) | vip;premium | - |
| `alternativePhones` | string | Alt phones (semicolon-separated) | 5299912345;5299987654 | - |
| `address_street` | string | Street address | Calle Principal 123 | - |
| `address_city` | string | City | Mérida | - |
| `address_state` | string | State/Province | Yucatán | - |
| `address_country` | string | Country | México | - |
| `address_postalCode` | string | Postal code | 97000 | - |
| `notes` | string | Additional notes | Cliente preferente | - |

### Field Name Variations

The import function supports multiple field name formats:

| Standard Field | Alternative Names Accepted |
|---------------|---------------------------|
| `phoneNumber` | `phone_number`, `phone` |
| `firstName` | `first_name` |
| `lastName` | `last_name` |
| `alternativePhones` | `alternative_phones` |
| `address_postalCode` | `address_postal_code` |

---

## Import Validation Rules

### Phone Number Validation
- **Required**: Yes
- **Format**: String (will be trimmed)
- **Uniqueness**: Checked against existing customers
- **Example**: `529991234567`

### Email Validation
- **Format**: Lowercase conversion applied
- **Example**: `juan.perez@example.com`

### Status Values
Valid options: `active`, `inactive`, `blocked`, `vip`
- Default: `active`

### Segment Values
Valid options: `vip`, `regular`, `new`, `inactive`
- Default: `new`

### Source Values
Valid options: `whatsapp`, `referral`, `website`, `social_media`, `other`
- Default: `whatsapp`

### Tags Format
- Separate multiple tags with semicolons (`;`)
- Example: `vip;premium;gold`
- Will be split into array: `["vip", "premium", "gold"]`

### Alternative Phones Format
- Separate multiple phones with semicolons (`;`)
- Example: `529991234568;529991234569`
- Will be split into array

---

## Common Use Cases

### Use Case 1: Initial CRM Setup
1. Download the template: `GET /api/v2/customers/template`
2. Fill in your customer data in the "Import Template" sheet
3. Upload the file: `POST /api/v2/customers/bulk/import`

### Use Case 2: Data Backup
1. Export all customers: `GET /api/v2/customers/export?format=xlsx`
2. Store the file securely
3. Can be re-imported if needed

### Use Case 3: Update Customer Information
1. Export current customers: `GET /api/v2/customers/export`
2. Make changes in Excel
3. Import with update flag: `POST /api/v2/customers/bulk/import` with `updateExisting=true`

### Use Case 4: Migrate from Another System
1. Export customers from your old system
2. Format data to match our template structure
3. Import using our API

### Use Case 5: Segment-Specific Operations
1. Export VIP customers: `GET /api/v2/customers/export?segment=vip`
2. Make segment-specific updates
3. Re-import with updates

---

## Error Handling

### Import Errors

The import process provides detailed error reporting:

```json
{
  "success": true,
  "results": {
    "failed": 2
  },
  "details": {
    "failed": [
      {
        "row": 15,
        "data": { "firstName": "John", "email": "john@example.com" },
        "reason": "Missing phone number"
      },
      {
        "row": 23,
        "data": { "phoneNumber": "invalid", "firstName": "Jane" },
        "reason": "Validation failed"
      }
    ]
  }
}
```

### Common Error Messages

| Error | Cause | Solution |
|-------|-------|----------|
| "No file uploaded" | File parameter missing | Include `file` in form data |
| "File is empty or invalid format" | Empty file or corrupted | Check file content |
| "Missing phone number" | Required field not provided | Add phoneNumber to row |
| "Customer already exists" | Duplicate phone number | Use `updateExisting=true` or remove duplicate |
| "Only XLSX, XLS, and CSV files are allowed" | Wrong file format | Use supported format |
| "File too large" | Exceeds 5MB limit | Split into smaller files |

---

## Best Practices

### 1. Data Preparation
- ✅ Use the provided template to ensure correct format
- ✅ Include country code in phone numbers (e.g., 52 for Mexico)
- ✅ Use semicolons (`;`) to separate multiple values in tags/phones
- ✅ Clean data before import (remove duplicates, validate emails)

### 2. Large Imports
- ✅ Split files larger than 5MB into smaller batches
- ✅ Import during off-peak hours
- ✅ Review the results after each batch
- ✅ Keep backup of original files

### 3. Data Updates
- ✅ Export before updating to have a backup
- ✅ Use `updateExisting=true` carefully
- ✅ Review duplicates list to identify conflicts
- ✅ Test with small batch first

### 4. Data Security
- ✅ Always use HTTPS in production
- ✅ Include valid JWT token in all requests
- ✅ Don't share exported files containing customer data
- ✅ Delete exported files after use

---

## Testing

### Test the Template Download
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:5000/api/v2/customers/template \
  -o test_template.xlsx
```

### Test Export
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:5000/api/v2/customers/export \
  -o test_export.xlsx
```

### Test Import
1. Use the downloaded template
2. Add test customer data
3. Import the file:
```bash
curl -X POST \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@test_template.xlsx" \
  http://localhost:5000/api/v2/customers/bulk/import
```

---

## Frontend Integration Examples

### React/Angular Component Example

```typescript
// Download template
const downloadTemplate = async () => {
  const response = await fetch('/api/v2/customers/template', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'customer_template.xlsx';
  a.click();
};

// Export customers
const exportCustomers = async (format = 'xlsx') => {
  const response = await fetch(`/api/v2/customers/export?format=${format}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `customers_${Date.now()}.${format}`;
  a.click();
};

// Import customers
const importCustomers = async (file: File, updateExisting = false) => {
  const formData = new FormData();
  formData.append('file', file);
  if (updateExisting) {
    formData.append('updateExisting', 'true');
  }

  const response = await fetch('/api/v2/customers/bulk/import', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: formData
  });

  return await response.json();
};
```

---

## Troubleshooting

### Problem: File Upload Fails
**Solution:** Check file size (max 5MB) and format (XLSX/XLS/CSV only)

### Problem: All Rows Show as Duplicates
**Solution:** Use `updateExisting=true` if you want to update existing customers

### Problem: Import Succeeds but Data Missing
**Solution:** Check field names match template exactly (case-sensitive for some fields)

### Problem: Special Characters Display Incorrectly
**Solution:** Ensure file is saved with UTF-8 encoding

### Problem: Export Downloads Empty File
**Solution:** Check filters - you may have no customers matching the criteria

---

## Support

For issues or questions:
1. Check this documentation
2. Review error messages in the API response
3. Check server logs for detailed error information
4. Contact development team

---

## Changelog

### Version 1.0 (Current)
- Initial implementation
- Support for XLSX, XLS, CSV formats
- Template download with instructions
- Comprehensive field mapping
- Duplicate detection
- Optional update existing customers
- Detailed error reporting
