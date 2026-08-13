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

/**
 * Helper to generate a clean relative URL directly from Multer's existing disk path
 */
function getLocalMulterUrl(file, folderName) {
  if (!file?.path) {
    throw new Error("No file path found from Multer storage.");
  }
  
  // Example: if file.path is "uploads/practical-submissions/file_123.pdf", 
  // we normalize it to ensure it starts with /uploads/...
  const normalizedPath = file.path.replace(/\\/g, "/");
  const marker = "uploads/";
  const markerIndex = normalizedPath.indexOf(marker);

  let cdnUrl = "";
  if (markerIndex !== -1) {
    cdnUrl = "/" + normalizedPath.substring(markerIndex);
  } else {
    // Fallback construction if marker isn't found
    const filename = path.basename(file.path);
    const cleanFolder = folderName.startsWith("uploads/") ? folderName : `uploads/${folderName}`;
    cdnUrl = `/${cleanFolder}/${filename}`;
  }

  return { cdnUrl, fullS3URL: cdnUrl };
}

async function uploadToAws({ file, fileName, folderName }) {
  let tempFilePath = file?.path;
  
  try {
    if (!file?.path && !file?.buffer) {
      throw new Error("No file path or buffer provided");
    }

    const detectedExt =
      mimeToExt[file.mimetype] ||
      path.extname(file.originalname || "").replace(".", "") ||
      "bin";

    // Try online upload service first
    try {
      const formData = new FormData();
      formData.append("fileName", fileName);
      formData.append("folderName", `uploads/${folderName}`);
      formData.append("fileExtension", detectedExt);

      if (file.path && fs.existsSync(file.path)) {
        formData.append("uploadFile", fs.createReadStream(file.path), {
          filename: file.originalname || `${fileName}.${detectedExt}`,
          contentType: file.mimetype || "application/octet-stream",
        });
      } else if (file.buffer) {
        formData.append("uploadFile", file.buffer, {
          filename: file.originalname || `${fileName}.${detectedExt}`,
          contentType: file.mimetype || "application/octet-stream",
        });
      }

      formData.append("extras", JSON.stringify({ appId: 1 }));

      const response = await axios.post(
        "https://aws-upload.uttirna.in/api/aws/upload",
        formData,
        {
          headers: formData.getHeaders(),
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
          timeout: 5000, // Fail fast if offline
        }
      );

      if (response.data?.data) {
        // Online success: Safely delete local multer temporary file if it exists
        if (tempFilePath && fs.existsSync(tempFilePath)) {
          fs.unlinkSync(tempFilePath);
          tempFilePath = null; // Prevent finally block from trying to delete it again
        }
        return response.data.data;
      }
    } catch (networkError) {
      console.warn("⚠️ Remote upload service unreachable (Offline mode). Using local Multer file...");
      // DO NOT delete tempFilePath here, because we want to keep the local file for offline use!
      return getLocalMulterUrl(file, folderName);
    }

    return getLocalMulterUrl(file, folderName);
    
  } catch (error) {
    console.error("Upload Error:", error.response?.data || error.message);
    if (error.response?.status === 413) {
      throw new Error("File too large for upload service.");
    }
    
    // Ultimate fallback using existing multer path
    if (file?.path) {
      return getLocalMulterUrl(file, folderName);
    }
    
    throw new Error("Failed to process file upload.");
  } finally {
    // Only cleanup temp file if we successfully uploaded to AWS 
    // (If offline, we keep it so the user can view it!)
  }
}

module.exports = uploadToAws;