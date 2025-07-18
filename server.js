const express = require('express');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY;
const SHOPIFY_STORE_URL = 'https://dzui0a-qg.myshopify.com';
const API_VERSION = '2023-04';

// Endpoint para obtener productos
app.get('/api/shopify/products', async (req, res) => {
  try {
    const response = await axios.get(`${SHOPIFY_STORE_URL}/admin/api/${API_VERSION}/products.json`, {
      headers: {
        'X-Shopify-Access-Token': SHOPIFY_API_KEY,
      },
    });
    res.json(response.data.products);
  } catch (error) {
    console.error('Error fetching Shopify products:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});