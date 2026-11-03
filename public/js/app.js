document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('dodForm');
  const uploadZone = document.getElementById('uploadZone');
  const photoInput = document.getElementById('photo');
  const previewContainer = document.getElementById('previewContainer');
  const previewImage = document.getElementById('previewImage');
  const previewName = document.getElementById('previewName');
  const previewMeta = document.getElementById('previewMeta');
  const removePhotoBtn = document.getElementById('removePhotoBtn');
  const submitBtn = document.getElementById('submitBtn');
  const submitSpinner = document.getElementById('submitSpinner');
  const submitText = document.getElementById('submitText');
  const errorAlert = document.getElementById('errorAlert');
  const successScreen = document.getElementById('successScreen');
  const newResponseBtn = document.getElementById('newResponseBtn');

  let selectedFile = null;

  // Helper to format bytes
  function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  // Show / Hide error alert
  function showError(msg) {
    errorAlert.textContent = msg;
    errorAlert.style.display = 'block';
    window.scrollTo({ top: errorAlert.offsetTop - 30, behavior: 'smooth' });
  }

  function hideError() {
    errorAlert.textContent = '';
    errorAlert.style.display = 'none';
  }

  // Handle file selection
  function handleFile(file) {
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showError('Vybraný soubor není obrázek. Nahrajte prosím JPG, PNG, WEBP nebo HEIC.');
      return;
    }

    const maxBytes = 15 * 1024 * 1024; // 15MB
    if (file.size > maxBytes) {
      showError('Fotka je příliš velká (max 15 MB). Zmenšete ji prosím před nahráním.');
      return;
    }

    hideError();
    selectedFile = file;

    // Show preview
    const reader = new FileReader();
    reader.onload = (e) => {
      previewImage.src = e.target.result;
      previewName.textContent = file.name;
      previewMeta.textContent = `${formatBytes(file.size)} • ${file.type.replace('image/', '').toUpperCase()}`;
      previewContainer.style.display = 'flex';
      uploadZone.style.display = 'none';
    };
    reader.readAsDataURL(file);
  }

  // Clear photo
  function clearPhoto() {
    selectedFile = null;
    photoInput.value = '';
    previewImage.src = '';
    previewContainer.style.display = 'none';
    uploadZone.style.display = 'block';
  }

  // Upload Zone Events
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

  photoInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  });

  removePhotoBtn.addEventListener('click', clearPhoto);

  // Form Submission
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError();

    const fullName = document.getElementById('fullName').value.trim();
    const schoolClass = document.getElementById('schoolClass').value.trim();
    const whySchool = document.getElementById('whySchool').value.trim();
    const whatYouLike = document.getElementById('whatYouLike').value.trim();
    const consent = document.getElementById('consent').checked;

    // Validation
    if (!fullName) {
      showError('Prosím vyplň své jméno a příjmení.');
      document.getElementById('fullName').focus();
      return;
    }

    if (!schoolClass) {
      showError('Prosím vyplň svou třídu nebo obor (např. IT3).');
      document.getElementById('schoolClass').focus();
      return;
    }

    if (!whySchool) {
      showError('Prosím napiš alespoň krátce, proč sis vybral/a naši školu.');
      document.getElementById('whySchool').focus();
      return;
    }

    if (!whatYouLike) {
      showError('Prosím napiš, co se ti na škole líbí nebo co tě baví.');
      document.getElementById('whatYouLike').focus();
      return;
    }

    if (!consent) {
      showError('Pro odeslání je potřeba potvrdit souhlas se zveřejněním v rámci DOD.');
      return;
    }

    // Prepare FormData
    const formData = new FormData(form);
    if (selectedFile) {
      formData.set('photo', selectedFile);
    } else {
      formData.delete('photo');
    }

    // Disable button & show spinner
    submitBtn.disabled = true;
    submitSpinner.style.display = 'inline-block';
    submitText.textContent = 'Odesílám odpovědi...';

    try {
      const response = await fetch('/api/submissions', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Chyba při odesílání.');
      }

      // Success!
      form.style.display = 'none';
      successScreen.style.display = 'block';
      window.scrollTo({ top: 0, behavior: 'smooth' });

    } catch (err) {
      console.error(err);
      showError(err.message || 'Nepodařilo se odeslat odpovědi. Zkontrolujte připojení.');
    } finally {
      submitBtn.disabled = false;
      submitSpinner.style.display = 'none';
      submitText.textContent = 'Odeslat odpovědi';
    }
  });

  // "Send another response" button
  newResponseBtn.addEventListener('click', () => {
    form.reset();
    clearPhoto();
    hideError();
    successScreen.style.display = 'none';
    form.style.display = 'block';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
});
