const crypto = require('crypto');
const fs = require('fs/promises');
const { pdf } = require('pdf-to-img');

exports.generateRandomString = (length = 16) => {
  const bytes = crypto.randomBytes(Math.ceil(length / 2));
  return bytes.toString('hex').slice(0, length);
};

exports.generatePdfThumbnail = async ({ pdfPath, outputDir })=>  {
  for await (const page of await pdf(pdfPath)) {
    return fs.writeFile(outputDir, page)
  }
}
