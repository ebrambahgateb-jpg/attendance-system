// ═══════════════════════════════════════════════════════
//   Upload Utility — ImgBB
//   ⚡ ضغط + رفع + معاينة الصور
// ═══════════════════════════════════════════════════════

// ═══ Constants ═══
const IMGBB_API_KEY = 'e222a3609a80a1de3ccb555dabcc355e';
const IMGBB_UPLOAD_URL = 'https://api.imgbb.com/1/upload';

// ═══ Compression Defaults ═══
const DEFAULT_MAX_WIDTH = 500;
const DEFAULT_MAX_HEIGHT = 500;
const DEFAULT_QUALITY = 0.85;
const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2 MB

// ═══ Allowed Types ═══
const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

// ═══════════════════════════════════════════════════════
//   ⚡ Compress Image (Before upload)
// ═══════════════════════════════════════════════════════

/**
 * ⚡ ضغط الصورة قبل الرفع
 * @param {File} file - الملف الأصلي
 * @param {number} maxWidth - أقصى عرض (px)
 * @param {number} maxHeight - أقصى ارتفاع (px)
 * @param {number} quality - جودة الصورة (0.1 → 1)
 * @returns {Promise<Blob>} - الـBlob المضغوط
 */
async function compressImage(file, maxWidth = DEFAULT_MAX_WIDTH, maxHeight = DEFAULT_MAX_HEIGHT, quality = DEFAULT_QUALITY) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      const img = new Image();

      img.onload = () => {
        let { width, height } = img;

        // ⚡ احسب الأبعاد الجديدة (حفظ النسبة)
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        // ⚡ ارسم الصورة على Canvas
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        // ⚡ حوّل لـBlob
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

/**
 * ⚡ رفع الصورة لـImgBB
 * @param {Blob|File} blob - الصورة (بعد الضغط)
 * @param {string} name - اسم الصورة (اختياري)
 * @returns {Promise<{url: string, thumb: string, deleteUrl: string}>}
 */
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
//   ⚡ Main Upload Function (Compress + Upload)
// ═══════════════════════════════════════════════════════

/**
 * ⚡ رفع صورة شخص (ضغط + رفع)
 * @param {File} file - الملف الأصلي
 * @returns {Promise<string>} - رابط الصورة
 */
async function uploadPersonPhoto(file) {
  // ⚡ 1. تحقق من النوع
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error('صيغة الصورة غير مدعومة. استخدم JPG أو PNG أو WebP');
  }

  // ⚡ 2. تحقق من الحجم
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`حجم الصورة أكبر من ${MAX_FILE_SIZE / 1024 / 1024} MB`);
  }

  // ⚡ 3. اضغط الصورة
  const compressed = await compressImage(file);

  // ⚡ 4. ارفع
  const result = await uploadToImgBB(compressed, `person_${Date.now()}`);

  return result.url;
}

// ═══════════════════════════════════════════════════════
//   ⚡ File Picker Helper
// ═══════════════════════════════════════════════════════

/**
 * ⚡ فتح File Picker
 * @returns {Promise<File|null>}
 */
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

// ═══════════════════════════════════════════════════════
//   ⚡ Upload Component (UI Widget)
// ═══════════════════════════════════════════════════════

/**
 * ⚡ يبني HTML component لرفع الصورة
 * @param {string} containerId - ID الـcontainer
 * @param {string} currentUrl - رابط الصورة الحالية (اختياري)
 * @param {Function} onUpload - دالة تُستدعى بعد الرفع (url) => {}
 * @param {Function} onRemove - دالة تُستدعى بعد المسح () => {}
 */
