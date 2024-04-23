const express = require("express");
const multer = require("multer");
const xlsx = require("xlsx");
const axios = require("axios");
const cheerio = require("cheerio");
const cors = require("cors");

const app = express();
const port = process.env.PORT || 3000;
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

const password = "M3ek@pt#2024!";
let excelPrices = {}; // Objektum a cikkszámokhoz tartozó Excel árak tárolásához
let notFoundProducts = [];

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/", (req, res) => {
  res.sendFile("index.html", { root: __dirname });
});

app.post("/authenticate", (req, res) => {
  const { password: providedPassword } = req.body;

  if (providedPassword === password) {
    // Ha a jelszó egyezik, akkor autentikált
    res.json({ authenticated: true });
  } else {
    // Ha nem egyezik, akkor hibaüzenet
    res.status(401).json({ authenticated: false });
  }
});

app.post("/", (req, res) => {
  // Alapértelmezett esetben a főoldalt szolgáltatjuk
  res.sendFile("index.html", { root: __dirname });
});

app.post("/upload", upload.single("excelFile"), async (req, res) => {
  try {
    const workbook = xlsx.read(req.file.buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(sheet, { defval: null });

    // Excel árakat tároljuk az objektumban a cikkszámok alapján
    data.forEach((row) => {
      if (row.ProductNumber && row["1-KISKER"]) {
        // Ellenőrizzük, hogy létezik-e a '1-KISKER' mező
        excelPrices[row.ProductNumber] = row["1-KISKER"]; // Itt a '1-KISKER' mezőt tároljuk el
      }
    });

    res.json(data);
  } catch (error) {
    res.status(500).json({ error: "Error reading Excel file" });
  }
});

app.post("/search", async (req, res) => {
  const productNumbers = req.body.productNumbers;
  try {
    const prices = await Promise.all(
      productNumbers.map(async (productNumber) => {
        return await scrapeProductPrice(productNumber);
      }),
    );

    res.json({ prices });
  } catch (error) {
    console.log("Error searching products:", error.message);
    res.status(500).json({ error: "Error searching products" });
  }
});

async function scrapeProductData(productLink, productNumber) {
  try {
    const response = await axios.get(productLink);
    const html = response.data;
    const $ = cheerio.load(html);

    // Termék adatok lekérése Cheerio segítségével
    const productNameFull = $("h4[data-akjl='Product name||ProductName']")
      .text()
      .trim();
    const productName = productNameFull.split(/\s\(/)[0].trim();
    const productPriceText = $("span.price").text().trim();
    const productPrice = parseFloat(
      productPriceText.replace(/\s/g, "").replace(",", "."),
    );

    // Kiszállítási adatok előkészítése
    const deliveryList = [];
    $("div.optoffer.device-desktop").each((index, element) => {
      const logoElement = $(element).find("div.col-logo");
      const imgElement = logoElement.find("img");
      const alt = imgElement.attr("alt");
      const firstWord = alt ? alt.split(" ")[0] : "";
      deliveryList.push(firstWord);
    });

    const { DeliveryData } = createDeliveryData($, deliveryList);
    const excelPrice = excelPrices[productNumber];
    // Eredmény objektum összeállítása
    const result = {
      ProductNumber: productNumber,
      ProductName: productName,
      Delivery: DeliveryData,
      BestProductPrice: productPrice,
      ExcelPrices: excelPrices, // Ez lehet, hogy nem szükséges
    };

    // Kilogolás a konzolra
    // console.log(result);

    return result;
  } catch (error) {
    console.error(`Error scraping product data for ${productLink}`, error);
    return null;
  }
}

async function scrapeProductPrice(productNumber) {
  try {
    const response = await axios.get(
      `https://www.arukereso.hu/CategorySearch.php?st=${productNumber}`,
    );
    const html = response.data;
    const $ = cheerio.load(html);
    const nameElement = $("div.name.ulined-link");
    const productLink = nameElement.find("h2").children("a").attr("href");
    if (!productLink) {
      console.error(
        `Product link not found for product number ${productNumber}`,
      );
      return null;
    }
    const productData = await scrapeProductData(productLink, productNumber);
    if (!productData) {
      console.error(`Product data not found for product link ${productLink}`);
      notFoundProducts.push({ ProductNumber: productNumber }); // Termék hozzáadása a nem talált termékek listájához
      return null;
    }

    const excelPrices = productData.ExcelPrices || {};
    const price = excelPrices[productNumber] || productData.BestProductPrice;

    const result = {
      ProductNumber: productNumber,
      ProductName: productData.ProductName,
      Delivery: productData.Delivery,
      Price: price,
    };

    return result;
  } catch (error) {
    console.error(
      `Error scraping product price for product number ${productNumber}`,
      error,
    );
    return null;
  }
}

function createDeliveryData($, deliveryList) {
  const deliveryData = {};

  // Árak és kiszállítási díjak kinyerése
  $("div.optoffer.device-desktop").each((i, element) => {
    const company = deliveryList[i];

    // Ár kinyerése
    const priceElement = $(element).find("div.row-price");
    const priceText = priceElement.text().trim();
    const priceMatch = priceText.match(/(\d[\d\s]*)\s*Ft/);
    const productPrice = priceMatch
      ? parseFloat(priceMatch[1].replace(/\s/g, ""))
      : 0;

    // Kiszállítási díj kinyerése
    const deliveryInfoElement = $(element).find("div.delivery-info");
    const deliveryInfoText = deliveryInfoElement.text().trim();
    const deliveryFeeMatch = deliveryInfoText.match(/(\d[\d\s]*)\s*Ft/);
    const deliveryFee = deliveryFeeMatch
      ? parseFloat(deliveryFeeMatch[1].replace(/\s/g, ""))
      : 0;

    // Csak a "Ft" utáni rész kivágása
    const formattedDeliveryFee = deliveryInfoText.includes("Ingyenes")
      ? "Ingyenes"
      : `${deliveryFee} Ft`;

    deliveryData[company] = {
      Price: productPrice,
      Kiszállítás: deliveryFee === 0 ? "Ingyenes" : formattedDeliveryFee,
    };
  });

  // Cégek neveinek kinyerése és növekvő sorrendbe rendezése a ProductPrice alapján
  const sortedCompanies = Object.entries(deliveryData)
    .sort((a, b) => a[1].Price - b[1].Price)
    .map((entry) => entry[0]);

  // Csak az első 5 céget választjuk ki
  const top5Companies = sortedCompanies.slice(0, 5);

  // Az adatok rendezése a növekvő sorrendnek megfelelően és csak az első 5 cégre korlátozva
  const sortedDeliveryData = {};
  top5Companies.forEach((company) => {
    sortedDeliveryData[company] = deliveryData[company];
  });

  // Visszaadja az összes adatot egy objektumban
  return {
    DeliveryData: sortedDeliveryData,
  };
}

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
