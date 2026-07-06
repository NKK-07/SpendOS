import * as ImageManipulator from 'expo-image-manipulator';

/**
 * Compresses and resizes an image captured by the camera.
 * This satisfies the Titan Edition requirement for Client-Side Image Compression
 * to speed up S3 uploads and reduce OCR BullMQ load.
 * 
 * @param uri The local URI of the captured image
 * @returns The compressed image result containing the new URI
 */
export async function compressReceiptImage(uri: string): Promise<ImageManipulator.ImageResult> {
  return await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 1600 } }],
    { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
  );
}
