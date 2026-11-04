document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('dodForm');
  const steps = document.querySelectorAll('.form-step');
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');
  const nextBtnText = document.getElementById('nextBtnText');
  const nextBtnIcon = document.getElementById('nextBtnIcon');
  const submitSpinner = document.getElementById('submitSpinner');
  const progressBar = document.getElementById('progressBar');
  const stepCounter = document.getElementById('stepCounter');
  const stepName = document.getElementById('stepName');
  const bottomNav = document.getElementById('bottomNav');
  const errorAlert = document.getElementById('errorAlert');
  const successScreen = document.getElementById('successScreen');
  const newResponseBtn = document.getElementById('newResponseBtn');

  // Photo elements
  const uploadZone = document.getElementById('uploadZone');
  const photoInput = document.getElementById('photo');
  const previewContainer = document.getElementById('previewContainer');
  const previewImage = document.getElementById('previewImage');
  const previewName = document.getElementById('previewName');
  const previewMeta = document.getElementById('previewMeta');
  const removePhotoBtn = document.getElementById('removePhotoBtn');

  // Class input
  const classInput = document.getElementById('schoolClass');

  let currentStep = 1;
  const totalSteps = steps.length;
  let selectedFile = null;

  const stepTitles = {
    1: 'O tobě',
    2: 'Výběr školy',
    3: 'Co tě baví',
    4: 'Vzkaz pro prváky',
    5: 'Tvoje tvorba',
    6: 'Soutěže a úspěchy',
    7: 'Kontakty & Odkazy',
    8: 'Tvoje fotka',
    9: 'Chceš něco dodat?',
  };

  function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function showError(msg) {
    errorAlert.textContent = msg;
    errorAlert.style.display = 'block';
  }

  function hideError() {
    errorAlert.textContent = '';
    errorAlert.style.display = 'none';
  }

  // Update Step UI
  function updateStepUI() {
    hideError();

    // Show active step
    steps.forEach((step) => {
      const stepNum = parseInt(step.dataset.step, 10);
      if (stepNum === currentStep) {
        step.classList.add('active');
        const firstInput = step.querySelector('input, textarea');
        if (firstInput && window.innerWidth > 640) {
          firstInput.focus();
        }
      } else {
        step.classList.remove('active');
      }
    });

    // Update Header progress
    stepCounter.textContent = `Krok ${currentStep} z ${totalSteps}`;
    stepName.textContent = stepTitles[currentStep] || '';
    const percent = (currentStep / totalSteps) * 100;
    progressBar.style.width = `${percent}%`;

    // Update Back button
    if (currentStep > 1) {
      prevBtn.style.display = 'inline-flex';
    } else {
      prevBtn.style.display = 'none';
    }

    // Update Next button
    if (currentStep === totalSteps) {
      nextBtnText.textContent = 'Poslat';
      nextBtnIcon.innerHTML = '<polygon points="22 2 15 22 11 13 2 9 22 2"/><line x1="22" y1="2" x2="11" y2="13"/>';
    } else {
      nextBtnText.textContent = 'Pokračovat';
      nextBtnIcon.innerHTML = '<polyline points="9 18 15 12 9 6"/>';
    }
  }

  // Step Validation
  function validateCurrentStep() {
    hideError();

    if (currentStep === 1) {
      const fullName = document.getElementById('fullName').value.trim();
      const schoolClass = classInput.value.trim();

      if (!fullName) {
        showError('Vyplň prosím své jméno a příjmení.');
        document.getElementById('fullName').focus();
        return false;
      }
      if (!schoolClass) {
        showError('Napiš svoji třídu (např. IT3).');
        classInput.focus();
        return false;
      }
    }

    if (currentStep === 2) {
      const whySchool = document.getElementById('whySchool').value.trim();
      if (!whySchool) {
        showError('Napiš alespoň krátce, proč sis vybral/a naši školu.');
        document.getElementById('whySchool').focus();
        return false;
      }
    }

    if (currentStep === 3) {
      const whatYouLike = document.getElementById('whatYouLike').value.trim();
      if (!whatYouLike) {
        showError('Napiš, co se ti na škole líbí nebo co tě baví.');
        document.getElementById('whatYouLike').focus();
        return false;
      }
    }

    if (currentStep === 9) {
      const consent = document.getElementById('consent').checked;
      if (!consent) {
        showError('Pro odeslání je potřeba potvrdit souhlas se zveřejněním.');
        return false;
      }
    }

    return true;
  }

  // Next / Continue button handler
  nextBtn.addEventListener('click', () => {
    if (!validateCurrentStep()) return;

    if (currentStep < totalSteps) {
      currentStep++;
      updateStepUI();
    } else {
      submitForm();
    }
  });

  // Prev / Back button handler
  prevBtn.addEventListener('click', () => {
    if (currentStep > 1) {
      currentStep--;
      updateStepUI();
    }
  });

  // Enter key on inputs moves to next step
  form.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type !== 'checkbox') {
      e.preventDefault();
      nextBtn.click();
    }
  });

  // Helper to compress/resize photos on the client side before upload
  // (Prevents Vercel 4.5MB payload limit errors and speeds up mobile uploads by 10x)
  async function compressImage(file, maxWidth = 1280, quality = 0.82) {
    return new Promise((resolve) => {
      if (!file || !file.type.startsWith('image/') || file.type === 'image/svg+xml') {
        return resolve(file);
      }

      const img = new Image();
      const objectUrl = URL.createObjectURL(file);

      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        let width = img.naturalWidth || img.width;
        let height = img.naturalHeight || img.height;

        if (width > maxWidth || height > maxWidth) {
          if (width > height) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          } else {
            width = Math.round((width * maxWidth) / height);
            height = maxWidth;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (!blob || blob.size >= file.size) {
              return resolve(file);
            }
            const compressed = new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), {
              type: 'image/jpeg',
              lastModified: Date.now(),
            });
            resolve(compressed);
          },
          'image/jpeg',
          quality
        );
      };

      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        resolve(file);
      };

      img.src = objectUrl;
    });
  }

  // Photo Upload Handling
  function handleFile(file) {
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showError('Vybraný soubor není obrázek. Vyberte prosím fotografii.');
      return;
    }

    const maxBytes = 25 * 1024 * 1024; // 25MB raw camera limit
    if (file.size > maxBytes) {
      showError('Fotka je příliš velká (max 25 MB). Vyberte jinou fotku.');
      return;
    }

    hideError();
    selectedFile = file;

    const reader = new FileReader();
    reader.onload = (e) => {
      previewImage.src = e.target.result;
      previewName.textContent = file.name;
      previewMeta.textContent = `${formatBytes(file.size)}`;
      previewContainer.style.display = 'flex';
      uploadZone.style.display = 'none';
    };
    reader.readAsDataURL(file);
  }

  function clearPhoto() {
    selectedFile = null;
    photoInput.value = '';
    previewImage.src = '';
    previewContainer.style.display = 'none';
    uploadZone.style.display = 'flex';
  }

  photoInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  });

  uploadZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadZone.classList.add('dragover');
  });

  uploadZone.addEventListener('dragleave', () => {
    uploadZone.classList.remove('dragover');
  });

  uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadZone.classList.remove('dragover');
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  });

  removePhotoBtn.addEventListener('click', clearPhoto);

  // Submit Form via API
  async function submitForm() {
    hideError();
    nextBtn.disabled = true;
    prevBtn.disabled = true;
    submitSpinner.style.display = 'inline-block';
    nextBtnText.textContent = 'Odesílám...';

    try {
      const formData = new FormData(form);

      if (selectedFile) {
        nextBtnText.textContent = 'Zpracovávám fotku...';
        try {
          const compressed = await compressImage(selectedFile, 1280, 0.82);
          formData.set('photo', compressed);
        } catch (compErr) {
          console.warn('Image compression fallback:', compErr);
          formData.set('photo', selectedFile);
        }
      } else {
        formData.delete('photo');
      }

      nextBtnText.textContent = 'Ukládám...';

      const response = await fetch('/api/submissions', {
        method: 'POST',
        body: formData,
      });

      let result;
      const responseText = await response.text();
      try {
        result = JSON.parse(responseText);
      } catch {
        result = { error: responseText || `Chyba serveru (${response.status})` };
      }

      if (!response.ok) {
        throw new Error(result.error || result.details || `Chyba při ukládání (${response.status}).`);
      }

      // Success
      form.style.display = 'none';
      bottomNav.style.display = 'none';
      const appHeader = document.querySelector('.app-header');
      if (appHeader) appHeader.style.display = 'none';
      successScreen.style.display = 'flex';

      // Load animated INFIS logo fresh
      const logoIframe = document.getElementById('logoIframe');
      if (logoIframe) {
        logoIframe.src = '/infis-logo-v11.html';
      }

    } catch (err) {
      console.error('Submit error:', err);
      showError(err.message || 'Nepodařilo se odeslat odpovědi. Zkontrolujte připojení k internetu.');
    } finally {
      nextBtn.disabled = false;
      prevBtn.disabled = false;
      submitSpinner.style.display = 'none';
      nextBtnText.textContent = 'Poslat';
    }
  }

  // Reset & start new response
  newResponseBtn.addEventListener('click', () => {
    form.reset();
    clearPhoto();
    currentStep = 1;

    // Reset logo iframe
    const logoIframe = document.getElementById('logoIframe');
    if (logoIframe) {
      logoIframe.src = 'about:blank';
    }

    form.style.display = 'flex';
    bottomNav.style.display = 'flex';
    const appHeader = document.querySelector('.app-header');
    if (appHeader) appHeader.style.display = 'block';
    successScreen.style.display = 'none';
    updateStepUI();
  });

  // Initial render
  updateStepUI();
});
