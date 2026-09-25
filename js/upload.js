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
  console.log('📤 [uploadToImgBB] بدء:', {
    blobSize: blob?.size,
    blobType: blob?.type,
    name: name
  });

  if (!blob || blob.size === 0) {
    throw new Error('❌ الملف فاضي (0 bytes)');
  }

  const formData = new FormData();
  formData.append('image', blob);
  if (name) formData.append('name', name);

  console.log('📤 [uploadToImgBB] جاري الإرسال...');

  const response = await fetch(`${IMGBB_UPLOAD_URL}?key=${IMGBB_API_KEY}`, {
    method: 'POST',
    body: formData
  });

  console.log('📤 [uploadToImgBB] Response status:', response.status);

  if (!response.ok) {
    let errorData = null;
    try {
      errorData = await response.json();
    } catch (e) {
      errorData = await response.text();
    }

    console.error('❌ [uploadToImgBB] Error:', {
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
    console.error('❌ [uploadToImgBB] not success:', data);
    throw new Error(data.error?.message || 'فشل رفع الصورة');
  }

  console.log('✅ [uploadToImgBB] نجح:', data.data.url);

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
//   ⚡ Main Upload Function
// ═══════════════════════════════════════════════════════

async function uploadPersonPhoto(file, previousHash = '', previousURL = '', originalFile = null) {
  console.log('📤 [uploadPersonPhoto] بدء:', {
    fileName: file?.name,
    fileSize: file?.size,
    fileType: file?.type,
    previousHash: previousHash ? previousHash.substring(0, 12) + '...' : '',
    previousURL: previousURL,
    hasOriginal: !!originalFile
  });

  // ⚡ 1. تحقق من النوع
  if (!file || !file.type) {
    throw new Error('❌ لا يوجد ملف');
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    console.error('❌ نوع الملف غير مدعوم:', file.type);
    throw new Error('صيغة الصورة غير مدعومة. استخدم JPG أو PNG أو WebP');
  }

  // ⚡ 2. تحقق من الحجم
  if (file.size > MAX_FILE_SIZE) {
    console.error('❌ الملف كبير:', file.size);
    throw new Error(`حجم الصورة أكبر من ${MAX_FILE_SIZE / 1024 / 1024} MB`);
  }

    // ⚡ 3. احسب الـhash
  // ⚡ لو فيه originalFile (بعد Cropper) → نحسب الـHash من الأصلية
  //    عشان نمنع الرفع المكرر لنفس الصورة
  console.log('📤 [uploadPersonPhoto] حساب الـhash...');
  const hashSource = originalFile || file;
  const hash = await getFileHash(hashSource);
  console.log('📤 [uploadPersonPhoto] Hash:', hash.substring(0, 12) + '...', originalFile ? '(from original)' : '(from file)');
  // ⚡ 4. تحقق من التكرار
  if (previousHash && previousURL && hash === previousHash) {
    console.log('📤 [uploadPersonPhoto] نفس الصورة — فحص لو موجودة على ImgBB...');

    if (typeof checkImageExistsStrict === 'function') {
      const exists = await checkImageExistsStrict(previousURL);

      if (exists) {
        console.log('♻️ [uploadPersonPhoto] الصورة موجودة — استخدام القديمة');
        return {
          url: previousURL,
          hash: hash,
          isDuplicate: true
        };
      } else {
        console.log('❌ [uploadPersonPhoto] الصورة مش موجودة — رفع جديد');
      }
    }
  }

  // ⚡ 5. اضغط الصورة
  console.log('📤 [uploadPersonPhoto] ضغط الصورة...');
  const compressed = await compressImage(file);
  console.log('📤 [uploadPersonPhoto] بعد الضغط:', compressed.size, 'bytes');

  // ⚡ 6. ارفع
  console.log('📤 [uploadPersonPhoto] بدء الرفع لـImgBB...');
  const result = await uploadToImgBB(compressed, `person_${Date.now()}`);
  console.log('✅ [uploadPersonPhoto] تم الرفع:', result.url);

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

function renderUploadWidget(containerId, currentUrl = '', onUpload = null, onRemove = null, options = {}) {
  const container = document.getElementById(containerId);
  if (!container) {
    console.error('❌ [renderUploadWidget] container مش موجود:', containerId);
    return;
  }

  const hasPhoto = !!currentUrl;
  const enableCropper = options.enableCropper !== false;

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

      console.log('📤 [renderUploadWidget] تم اختيار ملف:', file.name, file.size, 'bytes');

            if (enableCropper && typeof window.openImageCropper === 'function') {
        window.openImageCropper(file, (croppedFile, originalFile) => {
          console.log('📤 [renderUploadWidget] تم قص الصورة:', croppedFile.size, 'bytes');
          doUpload(containerId, croppedFile, onUpload, originalFile);
        }, { outputSize: 500 });
        return;
      }

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
async function doUpload(containerId, file, onUpload, originalFile = null) {
  console.log('📤 [doUpload] بدء:', { containerId, fileName: file?.name, fileSize: file?.size, hasOriginal: !!originalFile });

  const container = document.getElementById(containerId);
  if (!container) {
    console.error('❌ [doUpload] container مش موجود:', containerId);
    return;
  }

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

    console.log('📤 [doUpload] بدء رفع الصورة...');
    const result = await uploadPersonPhoto(file, prevHash, prevURL, originalFile);
    console.log('✅ [doUpload] الرفع نجح:', result);

    container.dataset.currentHash = result.hash;
    container.dataset.currentURL = result.url;

    if (preview) {
      preview.innerHTML = `
        <img src="${result.url}" alt="Preview" class="upload-img" id="${containerId}-img" />
        <div class="upload-loading" id="${containerId}-loading" style="display:none;">
          <div class="upload-spinner"></div>
          <span>جاري الرفع...</span>
        </div>
      `;
    }

    if (uploadBtn) uploadBtn.innerHTML = '📤 تغيير الصورة';

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

    if (typeof onUpload === 'function') {
      onUpload({ url: result.url, hash: result.hash, isDuplicate: result.isDuplicate });
    }

  } catch (err) {
    console.error('❌❌❌ [doUpload] فشل الرفع:', err);
    console.error('❌ [doUpload] Stack:', err.stack);
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

  container.dataset.currentURL = '';

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

  const rb = document.getElementById(`${containerId}-remove-btn`);
  if (rb) rb.remove();

  const uploadBtn = document.getElementById(`${containerId}-upload-btn`);
  if (uploadBtn) uploadBtn.innerHTML = '📤 رفع صورة';

  if (typeof onRemove === 'function') onRemove();

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

// ═══════════════════════════════════════════════════════
//   ⚡ Voice Upload (Catbox)
// ═══════════════════════════════════════════════════════

const CATBOX_UPLOAD_URL = 'https://catbox.moe/user/api.php';

/**
 * ⚡ رفع ملف صوتي على Catbox
 * @param {Blob} audioBlob - ملف الصوت
 * @returns {Promise<string>} - URL الصوت
 */
async function uploadVoiceMessage(audioBlob) {
  if (!audioBlob || audioBlob.size === 0) {
    throw new Error('❌ لا يوجد صوت');
  }

  // ⚡ الحد الأقصى (200 MB لـCatbox)
  const MAX_VOICE_SIZE = 200 * 1024 * 1024;
  if (audioBlob.size > MAX_VOICE_SIZE) {
    throw new Error('❌ الصوت أكبر من الحد المسموح');
  }

  console.log('📤 [uploadVoiceMessage] بدء:', {
    size: audioBlob.size,
    type: audioBlob.type
  });

  const formData = new FormData();
  formData.append('reqtype', 'fileupload');
  formData.append('fileToUpload', audioBlob, `voice_${Date.now()}.webm`);

  const response = await fetch(CATBOX_UPLOAD_URL, {
    method: 'POST',
    body: formData
  });

  if (!response.ok) {
    throw new Error(`Catbox error: ${response.status}`);
  }

  const url = await response.text();

  if (!url || !url.startsWith('http')) {
    throw new Error('❌ استجابة غير صالحة من Catbox');
  }

  console.log('✅ [uploadVoiceMessage] تم الرفع:', url);

  return url.trim();
}

window.uploadVoiceMessage = uploadVoiceMessage;

window.checkImageExistsStrict = checkImageExistsStrict;
