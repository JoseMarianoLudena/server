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

// Servir archivos estáticos (imágenes) desde chatbot-perfumes/images/
app.use('/images', express.static(path.join(__dirname, '../chatbot-perfumes/images')));

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

// Función para normalizar texto
const normalizeText = (text) =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

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

// Endpoint para FAQs
app.get('/api/hdcompany/faqs', (req, res) => {
  res.json(faqs);
});

// Endpoint para detectIntent con OpenAI
app.post('/api/hdcompany/openai', async (req, res) => {
  const { input, userName } = req.body;
  const normalizedInput = normalizeText(input);

  // Verificar FAQs
  const faqMatch = faqs.find((faq) => {
    const normalizedQuestion = normalizeText(faq.question);
    if (normalizedQuestion === 'tienen tienda fisica') {
      return /d[oó]nde.*(est[aá]n|ubicad[o]?s?|localizad[o]?s?|local|direcci[oó]n)|ubicaci[oó]n|tienda|sucursal/i.test(normalizedInput);
    } else if (normalizedQuestion === 'métodos de pago') {
      return /(pagar|pagos?|tarjeta|paypal|yape|plin)/i.test(normalizedInput);
    } else if (normalizedQuestion === 'envíos') {
      return /(env[ií]os?|delivery|entrega)/i.test(normalizedInput);
    } else if (normalizedQuestion === 'contacto') {
      return /(contacto|tel[eé]fono|whatsapp)/i.test(normalizedInput);
    }
    return normalizedInput.includes(normalizedQuestion);
  });

  if (faqMatch) {
    return res.json({
      message: `${faqMatch.answer}<br/>¿En qué te ayudo ahora, ${userName}? 😄`,
      intent: 'FAQ',
    });
  }

  // Verificar solicitud de imagen
  if (/\b(imagen|foto|ver.*producto|c[oó]mo.*es|puedo.*ver)\b/i.test(normalizedInput)) {
    const productMatch = hdcompanyProducts.find((p) =>
      normalizedInput.includes(normalizeText(p.nombre))
    );
    if (productMatch) {
      const imageUrl = productMatch.image_url?.startsWith('/')
        ? `https://hdcompany-whatsapp.onrender.com${productMatch.image_url}`
        : productMatch.image_url || '/default-product.jpg';
      return res.json({
        message: `📷 Imagen de ${productMatch.nombre}:<br/><img src="${imageUrl}" alt="${productMatch.nombre}" class="inline-block border-2 border-[#333] rounded-lg mb-2 max-w-[150px] h-24 object-contain" /><br/>¿En qué te ayudo ahora, ${userName}? 😄`,
        intent: 'Imagen',
      });
    }
  }

  // Verificar despedida
  if (/(gracias|adios|resuelto|listo|ok|solucionado|chao)/i.test(normalizedInput)) {
    return res.json({
      message: `¡Gracias por contactarnos, ${userName}! 😊 Escríbenos si necesitas más ayuda.`,
      intent: 'Despedida',
    });
  }

  // Pregunta sobre categorías
  if (/(categor[ií]as?|tipo[s]? de productos?|qu[eé] tienes?)/i.test(normalizedInput)) {
    const categories = [...new Set(hdcompanyProducts.map((p) => p.categoria))];
    const categoryList = categories.join(', ');
    return res.json({
      message: `Tenemos las siguientes categorías: ${categoryList}. ¿Quieres ver productos de alguna categoría específica, ${userName}? 😄`,
      intent: 'Categories',
    });
  }

  // Pregunta sobre productos más caros
  if (/(m[aá]s caro[s]?|costoso[s]?|precio[s]? alto[s]?)/i.test(normalizedInput)) {
    const sortedProducts = [...hdcompanyProducts].sort(
      (a, b) => parseFloat(b.precio.replace('PEN ', '')) - parseFloat(a.precio.replace('PEN ', ''))
    );
    const topExpensive = sortedProducts.slice(0, 3);
    const productList = topExpensive
      .map((p) => {
        const imageUrl = p.image_url?.startsWith('/')
          ? `https://hdcompany-whatsapp.onrender.com${p.image_url}`
          : p.image_url || '/default-product.jpg';
        return `<a href="#" onclick="window.dispatchEvent(new CustomEvent('selectProduct', { detail: { id: ${1000 + p.id} } }));"><img src="${imageUrl}" alt="${p.nombre}" class="inline-block border-2 border-[#333] rounded-lg mb-2 max-w-[150px] h-24 object-contain" /></a><br/>${p.nombre} - <span class="font-bold" style="color: #456883;">${p.precio}</span>`;
      })
      .join('<br/>');
    return res.json({
      message: `Los productos más caros son:<br/>${productList}<br/>¿En qué te ayudo ahora, ${userName}? 😄`,
      intent: 'ExpensiveProducts',
    });
  }

  // Pregunta sobre productos más baratos
  if (/(m[aá]s barato[s]?|econ[oó]mico[s]?|menor precio)/i.test(normalizedInput)) {
    const sortedProducts = [...hdcompanyProducts].sort(
      (a, b) => parseFloat(a.precio.replace('PEN ', '')) - parseFloat(b.precio.replace('PEN ', ''))
    );
    const topCheap = sortedProducts.slice(0, 3);
    const productList = topCheap
      .map((p) => {
        const imageUrl = p.image_url?.startsWith('/')
          ? `https://hdcompany-whatsapp.onrender.com${p.image_url}`
          : p.image_url || '/default-product.jpg';
        return `<a href="#" onclick="window.dispatchEvent(new CustomEvent('selectProduct', { detail: { id: ${1000 + p.id} } }));"><img src="${imageUrl}" alt="${p.nombre}" class="inline-block border-2 border-[#333] rounded-lg mb-2 max-w-[150px] h-24 object-contain" /></a><br/>${p.nombre} - <span class="font-bold" style="color: #456883;">${p.precio}</span>`;
      })
      .join('<br/>');
    return res.json({
      message: `Los productos más baratos son:<br/>${productList}<br/>¿En qué te ayudo ahora, ${userName}? 😄`,
      intent: 'CheapProducts',
    });
  }

  // Pregunta sobre descuentos
  if (/(descuento[s]?|oferta[s]?|promoci[oó]n)/i.test(normalizedInput)) {
    const discountText = discounts.bulk_discounts
      .map((d) => `Compra ${d.quantity} o más y obtén ${d.discount * 100}% de descuento.`)
      .join(' ');
    return res.json({
      message: `Nuestros descuentos: ${discountText} ¿En qué te ayudo ahora, ${userName}? 😄`,
      intent: 'Discount',
    });
  }

  // Pregunta sobre productos específicos por categoría
  if (/(producto[s]?|art[ií]culo[s]?|cargador(es)?|mouse|laptop[s]?)/i.test(normalizedInput)) {
    const categoryMatch = hdcompanyProducts.find((p) => normalizedInput.includes(normalizeText(p.categoria)));
    if (categoryMatch) {
      const productsInCategory = hdcompanyProducts
        .filter((p) => p.categoria === categoryMatch.categoria)
        .slice(0, 5)
        .map((p) => {
          const imageUrl = p.image_url?.startsWith('/')
            ? `https://hdcompany-whatsapp.onrender.com${p.image_url}`
            : p.image_url || '/default-product.jpg';
          return `<a href="#" onclick="window.dispatchEvent(new CustomEvent('selectProduct', { detail: { id: ${1000 + p.id} } }));"><img src="${imageUrl}" alt="${p.nombre}" class="inline-block border-2 border-[#333] rounded-lg mb-2 max-w-[150px] h-24 object-contain" /></a><br/>${p.nombre} - <span class="font-bold" style="color: #456883;">${p.precio}</span>`;
        })
        .join('<br/>');
      return res.json({
        message: `Productos en ${categoryMatch.categoria}:<br/>${productsInCategory}<br/>¿En qué te ayudo ahora, ${userName}? 😄`,
        intent: 'CategoryProducts',
      });
    }
  }

  // Llamar a OpenAI para otras preguntas
  try {
    const prompt = `
      Eres un asistente de HD Company, una tienda de tecnología en Lima, Perú.
      Usa la siguiente información para responder:
      - Preguntas frecuentes: ${JSON.stringify(faqs)}.
      - Productos: ${JSON.stringify(hdcompanyProducts)}.
      - Categorías: ${JSON.stringify([...new Set(hdcompanyProducts.map((p) => p.categoria))])}.
      - Descuentos: ${JSON.stringify(discounts)}.
      Responde en español, amigable, profesional y en máximo 300 caracteres a: "${input}".
      - Si pide una recomendación (ej. "qué laptop me recomiendas"), sugiere un producto de la categoría adecuada (ej. "Laptop LENOVO IDEAPAD 5 ARE05 – RYZEN 7 4700U, 8GB, SSD 500GB, 14″ FHD, WINDOWS 10").
      - Usa el nombre exacto del producto según el JSON.
      - No inventes información. Si no sabes, di: "Lo siento, ${userName}, no tengo esa info. 😅 ¿Otra cosa?"
      - Termina con: "¿En qué te ayudo ahora, ${userName}? 😄"
    `;
    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 100,
    });
    const message = completion.choices[0].message.content;
    return res.json({ message, intent: 'General' });
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