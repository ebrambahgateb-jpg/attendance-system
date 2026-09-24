// ═══════════════════════════════════════════════════════
//   Upload Utility — ImgBB + Duplicate Prevention
//   ⚡ ضغط + رفع + كشف تكرار نفس الصورة
// ═══════════════════════════════════════════════════════

// ═══ Constants ═══
const IMGBB_API_KEY = 'e222a3609a80a1de3ccb555dabcc355e';
const IMGBB_UPLOAD_URL = 'https://api.imgbb.com/1/upload';

// ═══ Compression Defaults ═══
const DEFAULT_MAX_WIDTH = 1920;
const DEFAULT_MAX_HEIGHT = 1920;
const DEFAULT_QUALITY = 0.95;
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB (بدل 2 MB)

// ═══ Allowed Types ═══
const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

// ═══════════════════════════════════════════════════════
//   ⚡ SHA-256 Hash
// ═══════════════════════════════════════════════════════

/**
 * ⚡ حساب SHA-256 hash للملف
 * @param {File|Blob} file
 * @returns {Promise<string>} - hex string
 */
async function getFileHash(file) {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  } catch (err) {
    console.warn('⚠️ getFileHash error:', err);
    // ⚡ Fallback: hash بسيط (لو crypto.subtle مش مدعوم)
    return fallbackHash(file);
  }
}

/**
 * ⚡ Fallback hash (لو crypto.subtle مش متاح)
 */
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
  const formData = new FormData();
  formData.append('image', blob);
  if (name) formData.append('name', name);

  const response = await fetch(`${IMGBB_UPLOAD_URL}?key=${IMGBB_API_KEY}`, {
    method: 'POST',
    body: formData
  });

  if (!response.ok) {
    throw new Error(`ImgBB API error: ${response.status}`);
  }

  const data = await response.json();

  if (!data.success) {
    throw new Error(data.error?.message || 'فشل رفع الصورة');
  }

  return {
    url: data.data.url,
    thumb: data.data.thumb?.url || data.data.url,
    display: data.data.display_url || data.data.url,
    deleteUrl: data.data.delete_url || '',
    id: data.data.id || ''
  };
}

// ═══════════════════════════════════════════════════════
//   ⚡ Main Upload Function (with Duplicate Check)
// ═══════════════════════════════════════════════════════

/**
 * ⚡ رفع صورة شخص (ضغط + رفع + فحص التكرار)
 * @param {File} file - الملف الأصلي
 * @param {string} previousHash - hash الصورة السابقة (اختياري)
 * @param {string} previousURL - URL الصورة السابقة (اختياري)
 * @returns {Promise<{url: string, hash: string, isDuplicate: boolean}>}
 */
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

  // ⚡ 4. تحقق من التكرار (نفس الشخص)
  if (previousHash && previousURL && hash === previousHash) {
    console.log('♻️ Same photo detected — reusing cached URL');
    return {
      url: previousURL,
      hash: hash,
      isDuplicate: true
    };
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
//   ⚡ File Picker Helper
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

/**
 * ⚡ فتح File Picker لاختيار عدة صور
 * @returns {Promise<File[]>}
 */
function pickMultipleImages() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/jpg,image/png,image/webp';
    input.multiple = true;  // ⚡ متعدد

    input.onchange = (e) => {
      const files = Array.from(e.target.files || []);
      resolve(files);
    };

    input.click();
  });
} 

// ═══════════════════════════════════════════════════════
//   ⚡ Upload Component (UI Widget)
// ═══════════════════════════════════════════════════════

/**
 * ⚡ يبني HTML component لرفع الصورة
 * @param {string} containerId - ID الـcontainer
 * @param {string} currentUrl - رابط الصورة الحالية (اختياري)
 * @param {Function} onUpload - دالة تُستدعى بعد الرفع ({url, hash}) => {}
 * @param {Function} onRemove - دالة تُستدعى بعد المسح () => {}
 * @param {Object} options - خيارات إضافية: { currentHash, currentURL }
 */
