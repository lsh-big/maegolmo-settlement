async function withPhotos(mode, operation) {
  const database = await new Promise((resolve, reject) => {
    const request = indexedDB.open('maegolmo-receipt-photos', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('photos');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction('photos', mode);
      const request = operation(transaction.objectStore('photos'));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
}

export async function saveReceiptPhoto(photoId, file) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error('사진을 읽을 수 없습니다. JPG, PNG 또는 WebP 사진을 선택해 주세요.');
  }
  let photo;
  try {
    const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    context.fillStyle = 'white';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    photo = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.88));
    if (!photo) throw new Error('Image encoding failed');
    await withPhotos('readwrite', photos => photos.put(photo, photoId));
  } catch {
    throw new Error('사진을 저장할 수 없습니다. 브라우저 저장 공간을 확인해 주세요.');
  } finally {
    bitmap.close();
  }
}

export const readReceiptPhoto = photoId => withPhotos('readonly', photos => photos.get(photoId));
export const deleteReceiptPhoto = photoId => withPhotos('readwrite', photos => photos.delete(photoId));
