// ===== Config =====
// Use global variable from index.html, fallback to empty string
const API_BASE_URL = window.API_BASE_URL || '';

// ===== DOM Elements =====
const contentInput = document.getElementById('content');
const titleInput = document.getElementById('title');
const expireSelect = document.getElementById('expire');
const shareTypeSelect = document.getElementById('shareType');
const burnAfterReadingCheckbox = document.getElementById('burnAfterReading');
const previewTitle = document.getElementById('previewTitle');
const previewContent = document.getElementById('previewContent');
const previewCreatedAt = document.getElementById('previewCreatedAt');
const previewExpiresAt = document.getElementById('previewExpiresAt');
const burnIndicator = document.getElementById('burnIndicator');
const shareOptions = document.getElementById('shareOptions');
const qrcodeContainer = document.getElementById('qrcodeContainer');
const qrcodeImage = document.getElementById('qrcodeImage');
const linkContainer = document.getElementById('linkContainer');
const shareLink = document.getElementById('shareLink');
const copyLinkBtn = document.getElementById('copyLinkBtn');
const clipboardMessage = document.getElementById('clipboardMessage');
const shareForm = document.getElementById('shareForm');
const charCount = document.getElementById('charCount');

// ===== Theme Toggle =====
const themeToggle = document.getElementById('themeToggle');
const htmlElement = document.documentElement;
const iconElement = themeToggle.querySelector('i');

if (localStorage.getItem('theme') === 'dark' || 
    (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    htmlElement.setAttribute('data-theme', 'dark');
    iconElement.classList.remove('fa-moon-o');
    iconElement.classList.add('fa-sun-o');
} else {
    htmlElement.removeAttribute('data-theme');
    iconElement.classList.remove('fa-sun-o');
    iconElement.classList.add('fa-moon-o');
}

themeToggle.addEventListener('click', () => {
    if (htmlElement.hasAttribute('data-theme')) {
        htmlElement.removeAttribute('data-theme');
        localStorage.setItem('theme', 'light');
        iconElement.classList.remove('fa-sun-o');
        iconElement.classList.add('fa-moon-o');
    } else {
        htmlElement.setAttribute('data-theme', 'dark');
        localStorage.setItem('theme', 'dark');
        iconElement.classList.remove('fa-moon-o');
        iconElement.classList.add('fa-sun-o');
    }
});

// ===== Utility Functions =====
function formatDateTime(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function updateExpireTime() {
    const now = new Date();
    const expireDays = parseInt(expireSelect.value);
    const expiresAt = new Date(now);
    expiresAt.setDate(expiresAt.getDate() + expireDays);
    previewExpiresAt.textContent = formatDateTime(expiresAt);
}

// ===== Debounce =====
let debounceTimer;

function updatePreview() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
        const title = titleInput.value.trim();
        const content = contentInput.value.trim();
        
        previewTitle.textContent = title || 'No Title';
        previewContent.textContent = content || 'Enter content to preview...';
        
        charCount.textContent = content.length;
        
        if (burnAfterReadingCheckbox.checked) {
            burnIndicator.classList.remove('hidden');
        } else {
            burnIndicator.classList.add('hidden');
        }
        
        localStorage.setItem('draft_content', content);
        localStorage.setItem('draft_title', title);
    }, 300);
}

function restoreDraft() {
    const savedContent = localStorage.getItem('draft_content');
    const savedTitle = localStorage.getItem('draft_title');
    if (savedContent) {
        contentInput.value = savedContent;
        titleInput.value = savedTitle || '';
        updatePreview();
    }
}

// ===== Copy Functions =====
function showClipboardMessage(text) {
    clipboardMessage.querySelector('span').textContent = text || 'Link copied to clipboard';
    clipboardMessage.classList.add('show');
    setTimeout(() => {
        clipboardMessage.classList.remove('show');
    }, 2000);
}

function copyToClipboard(text, message) {
    if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(() => {
            showClipboardMessage(message);
        }).catch(() => {
            fallbackCopy(text, message);
        });
    } else {
        fallbackCopy(text, message);
    }
}

function fallbackCopy(text, message) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try {
        document.execCommand('copy');
        showClipboardMessage(message);
    } catch (e) {
        alert('Copy failed, please copy manually');
    }
    document.body.removeChild(textarea);
}

// ===== Generate QR Code =====
function generateQRCode(text) {
    if (typeof QRCode === 'undefined') {
        console.error('QRCode library not loaded');
        return;
    }
    QRCode.toDataURL(text, {
        width: 200,
        margin: 1,
        color: {
            dark: '#2d3748',
            light: '#ffffff'
        }
    }, (err, url) => {
        if (err) {
            console.error('Failed to generate QR code:', err);
            return;
        }
        qrcodeImage.src = url;
        qrcodeContainer.classList.remove('hidden');
    });
}

// ===== Form Submit =====
let lastSubmitTime = 0;

shareForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const now = Date.now();
    if (now - lastSubmitTime < 5000) {
        showClipboardMessage('Too frequent, please wait');
        return;
    }
    lastSubmitTime = now;
    
    const content = contentInput.value.trim();
    const title = titleInput.value.trim() || 'Shared Content';
    
    if (!content) {
        showClipboardMessage('Please enter content');
        return;
    }
    
    if (content.length > 10000) {
        showClipboardMessage('Content too long, max 10000 chars');
        return;
    }
    
    const formData = {
        title: title,
        content: content,
        expireDays: parseInt(expireSelect.value),
        burnAfterRead: burnAfterReadingCheckbox.checked,
        shareType: shareTypeSelect.value
    };
    
    try {
        // Use relative path, handled by Pages Functions
        const response = await fetch('/api/create', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                title: formData.title,
                content: formData.content,
                expiresIn: formData.expireDays * 86400,
                burnAfterRead: formData.burnAfterRead
            })
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }
        
        const data = await response.json();
        
        localStorage.removeItem('draft_content');
        localStorage.removeItem('draft_title');
        
        shareOptions.classList.remove('hidden');
        
        const shareUrl = `${window.location.origin}/view.html?id=${data.id}`;
        const shareType = shareTypeSelect.value;
        
        if (shareType === 'both' || shareType === 'link') {
            shareLink.textContent = shareUrl;
            linkContainer.classList.remove('hidden');
        } else {
            linkContainer.classList.add('hidden');
        }
        
        if (shareType === 'both' || shareType === 'qrcode') {
            generateQRCode(shareUrl);
        } else {
            qrcodeContainer.classList.add('hidden');
        }
        
        showClipboardMessage('Share created successfully!');
        
    } catch (error) {
        console.error('Create share failed:', error);
        showClipboardMessage('Create failed: ' + error.message);
    }
});

// ===== Copy Link Button =====
copyLinkBtn.addEventListener('click', () => {
    const link = shareLink.textContent;
    if (link) {
        copyToClipboard(link, 'Link copied to clipboard');
    }
});

// ===== Initialization =====
const now = new Date();
previewCreatedAt.textContent = formatDateTime(now);
updateExpireTime();
restoreDraft();

// ===== Event Listeners =====
titleInput.addEventListener('input', updatePreview);
contentInput.addEventListener('input', updatePreview);
expireSelect.addEventListener('change', () => {
    updateExpireTime();
    updatePreview();
});
burnAfterReadingCheckbox.addEventListener('change', updatePreview);

console.log('app.js loaded successfully');