function renderUploadWidget(containerId, currentUrl = '', onUpload = null, onRemove = null, options = {}) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const hasPhoto = !!currentUrl;

  // ⚡ احفظ options في dataset
  container.dataset.currentHash = options.currentHash || '';
  container.dataset.currentURL = options.currentURL || currentUrl || '';

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
        JPG / PNG / WebP — بحد أقصى 2 MB
      </p>
    </div>
  `;

  // ═══ Upload Button ═══
  const uploadBtn = document.getElementById(`${containerId}-upload-btn`);
  const removeBtn = document.getElementById(`${containerId}-remove-btn`);
  const preview = document.getElementById(`${containerId}-preview`);

  if (uploadBtn) {
    uploadBtn.onclick = async () => {
      const file = await pickImage();
      if (!file) return;

      const loading = document.getElementById(`${containerId}-loading`);
      if (loading) loading.style.display = 'flex';
      uploadBtn.disabled = true;
      if (removeBtn) removeBtn.disabled = true;

      try {
        // ⚡ استخدم الـhash والـURL المحفوظين
        const prevHash = container.dataset.currentHash || '';
        const prevURL = container.dataset.currentURL || '';

        const result = await uploadPersonPhoto(file, prevHash, prevURL);

        // ⚡ حدّث الـdataset بالـhash الجديد
        container.dataset.currentHash = result.hash;
        container.dataset.currentURL = result.url;

        // ⚡ لو كانت نسخة مكررة، اعرض رسالة
        if (result.isDuplicate) {
          console.log('♻️ Used cached photo URL');
        }

        // ⚡ حدّث الـPreview
        if (preview) {
          const placeholder = preview.querySelector('.upload-placeholder');
          const img = preview.querySelector('.upload-img');

          if (img) {
            img.src = result.url;
          } else {
            if (placeholder) placeholder.remove();
            const newImg = document.createElement('img');
            newImg.src = result.url;
            newImg.className = 'upload-img';
            newImg.id = `${containerId}-img`;
            preview.insertBefore(newImg, loading);
          }
        }

        // ⚡ ضيف زرار مسح لو مش موجود
        let currentRemoveBtn = document.getElementById(`${containerId}-remove-btn`);
        if (!currentRemoveBtn) {
          const actionsDiv = document.querySelector(`#${containerId} .upload-actions`);
          if (actionsDiv) {
            currentRemoveBtn = document.createElement('button');
            currentRemoveBtn.type = 'button';
            currentRemoveBtn.className = 'btn-secondary upload-btn';
            currentRemoveBtn.id = `${containerId}-remove-btn`;
            currentRemoveBtn.innerHTML = '🗑️ مسح';
            actionsDiv.appendChild(currentRemoveBtn);
          }
        }

        uploadBtn.innerHTML = '📤 تغيير الصورة';

        // ⚡ اربط زرار المسح
        if (currentRemoveBtn) {
          currentRemoveBtn.onclick = () => {
            if (typeof onRemove === 'function') onRemove();
            handleRemove(containerId, preview, uploadBtn, onUpload);
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
        if (loading) loading.style.display = 'none';
        uploadBtn.disabled = false;
        if (removeBtn) removeBtn.disabled = false;
      }
    };
  }

  // ═══ Remove Button ═══
  if (removeBtn) {
    removeBtn.onclick = () => {
      if (typeof onRemove === 'function') onRemove();
      handleRemove(containerId, preview, uploadBtn, onUpload);
    };
  }
}

/**
 * ⚡ مسح الصورة من الـUI (بدون مسح الـhash)
 */
function handleRemove(containerId, preview, uploadBtn, onUpload) {
  if (!confirm('⚠️ هل تريد مسح الصورة؟')) return;

  const container = document.getElementById(containerId);
  if (!container) return;

  // ⚡ نمسح الـURL بس من الـdataset (نسيب الـhash عشان نقدر نطابق لو رفعها تاني)
  container.dataset.currentURL = '';

  // ⚡ استبدل الصورة بـplaceholder
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

  // ⚡ رجّع نص الزرار الأصلي
  if (uploadBtn) {
    uploadBtn.innerHTML = '📤 رفع صورة';

    // ⚡ أعد ربط زرار الرفع
    uploadBtn.onclick = async () => {
      const file = await pickImage();
      if (!file) return;

      const loading = document.getElementById(`${containerId}-loading`);
      if (loading) loading.style.display = 'flex';
      uploadBtn.disabled = true;

      try {
        const prevHash = container.dataset.currentHash || '';
        const prevURL = container.dataset.currentURL || '';

        const result = await uploadPersonPhoto(file, prevHash, prevURL);

        // ⚡ حدّث
        container.dataset.currentHash = result.hash;
        container.dataset.currentURL = result.url;

        if (result.isDuplicate) {
          console.log('♻️ Used cached photo URL (reused)');
        }

        // ⚡ ارسم الصورة
        const newPreview = document.getElementById(`${containerId}-preview`);
        if (newPreview) {
          newPreview.innerHTML = `
            <img src="${result.url}" alt="Preview" class="upload-img" />
            <div class="upload-loading" id="${containerId}-loading" style="display:none;">
              <div class="upload-spinner"></div>
              <span>جاري الرفع...</span>
            </div>
          `;
        }

        uploadBtn.innerHTML = '📤 تغيير الصورة';

        // ⚡ ضيف زرار مسح
        const actionsDiv = document.querySelector(`#${containerId} .upload-actions`);
        if (actionsDiv) {
          const newRemoveBtn = document.createElement('button');
          newRemoveBtn.type = 'button';
          newRemoveBtn.className = 'btn-secondary upload-btn';
          newRemoveBtn.id = `${containerId}-remove-btn`;
          newRemoveBtn.innerHTML = '🗑️ مسح';

          newRemoveBtn.onclick = () => {
            const p = document.getElementById(`${containerId}-preview`);
            // ⚡ استدعي onRemove (لو موجود) عشان نمسح الـURL من الـDB
            if (typeof window._uploadOnRemove?.[containerId] === 'function') {
              window._uploadOnRemove[containerId]();
            }
            handleRemove(containerId, p, uploadBtn, onUpload);
          };

          actionsDiv.appendChild(newRemoveBtn);
        }

        if (typeof onUpload === 'function') {
          onUpload({ url: result.url, hash: result.hash, isDuplicate: result.isDuplicate });
        }

      } catch (err) {
        alert('❌ فشل الرفع: ' + err.message);
      } finally {
        const l = document.getElementById(`${containerId}-loading`);
        if (l) l.style.display = 'none';
        uploadBtn.disabled = false;
      }
    };
  }
}

// ═══════════════════════════════════════════════════════
//   Expose
// ═══════════════════════════════════════════════════════

window.compressImage = compressImage;
window.uploadToImgBB = uploadToImgBB;
window.uploadPersonPhoto = uploadPersonPhoto;
window.pickImage = pickImage;
window.getFileHash = getFileHash;
window.renderUploadWidget = renderUploadWidget;
window.pickMultipleImages = pickMultipleImages;
