const express = require('express');
const axios = require('axios');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY;
const SHOPIFY_STORE_URL = 'https://dzui0a-qg.myshopify.com';
const API_VERSION = '2023-04';

// Inicializar OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Cargar datos
const hdcompanyProducts = JSON.parse(fs.readFileSync(path.join(__dirname, 'products.json'), 'utf8'));
const faqs = JSON.parse(fs.readFileSync(path.join(__dirname, 'faqs.json'), 'utf8'));
const discounts = JSON.parse(fs.readFileSync(path.join(__dirname, 'discounts.json'), 'utf8'));

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

// Endpoint para detectIntent con OpenAI
app.post('/api/hdcompany/openai', async (req, res) => {
  const { input, userName } = req.body;
  const lowerInput = input.toLowerCase();

  // Buscar en FAQs con expresiones regulares
  const faqMatch = faqs.find((faq) => {
    if (faq.question.toLowerCase() === 'tienen tienda física') {
      return /(d[oó]nde.*(est[aá]n|ubicad[o]?s?|localizad[o]?s?|local|direcci[oó]n))|ubicaci[oó]n|tienda|sucursal/i.test(lowerInput);
    }
    if (faq.question.toLowerCase() === 'métodos de pago') {
      return /(pagar|pagos?|tarjeta|paypal|yape|plin)/i.test(lowerInput);
    }
    if (faq.question.toLowerCase() === 'envíos') {
      return /(env[ií]os?|delivery|entrega)/i.test(lowerInput);
    }
    if (faq.question.toLowerCase() === 'contacto') {
      return /(contacto|tel[eé]fono|whatsapp)/i.test(lowerInput);
    }
    return lowerInput.includes(faq.question.toLowerCase());
  });

  if (faqMatch) {
    return res.json({ message: `${faqMatch.answer} ¿En qué te puedo ayudar ahora, ${userName}? 😄`, intent: 'FAQ' });
  }

  // Pregunta sobre categorías
  if (/(categor[ií]as?|tipo[s]? de productos?|qu[eé] tienes?)/i.test(lowerInput)) {
    const categories = [...new Set(hdcompanyProducts.map((p) => p.categoria))];
    const categoryList = categories.join(', ');
    return res.json({
      message: `Tenemos las siguientes categorías: ${categoryList}. ¿Quieres ver productos de alguna categoría específica, ${userName}? 😄`,
      intent: 'Categories',
    });
  }

  // Pregunta sobre productos más caros
  if (/(m[aá]s caro[s]?|costoso[s]?|precio[s]? alto[s]?)/i.test(lowerInput)) {
    const sortedProducts = [...hdcompanyProducts].sort(
      (a, b) => parseFloat(b.precio.replace('PEN ', '')) - parseFloat(a.precio.replace('PEN ', ''))
    );
    const topExpensive = sortedProducts.slice(0, 3);
    const productList = topExpensive
      .map((p) => `• ${p.nombre} - ${p.precio}`)
      .join('\n');
    return res.json({
      message: `Los productos más caros son:\n${productList}\n¿En qué te puedo ayudar ahora, ${userName}? 😄`,
      intent: 'ExpensiveProducts',
    });
  }

  // Pregunta sobre productos más baratos
  if (/(m[aá]s barato[s]?|econ[oó]mico[s]?|menor precio)/i.test(lowerInput)) {
    const sortedProducts = [...hdcompanyProducts].sort(
      (a, b) => parseFloat(a.precio.replace('PEN ', '')) - parseFloat(b.precio.replace('PEN ', ''))
    );
    const topCheap = sortedProducts.slice(0, 3);
    const productList = topCheap
      .map((p) => `• ${p.nombre} - ${p.precio}`)
      .join('\n');
    return res.json({
      message: `Los productos más baratos son:\n${productList}\n¿En qué te puedo ayudar ahora, ${userName}? 😄`,
      intent: 'CheapProducts',
    });
  }

  // Pregunta sobre descuentos
  if (/(descuento[s]?|oferta[s]?|promoci[oó]n)/i.test(lowerInput)) {
    const discountText = discounts.bulk_discounts
      .map((d) => `Compra ${d.quantity} o más y obtén ${d.discount * 100}% de descuento.`)
      .join(' ');
    return res.json({
      message: `Nuestros descuentos: ${discountText} ¿En qué te puedo ayudar ahora, ${userName}? 😄`,
      intent: 'Discount',
    });
  }

  // Pregunta sobre productos específicos por categoría
  if (/(producto[s]?|art[ií]culo[s]?|cargador(es)?|mouse|laptop[s]?)/i.test(lowerInput)) {
    const categoryMatch = hdcompanyProducts.find((p) => lowerInput.includes(p.categoria.toLowerCase()));
    if (categoryMatch) {
      const productsInCategory = hdcompanyProducts
        .filter((p) => p.categoria === categoryMatch.categoria)
        .map((p) => `• ${p.nombre} - ${p.precio}`)
        .join('\n');
      return res.json({
        message: `Productos en ${categoryMatch.categoria}:\n${productsInCategory}\n¿En qué te puedo ayudar ahora, ${userName}? 😄`,
        intent: 'CategoryProducts',
      });
    }
  }

  // Llamar a OpenAI para otras preguntas
  try {
    const prompt = `
      Eres un asistente de HD Company, una tienda de laptops y tecnología en Lima, Perú.
      Usa la siguiente información para responder:
      - Preguntas frecuentes: ${JSON.stringify(faqs, null, 2)}.
      - Productos disponibles: ${JSON.stringify(hdcompanyProducts, null, 2)}.
      - Categorías: ${JSON.stringify([...new Set(hdcompanyProducts.map((p) => p.categoria))], null, 2)}.
      - Reglas de descuentos: ${JSON.stringify(discounts, null, 2)}.
      Responde en español, de manera amigable, profesional y concisa a la pregunta: "${input}".
      - Si la pregunta es sobre ubicación, métodos de pago, envíos o contacto, usa las FAQs.
      - Si es sobre categorías, productos o precios, usa los datos de productos y categorías.
      - Si es sobre descuentos, usa las reglas de descuentos.
      - No inventes información. Si no sabes la respuesta, di: "Lo siento, ${userName}, no tengo suficiente información. 😅 ¿Quieres preguntar otra cosa o volver al menú?"
    
    `;
    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 500,
    });
    const response = completion.choices[0].message.content || `Lo siento, ${userName}, no entendí. 😅 ¿Más detalles o elige una opción?`;
    return res.json({ message: response, intent: 'OpenAI' });
  } catch (error) {
    console.error('Error con OpenAI:', error);
    return res.json({
      message: `Lo siento, ${userName}, no entendí. 😅 ¿Más detalles o elige una opción?`,
      intent: 'Desconocido',
    });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));