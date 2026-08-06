// ===== 配置 =====
const API_BASE_URL = 'https://txtaip.step.cc.cd';

// ===== DOM元素 =====
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

// ===== 主题切换 =====
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

// ===== 工具函数 =====
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

// ===== 防抖 =====
let debounceTimer;

function updatePreview() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
        const title = titleInput.value.trim();
        const content = contentInput.value.trim();
        
        previewTitle.textContent = title || '无标题';
        previewContent.textContent = content || '在这里输入内容以查看预览...';
        
        // 字符计数
        charCount.textContent = content.length;
        
        // 阅后即焚标识
        if (burnAfterReadingCheckbox.checked) {
            burnIndicator.classList.remove('hidden');
        } else {
            burnIndicator.classList.add('hidden');
        }
        
        // 保存草稿
        localStorage.setItem('draft_content', content);
        localStorage.setItem('draft_title', title);
    }, 300);
}

// ===== 恢复草稿 =====
function restoreDraft() {
    const savedContent = localStorage.getItem('draft_content');
    const savedTitle = localStorage.getItem('draft_title');
    if (savedContent) {
        contentInput.value = savedContent;
        titleInput.value = savedTitle || '';
        updatePreview();
    }
}

// ===== 复制功能 =====
function showClipboardMessage(text) {
    clipboardMessage.querySelector('span').textContent = text || '链接已复制到剪贴板';
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
        alert('复制失败，请手动复制');
    }
    document.body.removeChild(textarea);
}

// ===== 生成二维码 =====
function generateQRCode(text) {
    if (typeof QRCode === 'undefined') {
        console.error('QRCode库未加载');
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
            console.error('生成二维码失败:', err);
            return;
        }
        qrcodeImage.src = url;
        qrcodeContainer.classList.remove('hidden');
    });
}

// ===== 提交表单 =====
let submitCount = 0;
let lastSubmitTime = 0;

shareForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    // 频率限制
    const now = Date.now();
    if (now - lastSubmitTime < 5000) {
        showClipboardMessage('操作过于频繁，请稍后再试');
        return;
    }
    lastSubmitTime = now;
    
    const content = contentInput.value.trim();
    const title = titleInput.value.trim() || '分享内容';
    
    // 内容验证
    if (!content) {
        showClipboardMessage('请输入要分享的内容');
        return;
    }
    
    if (content.length > 10000) {
        showClipboardMessage('内容过长，请缩减至10000字符以内');
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
        const response = await fetch(`${API_BASE_URL}/api/create`, {
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
            throw new Error(`HTTP错误！状态码: ${response.status}`);
        }
        
        const data = await response.json();
        
        // 清除草稿
        localStorage.removeItem('draft_content');
        localStorage.removeItem('draft_title');
        
        // 显示分享选项
        shareOptions.classList.remove('hidden');
        
        const shareUrl = `${API_BASE_URL}/s/${data.id}`;
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
        
        showClipboardMessage('🎉 分享创建成功！');
        
    } catch (error) {
        console.error('创建分享失败:', error);
        showClipboardMessage('创建失败，请稍后重试');
    }
});

// ===== 复制链接 =====
copyLinkBtn.addEventListener('click', () => {
    const link = shareLink.textContent;
    if (link) {
        copyToClipboard(link, '链接已复制到剪贴板');
    }
});

// ===== 初始化 =====
const now = new Date();
previewCreatedAt.textContent = formatDateTime(now);
updateExpireTime();
restoreDraft();

// ===== 事件监听 =====
titleInput.addEventListener('input', updatePreview);
contentInput.addEventListener('input', updatePreview);
expireSelect.addEventListener('change', () => {
    updateExpireTime();
    updatePreview();
});
burnAfterReadingCheckbox.addEventListener('change', updatePreview);