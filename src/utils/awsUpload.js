const FormData = require("form-data");
const fs = require("fs");
const path = require("path");
const axios = require("axios");

const mimeToExt = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/svg+xml": "svg",
  "application/pdf": "pdf",
  "application/zip": "zip",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "video/mp4": "mp4",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/ogg": "ogg",
  "audio/webm": "webm",
};

async function uploadToAws({ file, fileName, folderName }) {
  try {
    if (!file?.path) throw new Error("No file path provided");

    const detectedExt =
      mimeToExt[file.mimetype] ||
      path.extname(file.originalname || "").replace(".", "") ||
      "bin";

    const dataFile = fs.createReadStream(file.path);
    const formData = new FormData();

    formData.append("fileName", fileName);
    formData.append("folderName", `uploads/${folderName}`);
    formData.append("fileExtension", detectedExt);
    formData.append("uploadFile", dataFile, {
      filename: file.originalname || `${fileName}.${detectedExt}`,
      contentType: file.mimetype || "application/octet-stream",
    });
    formData.append("extras", JSON.stringify({ appId: 1 }));

    const headers = formData.getHeaders();
    const response = await axios.post(
      "https://aws-upload.uttirna.in/api/aws/upload",
      formData,
      {
        headers,
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      }
    );

    return response.data?.data;
  } catch (error) {
    console.error("AWS Upload Error:", error.response?.data || error.message);
    throw new Error("Failed to upload file to AWS");
  } finally {
    // Delete the temporary file from the server disk after upload is done or if it fails
    if (file?.path && fs.existsSync(file.path)) {
      try {
        fs.unlinkSync(file.path);
      } catch (cleanupError) {
        console.error("Failed to delete temp file:", cleanupError.message);
      }
    }
  }
}

module.exports = uploadToAws;
