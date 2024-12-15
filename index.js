const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors'); // Importar CORS

const app = express();
const PORT = 3000;

// Configuración de CORS
const corsOptions = {
    origin: ['http://localhost', 'https://tu-dominio.com'], // Cambiar por los dominios permitidos
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
};
app.use(cors(corsOptions)); // Habilitar CORS

let cachedProducts = [];
let lastUpdated = null;

const scrapeProducts = async () => {
    try {
        console.log('Iniciando Puppeteer...');
        const browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });
        const page = await browser.newPage();

        console.log('Navegando a la página...');
        await page.goto('https://menu.fu.do/ecf2', { waitUntil: 'domcontentloaded' });

        console.log('Esperando elementos...');
        await page.waitForSelector('div.product');

        console.log('Extrayendo datos...');
        const products = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('div.product')).map(product => {
                const nameElement = product.querySelector('div h4');
                const priceElement = product.querySelector('div.product-price span.ng-star-inserted');
                const imageElement = product.querySelector('img');

                return {
                    nombre: nameElement ? nameElement.textContent.trim() : null,
                    precio: priceElement ? priceElement.textContent.trim() : null,
                    imagen: imageElement ? imageElement.src : null
                };
            });
        });

        await browser.close();

        // Actualiza la caché
        cachedProducts = products;
        lastUpdated = new Date();
        console.log('Productos actualizados:', cachedProducts);
    } catch (error) {
        console.error('Error durante el scraping:', error);
    }
};

// Ejecutar el scraping al iniciar el servidor
scrapeProducts().catch(err => console.error('Error al inicializar el scraping:', err));

// Actualizar productos automáticamente cada 10 minutos
setInterval(() => {
    scrapeProducts().catch(err => console.error('Error en la actualización programada:', err));
}, 1 * 60 * 1000); // 10 minutos en milisegundos

// Endpoint para obtener productos
app.get('/products', (req, res) => {
    if (cachedProducts.length > 0) {
        res.json({ products: cachedProducts, lastUpdated });
    } else {
        res.status(503).json({ error: 'Datos no disponibles. Intenta más tarde.' });
    }
});

// Endpoint para forzar el scraping manualmente
app.get('/scrape', async (req, res) => {
    await scrapeProducts();
    res.json({ success: true, products: cachedProducts });
});

app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
