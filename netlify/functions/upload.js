const multer = require("multer");
const xlsx = require("xlsx");

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

exports.handler = async (event) => {
  // A fájlok feltöltése itt történik, ha multipart/form-data-t használsz
  if (event.httpMethod === "POST" && event.headers["content-type"].includes("multipart/form-data")) {
    const formData = new FormData();
    const body = await event.body;

    formData.append("file", body);

    const workbook = xlsx.read(body, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(sheet, { defval: null });

    // Excel árakat tároljuk
    const excelPrices = {};
    data.forEach((row) => {
      if (row.ProductNumber && row["1-KISKER"]) {
        excelPrices[row.ProductNumber] = row["1-KISKER"];
      }
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ data, excelPrices }),
    };
  }

  return {
    statusCode: 404,
    body: JSON.stringify({ error: "Not Found" }),
  };
};
