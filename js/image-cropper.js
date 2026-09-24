// ═══════════════════════════════════════════════════════
//   Image Cropper — Facebook-style
//   ⚡ Drag + Zoom + Crop
// ═══════════════════════════════════════════════════════

// ═══ State ═══
let cropperState = {
  originalFile: null,
  imageElement: null,
  canvas: null,
  context: null,

  // ⚡ عرض + موقع
  imageWidth: 0,
  imageHeight: 0,
  baseScale: 1,      // ⚡ الحجم الأساسي للصورة في الـViewport
  zoom: 1,           // ⚡ الزووم الإضافي
  offsetX: 0,        // ⚡ الإزاحة الأفقية
  offsetY: 0,        // ⚡ الإزاحة الرأسية

  // ⚡ Drag state
  isDragging: false,
  dragStartX: 0,
  dragStartY: 0,
  dragInitialOffsetX: 0,
  dragInitialOffsetY: 0,

  // ⚡ Pinch state
  initialPinchDistance: 0,
  initialZoom: 0,

  // ═══ Output size (500×500) ═══
  outputSize: 500,

  // ═══ Callback ═══
  onCropCallback: null
};

// ═══════════════════════════════════════════════════════
//   Open Cropper
// ═══════════════════════════════════════════════════════

/**
 * ⚡ فتح الـCropper
 * @param {File} file - الملف الأصلي
 * @param {Function} onCrop - callback (croppedFile) => {}
 * @param {Object} options - { outputSize: 500 }
 */
async function openImageCropper(file, onCrop, options = {}) {
  if (!file) {
    console.warn('⚠️ No file provided');
    return;
  }

  cropperState.originalFile = file;
  cropperState.onCropCallback = onCrop;
  cropperState.outputSize = options.outputSize || 500;

  // ⚡ اقرأ الصورة
  const imageUrl = URL.createObjectURL(file);
  const img = new Image();

  img.onload = () => {
    cropperState.imageElement = img;
    cropperState.imageWidth = img.width;
    cropperState.imageHeight = img.height;

    // ⚡ افتح الـModal
    initCropperModal(img);
  };

  img.onerror = () => {
    alert('❌ فشل تحميل الصورة');
    URL.revokeObjectURL(imageUrl);
  };

  img.src = imageUrl;
}

// ═══════════════════════════════════════════════════════
//   Init Modal
// ═══════════════════════════════════════════════════════

