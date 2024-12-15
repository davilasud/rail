const express = require('express');
const puppeteer = require('puppeteer');

const app = express();
const PORT = 3000;

let cachedProducts = [];
let lastUpdated = null;

const scrapeProducts = async () => {
    try {
        console.log('Iniciando Puppeteer...');
        const browser = await puppeteer.launch({ headless: true });
        const page = await browser.newPage();

        console.log('Navegando a la página...');
        await page.goto('https://menu.fu.do/ecf2', { waitUntil: 'domcontentloaded' });

        console.log('Esperando elementos...');
        await page.waitForSelector('div.product div h4');

        console.log('Extrayendo datos...');
        const products = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('div.product div h4'))
                .map(el => el.textContent.trim());
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
