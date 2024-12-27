// Importar dependencias
const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');
const fs = require('fs');

const app = express();
const PORT = 3000;
const CACHE_FILE = './products_cache.json';

// Configuración de CORS
const corsOptions = {
    origin: ['https://tapachula.enamoraconflores.com', 'https://panel.enamoraconflores.com'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
};
app.use(cors(corsOptions));

let cachedProducts = [];
let lastUpdated = null;
let isScraping = false;
const queue = [];
let browser = null;

// Cargar caché desde archivo al iniciar
const loadCache = () => {
    if (fs.existsSync(CACHE_FILE)) {
        const data = fs.readFileSync(CACHE_FILE);
        const parsedData = JSON.parse(data);
        cachedProducts = parsedData.products || [];
        lastUpdated = new Date(parsedData.lastUpdated);
    }
};

const saveCache = (products) => {
    fs.writeFileSync(CACHE_FILE, JSON.stringify({ products, lastUpdated }, null, 2));
};

// Inicializa Puppeteer una sola vez
const startBrowser = async () => {
    if (!browser) {
        browser = await puppeteer.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--disable-gpu',
                '--no-zygote',
                '--single-process',
            ],
        });
    }
    return browser;
};

const scrapeProducts = async () => {
    if (isScraping) {
        console.log('Ya hay un scraping en curso. Abortando...');
        return;
    }

    isScraping = true;
    try {
        console.log('Iniciando Puppeteer...');
        const browser = await startBrowser();
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
                    imagen: imageElement ? imageElement.src : null,
                };
            });
        });

        await page.close(); // Cierra solo la página, no el navegador

        // Actualiza la caché
        cachedProducts = products;
        lastUpdated = new Date();
        saveCache(cachedProducts);

        console.log('Productos actualizados:', cachedProducts);
    } catch (error) {
        console.error('Error durante el scraping:', error);
    } finally {
        isScraping = false;
        // Procesa solicitudes en cola
        while (queue.length > 0) {
            const res = queue.shift();
            res.json({ products: cachedProducts, lastUpdated });
        }
    }
};

// Ejecutar scraping al iniciar si no hay datos en caché
loadCache();
if (!cachedProducts.length) {
    scrapeProducts().catch(err => console.error('Error al inicializar el scraping:', err));
}

// Endpoint para obtener productos
app.get('/products', (req, res) => {
    if (cachedProducts.length > 0) {
        res.json({ products: cachedProducts, lastUpdated });
    } else {
        res.status(503).json({ error: 'Datos no disponibles. Intenta más tarde.' });
    }
});

// Ruta para disparar scraping manual
app.get('/scrape', async (req, res) => {
    if (isScraping) {
        queue.push(res); // Añade la solicitud a la cola
        console.log('Solicitud de scraping añadida a la cola.');
        return;
    }

    try {
        await scrapeProducts();
        res.json({ message: 'Los productos se han actualizado exitosamente.', products: cachedProducts, lastUpdated });
    } catch (error) {
        console.error('Error durante la actualización manual:', error);
        res.status(500).json({ message: 'Ocurrió un error durante la actualización.' });
    }
});

// Cierra el navegador cuando el servidor se detiene
process.on('SIGINT', async () => {
    if (browser) {
        console.log('Cerrando Puppeteer...');
        await browser.close();
    }
    process.exit();
});

// Inicia el servidor
app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
