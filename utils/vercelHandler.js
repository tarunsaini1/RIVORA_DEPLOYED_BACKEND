import { put, list, del } from '@vercel/blob';
import { v4 as uuidv4 } from 'uuid';

// Generate a unique filename with original file extension preserved
const generateUniqueFilename = (originalFilename) => {
  const fileExtension = originalFilename.split('.').pop();
  return `${uuidv4()}.${fileExtension}`;
};

// Upload a file to Vercel Blob storage
export const uploadFile = async (fileBuffer, fileName, contentType) => {
  try {
    const uniqueFilename = generateUniqueFilename(fileName);
    
    const blob = await put(uniqueFilename, fileBuffer, {
      contentType,
      access: 'public' // Files are private by default
    });
    
    return {
      url: blob.url,
      size: blob.size,
      contentType: blob.contentType
    };
  } catch (error) {
    console.error('Error uploading to Vercel Blob:', error);
    throw new Error(`Failed to upload file: ${error.message}`);
  }
};

// Delete a file from Vercel Blob storage
export const deleteFile = async (url) => {
  try {
    await del(url);
    return true;
  } catch (error) {
    console.error('Error deleting from Vercel Blob:', error);
    throw new Error(`Failed to delete file: ${error.message}`);
  }
};