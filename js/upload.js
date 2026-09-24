// ═══════════════════════════════════════════════════════
//   Upload Utility — ImgBB + Duplicate Prevention + Cropper
//   ⚡ ضغط + رفع + كشف تكرار + قص الصور
// ═══════════════════════════════════════════════════════

// ═══ Constants ═══
const IMGBB_API_KEY = 'e222a3609a80a1de3ccb555dabcc355e';
const IMGBB_UPLOAD_URL = 'https://api.imgbb.com/1/upload';

// ═══ Compression Defaults ═══
const DEFAULT_MAX_WIDTH = 1920;
const DEFAULT_MAX_HEIGHT = 1920;
const DEFAULT_QUALITY = 0.95;
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

// ═══ Allowed Types ═══
const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

// ═══════════════════════════════════════════════════════
//   ⚡ SHA-256 Hash
// ═══════════════════════════════════════════════════════

async function getFileHash(file) {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  } catch (err) {
    console.warn('⚠️ getFileHash error:', err);
    return fallbackHash(file);
  }
}

function fallbackHash(file) {
  const str = `${file.name}_${file.size}_${file.lastModified || Date.now()}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return 'fb_' + Math.abs(hash).toString(16);
}

// ═══════════════════════════════════════════════════════
//   ⚡ Compress Image
// ═══════════════════════════════════════════════════════

async function compressImage(file, maxWidth = DEFAULT_MAX_WIDTH, maxHeight = DEFAULT_MAX_HEIGHT, quality = DEFAULT_QUALITY) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      const img = new Image();

      img.onload = () => {
        let { width, height } = img;

        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('فشل ضغط الصورة'));
            }
          },
          'image/jpeg',
          quality
        );
      };

      img.onerror = () => reject(new Error('فشل تحميل الصورة'));
      img.src = e.target.result;
    };

    reader.onerror = () => reject(new Error('فشل قراءة الملف'));
    reader.readAsDataURL(file);
  });
}

// ═══════════════════════════════════════════════════════
//   ⚡ Upload to ImgBB
// ═══════════════════════════════════════════════════════

async function uploadToImgBB(blob, name = '') {
  // ⚡ Debug logging
  console.log('📤 uploadToImgBB:', {
    blobSize: blob.size,
    blobType: blob.type,
    name: name
  });

  const formData = new FormData();
  formData.append('image', blob);
  if (name) formData.append('name', name);

  const response = await fetch(`${IMGBB_UPLOAD_URL}?key=${IMGBB_API_KEY}`, {
    method: 'POST',
    body: formData
  });

  if (!response.ok) {
    // ⚡ اقفل تفاصيل الخطأ
    let errorData = null;
    try {
      errorData = await response.json();
    } catch (e) {
      errorData = await response.text();
    }

    console.error('❌ ImgBB error response:', {
      status: response.status,
      statusText: response.statusText,
      data: errorData,
      blobSize: blob.size,
      blobType: blob.type
    });

    throw new Error(`ImgBB API error: ${response.status} — ${JSON.stringify(errorData)}`);
  }

  const data = await response.json();

  if (!data.success) {
    console.error('❌ ImgBB not success:', data);
    throw new Error(data.error?.message || 'فشل رفع الصورة');
  }

  console.log('✅ ImgBB success:', data.data.url);

  return {
    url: data.data.url,
    thumb: data.data.thumb?.url || data.data.url,
    display: data.data.display_url || data.data.url,
    deleteUrl: data.data.delete_url || '',
    id: data.data.id || ''
  };
}

// ═══════════════════════════════════════════════════════
//   ⚡ Check Image Exists on ImgBB
// ═══════════════════════════════════════════════════════

/**
 * ⚡ فحص إن الصورة موجودة على ImgBB
 * @param {string} url
 * @returns {Promise<boolean>}
 */
async function checkImageExistsStrict(url) {
  if (!url) return false;

  return new Promise((resolve) => {
    const img = new Image();

    const timeout = setTimeout(() => {
      img.src = '';
      console.warn('⏱️ checkImageExists timeout — افتراض إنها موجودة');
      resolve(true);
    }, 5000);

    img.onload = () => {
      clearTimeout(timeout);
      console.log('✅ Image exists:', url);
      resolve(true);
    };

    img.onerror = () => {
      clearTimeout(timeout);
      console.warn('❌ Image NOT found (404):', url);
      resolve(false);
    };

    const separator = url.includes('?') ? '&' : '?';
    img.src = url + separator + '_cb=' + Date.now();
  });
}

// ═══════════════════════════════════════════════════════
//   ⚡ Main Upload Function (with Duplicate Check)
// ═══════════════════════════════════════════════════════

async function uploadPersonPhoto(file, previousHash = '', previousURL = '') {
  // ⚡ 1. تحقق من النوع
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error('صيغة الصورة غير مدعومة. استخدم JPG أو PNG أو WebP');
  }

  // ⚡ 2. تحقق من الحجم
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`حجم الصورة أكبر من ${MAX_FILE_SIZE / 1024 / 1024} MB`);
  }

  // ⚡ 3. احسب الـhash
  const hash = await getFileHash(file);

  // ⚡ 4. تحقق من التكرار
  if (previousHash && previousURL && hash === previousHash) {
    if (typeof checkImageExistsStrict === 'function') {
      const exists = await checkImageExistsStrict(previousURL);

      if (exists) {
        console.log('♻️ Same photo detected — reusing cached URL');
        return {
          url: previousURL,
          hash: hash,
          isDuplicate: true
        };
      } else {
        console.log('❌ Cached photo missing — uploading new');
      }
    } else {
      return {
        url: previousURL,
        hash: hash,
        isDuplicate: true
      };
    }
  }

  // ⚡ 5. اضغط الصورة
  const compressed = await compressImage(file);

  // ⚡ 6. ارفع
  const result = await uploadToImgBB(compressed, `person_${Date.now()}`);

  return {
    url: result.url,
    thumb: result.thumb,
    deleteUrl: result.deleteUrl,
    imgbbId: result.id,
    hash: hash,
    isDuplicate: false
  };
}

// ═══════════════════════════════════════════════════════
//   ⚡ File Picker Helpers
// ═══════════════════════════════════════════════════════

function pickImage() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/jpg,image/png,image/webp';

    input.onchange = (e) => {
      const file = e.target.files?.[0];
      resolve(file || null);
    };

    input.click();
  });
}

function pickMultipleImages() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/jpg,image/png,image/webp';
    input.multiple = true;

    input.onchange = (e) => {
      const files = Array.from(e.target.files || []);
      resolve(files);
    };

    input.click();
  });
}

// ═══════════════════════════════════════════════════════
//   ⚡ Upload Widget (UI Component)
// ═══════════════════════════════════════════════════════

/**
 * ⚡ يبني HTML component لرفع الصورة
 * @param {string} containerId
 * @param {string} currentUrl
 * @param {Function} onUpload
 * @param {Function} onRemove
 * @param {Object} options - { currentHash, currentURL, enableCropper }
 */
function renderUploadWidget(containerId, currentUrl = '', onUpload = null, onRemove = null, options = {}) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const hasPhoto = !!currentUrl;
  const enableCropper = options.enableCropper !== false; // ⚡ افتراضي: مفعّل

  // ⚡ احفظ options في dataset
  container.dataset.currentHash = options.currentHash || '';
  container.dataset.currentURL = options.currentURL || currentUrl || '';
  container.dataset.enableCropper = enableCropper ? '1' : '0';

  container.innerHTML = `
    <div class="upload-widget">
      <div class="upload-preview" id="${containerId}-preview">
        ${hasPhoto
          ? `<img src="${currentUrl}" alt="Preview" class="upload-img" id="${containerId}-img" />`
          : `<div class="upload-placeholder">
              <span class="upload-placeholder-icon">👤</span>
              <span class="upload-placeholder-text">لا توجد صورة</span>
             </div>`
        }
        <div class="upload-loading" id="${containerId}-loading" style="display:none;">
          <div class="upload-spinner"></div>
          <span>جاري الرفع...</span>
        </div>
      </div>

      <div class="upload-actions">
        <button type="button" class="btn-primary upload-btn" id="${containerId}-upload-btn">
          📤 ${hasPhoto ? 'تغيير الصورة' : 'رفع صورة'}
        </button>

        ${hasPhoto ? `
          <button type="button" class="btn-secondary upload-btn" id="${containerId}-remove-btn">
            🗑️ مسح
          </button>
        ` : ''}
      </div>

      <p class="upload-hint">
        JPG / PNG / WebP — بحد أقصى 5 MB
      </p>
    </div>
  `;

  const uploadBtn = document.getElementById(`${containerId}-upload-btn`);
  const removeBtn = document.getElementById(`${containerId}-remove-btn`);

  // ═══ Upload Button ═══
  if (uploadBtn) {
    uploadBtn.onclick = async () => {
      const file = await pickImage();
      if (!file) return;

      // ⚡ افتح الـCropper لو مفعّل
      if (enableCropper && typeof window.openImageCropper === 'function') {
        window.openImageCropper(file, (croppedFile) => {
          doUpload(containerId, croppedFile, onUpload);
        }, { outputSize: 500 });
        return;
      }

      // ⚡ Fallback: ارفع بدون قص
      doUpload(containerId, file, onUpload);
    };
  }

  // ═══ Remove Button ═══
  if (removeBtn) {
    removeBtn.onclick = () => {
      if (typeof onRemove === 'function') onRemove();
      handleRemove(containerId, onRemove);
    };
  }
}

// ═══ ⚡ رفع فعلي ═══
async function doUpload(containerId, file, onUpload) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const preview = document.getElementById(`${containerId}-preview`);
  const loading = document.getElementById(`${containerId}-loading`);
  const uploadBtn = document.getElementById(`${containerId}-upload-btn`);
  const removeBtn = document.getElementById(`${containerId}-remove-btn`);

  if (loading) loading.style.display = 'flex';
  if (uploadBtn) uploadBtn.disabled = true;
  if (removeBtn) removeBtn.disabled = true;

  try {
    const prevHash = container.dataset.currentHash || '';
    const prevURL = container.dataset.currentURL || '';

    const result = await uploadPersonPhoto(file, prevHash, prevURL);

    // ⚡ حدّث الـdataset
    container.dataset.currentHash = result.hash;
    container.dataset.currentURL = result.url;

    if (result.isDuplicate) {
      console.log('♻️ Used cached photo URL');
    }

    // ⚡ Rebuild كامل للـPreview (يحل مشكلة insertBefore)
    if (preview) {
      preview.innerHTML = `
        <img src="${result.url}" alt="Preview" class="upload-img" id="${containerId}-img" />
        <div class="upload-loading" id="${containerId}-loading" style="display:none;">
          <div class="upload-spinner"></div>
          <span>جاري الرفع...</span>
        </div>
      `;
    }

    // ⚡ حدّث نص الزرار
    if (uploadBtn) uploadBtn.innerHTML = '📤 تغيير الصورة';

    // ⚡ ضيف زرار المسح لو مش موجود
    const actionsDiv = container.querySelector('.upload-actions');
    if (actionsDiv) {
      let currentRemoveBtn = document.getElementById(`${containerId}-remove-btn`);

      if (!currentRemoveBtn) {
        currentRemoveBtn = document.createElement('button');
        currentRemoveBtn.type = 'button';
        currentRemoveBtn.className = 'btn-secondary upload-btn';
        currentRemoveBtn.id = `${containerId}-remove-btn`;
        currentRemoveBtn.innerHTML = '🗑️ مسح';
        actionsDiv.appendChild(currentRemoveBtn);
      }

      currentRemoveBtn.onclick = () => {
        handleRemove(containerId, null);
      };
    }

    // ⚡ استدعي الـcallback
    if (typeof onUpload === 'function') {
      onUpload({ url: result.url, hash: result.hash, isDuplicate: result.isDuplicate });
    }

  } catch (err) {
    console.error('❌ Upload error:', err);
    alert('❌ فشل الرفع: ' + err.message);
  } finally {
    const l = document.getElementById(`${containerId}-loading`);
    if (l) l.style.display = 'none';
    if (uploadBtn) uploadBtn.disabled = false;
    if (removeBtn) removeBtn.disabled = false;
  }
}

// ═══ ⚡ مسح الصورة ═══
function handleRemove(containerId, onRemove) {
  if (!confirm('⚠️ هل تريد مسح الصورة؟')) return;

  const container = document.getElementById(containerId);
  if (!container) return;

  // ⚡ نمسح الـURL من الـdataset (نسيب الـhash عشان نقدر نطابق لو رفعها تاني)
  container.dataset.currentURL = '';

  // ⚡ Rebuild الـPreview
  const preview = document.getElementById(`${containerId}-preview`);
  if (preview) {
    preview.innerHTML = `
      <div class="upload-placeholder">
        <span class="upload-placeholder-icon">👤</span>
        <span class="upload-placeholder-text">لا توجد صورة</span>
      </div>
      <div class="upload-loading" id="${containerId}-loading" style="display:none;">
        <div class="upload-spinner"></div>
        <span>جاري الرفع...</span>
      </div>
    `;
  }

  // ⚡ شيل زرار المسح
  const rb = document.getElementById(`${containerId}-remove-btn`);
  if (rb) rb.remove();

  // ⚡ رجّع نص الزرار
  const uploadBtn = document.getElementById(`${containerId}-upload-btn`);
  if (uploadBtn) uploadBtn.innerHTML = '📤 رفع صورة';

  // ⚡ استدعي الـcallback
  if (typeof onRemove === 'function') onRemove();

  // ⚡ أعد ربط الزرار
  if (uploadBtn) {
    uploadBtn.onclick = async () => {
      const file = await pickImage();
      if (!file) return;

      const enableCropper = container.dataset.enableCropper !== '0';

      if (enableCropper && typeof window.openImageCropper === 'function') {
        window.openImageCropper(file, (croppedFile) => {
          doUpload(containerId, croppedFile, null);
        }, { outputSize: 500 });
        return;
      }

      doUpload(containerId, file, null);
    };
  }
}

// ═══════════════════════════════════════════════════════
//   ⚡ Theme Upload (Logo & Background)
// ═══════════════════════════════════════════════════════

async function uploadLogoImage(file) {
  if (!file) throw new Error('لا يوجد ملف');

  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error('صيغة الصورة غير مدعومة');
  }

  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`حجم الصورة أكبر من ${MAX_FILE_SIZE / 1024 / 1024} MB`);
  }

  const compressed = await compressImage(file, 500, 500, 0.9);
  const result = await uploadToImgBB(compressed, `logo_${Date.now()}`);

  return result.url;
}

async function uploadBgImage(file) {
  if (!file) throw new Error('لا يوجد ملف');

  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error('صيغة الصورة غير مدعومة');
  }

  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`حجم الصورة أكبر من ${MAX_FILE_SIZE / 1024 / 1024} MB`);
  }

  const compressed = await compressImage(file, 1920, 1080, 0.85);
  const result = await uploadToImgBB(compressed, `background_${Date.now()}`);

  return result.url;
}

// ═══════════════════════════════════════════════════════
//   Expose to window
// ═══════════════════════════════════════════════════════

window.compressImage = compressImage;
window.uploadToImgBB = uploadToImgBB;
window.uploadPersonPhoto = uploadPersonPhoto;
window.uploadLogoImage = uploadLogoImage;
window.uploadBgImage = uploadBgImage;
window.pickImage = pickImage;
window.getFileHash = getFileHash;
window.renderUploadWidget = renderUploadWidget;
window.pickMultipleImages = pickMultipleImages;
window.checkImageExistsStrict = checkImageExistsStrict;
