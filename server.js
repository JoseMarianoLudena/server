const express = require('express');
const axios = require('axios');
const cors = require('cors');
const fs = require('fs');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY;
const SHOPIFY_STORE_URL = 'https://dzui0a-qg.myshopify.com';
const API_VERSION = '2023-04';

// Cargar productos desde products.json
const hdcompanyProducts = JSON.parse(fs.readFileSync('./products.json', 'utf8'));

// Endpoint para productos de Shopify (para romani)
app.get('/api/shopify/products', async (req, res) => {
  try {
    const response = await axios.get(`${SHOPIFY_STORE_URL}/admin/api/${API_VERSION}/products.json`, {
      headers: { 'X-Shopify-Access-Token': SHOPIFY_API_KEY },
    });
    res.json(response.data.products);
  } catch (error) {
    console.error('Error fetching Shopify products:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// Endpoint para productos de HDCompany
app.get('/api/hdcompany/products', (req, res) => {
  const { category } = req.query;
  if (category) {
    return res.json(hdcompanyProducts.filter((p) => p.categoria === category));
  }
  res.json(hdcompanyProducts);
});

// Endpoint para categorías únicas de HDCompany
app.get('/api/hdcompany/categories', (req, res) => {
  const categories = [...new Set(hdcompanyProducts.map((p) => p.categoria))];
  res.json(categories);
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));