function initCropperModal(img) {
  let modal = document.getElementById('imageCropperModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'imageCropperModal';
    modal.className = 'image-cropper-modal';
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div class="image-cropper-content">
      <div class="image-cropper-header">
        <h2>✂️ تعديل الصورة</h2>
        <button class="image-cropper-close" onclick="closeImageCropper()" aria-label="إغلاق">✕</button>
      </div>

      <div class="image-cropper-body">
        <div class="image-cropper-viewport" id="cropperViewport">
          <div class="image-cropper-canvas-wrap">
            <canvas id="cropperCanvas"></canvas>
          </div>
          <div class="image-cropper-overlay"></div>
          <div class="image-cropper-guide"></div>
        </div>

        <div class="image-cropper-controls">
          <button class="cropper-ctrl-btn" onclick="cropperZoomOut()" title="تصغير">−</button>
          <input type="range" id="cropperZoomSlider" min="1" max="3" step="0.01" value="1" class="cropper-zoom-slider" />
          <button class="cropper-ctrl-btn" onclick="cropperZoomIn()" title="تكبير">+</button>
        </div>

        <p class="image-cropper-hint">اسحب الصورة للتحريك • استخدم السلايدر أو عجلة الماوس للزووم</p>
      </div>

      <div class="image-cropper-footer">
        <button class="btn-secondary" onclick="closeImageCropper()">إلغاء</button>
        <button class="btn-primary" id="cropperSaveBtn">✂️ حفظ</button>
      </div>
    </div>
  `;

  modal.style.display = 'flex';

  // ⚡ Init canvas
  setTimeout(() => {
    initCropperCanvas();
  }, 50);
}

// ═══════════════════════════════════════════════════════
//   Init Canvas
// ═══════════════════════════════════════════════════════

function initCropperCanvas() {
  const viewport = document.getElementById('cropperViewport');
  const canvas = document.getElementById('cropperCanvas');
  if (!viewport || !canvas) return;

  const viewportSize = viewport.clientWidth;
  if (viewportSize === 0) return;

  // ⚡ اعمل الـcanvas مربع بحجم الـViewport
  canvas.width = viewportSize;
  canvas.height = viewportSize;

  cropperState.canvas = canvas;
  cropperState.context = canvas.getContext('2d');

  // ⚡ احسب الـbaseScale — خلي الصورة تغطي الـViewport بالكامل
  const img = cropperState.imageElement;
  const scaleX = viewportSize / img.width;
  const scaleY = viewportSize / img.height;
  cropperState.baseScale = Math.max(scaleX, scaleY);

  cropperState.zoom = 1;
  cropperState.offsetX = 0;
  cropperState.offsetY = 0;

  // ⚡ Reset الـSlider
  const slider = document.getElementById('cropperZoomSlider');
  if (slider) slider.value = 1;

  // ⚡ ارسم
  drawCropper();

  // ⚡ Event Listeners
  setupCropperEvents(viewport);
}

function drawCropper() {
  const canvas = cropperState.canvas;
  const ctx = cropperState.context;
  const img = cropperState.imageElement;

  if (!canvas || !ctx || !img) return;

  const size = canvas.width;

  // ⚡ امسح
  ctx.clearRect(0, 0, size, size);

  // ⚡ احسب المقاسات
  const totalScale = cropperState.baseScale * cropperState.zoom;
  const drawWidth = img.width * totalScale;
  const drawHeight = img.height * totalScale;

  // ⚡ الـcenter
  const centerX = size / 2;
  const centerY = size / 2;

  // ⚡ الموقع النهائي
  const drawX = centerX - drawWidth / 2 + cropperState.offsetX;
  const drawY = centerY - drawHeight / 2 + cropperState.offsetY;

  // ⚡ ارسم
  ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);
}

// ═══════════════════════════════════════════════════════
//   Events (Drag + Zoom + Pinch)
// ═══════════════════════════════════════════════════════

function setupCropperEvents(viewport) {
  // ⚡ Mouse Drag
  viewport.addEventListener('mousedown', handleCropperMouseDown);
  document.addEventListener('mousemove', handleCropperMouseMove);
  document.addEventListener('mouseup', handleCropperMouseUp);

  // ⚡ Touch Drag + Pinch
  viewport.addEventListener('touchstart', handleCropperTouchStart, { passive: false });
  viewport.addEventListener('touchmove', handleCropperTouchMove, { passive: false });
  viewport.addEventListener('touchend', handleCropperTouchEnd);

  // ⚡ Wheel Zoom
  viewport.addEventListener('wheel', handleCropperWheel, { passive: false });

  // ⚡ Slider
  const slider = document.getElementById('cropperZoomSlider');
  if (slider) {
    slider.oninput = (e) => {
      cropperState.zoom = Number(e.target.value);
      drawCropper();
    };
  }

  // ⚡ Save Button
  const saveBtn = document.getElementById('cropperSaveBtn');
  if (saveBtn) {
    saveBtn.onclick = handleCropperSave;
  }
}

function handleCropperMouseDown(e) {
  e.preventDefault();
  cropperState.isDragging = true;
  cropperState.dragStartX = e.clientX;
  cropperState.dragStartY = e.clientY;
  cropperState.dragInitialOffsetX = cropperState.offsetX;
  cropperState.dragInitialOffsetY = cropperState.offsetY;
}

function handleCropperMouseMove(e) {
  if (!cropperState.isDragging) return;

  const dx = e.clientX - cropperState.dragStartX;
  const dy = e.clientY - cropperState.dragStartY;

  cropperState.offsetX = cropperState.dragInitialOffsetX + dx;
  cropperState.offsetY = cropperState.dragInitialOffsetY + dy;

  drawCropper();
}

function handleCropperMouseUp() {
  cropperState.isDragging = false;
}

// ═══ Touch ═══
function handleCropperTouchStart(e) {
  if (e.touches.length === 1) {
    // ⚡ Drag
    cropperState.isDragging = true;
    cropperState.dragStartX = e.touches[0].clientX;
    cropperState.dragStartY = e.touches[0].clientY;
    cropperState.dragInitialOffsetX = cropperState.offsetX;
    cropperState.dragInitialOffsetY = cropperState.offsetY;
  } else if (e.touches.length === 2) {
    // ⚡ Pinch
    e.preventDefault();
    cropperState.isDragging = false;

    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    cropperState.initialPinchDistance = Math.hypot(dx, dy);
    cropperState.initialZoom = cropperState.zoom;
  }
}

function handleCropperTouchMove(e) {
  if (e.touches.length === 1 && cropperState.isDragging) {
    e.preventDefault();

    const dx = e.touches[0].clientX - cropperState.dragStartX;
    const dy = e.touches[0].clientY - cropperState.dragStartY;

    cropperState.offsetX = cropperState.dragInitialOffsetX + dx;
    cropperState.offsetY = cropperState.dragInitialOffsetY + dy;

    drawCropper();
  } else if (e.touches.length === 2 && cropperState.initialPinchDistance > 0) {
    e.preventDefault();

    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    const distance = Math.hypot(dx, dy);

    const ratio = distance / cropperState.initialPinchDistance;
    const newZoom = Math.max(1, Math.min(cropperState.initialZoom * ratio, 3));

    cropperState.zoom = newZoom;

    // ⚡ حدّث الـSlider
    const slider = document.getElementById('cropperZoomSlider');
    if (slider) slider.value = newZoom;

    drawCropper();
  }
}

function handleCropperTouchEnd(e) {
  if (e.touches.length === 0) {
    cropperState.isDragging = false;
    cropperState.initialPinchDistance = 0;
  } else if (e.touches.length === 1) {
    // ⚡ رجع للـdrag بإصبع واحد
    cropperState.isDragging = true;
    cropperState.dragStartX = e.touches[0].clientX;
    cropperState.dragStartY = e.touches[0].clientY;
    cropperState.dragInitialOffsetX = cropperState.offsetX;
    cropperState.dragInitialOffsetY = cropperState.offsetY;
    cropperState.initialPinchDistance = 0;
  }
}

function handleCropperWheel(e) {
  e.preventDefault();

  const delta = e.deltaY < 0 ? 0.1 : -0.1;
  const newZoom = Math.max(1, Math.min(cropperState.zoom + delta, 3));

  cropperState.zoom = newZoom;

  const slider = document.getElementById('cropperZoomSlider');
  if (slider) slider.value = newZoom;

  drawCropper();
}

// ═══ Zoom Buttons ═══
window.cropperZoomIn = function() {
  cropperState.zoom = Math.min(cropperState.zoom + 0.1, 3);
  const slider = document.getElementById('cropperZoomSlider');
  if (slider) slider.value = cropperState.zoom;
  drawCropper();
};

window.cropperZoomOut = function() {
  cropperState.zoom = Math.max(cropperState.zoom - 0.1, 1);
  const slider = document.getElementById('cropperZoomSlider');
  if (slider) slider.value = cropperState.zoom;
  drawCropper();
};

// ═══════════════════════════════════════════════════════
//   Save Crop
// ═══════════════════════════════════════════════════════

async function handleCropperSave() {
  const saveBtn = document.getElementById('cropperSaveBtn');
  const originalText = saveBtn ? saveBtn.textContent : '';
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.textContent = '⏳ جاري الحفظ...';
  }

  try {
    const croppedFile = await generateCroppedFile();

    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = originalText;
    }

    // ⚡ اقفل الـModal
    closeImageCropper();

    // ⚡ نادي الـcallback
    if (typeof cropperState.onCropCallback === 'function') {
      cropperState.onCropCallback(croppedFile);
    }

  } catch (err) {
    console.error('❌ Crop error:', err);
    alert('❌ فشل حفظ الصورة: ' + err.message);
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = originalText;
    }
  }
}

/**
 * ⚡ توليد الصورة النهائية (500×500)
 */
async function generateCroppedFile() {
  const outputSize = cropperState.outputSize;

  // ⚡ اعمل canvas مؤقت بحجم الـOutput
  const outputCanvas = document.createElement('canvas');
  outputCanvas.width = outputSize;
  outputCanvas.height = outputSize;

  const outCtx = outputCanvas.getContext('2d');

  // ⚡ املأ الخلفية بالأبيض (اختياري — لو عايز خلفية بيضاء)
  // ⚡ هنستخدم شفافية (بدون ملء) → PNG شفاف
  outCtx.clearRect(0, 0, outputSize, outputSize);

  const img = cropperState.imageElement;
  const viewportSize = cropperState.canvas.width;

  // ⚡ احسب نسبة التحويل من الـviewport للـoutput
  const ratio = outputSize / viewportSize;

  // ⚡ احسب المقاسات بنفس منطق الرسم
  const totalScale = cropperState.baseScale * cropperState.zoom;
  const drawWidth = img.width * totalScale;
  const drawHeight = img.height * totalScale;

  const centerX = viewportSize / 2;
  const centerY = viewportSize / 2;

  const drawX = centerX - drawWidth / 2 + cropperState.offsetX;
  const drawY = centerY - drawHeight / 2 + cropperState.offsetY;

  // ⚡ ارسم على الـOutput canvas
  outCtx.drawImage(
    img,
    drawX * ratio,
    drawY * ratio,
    drawWidth * ratio,
    drawHeight * ratio
  );

  // ⚡ حوّل لـBlob
  return new Promise((resolve, reject) => {
    outputCanvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('فشل توليد الصورة'));
          return;
        }

        // ⚡ حوّل لـFile
        const fileName = cropperState.originalFile.name || 'cropped.jpg';
        const croppedFile = new File([blob], fileName, { type: 'image/jpeg' });

        resolve(croppedFile);
      },
      'image/jpeg',
      0.95
    );
  });
}

// ═══════════════════════════════════════════════════════
//   Close Cropper
// ═══════════════════════════════════════════════════════

window.closeImageCropper = function() {
  const modal = document.getElementById('imageCropperModal');
  if (modal) modal.style.display = 'none';

  // ⚡ Cleanup
  if (cropperState.imageElement) {
    try { URL.revokeObjectURL(cropperState.imageElement.src); } catch (e) {}
  }

  cropperState = {
    originalFile: null,
    imageElement: null,
    canvas: null,
    context: null,
    imageWidth: 0,
    imageHeight: 0,
    baseScale: 1,
    zoom: 1,
    offsetX: 0,
    offsetY: 0,
    isDragging: false,
    dragStartX: 0,
    dragStartY: 0,
    dragInitialOffsetX: 0,
    dragInitialOffsetY: 0,
    initialPinchDistance: 0,
    initialZoom: 0,
    outputSize: 500,
    onCropCallback: null
  };
};

// ═══════════════════════════════════════════════════════
//   Expose
// ═══════════════════════════════════════════════════════

window.openImageCropper = openImageCropper;
window.closeImageCropper = closeImageCropper;