function renderUploadWidget(containerId, currentUrl = '', onUpload = null, onRemove = null) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const hasPhoto = !!currentUrl;

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
  const loading = document.getElementById(`${containerId}-loading`);

  if (uploadBtn) {
    uploadBtn.onclick = async () => {
      const file = await pickImage();
      if (!file) return;

      // ⚡ عرض الـloading
      if (loading) loading.style.display = 'flex';
      uploadBtn.disabled = true;
      if (removeBtn) removeBtn.disabled = true;

      try {
        const url = await uploadPersonPhoto(file);

        // ⚡ حدّث الـPreview
        if (preview) {
          const placeholder = preview.querySelector('.upload-placeholder');
          const img = preview.querySelector('.upload-img');

          if (img) {
            img.src = url;
          } else {
            if (placeholder) placeholder.remove();
            const newImg = document.createElement('img');
            newImg.src = url;
            newImg.className = 'upload-img';
            newImg.id = `${containerId}-img`;
            preview.insertBefore(newImg, loading);
          }
        }

        // ⚡ غيّر الزرار لـ"تغيير" + ضيف مسح
        uploadBtn.innerHTML = '📤 تغيير الصورة';
        if (!document.getElementById(`${containerId}-remove-btn`)) {
          const actionsDiv = document.querySelector(`#${containerId} .upload-actions`);
          if (actionsDiv) {
            const removeBtnNew = document.createElement('button');
            removeBtnNew.type = 'button';
            removeBtnNew.className = 'btn-secondary upload-btn';
            removeBtnNew.id = `${containerId}-remove-btn`;
            removeBtnNew.innerHTML = '🗑️ مسح';
            actionsDiv.appendChild(removeBtnNew);
            removeBtnNew.onclick = () => handleRemove(containerId, onRemove, preview, uploadBtn);
          }
        } else {
          const rb = document.getElementById(`${containerId}-remove-btn`);
          if (rb) rb.onclick = () => handleRemove(containerId, onRemove, preview, uploadBtn);
        }

        // ⚡ استدعي الـcallback
        if (typeof onUpload === 'function') onUpload(url);

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
    removeBtn.onclick = () => handleRemove(containerId, onRemove, preview, uploadBtn);
  }
}

function handleRemove(containerId, onRemove, preview, uploadBtn) {
  if (!confirm('⚠️ هل تريد مسح الصورة؟')) return;

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

  // ⚡ رجّع النص الأصلي
  if (uploadBtn) uploadBtn.innerHTML = '📤 رفع صورة';

  // ⚡ استدعي الـcallback
  if (typeof onRemove === 'function') onRemove();

  // ⚡ أعد ربط زرار الرفع (عشان الـloading اتغير)
  const newPreview = document.getElementById(`${containerId}-preview`);
  const newLoading = document.getElementById(`${containerId}-loading`);
  if (uploadBtn && newPreview) {
    uploadBtn.onclick = async () => {
      const file = await pickImage();
      if (!file) return;

      if (newLoading) newLoading.style.display = 'flex';
      uploadBtn.disabled = true;

      try {
        const url = await uploadPersonPhoto(file);

        newPreview.innerHTML = `
          <img src="${url}" alt="Preview" class="upload-img" id="${containerId}-img" />
          <div class="upload-loading" id="${containerId}-loading" style="display:none;">
            <div class="upload-spinner"></div>
            <span>جاري الرفع...</span>
          </div>
        `;

        uploadBtn.innerHTML = '📤 تغيير الصورة';

        // ⚡ ضيف زرار المسح من جديد
        const actionsDiv = document.querySelector(`#${containerId} .upload-actions`);
        if (actionsDiv) {
          const removeBtnNew = document.createElement('button');
          removeBtnNew.type = 'button';
          removeBtnNew.className = 'btn-secondary upload-btn';
          removeBtnNew.id = `${containerId}-remove-btn`;
          removeBtnNew.innerHTML = '🗑️ مسح';

          removeBtnNew.onclick = () => {
            const p = document.getElementById(`${containerId}-preview`);
            handleRemove(containerId, onRemove, p, uploadBtn);
          };

          actionsDiv.appendChild(removeBtnNew);
        }

        if (typeof window._uploadCallbacks === 'undefined') window._uploadCallbacks = {};
        // ⚡ نستخدم نفس callback الأصلي
        // (لأننا محتاجين نحفظهم — بس ده سهل، نستخدم closure)

        // ⚡ نستخدم callback متخزن
        if (containerId && window._uploadCallbacks?.[containerId]?.onUpload) {
          window._uploadCallbacks[containerId].onUpload(url);
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
window.renderUploadWidget = renderUploadWidget;
